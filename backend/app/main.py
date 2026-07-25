"""
EduSync backend entrypoint.

Run locally with:
    python -m app.main
or:
    uvicorn app.main:app --host 127.0.0.1 --port 8000

IMPORTANT: the app must only ever bind to 127.0.0.1 (loopback). Binding to
0.0.0.0 would expose the API -- and therefore every locally stored document,
embedding, and mastery record -- to other devices on the same network,
which directly violates NFR-01 (Absolute Data Sovereignty) and the
localhost-only pillar of the Hardware-Bound Single-Tenant Authentication
model described in the report.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS, HOST, PORT
from app.database import init_db
from app.routers import analytics, auth, documents, query, quiz

app = FastAPI(
    title="EduSync API",
    description="Local-first, sovereign AI study assistant backend.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(query.router)
app.include_router(quiz.router)
app.include_router(analytics.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok", "bound_to": HOST}


if __name__ == "__main__":
    import uvicorn

    # host is intentionally NOT read from an environment variable / CLI flag
    # here, to make it harder to accidentally expose the API off-device.
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
