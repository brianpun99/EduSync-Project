"""
Local SQLite persistence layer.

Mirrors the ERD from Section 3.5.2: a single-tenant `users` table acts as
the zero-trust security gate, and `subjects` / `documents` / `topics` /
`quiz_history` implement the relational mapping that powers the DKT
(EWMA-based) mastery engine.
"""

import sqlite3
from typing import Iterator

from app.config import DB_PATH


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """
    FastAPI dependency: yields a connection, commits on success, rolls back on
    error. Deliberately a plain generator function (NOT wrapped in
    @contextlib.contextmanager) -- FastAPI's Depends() has built-in support
    for generator dependencies and handles the try/finally teardown itself.
    Wrapping this in @contextmanager breaks that detection (its @wraps sets
    __wrapped__, which makes FastAPI treat the wrapper as a generator
    function while actually calling it returns a context-manager object,
    not a generator), causing a TypeError/AttributeError at request time.
    """
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY CHECK (id = 1), -- single-tenant: exactly one row, ever
    email           TEXT NOT NULL UNIQUE,
    username        TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    recovery_key_hash TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id      INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    page_count      INTEGER,
    chunk_count     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'processing', -- processing | vectorized | failed
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id      INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    mastery_score   REAL NOT NULL DEFAULT 0,
    is_weak         INTEGER NOT NULL DEFAULT 1, -- boolean flag, per FR-05
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(subject_id, name)
);

CREATE TABLE IF NOT EXISTS quiz_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id        INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    score           REAL NOT NULL,        -- percentage, 0-100
    correct_count   INTEGER NOT NULL,
    total_count     INTEGER NOT NULL,
    taken_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def init_db() -> None:
    conn = _connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
