"""
Read-only aggregation endpoints that back dashboard.tsx and analytics.tsx.
No writes happen here -- mastery is only ever updated by /api/quiz/submit.
"""

import sqlite3

from fastapi import APIRouter, Depends

from app.config import MASTERY_THRESHOLD
from app.database import get_db
from app.schemas import AnalyticsOverviewOut, DashboardOut, QuizHistoryEntry, WeakTopic
from app.security import require_auth

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

STRONG_THRESHOLD = 80.0  # matches the 80/60 tiering used in analytics.tsx


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

    return DashboardOut(
        overall_mastery=overall_mastery,
        weak_topics=[WeakTopic(**dict(r)) for r in weak_rows],
        document_count=doc_count,
    )


@router.get("/overview", response_model=AnalyticsOverviewOut)
def overview(
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
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
        quiz_score_trend=[QuizHistoryEntry(**dict(r)) for r in trend_rows],
        strong_count=tier_counts["strong"] or 0,
        good_count=tier_counts["good"] or 0,
        weak_count=tier_counts["weak"] or 0,
    )
