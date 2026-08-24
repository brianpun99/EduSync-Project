"""
Quiz generation, grading, and the mastery-update loop (FR-05).

POST /generate  -> Groq produces the questions (grounded in retrieved chunks)
POST /submit    -> grades client-supplied answers, updates the topic's EWMA
                   mastery score, and flags it as a knowledge gap if <60%.
GET  /history   -> backs quiz-history.tsx
"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.schemas import (
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizHistoryEntry,
    QuizSubmitRequest,
    QuizSubmitResponse,
)
from app.security import require_auth
from app.services.mastery import is_weak_topic, update_mastery
from app.services.rag import generate_quiz

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


def _get_or_create_topic(db: sqlite3.Connection, subject_id: int, topic_name: str) -> sqlite3.Row:
    row = db.execute(
        "SELECT * FROM topics WHERE subject_id = ? AND name = ?", (subject_id, topic_name)
    ).fetchone()
    if row is not None:
        return row
    db.execute(
        "INSERT INTO topics (subject_id, name, mastery_score, is_weak) VALUES (?, ?, 0, 1)",
        (subject_id, topic_name),
    )
    return db.execute(
        "SELECT * FROM topics WHERE subject_id = ? AND name = ?", (subject_id, topic_name)
    ).fetchone()


@router.post("/generate", response_model=QuizGenerateResponse)
def create_quiz(payload: QuizGenerateRequest, _user_id: int = Depends(require_auth)):
    try:
        raw = generate_quiz(
            payload.subject_id,
            payload.topic,
            payload.num_questions,
            payload.difficulty,
        )
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    except ValueError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    return QuizGenerateResponse(topic=payload.topic, questions=raw.get("questions", []))


@router.post("/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    payload: QuizSubmitRequest,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    if not payload.answers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No answers submitted.")

    total = len(payload.answers)
    correct = sum(1 for a in payload.answers if a.selected_option_id == a.correct_option_id)
    score = round((correct / total) * 100, 1)

    topic = _get_or_create_topic(db, payload.subject_id, payload.topic)
    new_mastery = update_mastery(topic["mastery_score"], score)
    weak = is_weak_topic(new_mastery)

    db.execute(
        "UPDATE topics SET mastery_score = ?, is_weak = ?, updated_at = datetime('now') WHERE id = ?",
        (new_mastery, int(weak), topic["id"]),
    )
    db.execute(
        """
        INSERT INTO quiz_history (topic_id, score, correct_count, total_count)
        VALUES (?, ?, ?, ?)
        """,
        (topic["id"], score, correct, total),
    )

    return QuizSubmitResponse(
        score=score,
        correct_count=correct,
        total_count=total,
        mastery_score=new_mastery,
        is_weak=weak,
    )


@router.get("/history", response_model=list[QuizHistoryEntry])
def quiz_history(
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    rows = db.execute(
        """
        SELECT qh.taken_at AS date, s.name AS subject, t.name AS topic, qh.score AS score
        FROM quiz_history qh
        JOIN topics t ON t.id = qh.topic_id
        JOIN subjects s ON s.id = t.subject_id
        ORDER BY qh.taken_at DESC
        """
    ).fetchall()
    return [QuizHistoryEntry(**dict(row)) for row in rows]
