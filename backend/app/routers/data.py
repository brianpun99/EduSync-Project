"""
Data Sovereignty endpoints (NFR-01).

Provides storage visibility and data management actions:
  - GET  /api/data/storage  — real-time disk usage breakdown
  - DELETE /api/data/cache  — wipe transient data (chat history, study sessions)
  - DELETE /api/data/all    — full factory reset (all tables + vector store)
"""

import os
import shutil
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import BASE_DIR, CHROMA_DIR, DATA_DIR, DB_PATH
from app.database import get_db, init_db
from app.security import require_auth

router = APIRouter(prefix="/api/data", tags=["data"])

STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB


def _dir_size(path: str) -> int:
    """Recursively compute total size (bytes) of a directory."""
    total = 0
    if not os.path.isdir(path):
        return 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def _file_size(path: str) -> int:
    """Return the size of a single file, or 0 if it doesn't exist."""
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


@router.get("/storage")
def get_storage_usage(_user_id: int = Depends(require_auth)):
    """Returns a breakdown of local disk usage for the EduSync data footprint."""
    db_bytes = _file_size(str(DB_PATH))
    chroma_bytes = _dir_size(str(CHROMA_DIR))
    data_bytes = _dir_size(str(DATA_DIR))

    # data_bytes already includes the DB file; avoid double-counting
    uploads_bytes = max(0, data_bytes - db_bytes)

    total_bytes = db_bytes + chroma_bytes + uploads_bytes
    limit_bytes = STORAGE_LIMIT_BYTES

    return {
        "database_bytes": db_bytes,
        "vector_store_bytes": chroma_bytes,
        "uploads_bytes": uploads_bytes,
        "total_bytes": total_bytes,
        "limit_bytes": limit_bytes,
        "total_display": _format_bytes(total_bytes),
        "limit_display": _format_bytes(limit_bytes),
        "usage_percent": round((total_bytes / limit_bytes) * 100, 1) if limit_bytes > 0 else 0,
    }


@router.delete("/cache")
def clear_cache(
    _user_id: int = Depends(require_auth),
    db: sqlite3.Connection = Depends(get_db),
):
    """
    Clears transient / non-essential data:
      - chat_history  (RAG conversation logs)
      - study_sessions (time-tracking logs)

    Preserves: user account, subjects, documents, topics, quiz_history.
    """
    db.execute("DELETE FROM chat_history")
    db.execute("DELETE FROM study_sessions")
    return {"message": "Local cache cleared successfully."}


@router.delete("/all")
def delete_all_data(
    _user_id: int = Depends(require_auth),
    db: sqlite3.Connection = Depends(get_db),
):
    """
    Nuclear factory reset — wipes every table and the vector store.
    After this call the frontend MUST discard the JWT and redirect to /login;
    the next visitor will see the first-run registration screen.
    """
    # 1. Drop all data rows (order respects FK constraints)
    db.execute("DELETE FROM chat_history")
    db.execute("DELETE FROM study_sessions")
    db.execute("DELETE FROM quiz_history")
    db.execute("DELETE FROM topics")
    db.execute("DELETE FROM documents")
    db.execute("DELETE FROM subjects")
    db.execute("DELETE FROM users")

    # 2. Wipe ChromaDB vector store
    if os.path.isdir(str(CHROMA_DIR)):
        shutil.rmtree(str(CHROMA_DIR), ignore_errors=True)
        os.makedirs(str(CHROMA_DIR), exist_ok=True)

    # 3. Delete any uploaded PDFs in data/ (but keep the directory itself)
    for entry in os.listdir(str(DATA_DIR)):
        entry_path = os.path.join(str(DATA_DIR), entry)
        # Keep the DB file (it's been emptied above)
        if entry_path == str(DB_PATH):
            continue
        try:
            if os.path.isfile(entry_path):
                os.remove(entry_path)
            elif os.path.isdir(entry_path):
                shutil.rmtree(entry_path, ignore_errors=True)
        except OSError:
            pass

    return {"message": "All user data has been permanently deleted."}


def _format_bytes(size: int) -> str:
    """Human-readable byte string, e.g. '1.2 GB', '340.5 MB'."""
    if size >= 1024 ** 3:
        return f"{size / (1024 ** 3):.1f} GB"
    if size >= 1024 ** 2:
        return f"{size / (1024 ** 2):.1f} MB"
    if size >= 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size} B"
