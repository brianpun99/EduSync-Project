"""
Read-only aggregation endpoints that back dashboard.tsx and analytics.tsx.
No writes happen here -- mastery is only ever updated by /api/quiz/submit.
"""

import sqlite3

from fastapi import APIRouter, Depends

from app.config import MASTERY_THRESHOLD
from app.database import get_db
from app.schemas import (
    ActivityItem,
    AnalyticsOverviewOut,
    DashboardOut,
    QuizHistoryEntry,
    StudyTimeLogRequest,
    WeakTopic,
)
from app.security import require_auth

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

STRONG_THRESHOLD = 80.0  # matches the 80/60 tiering used in analytics.tsx


def _format_duration(total_minutes: int) -> str:
    if total_minutes <= 0:
        return "0h 0m"
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    overall_row = db.execute("SELECT AVG(mastery_score) AS avg_score FROM topics").fetchone()
    overall_mastery = round(overall_row["avg_score"], 1) if overall_row["avg_score"] is not None else 0.0

    weak_rows = db.execute(
        """
        SELECT t.name AS topic, s.name AS subject, t.mastery_score AS mastery_score
        FROM topics t
        JOIN subjects s ON s.id = t.subject_id
        WHERE t.is_weak = 1
        ORDER BY t.mastery_score ASC
        LIMIT 10
        """
    ).fetchall()

    doc_count = db.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]

    # ── Calculate Study Time ──────────────────────────────────────────────────
    session_row = db.execute("SELECT SUM(duration_seconds) AS s FROM study_sessions").fetchone()
    logged_seconds = session_row["s"] if session_row and session_row["s"] else 0

    # Quizzes taken (estimated 2.5 min per quiz attempt)
    quiz_count = db.execute("SELECT COUNT(*) AS c FROM quiz_history").fetchone()["c"]
    quiz_seconds = quiz_count * 150

    # Chat queries (estimated 45 seconds per question asked)
    chat_count = db.execute("SELECT COUNT(*) AS c FROM chat_history WHERE role = 'user'").fetchone()["c"]
    chat_seconds = chat_count * 45

    total_seconds = logged_seconds + quiz_seconds + chat_seconds
    total_minutes = total_seconds // 60
    study_time_formatted = _format_duration(total_minutes)

    # ── Aggregate Recent Activities ───────────────────────────────────────────
    quizzes = db.execute(
        """
        SELECT qh.id, qh.score, qh.correct_count, qh.total_count, qh.taken_at AS ts,
               t.name AS topic, s.name AS subject
        FROM quiz_history qh
        JOIN topics t ON t.id = qh.topic_id
        JOIN subjects s ON s.id = t.subject_id
        ORDER BY qh.taken_at DESC
        LIMIT 8
        """
    ).fetchall()

    docs = db.execute(
        """
        SELECT d.id, d.filename, d.page_count, d.created_at AS ts, s.name AS subject
        FROM documents d
        JOIN subjects s ON s.id = d.subject_id
        ORDER BY d.created_at DESC
        LIMIT 8
        """
    ).fetchall()

    chats = db.execute(
        """
        SELECT ch.id, ch.content, ch.created_at AS ts, d.filename, s.name AS subject
        FROM chat_history ch
        JOIN documents d ON d.id = ch.document_id
        JOIN subjects s ON s.id = d.subject_id
        WHERE ch.role = 'user'
        ORDER BY ch.created_at DESC
        LIMIT 8
        """
    ).fetchall()

    activities = []
    for q in quizzes:
        clean_topic = q["topic"]
        score_pct = round(q["score"])
        activities.append(
            {
                "id": f"quiz-{q['id']}",
                "type": "quiz",
                "title": f"Completed Quiz on {clean_topic}",
                "description": f"Scored {score_pct}% ({q['correct_count']}/{q['total_count']} correct) in {q['subject']}",
                "timestamp": q["ts"],
                "meta": f"{score_pct}%",
            }
        )

    for d in docs:
        clean_name = d["filename"].rsplit(".", 1)[0].replace("_", " ")
        pages = d["page_count"] or 0
        activities.append(
            {
                "id": f"doc-{d['id']}",
                "type": "document",
                "title": f"Uploaded {clean_name}",
                "description": f"Added to {d['subject']} ({pages} pages)",
                "timestamp": d["ts"],
                "meta": f"{pages} pages" if pages else "Document",
            }
        )

    for c in chats:
        q_snippet = c["content"][:45] + ("..." if len(c["content"]) > 45 else "")
        activities.append(
            {
                "id": f"chat-{c['id']}",
                "type": "chat",
                "title": f"Q&A on {c['subject']}",
                "description": f'"{q_snippet}"',
                "timestamp": c["ts"],
                "meta": "AI Chat",
            }
        )

    activities.sort(key=lambda a: a["timestamp"], reverse=True)
    recent_activities = [ActivityItem(**a) for a in activities[:8]]

    return DashboardOut(
        overall_mastery=overall_mastery,
        weak_topics=[WeakTopic(**dict(r)) for r in weak_rows],
        document_count=doc_count,
        study_time_minutes=total_minutes,
        study_time_formatted=study_time_formatted,
        recent_activities=recent_activities,
    )


@router.post("/study-time")
def log_study_time(
    payload: StudyTimeLogRequest,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    db.execute(
        "INSERT INTO study_sessions (subject_id, document_id, duration_seconds) VALUES (?, ?, ?)",
        (payload.subject_id, payload.document_id, payload.duration_seconds),
    )
    return {"status": "ok", "logged_seconds": payload.duration_seconds}


@router.get("/overview", response_model=AnalyticsOverviewOut)
def overview(
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    # Counts
    total_subjects = db.execute("SELECT COUNT(*) AS c FROM subjects").fetchone()["c"]
    total_documents = db.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]
    total_quizzes = db.execute("SELECT COUNT(*) AS c FROM quiz_history").fetchone()["c"]
    avg_score_row = db.execute("SELECT AVG(score) AS avg FROM quiz_history").fetchone()
    avg_score = round(avg_score_row["avg"] or 0.0, 1)

    # Per-quiz trend
    trend_rows = db.execute(
        """
        SELECT qh.taken_at AS date, s.name AS subject, t.name AS topic, qh.score AS score
        FROM quiz_history qh
        JOIN topics t ON t.id = qh.topic_id
        JOIN subjects s ON s.id = t.subject_id
        ORDER BY qh.taken_at ASC
        """
    ).fetchall()

    tier_counts = db.execute(
        f"""
        SELECT
            SUM(CASE WHEN mastery_score >= {STRONG_THRESHOLD} THEN 1 ELSE 0 END) AS strong,
            SUM(CASE WHEN mastery_score >= {MASTERY_THRESHOLD} AND mastery_score < {STRONG_THRESHOLD} THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN mastery_score < {MASTERY_THRESHOLD} THEN 1 ELSE 0 END) AS weak
        FROM topics
        """
    ).fetchone()

    return AnalyticsOverviewOut(
        total_subjects=total_subjects,
        total_documents=total_documents,
        total_quizzes_taken=total_quizzes,
        average_quiz_score=avg_score,
        quiz_score_trend=[QuizHistoryEntry(**dict(r)) for r in trend_rows],
        strong_count=tier_counts["strong"] or 0,
        good_count=tier_counts["good"] or 0,
        weak_count=tier_counts["weak"] or 0,
    )
