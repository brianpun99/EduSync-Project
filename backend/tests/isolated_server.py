"""Real Chroma/embedding/Groq integration server with entirely separate storage.

Only GROQ_API_KEY and GROQ_MODEL are read from the project's .env. Credentials
are never printed or copied. Start in a fresh process; synthetic fixtures only.
"""
import importlib
import os
import sys
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from dotenv import dotenv_values

root = Path(sys.argv[1]).resolve()
assert root.is_relative_to(BACKEND.parent / "tmp"), "Integration store must be inside project tmp"
root.mkdir(parents=True, exist_ok=True)
with patch("dotenv.load_dotenv", return_value=False), patch.object(Path, "mkdir"):
    config = importlib.import_module("app.config")
values = dotenv_values(BACKEND / ".env")
config.GROQ_API_KEY = values.get("GROQ_API_KEY") or os.getenv("GROQ_API_KEY", "")
config.GROQ_MODEL = values.get("GROQ_MODEL") or config.GROQ_MODEL
config.BASE_DIR = root
config.DATA_DIR = root / "data"
config.CHROMA_DIR = root / "chroma"
config.DB_PATH = config.DATA_DIR / "test.db"
config.JWT_SECRET = "isolated-integration-test-secret-2026-only"
config.ALLOWED_ORIGINS = ["http://127.0.0.1:3101", "http://localhost:3000"]
config.DATA_DIR.mkdir(exist_ok=True)
config.CHROMA_DIR.mkdir(exist_ok=True)
from app.main import app
import uvicorn
print("Isolated integration server; real vector store; provider key available:", bool(config.GROQ_API_KEY), flush=True)
uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[2]) if len(sys.argv) > 2 else 8101, log_level="warning")
