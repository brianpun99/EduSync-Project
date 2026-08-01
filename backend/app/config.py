"""
Central configuration for the EduSync backend.

Every hard constraint from the FYP report's Functional / Non-Functional
Requirements tables lives here as a single source of truth, so the rest
of the codebase never hardcodes a limit in more than one place.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend root (one level up from this file's parent)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# --- Paths -------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "edusync.db"
CHROMA_DIR = BASE_DIR / "chroma_store"

DATA_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

# --- NFR-01: Absolute Data Sovereignty ---------------------------------
# The server only ever binds to loopback. Never change this to "0.0.0.0"
# without re-reading NFR-01 / the Hardware-Bound Single-Tenant model.
HOST = "127.0.0.1"
PORT = int(os.getenv("EDUSYNC_PORT", "8000"))

# CORS: only the local React dev server / packaged frontend may call the API.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# --- FR-02: Structural File Validation ----------------------------------
MAX_UPLOAD_MB = 10
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {".pdf"}
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "application/pdf",
}

# --- NFR-02: System Stability (vector storage ceiling) -------------------
MAX_SUBJECT_VECTOR_STORAGE_MB = 100

# --- FR-05: Algorithmic Learning Evaluation ------------------------------
MASTERY_THRESHOLD = 60.0        # below this => topic flagged as a knowledge gap
EWMA_ALPHA = 0.35               # weight given to the most recent quiz attempt

# --- Semantic chunking ----------------------------------------------------
CHUNK_SIZE = 800
CHUNK_OVERLAP = 120
RETRIEVAL_TOP_K = 5

# --- Cloud inference (Groq / Llama-3) -------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# --- Auth / session -------------------------------------------------------
JWT_SECRET = os.getenv("EDUSYNC_JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 12
