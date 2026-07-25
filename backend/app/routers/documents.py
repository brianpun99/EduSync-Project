"""
Subjects (folders) + document upload/ingestion.

FR-02: Structural File Validation. The upload handler rejects any file
over 10MB (or with a disallowed extension) BEFORE PyMuPDF/python-pptx
ever touches it -- both via the Content-Length header (fast path) and by
aborting mid-stream while writing to disk (defends against a spoofed
header), so an oversized file is never fully buffered or parsed.
"""

import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.config import (
    ALLOWED_UPLOAD_EXTENSIONS,
    DATA_DIR,
    MAX_SUBJECT_VECTOR_STORAGE_MB,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
)
from app.database import get_db
from app.schemas import DocumentOut, SubjectCreate, SubjectOut
from app.security import require_auth
from app.services.ingestion import (
    delete_document_vectors,
    estimate_subject_storage_mb,
    ingest_document,
)

router = APIRouter(prefix="/api/subjects", tags=["subjects"])

UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _subject_overall_mastery(db: sqlite3.Connection, subject_id: int) -> float:
    row = db.execute(
        "SELECT AVG(mastery_score) AS avg_score FROM topics WHERE subject_id = ?",
        (subject_id,),
    ).fetchone()
    return round(row["avg_score"], 1) if row and row["avg_score"] is not None else 0.0


@router.post("", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    try:
        cursor = db.execute("INSERT INTO subjects (name) VALUES (?)", (payload.name,))
    except sqlite3.IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A subject with this name already exists.")
    subject_id = cursor.lastrowid
    return SubjectOut(
        id=subject_id,
        name=payload.name,
        document_count=0,
        storage_used_mb=0.0,
        storage_limit_mb=MAX_SUBJECT_VECTOR_STORAGE_MB,
        overall_mastery=0.0,
    )


@router.get("", response_model=list[SubjectOut])
def list_subjects(
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    rows = db.execute("SELECT id, name FROM subjects ORDER BY name").fetchall()
    result = []
    for row in rows:
        doc_count = db.execute(
            "SELECT COUNT(*) AS c FROM documents WHERE subject_id = ?", (row["id"],)
        ).fetchone()["c"]
        result.append(
            SubjectOut(
                id=row["id"],
                name=row["name"],
                document_count=doc_count,
                storage_used_mb=estimate_subject_storage_mb(row["id"]),
                storage_limit_mb=MAX_SUBJECT_VECTOR_STORAGE_MB,
                overall_mastery=_subject_overall_mastery(db, row["id"]),
            )
        )
    return result


@router.get("/{subject_id}/documents", response_model=list[DocumentOut])
def list_documents(
    subject_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    rows = db.execute(
        "SELECT * FROM documents WHERE subject_id = ? ORDER BY created_at DESC", (subject_id,)
    ).fetchall()
    return [DocumentOut(**dict(row)) for row in rows]


@router.post("/{subject_id}/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    subject_id: int,
    file: UploadFile,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    subject = db.execute("SELECT id FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found.")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Only {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))} files are supported.",
        )

    # --- FR-02 fast path: reject obviously oversized uploads via the declared size.
    declared_size = file.size or 0
    if declared_size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"File exceeds the {MAX_UPLOAD_MB}MB limit.",
        )

    # --- FR-02 hard enforcement: stream to a temp path and abort mid-write if the
    # actual byte count ever exceeds the cap. This is the check that matters --
    # a client could lie about Content-Length, but it can't lie about bytes sent.
    tmp_path = UPLOAD_DIR / f"__tmp_{subject_id}_{file.filename}"
    bytes_written = 0
    try:
        with open(tmp_path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    out.close()
                    tmp_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE,
                        f"File exceeds the {MAX_UPLOAD_MB}MB limit.",
                    )
                out.write(chunk)
    finally:
        await file.close()

    final_path = UPLOAD_DIR / f"subj{subject_id}_{file.filename}"
    tmp_path.replace(final_path)

    cursor = db.execute(
        """
        INSERT INTO documents (subject_id, filename, file_size_bytes, status)
        VALUES (?, ?, ?, 'processing')
        """,
        (subject_id, file.filename, bytes_written),
    )
    document_id = cursor.lastrowid

    # Only now -- after validation has fully passed -- does parsing begin.
    try:
        page_count, chunk_count = ingest_document(subject_id, document_id, file.filename, final_path)
        db.execute(
            """
            UPDATE documents
            SET status = 'vectorized', page_count = ?, chunk_count = ?
            WHERE id = ?
            """,
            (page_count, chunk_count, document_id),
        )
    except Exception as exc:
        db.execute("UPDATE documents SET status = 'failed' WHERE id = ?", (document_id,))
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Ingestion failed: {exc}")

    row = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    return DocumentOut(**dict(row))


@router.delete("/{subject_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    subject_id: int,
    document_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _user_id: int = Depends(require_auth),
):
    doc = db.execute(
        "SELECT filename FROM documents WHERE id = ? AND subject_id = ?", (document_id, subject_id)
    ).fetchone()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")

    delete_document_vectors(subject_id, document_id)
    db.execute("DELETE FROM documents WHERE id = ?", (document_id,))

    file_path = UPLOAD_DIR / f"subj{subject_id}_{doc['filename']}"
    file_path.unlink(missing_ok=True)
