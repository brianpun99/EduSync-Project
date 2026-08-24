# EduSync Backend

FastAPI backend implementing the Hybrid Edge RAG architecture described in
the FYP report: local ingestion/retrieval (PyMuPDF + LangChain + ChromaDB),
cloud inference (Groq/OpenAI), and a SQLite-backed EWMA mastery engine.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then paste in your GROQ_API_KEY
python -m app.main
```

The API starts on `http://127.0.0.1:8000` **only** — it is not reachable
from other devices, by design (NFR-01 / Hardware-Bound Single-Tenant model).
Interactive API docs are available at `http://127.0.0.1:8000/docs` while the
server is running.

## Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Required for `/api/query` and `/api/quiz/generate` |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b` |
| `EDUSYNC_JWT_SECRET` | Signs local session tokens — set to a random string |
| `EDUSYNC_PORT` | Defaults to `8000` |

## Endpoint reference

| Endpoint | Frontend component | Notes |
|---|---|---|
| `GET /api/auth/status` | `auth.tsx` | tells the frontend whether to show Login or first-run Register |
| `POST /api/auth/register` | `auth.tsx` | rejected with 403 if an account already exists (single-tenant) |
| `POST /api/auth/login` | `auth.tsx` | returns a bearer token |
| `POST /api/auth/recover` | `auth.tsx` | offline recovery via the Master Recovery Key |
| `POST /api/subjects` | `subjects.tsx` | create a subject folder |
| `GET /api/subjects` | `subjects.tsx` | list folders with storage usage + mastery |
| `POST /api/subjects/{id}/documents` | `subjects.tsx` | upload; enforces FR-02 (10MB cap) before parsing |
| `GET /api/subjects/{id}/documents` | `subjects.tsx` | list documents in a folder |
| `DELETE /api/subjects/{id}/documents/{doc_id}` | `subjects.tsx` | removes file + its vectors |
| `POST /api/query` | `study-workspace.tsx` | grounded RAG chat answer + sources |
| `POST /api/quiz/generate` | `study-workspace.tsx`, `quiz.tsx` | Groq-generated MCQs, grounded in retrieved chunks |
| `POST /api/quiz/submit` | `quiz.tsx` | grades answers, updates EWMA mastery, flags weak topics |
| `GET /api/quiz/history` | `quiz-history.tsx` | full attempt history |
| `GET /api/analytics/dashboard` | `dashboard.tsx` | overall mastery + top weak topics |
| `GET /api/analytics/overview` | `analytics.tsx` | score trend + strong/good/weak tier counts |

All endpoints except `/api/auth/*` and `/api/health` require an
`Authorization: Bearer <token>` header obtained from `/api/auth/login`.

## Project layout

```
backend/
  app/
    main.py            # FastAPI app, CORS, localhost-only binding
    config.py           # every FR/NFR threshold in one place
    database.py          # SQLite schema + connection
    security.py           # bcrypt, recovery keys, JWT sessions
    schemas.py             # Pydantic request/response models
    routers/
      auth.py               # FR-01
      documents.py           # FR-02, subject/document CRUD
      query.py                 # FR-04
      quiz.py                   # FR-05 (submit) + quiz generation
      analytics.py               # read-only aggregation
    services/
      ingestion.py               # PDF/PPTX extraction, chunking, ChromaDB
      rag.py                      # Groq-backed grounded Q&A + quiz gen
      mastery.py                   # EWMA mastery calculation
  data/                           # SQLite DB + uploaded originals (gitignored)
  chroma_store/                   # local vector store (gitignored)
  requirements.txt
  .env.example
```

## Important first-run note: the embedding model

ChromaDB's default embedding function (`all-MiniLM-L6-v2`) is downloaded
and cached locally **the first time a document is ingested** — this is the
one moment the otherwise fully-offline ingestion pipeline needs an internet
connection. After that first download it is cached under
`~/.cache/chroma/onnx_models/` and every subsequent embedding call runs
100% locally, consistent with NFR-01. If you're demoing on a machine with
no internet access at all, either ingest one document while online first,
or pre-seed that cache directory ahead of time.

## Known gaps / next steps

- `python-jose`/session revocation on logout is not implemented — tokens
  simply expire after `JWT_EXPIRE_MINUTES`.
- The 100MB-per-subject vector storage ceiling is currently monitored
  (`storage_used_mb` on `SubjectOut`) but not yet **enforced** as a hard
  upload rejection — add that check in `documents.py` before calling
  `ingest_document()` once you've decided on the exact UX (e.g. block vs.
  warn-and-prune-oldest).
- No automated tests yet — recommend `pytest` + `httpx.AsyncClient` against
  a temp SQLite file and a mocked Groq client.
