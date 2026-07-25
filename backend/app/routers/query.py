"""
FR-04: Grounded Knowledge Synthesis. Powers the chat panel in
study-workspace.tsx.
"""

from fastapi import APIRouter, Depends

from app.schemas import QueryRequest, QueryResponse
from app.security import require_auth
from app.services.rag import answer_question

router = APIRouter(prefix="/api/query", tags=["query"])


@router.post("", response_model=QueryResponse)
def query(payload: QueryRequest, _user_id: int = Depends(require_auth)):
    result = answer_question(payload.subject_id, payload.question)
    return QueryResponse(**result)
