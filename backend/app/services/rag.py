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
    "You are a quiz generator for a study app. Using ONLY the CONTEXT "
    "provided, write multiple-choice questions about the given topic. "
    "If the context contains multiple source documents, you MUST generate questions "
    "that cover concepts from EACH source document fairly and evenly. "
    "For each question, produce exactly one correct answer and three "
    "plausible but incorrect distractors (not random nonsense -- they "
    "should reflect common misconceptions). "
    "Crucially, you must also provide a detailed 'explanation' in a brief paragraph "
    "explaining why the correct answer is right and why the other 3 options are incorrect. "
    "Respond with STRICT JSON ONLY, no prose, no markdown fences, in this "
    "exact shape: "
    '{"questions": [{"question": str, "options": '
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
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        parts.append(f"[Source {i}: {chunk['filename']}]\n{chunk['text']}")
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


def generate_quiz(subject_id: int, topic: str, num_questions: int, difficulty: str, document_ids: list[int] | None = None) -> dict:
    client = _require_client()
    retrieval_k = max(8, len(document_ids) * 4) if document_ids else 8
    chunks = retrieve_relevant_chunks(subject_id, topic, top_k=retrieval_k, document_ids=document_ids)
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
