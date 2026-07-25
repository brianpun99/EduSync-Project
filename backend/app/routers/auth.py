"""
FR-01: Identity Verification / single-tenant registration gate.

EduSync only ever allows ONE account (id=1 in the users table, enforced
by a CHECK constraint at the DB layer as a second line of defence). Once
that account exists, /register must always be rejected -- this endpoint
is what auth.tsx's "Create Account" flow hits.
"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.schemas import (
    LoginRequest,
    RecoverRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
)
from app.security import (
    create_session_token,
    generate_recovery_key,
    hash_secret,
    verify_secret,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: sqlite3.Connection = Depends(get_db)):
    existing = db.execute("SELECT id FROM users LIMIT 1").fetchone()
    if existing is not None:
        # Single-tenant lockout -- this is not a generic "email taken" error.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An account already exists on this device. EduSync supports one local account.",
        )

    recovery_key = generate_recovery_key()
    db.execute(
        """
        INSERT INTO users (id, email, username, password_hash, recovery_key_hash)
        VALUES (1, ?, ?, ?, ?)
        """,
        (
            payload.email.lower(),
            payload.username,
            hash_secret(payload.password),
            hash_secret(recovery_key),
        ),
    )
    return RegisterResponse(recovery_key=recovery_key)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE email = ?", (payload.email.lower(),)
    ).fetchone()
    if row is None or not verify_secret(payload.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return TokenResponse(access_token=create_session_token(row["id"]))


@router.post("/recover", response_model=TokenResponse)
def recover(payload: RecoverRequest, db: sqlite3.Connection = Depends(get_db)):
    """Offline recovery: prove ownership via the Master Recovery Key, then set a new password."""
    row = db.execute(
        "SELECT id, recovery_key_hash FROM users WHERE email = ?", (payload.email.lower(),)
    ).fetchone()
    if row is None or not verify_secret(payload.recovery_key, row["recovery_key_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or recovery key.",
        )
    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hash_secret(payload.new_password), row["id"]),
    )
    return TokenResponse(access_token=create_session_token(row["id"]))


@router.get("/status")
def auth_status(db: sqlite3.Connection = Depends(get_db)):
    """Lets the frontend decide whether to show Login or the first-run Register screen."""
    existing = db.execute("SELECT id FROM users LIMIT 1").fetchone()
    return {"account_exists": existing is not None}
