"""
FR-04: Grounded Knowledge Synthesis. Powers the chat panel in
study-workspace.tsx.

Endpoints
---------
POST /api/query                                  -- ask a question (saves to chat_history)
GET  /api/subjects/{subject_id}/documents/{document_id}/chat  -- load history
DELETE /api/subjects/{subject_id}/documents/{document_id}/chat -- clear history
"""

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.schemas import ChatMessageOut, QueryRequest, QueryResponse, SourceChunk
from app.security import require_auth
from app.services.rag import answer_question

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
def query(
    payload: QueryRequest,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    # Verify the document exists and belongs to the given subject
    doc = db.execute(
        "SELECT id FROM documents WHERE id = ? AND subject_id = ?",
        (payload.document_id, payload.subject_id),
    ).fetchone()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")

<<<<<<< HEAD
    # Default to current document if no checklist selection provided
    doc_ids = payload.document_ids if payload.document_ids else [payload.document_id]
    result = answer_question(payload.subject_id, payload.question, document_ids=doc_ids)
=======
    try:
        result = answer_question(payload.subject_id, payload.question)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI Inference Error: {exc}")
>>>>>>> main

    # Persist user message
    db.execute(
        "INSERT INTO chat_history (document_id, role, content) VALUES (?, 'user', ?)",
        (payload.document_id, payload.question),
    )

    # Persist assistant message (with sources as JSON)
    sources_json = json.dumps(result.get("sources", []))
    db.execute(
        "INSERT INTO chat_history (document_id, role, content, sources_json) VALUES (?, 'assistant', ?, ?)",
        (payload.document_id, result["answer"], sources_json),
    )

    return QueryResponse(**result)


@router.get(
    "/subjects/{subject_id}/documents/{document_id}/chat",
    response_model=list[ChatMessageOut],
)
def get_chat_history(
    subject_id: int,
    document_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    """Return all persisted chat messages for a document, oldest-first."""
    doc = db.execute(
        "SELECT id FROM documents WHERE id = ? AND subject_id = ?",
        (document_id, subject_id),
    ).fetchone()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")

    rows = db.execute(
        "SELECT id, role, content, sources_json, created_at FROM chat_history "
        "WHERE document_id = ? ORDER BY id ASC",
        (document_id,),
    ).fetchall()

    messages = []
    for row in rows:
        sources = None
        if row["sources_json"]:
            raw = json.loads(row["sources_json"])
            if raw:
                sources = [SourceChunk(**s) for s in raw]
        messages.append(
            ChatMessageOut(
                id=row["id"],
                role=row["role"],
                content=row["content"],
                sources=sources,
                created_at=row["created_at"],
            )
        )
    return messages


@router.delete(
    "/subjects/{subject_id}/documents/{document_id}/chat",
    status_code=status.HTTP_204_NO_CONTENT,
)
def clear_chat_history(
    subject_id: int,
    document_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    """Delete all chat history for a document."""
    doc = db.execute(
        "SELECT id FROM documents WHERE id = ? AND subject_id = ?",
        (document_id, subject_id),
    ).fetchone()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")

    db.execute("DELETE FROM chat_history WHERE document_id = ?", (document_id,))
