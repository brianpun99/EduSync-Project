<p align="center">
  <img src="frontend/public/icon.svg" alt="EduSync Logo" width="80" />
</p>

<h1 align="center">EduSync — AI Study Assistant</h1>

<p align="center">
  <strong>A privacy-first, local-first adaptive AI study assistant</strong><br/>
  Upload your study materials, ask grounded questions, generate quizzes, and track knowledge gaps — all without your data ever leaving your machine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-Next.js_16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/LLM-Groq_(GPT--oss--120B)-orange?logo=openai" alt="Groq / GPT-oss-120B" />
  <img src="https://img.shields.io/badge/Vector_DB-ChromaDB-blueviolet" alt="ChromaDB" />
  <img src="https://img.shields.io/badge/License-FYP_(Academic)-lightgrey" alt="License" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Known Limitations & Future Work](#known-limitations--future-work)
- [License](#license)

---

## Overview

**EduSync** is a Final Year Project (FYP) that implements a **Hybrid Edge-RAG (Retrieval-Augmented Generation)** study assistant. It combines:

- **Local ingestion & retrieval** — PDF text extraction (PyMuPDF), semantic chunking (LangChain), and vector storage (ChromaDB) all run on your machine.
- **Cloud inference** — only small, retrieved text chunks and the user's question are sent to the Groq API (currently using `openai/gpt-oss-120b`) for grounded answers and quiz generation.
- **Adaptive mastery tracking** — an EWMA-based engine tracks per-topic mastery and surfaces knowledge gaps.

The result is an app where **no raw documents, embeddings, or personal data ever leave the device**, while still leveraging state-of-the-art LLM capabilities for Q&A and quiz generation.

---

## Key Features

| Feature | Description |
|---|---|
| 📄 **Document Management** | Upload PDFs organized by subject. Files are validated (10 MB cap), extracted, chunked, and vectorized locally. |
| 💬 **Grounded RAG Chat** | Ask questions about your documents. Answers cite source documents and are constrained to uploaded material — no hallucinations. |
| 📝 **AI Quiz Generation** | Generate multiple-choice quizzes grounded in your documents, with configurable topic, difficulty, and question count. |
| 📊 **Mastery Analytics** | EWMA-based knowledge tracing flags weak topics and tracks score trends over time via a dashboard. |
| 🔒 **Privacy-First Design** | Single-tenant, localhost-only architecture. bcrypt-hashed credentials, JWT sessions, and offline recovery keys. |
| 🌙 **Dark Mode UI** | Modern dark-themed interface built with shadcn/ui components and Tailwind CSS 4. |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        USER'S MACHINE                            │
│                                                                   │
│  ┌─────────────────────┐          ┌──────────────────────────┐   │
│  │   Next.js Frontend  │  HTTP    │     FastAPI Backend       │   │
│  │   (localhost:3000)   │ ──────► │     (localhost:8000)       │   │
│  │                     │          │                            │   │
│  │  • Subjects page    │          │  ┌──────────┐             │   │
│  │  • Study workspace  │          │  │ Ingestion│ PyMuPDF     │   │
│  │  • Quiz interface   │          │  │ Service  │ + LangChain │   │
│  │  • Analytics dash   │          │  └────┬─────┘             │   │
│  │  • Landing page     │          │       │                    │   │
│  └─────────────────────┘          │       ▼                    │   │
│                                   │  ┌──────────┐             │   │
│                                   │  │ ChromaDB │ (on-disk)   │   │
│                                   │  │ Vectors  │             │   │
│                                   │  └────┬─────┘             │   │
│                                   │       │                    │   │
│                                   │       ▼                    │   │
│                                   │  ┌──────────┐             │   │
│                                   │  │ RAG      │ chunks +    │   │
│                                   │  │ Service  │─── query ───┼───┼──► Groq API
│                                   │  └────┬─────┘             │   │    (GPT-oss-120B)
│                                   │       │                    │   │
│                                   │       ▼                    │   │
│                                   │  ┌──────────┐             │   │
│                                   │  │ Mastery  │ EWMA        │   │
│                                   │  │ Engine   │ scoring     │   │
│                                   │  └──────────┘             │   │
│                                   │                            │   │
│                                   │  ┌──────────┐             │   │
│                                   │  │ SQLite   │ users,      │   │
│                                   │  │ Database │ subjects,   │   │
│                                   │  │          │ quiz_history │   │
│                                   │  └──────────┘             │   │
│                                   └──────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

> **Only retrieved text chunks and the user's question are sent to the Groq API.** Raw documents, embeddings, and the vector database remain entirely local.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org/) (React 19) | App router, SSR, file-based routing |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first styling |
| [shadcn/ui](https://ui.shadcn.com/) + Radix UI | Accessible component library |
| [TanStack React Query](https://tanstack.com/query/) | Server state management & caching |
| [Axios](https://axios-http.com/) | HTTP client with interceptors |
| [Recharts](https://recharts.org/) | Analytics charts |
| [Lucide React](https://lucide.dev/) | Icon library |
| [Zod](https://zod.dev/) + React Hook Form | Form validation |

### Backend

| Technology | Purpose |
|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | REST API framework |
| [Uvicorn](https://www.uvicorn.org/) | ASGI server |
| [SQLite](https://sqlite.org/) | Local relational database |
| [ChromaDB](https://www.trychroma.com/) | Local vector database (on-disk) |
| [PyMuPDF (fitz)](https://pymupdf.readthedocs.io/) | PDF text extraction |
| [LangChain Text Splitters](https://python.langchain.com/) | Recursive semantic chunking |
| [Groq SDK](https://console.groq.com/) | Cloud LLM inference (currently `openai/gpt-oss-120b`) |
| [bcrypt](https://pypi.org/project/bcrypt/) | Password hashing |
| [PyJWT](https://pyjwt.readthedocs.io/) | JWT session tokens |
| [Pydantic v2](https://docs.pydantic.dev/) | Request/response validation |

---

## Prerequisites

- **Python 3.10+** — for the backend
- **Node.js 18+** and **npm** (or pnpm) — for the frontend
- **Groq API Key** — free at [console.groq.com](https://console.groq.com/)
- **Internet connection** — required once for ChromaDB to download the `all-MiniLM-L6-v2` embedding model on first document ingestion; after that, embeddings run fully offline

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/brianpun99/EduSync-Project.git
cd EduSync-Project
```

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Open .env and paste your GROQ_API_KEY

# Start the backend server
python -m app.main
```

The API will start at **`http://127.0.0.1:8000`** (localhost only, by design).

> 📖 Interactive API documentation is available at [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs) while the server is running.

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will start at **`http://localhost:3000`**.

> **First-time note:** On initial launch, EduSync will prompt you to register a single-tenant account. A Master Recovery Key is displayed once — **store it safely**.

---

## Environment Variables

Create a `.env` file inside the `backend/` directory (use `.env.example` as a template):

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ Yes | — | API key for Groq cloud inference (RAG chat & quiz generation) |
| `GROQ_MODEL` | No | `llama-3.1-8b-instant` | Override the default model served by Groq (currently set to `openai/gpt-oss-120b`) |
| `EDUSYNC_JWT_SECRET` | No | `change-me-in-production` | Secret used to sign local session tokens. Set to a random string in production |
| `EDUSYNC_PORT` | No | `8000` | Local port the API listens on (bound to `127.0.0.1` only) |

---

## API Reference

All endpoints except `/api/auth/*` and `/api/health` require an `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/status` | Check if an account exists (show Login vs. Register) |
| `POST` | `/api/auth/register` | Create the single-tenant account (rejected if one already exists) |
| `POST` | `/api/auth/login` | Authenticate and receive a bearer token |
| `POST` | `/api/auth/recover` | Offline account recovery via Master Recovery Key |

### Subjects & Documents

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/subjects` | Create a subject folder |
| `GET` | `/api/subjects` | List subjects with storage usage and mastery |
| `POST` | `/api/subjects/{id}/documents` | Upload a document (10 MB cap enforced) |
| `GET` | `/api/subjects/{id}/documents` | List documents in a subject |
| `DELETE` | `/api/subjects/{id}/documents/{doc_id}` | Delete a document and its vectors |

### RAG Query

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/query` | Grounded Q&A — returns an answer with cited source chunks |

### Quiz

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/quiz/generate` | Generate MCQs grounded in retrieved document chunks |
| `POST` | `/api/quiz/submit` | Grade answers, update EWMA mastery, flag weak topics |
| `GET` | `/api/quiz/history` | Retrieve full quiz attempt history |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/dashboard` | Overall mastery score and top weak topics |
| `GET` | `/api/analytics/overview` | Score trends, tier counts (strong/good/weak) |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (returns bound host) |

---

## Project Structure

```
EduSync-Project/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, localhost-only binding
│   │   ├── config.py               # Centralized FR/NFR thresholds & settings
│   │   ├── database.py             # SQLite schema & connection management
│   │   ├── security.py             # bcrypt hashing, recovery keys, JWT sessions
│   │   ├── schemas.py              # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── auth.py             # FR-01: Identity verification
│   │   │   ├── documents.py        # FR-02: Subject & document CRUD
│   │   │   ├── query.py            # FR-04: Grounded RAG chat
│   │   │   ├── quiz.py             # FR-05: Quiz generation & submission
│   │   │   └── analytics.py        # Read-only mastery aggregation
│   │   └── services/
│   │       ├── ingestion.py        # PDF extraction, chunking, ChromaDB storage
│   │       ├── rag.py              # Groq-backed Q&A and quiz generation
│   │       └── mastery.py          # EWMA mastery scoring engine
│   ├── data/                       # SQLite DB + uploaded files (gitignored)
│   ├── chroma_store/               # Local vector store (gitignored)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (Geist font, dark theme)
│   │   ├── page.tsx                # Landing page entry
│   │   ├── providers.tsx           # React Query + theme providers
│   │   ├── globals.css             # Tailwind CSS 4 global styles
│   │   ├── (auth)/
│   │   │   └── login/page.tsx      # Login / Register page
│   │   └── (main)/
│   │       ├── layout.tsx          # Authenticated layout with sidebar
│   │       ├── dashboard/          # Dashboard with mastery overview
│   │       ├── subjects/           # Subject & document management
│   │       ├── study/[subjectId]/  # Study workspace (RAG chat + PDF viewer)
│   │       ├── quiz/               # Quiz interface
│   │       ├── analytics/          # Score trends & performance analytics
│   │       └── settings/           # User settings
│   ├── components/
│   │   ├── landing-page.tsx        # Hero landing page component
│   │   ├── sidebar.tsx             # App navigation sidebar
│   │   ├── theme-provider.tsx      # Dark/light theme context
│   │   └── ui/                     # 57 shadcn/ui components
│   ├── lib/
│   │   ├── api.ts                  # Axios client with auth interceptors
│   │   └── utils.ts                # Shared utility functions
│   ├── hooks/
│   │   ├── use-mobile.ts           # Responsive breakpoint hook
│   │   └── use-toast.ts            # Toast notification hook
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.mjs
│
├── .gitignore
└── README.md                       # ← You are here
```

---

## Design Decisions

### Why localhost-only?

EduSync enforces **NFR-01: Absolute Data Sovereignty**. The backend binds exclusively to `127.0.0.1` and this value is intentionally hardcoded (not configurable via environment variable) to prevent accidental network exposure of study materials and personal data.

### Why a single-tenant model?

The app uses a `CHECK (id = 1)` constraint on the `users` table, guaranteeing exactly one account per installation. This eliminates multi-user access control complexity and aligns with the Hardware-Bound Single-Tenant Authentication model described in the FYP report.

### Why Hybrid Edge-RAG instead of fully local LLM?

Running a large language model locally requires significant GPU resources. The Hybrid Edge-RAG approach keeps **all data ingestion, embedding, and retrieval local** while only sending small, pre-retrieved text chunks to the cloud for inference — a practical compromise that achieves high answer quality with minimal data exposure.

### Why EWMA for mastery tracking?

Exponentially Weighted Moving Average gives more weight to recent quiz performance, so a topic the student just struggled with is flagged faster than one they got wrong months ago. The formula is:

```
new_score = α × latest_result + (1 − α) × previous_score    (α = 0.35)
```

Topics scoring below 60% are automatically flagged as knowledge gaps.

---

## Known Limitations & Future Work

| Area | Status | Notes |
|---|---|---|
| **Token revocation** | 🔴 Not implemented | JWT tokens expire after 12 hours but cannot be revoked on logout |
| **Storage ceiling enforcement** | 🟡 Monitored only | The 100 MB/subject vector storage limit is tracked but not yet enforced as a hard rejection |
| **Automated tests** | 🔴 Not present | Recommended: `pytest` + `httpx.AsyncClient` with a temp SQLite file and mocked Groq client |
| **File format support** | 🟡 PDF only | The ingestion pipeline is extensible but currently only supports PDF uploads |
| **Embedding model download** | 🟡 First-run only | ChromaDB's `all-MiniLM-L6-v2` model requires internet on first document ingest; cached locally afterward |

---

## License

This project was developed as an academic Final Year Project (FYP). Please refer to your institution's guidelines regarding usage and distribution.
