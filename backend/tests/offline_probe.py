"""Real cached embeddings with outgoing Python socket connections denied.
Run seed then verify in separate processes to check persistent Chroma/SQLite.
"""
import importlib
import json
import socket
import sys
import time
from pathlib import Path
from unittest.mock import patch

import pymupdf
import ctypes
from ctypes import wintypes
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]

class MemoryCounters(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ["PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage"]]

def rss():
    values = MemoryCounters()
    values.cb = ctypes.sizeof(values)
    ctypes.windll.kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    ctypes.windll.psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD]
    process = ctypes.windll.kernel32.GetCurrentProcess()
    if not ctypes.windll.psapi.GetProcessMemoryInfo(process, ctypes.byref(values), values.cb):
        raise ctypes.WinError()
    return values.WorkingSetSize
sys.path.insert(0, str(BACKEND))
root = BACKEND.parent / "tmp/offline-probe-final-2026-09-30"
root.mkdir(parents=True, exist_ok=True)
out = BACKEND.parent / "docs/testing/results/2026-09-30-offline"
out.mkdir(parents=True, exist_ok=True)
with patch("dotenv.load_dotenv", return_value=False), patch.object(Path, "mkdir"):
    config = importlib.import_module("app.config")
config.DATA_DIR = root / "data"
config.CHROMA_DIR = root / "vectors"
config.DB_PATH = config.DATA_DIR / "test.db"
config.GROQ_API_KEY = ""
config.JWT_SECRET = "offline-test-signing-secret-2026-only"
config.DATA_DIR.mkdir(exist_ok=True)
config.CHROMA_DIR.mkdir(exist_ok=True)
attempts = []
original = socket.socket.connect
def deny(self, address):
    if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1", "localhost"}:
        return original(self, address)
    attempts.append(str(address))
    raise OSError("External network disabled for offline probe")

with patch.object(socket.socket, "connect", deny):
    from app.main import app
    from app import security
    from app.services import ingestion
    with TestClient(app, raise_server_exceptions=False) as client:
        client.headers["Authorization"] = "Bearer " + security.create_session_token(1)
        records = []
        if sys.argv[1] == "seed":
            sid = client.post("/api/subjects", json={"name": "Offline Subject"}).json()["id"]
            with pymupdf.open() as doc:
                page = doc.new_page()
                page.insert_text((50, 70), "The Orion review cycle lasts 17 days. Its owner is Mira.")
                content = doc.tobytes()
            resident = [rss()]
            timings = []
            statuses = []
            for i in range(20):
                start = time.perf_counter()
                r = client.post(f"/api/subjects/{sid}/documents", files={"file": (f"offline-{i}.pdf", content, "application/pdf")})
                timings.append(time.perf_counter() - start)
                statuses.append(r.status_code)
                resident.append(rss())
            ids = [d["id"] for d in client.get(f"/api/subjects/{sid}/documents").json()]
            (out / "fixture_ids.json").write_text(json.dumps({"subject": sid, "documents": ids}))
            retrieved = ingestion.retrieve_relevant_chunks(sid, "Orion duration", document_ids=[ids[0]])
            records.append(dict(plan_id="SEC-03", description="Cached real ingestion and retrieval with Python outbound sockets blocked", status="Pass" if all(s == 201 for s in statuses) and retrieved else "Fail", observations=[{"uploads": statuses, "retrieved": retrieved, "blocked_socket_attempts": attempts, "limitation": "Python socket guard; not OS packet capture or proof of no native telemetry"}]))
            records.append(dict(plan_id="PERF-02", description="20 sequential real embedding uploads", status="Partial", observations=[{"statuses": statuses, "rss_bytes": resident, "seconds": timings, "limitation": "Small PDFs and sampled RSS, not peak memory or 8 GiB constrained validation"}]))
        else:
            ids = json.loads((out / "fixture_ids.json").read_text())
            docs = client.get(f"/api/subjects/{ids['subject']}/documents").json()
            chunks = ingestion.retrieve_relevant_chunks(ids["subject"], "Orion duration", document_ids=[ids["documents"][0]])
            records.append(dict(plan_id="DEP-02", description="Fresh process reopens real SQLite and Chroma", status="Pass" if len(docs) == 20 and chunks and "17" in chunks[0]["text"] else "Fail", observations=[{"documents": len(docs), "retrieved": chunks, "blocked_socket_attempts": attempts, "limitation": "Backend persistence only; no full browser restart or saved quiz/chat in this fixture"}]))
        (out / (sys.argv[1] + ".json")).write_text(json.dumps({"records": records}, indent=2), encoding="utf-8")
        print(json.dumps(records), flush=True)
