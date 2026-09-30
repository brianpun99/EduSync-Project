"""Safety boundary: configure a temporary app before importing any router.

The real config module is executed with dotenv and mkdir disabled, then paths
are replaced BEFORE importing SQLite, ingestion, or FastAPI. No production
database, uploaded PDF, .env, embedding model or provider client is opened.
Chroma is a contract double, not a test of actual vector search quality.
"""
import atexit
import importlib
import sys
import tempfile
import types
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import httpx
import pymupdf
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
if any(name.startswith("app.") for name in sys.modules):
    raise RuntimeError("Run this suite in a fresh process before importing app modules.")

_bootstrap = tempfile.TemporaryDirectory(prefix="edusync-test-bootstrap-")
atexit.register(_bootstrap.cleanup)
with patch("dotenv.load_dotenv", return_value=False), patch.object(Path, "mkdir"):
    config = importlib.import_module("app.config")
config.BASE_DIR = Path(_bootstrap.name)
config.DATA_DIR = config.BASE_DIR / "data"
config.DB_PATH = config.DATA_DIR / "test.db"
config.CHROMA_DIR = config.BASE_DIR / "vectors"
config.GROQ_API_KEY = ""
config.JWT_SECRET = "edusync-isolated-test-signing-secret-2026-only"
config.DATA_DIR.mkdir()
config.CHROMA_DIR.mkdir()


class CollectionDouble:
    def __init__(self):
        self.rows = {}
        self.queries = []

    def add(self, ids, documents, metadatas):
        for identifier, text, metadata in zip(ids, documents, metadatas):
            if identifier in self.rows:
                raise ValueError("Duplicate vector ID")
            self.rows[identifier] = (text, metadata)

    def count(self):
        return len(self.rows)

    def delete(self, where):
        self.rows = {k: v for k, v in self.rows.items()
                     if not all(v[1].get(key) == value for key, value in where.items())}

    def query(self, query_texts, n_results, where=None):
        self.queries.append({"query": query_texts, "n_results": n_results, "where": where})
        rows = [v for v in self.rows.values()
                if not where or all(v[1].get(k) == value for k, value in where.items())][:n_results]
        return {"documents": [[v[0] for v in rows]],
                "metadatas": [[v[1] for v in rows]],
                "distances": [[0.1 + i * 0.01 for i in range(len(rows))]]}


class ChromaDouble:
    def __init__(self, **kwargs):
        self.collections = {}

    def get_or_create_collection(self, name):
        return self.collections.setdefault(name, CollectionDouble())

    def delete_collection(self, name):
        self.collections.pop(name, None)


_chroma_module = types.ModuleType("chromadb")
_chroma_module.PersistentClient = ChromaDouble
with patch.dict(sys.modules, {"chromadb": _chroma_module}):
    from app import database, security
    from app.main import app
    from app.services import ingestion, mastery, rag
    from app.routers import documents, query, quiz, data


def case(plan_id, expected, gap=False):
    def decorate(fn):
        fn.plan_id = plan_id
        fn.expected = expected
        fn.gap_check = gap
        return fn
    return decorate


def pdf_bytes(text="The Orion review cycle lasts 17 days. A unit test checks one component."):
    with pymupdf.open() as doc:
        page = doc.new_page()
        if text:
            page.insert_text((50, 70), text)
        return doc.tobytes()


class IsolatedCase(unittest.TestCase):
    def setUp(self):
        self.observations = []
        self.temp = tempfile.TemporaryDirectory(prefix="edusync-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.data_dir = self.root / "data"
        self.upload_dir = self.data_dir / "uploads"
        self.vector_dir = self.root / "vectors"
        self.upload_dir.mkdir(parents=True)
        self.vector_dir.mkdir()
        self.db_path = self.data_dir / "test.db"
        self.vector_client = ChromaDouble()
        changes = [(database, "DB_PATH", self.db_path),
                   (documents, "UPLOAD_DIR", self.upload_dir),
                   (ingestion, "CHROMA_DIR", self.vector_dir),
                   (ingestion, "_chroma_client", self.vector_client),
                   (rag, "_client", None),
                   (data, "DATA_DIR", self.data_dir),
                   (data, "DB_PATH", self.db_path),
                   (data, "CHROMA_DIR", self.vector_dir)]
        for module, name, value in changes:
            self.enterContext(patch.object(module, name, value))
        # TestClient uses a different transport, so real outgoing HTTP is blocked.
        self.enterContext(patch.object(httpx.HTTPTransport, "handle_request",
                                      side_effect=AssertionError("External HTTP forbidden in tests")))
        self.enterContext(patch.object(httpx.AsyncHTTPTransport, "handle_async_request",
                                      side_effect=AssertionError("External HTTP forbidden in tests")))
        self.client = self.enterContext(TestClient(app, raise_server_exceptions=False))
        self.token = security.create_session_token(1)
        self.client.headers["Authorization"] = "Bearer " + self.token

    def observe(self, **values):
        self.observations.append(values)

    def sql(self, statement, parameters=()):
        with closing(database._connect()) as conn:
            with conn:
                return [dict(row) for row in conn.execute(statement, parameters).fetchall()]

    def count(self, table):
        allowed = {"users", "subjects", "documents", "topics", "quiz_history", "chat_history", "study_sessions"}
        assert table in allowed
        return self.sql(f"SELECT COUNT(*) AS n FROM {table}")[0]["n"]

    def subject(self, name="Software Engineering"):
        response = self.client.post("/api/subjects", json={"name": name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def upload(self, subject_id, name="notes.pdf", content=None):
        return self.client.post(f"/api/subjects/{subject_id}/documents",
                                files={"file": (name, pdf_bytes() if content is None else content, "application/pdf")})

    def document(self, subject_id):
        response = self.upload(subject_id)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def register(self, **changes):
        payload = {"email": "student.test@example.com", "username": "TestStudent", "password": "StudyTest2026!"}
        payload.update(changes)
        return self.client.post("/api/auth/register", json=payload)

    def submit(self, subject_id, selected="abcdb", topic="Unit Testing"):
        return self.client.post("/api/quiz/submit", json={"subject_id": subject_id, "topic": topic,
            "answers": [{"question_index": i, "selected_option_id": a, "correct_option_id": b}
                        for i, (a, b) in enumerate(zip(selected, "abcda"))]})
