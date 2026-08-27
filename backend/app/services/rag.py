"""
Cloud inference layer (Section 2.4).

Only retrieved local text chunks + the user's question/topic are ever sent
to Groq -- never the raw document, never the vector store itself. The
system prompt explicitly constrains the model to the supplied context to
satisfy FR-04 (Grounded Knowledge Synthesis) and mitigate hallucination.
"""

import json
from typing import List

from groq import Groq

from app.config import GROQ_API_KEY, GROQ_MODEL
from app.services.ingestion import retrieve_relevant_chunks

_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

GROUNDED_SYSTEM_PROMPT = (
    "You are EduSync, a study assistant. Answer ONLY using the CONTEXT "
    "provided below. If the context does not contain enough information "
    "to answer, say so explicitly instead of guessing or using outside "
    "knowledge. Keep answers concise and cite which source document each "
    "claim comes from."
)

QUIZ_SYSTEM_PROMPT = (
    "You are an academic quiz generator for a study app. Using ONLY the CONTEXT "
    "provided below, generate multiple-choice questions matching the requested difficulty.\n\n"
    "CRITICAL RULES:\n"
    "1. If multiple SOURCE DOCUMENTS are present in the context, you MUST generate questions "
    "from EACH source document evenly (e.g. for 2 documents and 5 questions, create at least 2 questions "
    "from Document 1 and at least 2 questions from Document 2). Do NOT focus only on one document.\n"
    "2. For each question, you MUST set 'source_document' to the exact document filename it was drawn from.\n"
    "3. For each question, produce exactly one correct answer and three plausible distractors.\n"
    "4. Provide a detailed 'explanation' paragraph justifying why the correct answer is right and why the distractors are incorrect.\n\n"
    "Respond with STRICT JSON ONLY matching this shape:\n"
    '{"questions": [{"question": str, "source_document": str, "options": '
    '[{"id": "a", "text": str}, {"id": "b", "text": str}, '
    '{"id": "c", "text": str}, {"id": "d", "text": str}], '
    '"correct_option_id": str, "explanation": str}]}'
)


def _require_client() -> Groq:
    if _client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not configured. Set it in the environment "
            "before calling any RAG/quiz-generation endpoint."
        )
    return _client


def _format_context(chunks: List[dict]) -> str:
    if not chunks:
        return "(no relevant context was found in the uploaded documents)"
    # Group chunks cleanly by source document
    docs_map: dict[str, list[str]] = {}
    for c in chunks:
        fn = c.get("filename", "Unknown Document")
        docs_map.setdefault(fn, []).append(c.get("text", ""))

    parts = []
    for doc_name, texts in docs_map.items():
        joined_text = "\n\n".join(texts)
        parts.append(f"=== SOURCE DOCUMENT: {doc_name} ===\n{joined_text}")
    return "\n\n".join(parts)


def answer_question(subject_id: int, question: str, document_ids: list[int] | None = None) -> dict:
    client = _require_client()
    chunks = retrieve_relevant_chunks(subject_id, question, document_ids=document_ids)
    context = _format_context(chunks)

    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": GROUNDED_SYSTEM_PROMPT},
            {"role": "user", "content": f"CONTEXT:\n{context}\n\nQUESTION:\n{question}"},
        ],
        temperature=0.2,
    )
    answer_text = completion.choices[0].message.content

    sources = [
        {"document": c["filename"], "snippet": c["text"][:200], "score": c["score"]}
        for c in chunks
    ]
    return {"answer": answer_text, "sources": sources}


import concurrent.futures


def _generate_questions_for_single_doc(
    client: Groq,
    subject_id: int,
    doc_id: int,
    doc_num_questions: int,
    difficulty: str,
    topic: str,
) -> List[dict]:
    if doc_num_questions <= 0:
        return []
    chunks = retrieve_relevant_chunks(subject_id, topic, top_k=6, document_ids=[doc_id])
    if not chunks:
        return []
    doc_filename = chunks[0].get("filename", f"Document {doc_id}")
    context = _format_context(chunks)

    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"CONTEXT:\n{context}\n\n"
                    f"Generate exactly {doc_num_questions} multiple-choice questions at a {difficulty} difficulty level "
                    f"based STRICTLY on the contents of this document: '{doc_filename}'."
                ),
            },
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    raw = completion.choices[0].message.content
    try:
        parsed = json.loads(raw)
        questions = parsed.get("questions", [])
        for q in questions:
            q["source_document"] = doc_filename
        return questions
    except Exception:
        return []


def generate_quiz(
    subject_id: int,
    topic: str,
    num_questions: int,
    difficulty: str,
    document_ids: list[int] | None = None,
) -> dict:
    client = _require_client()

    # Multi-document generation: explicitly allocate question quotas per document
    if document_ids and len(document_ids) > 1:
        num_docs = len(document_ids)
        base_q = num_questions // num_docs
        remainder = num_questions % num_docs

        def _task(idx_and_doc_id: tuple[int, int]) -> List[dict]:
            idx, d_id = idx_and_doc_id
            allocated_count = base_q + (1 if idx < remainder else 0)
            return _generate_questions_for_single_doc(
                client=client,
                subject_id=subject_id,
                doc_id=d_id,
                doc_num_questions=allocated_count,
                difficulty=difficulty,
                topic=topic,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(5, num_docs)) as executor:
            batch_results = list(executor.map(_task, enumerate(document_ids)))

        combined_questions = [q for sublist in batch_results for q in sublist]

        # If combined generated count matches or exceeds, return sliced to num_questions
        if combined_questions:
            return {"questions": combined_questions[:num_questions]}

    # Fallback / Single-document generation
    chunks = retrieve_relevant_chunks(subject_id, topic, top_k=8, document_ids=document_ids)
    context = _format_context(chunks)

    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"CONTEXT:\n{context}\n\nTOPIC: {topic}\n"
                    f"Generate exactly {num_questions} questions at a {difficulty} difficulty level."
                ),
            },
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )

    raw = completion.choices[0].message.content
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}") from exc

    return parsed
