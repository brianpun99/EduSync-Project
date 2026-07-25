"""
FR-01: Identity Verification.

Implements the "Hardware-Bound Single-Tenant Authentication" model:
  1. localhost-only binding            -> enforced in main.py / config.HOST
  2. rigid single-tenant lockout       -> enforced here + in routers/auth.py
  3. bcrypt-hashed credentials         -> enforced here
"""

import secrets
import string
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET

_bearer_scheme = HTTPBearer(auto_error=False)


# --- Password / recovery-key hashing -------------------------------------

def hash_secret(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed hash in the DB should never crash the request.
        return False


def generate_recovery_key() -> str:
    """Generates a human-writable offline recovery key, e.g. EDUSYNC-X7B9-M2Q4-P9L1."""
    alphabet = string.ascii_uppercase + string.digits
    groups = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    return "EDUSYNC-" + "-".join(groups)


# --- JWT session tokens ----------------------------------------------------
# Even though EduSync is single-tenant and offline-first, we still issue a
# short-lived bearer token after login so the React app doesn't need to
# resend the password on every request.

def create_session_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> int:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token.",
        )


def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> int:
    """FastAPI dependency: returns the authenticated user's id, or 401s."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    return decode_session_token(credentials.credentials)
