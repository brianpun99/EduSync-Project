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
import fitz  # PyMuPDF
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


def extract_text_pdf(file_path: Path) -> tuple[str, int]:
    doc = fitz.open(file_path)
    try:
        page_count = doc.page_count
        text = "\n\n".join(page.get_text() for page in doc)
    finally:
        doc.close()
    return text, page_count


def extract_text(file_path: Path) -> tuple[str, int]:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_pdf(file_path)
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_text(text: str) -> List[str]:
    chunks = _splitter.split_text(text)
    # Drop near-empty fragments (headers, page numbers, stray whitespace).
    return [c.strip() for c in chunks if len(c.strip()) > 20]


def ingest_document(
    subject_id: int,
    document_id: int,
    filename: str,
    file_path: Path,
) -> tuple[int, int]:
    """
    Extracts, chunks, and vectorizes a document into the subject's local
    ChromaDB collection.

    Returns (page_count, chunk_count).
    """
    text, page_count = extract_text(file_path)
    chunks = chunk_text(text)

    if chunks:
        collection = get_collection(subject_id)
        ids = [f"doc{document_id}_chunk{i}" for i in range(len(chunks))]
        metadatas = [
            {"document_id": document_id, "filename": filename, "chunk_index": i}
            for i in range(len(chunks))
        ]
        # ChromaDB's default embedding function runs locally (all-MiniLM-L6-v2),
        # so no text is sent anywhere during this call.
        collection.add(ids=ids, documents=chunks, metadatas=metadatas)

    return page_count, len(chunks)


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


def retrieve_relevant_chunks(subject_id: int, query: str, top_k: int = RETRIEVAL_TOP_K):
    collection = get_collection(subject_id)
    if collection.count() == 0:
        return []
    results = collection.query(query_texts=[query], n_results=min(top_k, collection.count()))
    chunks = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    for doc_text, meta, distance in zip(documents, metadatas, distances):
        chunks.append(
            {
                "text": doc_text,
                "filename": meta.get("filename", "unknown"),
                # Chroma returns a distance; convert to an intuitive 0-1 similarity score.
                "score": round(max(0.0, 1 - distance), 3),
            }
        )
    return chunks
