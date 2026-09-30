"""
Local ingestion & retrieval layer (Section 2.3 of the system design doc).

Everything in this module runs entirely offline:
  1. Text extraction  -- PyMuPDF (PDF)
  2. Semantic chunking -- LangChain's RecursiveCharacterTextSplitter
  3. Vector storage    -- a local, on-disk ChromaDB instance (no network calls)

No raw document text or embedding ever leaves this process.
"""

from pathlib import Path
from typing import List

import chromadb
import pymupdf as fitz
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import CHROMA_DIR, CHUNK_OVERLAP, CHUNK_SIZE, RETRIEVAL_TOP_K

_chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def _collection_name(subject_id: int) -> str:
    # One ChromaDB collection per subject folder, matching the frontend's
    # per-subject storage-usage display.
    return f"subject_{subject_id}"


def get_collection(subject_id: int):
    return _chroma_client.get_or_create_collection(name=_collection_name(subject_id))


def extract_pdf_pages(file_path: Path) -> list[tuple[int, str]]:
    doc = fitz.open(file_path)
    pages = []
    try:
        for idx in range(doc.page_count):
            page_text = doc[idx].get_text()
            pages.append((idx + 1, page_text))
    finally:
        doc.close()
    return pages


def extract_text_pdf(file_path: Path) -> tuple[str, int]:
    pages = extract_pdf_pages(file_path)
    text = "\n\n".join(p[1] for p in pages)
    return text, len(pages)


def extract_text(file_path: Path) -> tuple[str, int]:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_pdf(file_path)
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_document_pages(pages: list[tuple[int, str]]) -> list[dict]:
    chunks = []
    for page_num, text in pages:
        clean = text.strip()
        if not clean:
            continue
        page_chunks = _splitter.split_text(clean)
        for c in page_chunks:
            s = c.strip()
            if len(s) > 20:
                chunks.append({"text": s, "page_number": page_num})
    return chunks


def chunk_text(text: str) -> List[str]:
    chunks = _splitter.split_text(text)
    return [c.strip() for c in chunks if len(c.strip()) > 20]


def ingest_document(
    subject_id: int,
    document_id: int,
    filename: str,
    file_path: Path,
) -> tuple[int, int]:
    """
    Extracts, chunks, and vectorizes a document into the subject's local
    ChromaDB collection with page-level metadata.

    Returns (page_count, chunk_count).
    """
    suffix = file_path.suffix.lower()
    if suffix != ".pdf":
        raise ValueError(f"Unsupported file type: {suffix}")

    pages = extract_pdf_pages(file_path)
    page_count = len(pages)
    chunk_items = chunk_document_pages(pages)

    if chunk_items:
        collection = get_collection(subject_id)
        # Remove any existing vectors for this document first to avoid duplication
        try:
            collection.delete(where={"document_id": document_id})
        except Exception:
            pass

        ids = [f"doc{document_id}_chunk{i}" for i in range(len(chunk_items))]
        documents = [c["text"] for c in chunk_items]
        metadatas = [
            {
                "document_id": document_id,
                "filename": filename,
                "chunk_index": i,
                "page_number": chunk_items[i]["page_number"],
            }
            for i in range(len(chunk_items))
        ]
        collection.add(ids=ids, documents=documents, metadatas=metadatas)

    return page_count, len(chunk_items)


def delete_document_vectors(subject_id: int, document_id: int) -> None:
    collection = get_collection(subject_id)
    collection.delete(where={"document_id": document_id})

def delete_subject_vectors(subject_id: int) -> None:
    try:
        _chroma_client.delete_collection(name=_collection_name(subject_id))
    except Exception:
        pass


def estimate_subject_storage_mb(subject_id: int) -> float:
    """
    Rough on-disk estimate of a subject's vector storage, used to enforce the
    100MB-per-subject ceiling (NFR-02).
    """
    collection_dir = CHROMA_DIR
    total_bytes = sum(f.stat().st_size for f in collection_dir.rglob("*") if f.is_file())
    return round(total_bytes / (1024 * 1024), 2)


def retrieve_relevant_chunks(
    subject_id: int,
    query: str,
    top_k: int = RETRIEVAL_TOP_K,
    document_ids: list[int] | None = None,
):
    collection = get_collection(subject_id)
    if collection.count() == 0:
        return []

    # If multiple document_ids are specified, perform stratified (balanced) retrieval
    # across each selected document so that one document cannot starve out the others.
    if document_ids and len(document_ids) > 1:
        per_doc_k = max(2, (top_k + len(document_ids) - 1) // len(document_ids))
        chunks = []
        for doc_id in document_ids:
            try:
                results = collection.query(
                    query_texts=[query],
                    n_results=min(per_doc_k, collection.count()),
                    where={"document_id": doc_id},
                )
                docs = results.get("documents", [[]])[0]
                metas = results.get("metadatas", [[]])[0]
                dists = results.get("distances", [[]])[0]
                for doc_text, meta, distance in zip(docs, metas, dists):
                    chunks.append(
                        {
                            "text": doc_text,
                            "filename": meta.get("filename", "unknown"),
                            "document_id": meta.get("document_id", doc_id),
                            "page_number": meta.get("page_number"),
                            "score": round(max(0.0, 1 - distance), 3),
                        }
                    )
            except Exception:
                continue
        # Retain balanced chunks sorted by score
        chunks.sort(key=lambda c: c["score"], reverse=True)
        return chunks

    # Single document or entire subject
    where_filter = None
    if document_ids and len(document_ids) == 1:
        where_filter = {"document_id": document_ids[0]}

    results = collection.query(
        query_texts=[query],
        n_results=min(top_k, collection.count()),
        where=where_filter,
    )
    chunks = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    for doc_text, meta, distance in zip(documents, metadatas, distances):
        chunks.append(
            {
                "text": doc_text,
                "filename": meta.get("filename", "unknown"),
                "document_id": meta.get("document_id"),
                "page_number": meta.get("page_number"),
                "score": round(max(0.0, 1 - distance), 3),
            }
        )
    return chunks

