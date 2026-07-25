"""
Deep Knowledge Tracing (simplified) via Exponentially Weighted Moving Average.

new_score = alpha * latest_result + (1 - alpha) * previous_score

Weighting recent attempts more heavily means a topic the student just
struggled with is flagged faster than one they got wrong once months ago,
which is the behaviour described in Section 3.5 of the report.
"""

from app.config import EWMA_ALPHA, MASTERY_THRESHOLD


def update_mastery(previous_score: float, latest_quiz_score: float) -> float:
    """
    previous_score / latest_quiz_score are both 0-100 percentages.
    Returns the new EWMA mastery score, rounded to 1 decimal place.
    """
    new_score = EWMA_ALPHA * latest_quiz_score + (1 - EWMA_ALPHA) * previous_score
    return round(max(0.0, min(100.0, new_score)), 1)


def is_weak_topic(mastery_score: float) -> bool:
    return mastery_score < MASTERY_THRESHOLD
