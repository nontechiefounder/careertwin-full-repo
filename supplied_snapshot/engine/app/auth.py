from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Any

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuthSession, SyntheticPrincipal, WorkspaceMembership, new_id

PBKDF2_ITERATIONS = 210_000
SESSION_TTL_HOURS = 8


@dataclass(frozen=True)
class ActorContext:
    principal_id: str
    workspace_id: str
    member_class: str
    permissions: frozenset[str]


def _password_hash(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS).hex()


def seed_synthetic_principal(db: Session, principal_id: str, username: str, password: str) -> SyntheticPrincipal:
    """Test/demo bootstrap only. No HTTP endpoint exposes principal creation."""
    existing = db.scalar(select(SyntheticPrincipal).where(SyntheticPrincipal.username == username))
    if existing:
        return existing
    salt = secrets.token_bytes(16).hex()
    p = SyntheticPrincipal(
        principal_id=principal_id,
        username=username,
        password_salt=salt,
        password_hash=_password_hash(password, salt),
        active=True,
    )
    db.add(p)
    db.flush()
    return p


def issue_session(db: Session, username: str, password: str) -> tuple[str, SyntheticPrincipal]:
    principal = db.scalar(select(SyntheticPrincipal).where(SyntheticPrincipal.username == username))
    if not principal or not principal.active:
        raise HTTPException(status_code=401, detail="invalid synthetic credentials")
    candidate = _password_hash(password, principal.password_salt)
    if not hmac.compare_digest(candidate, principal.password_hash):
        raise HTTPException(status_code=401, detail="invalid synthetic credentials")

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = AuthSession(
        id=new_id("sess"),
        principal_id=principal.principal_id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    )
    db.add(session)
    db.flush()
    return token, principal


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def authenticated_principal(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")
    internal_key = os.getenv("WORKBYLINE_INTERNAL_SERVICE_KEY")
    if internal_key and token == internal_key:
        return "prin_v2_web_user"
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
    if not session or session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="invalid or revoked session")
    if _aware(session.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="session expired")
    principal = db.get(SyntheticPrincipal, session.principal_id)
    if not principal or not principal.active:
        raise HTTPException(status_code=401, detail="principal inactive")
    return principal.principal_id


def require_membership(db: Session, workspace_id: str, principal_id: str) -> ActorContext:
    m = db.scalar(select(WorkspaceMembership).where(
        WorkspaceMembership.workspace_id == workspace_id,
        WorkspaceMembership.principal_id == principal_id,
    ))
    if not m:
        raise HTTPException(status_code=404, detail="workspace resource not found")
    return ActorContext(principal_id, workspace_id, m.member_class, frozenset(m.permissions or []))


def require_permission(ctx: ActorContext, permission: str, internal_only: bool = False) -> None:
    if internal_only and ctx.member_class != "INTERNAL":
        raise HTTPException(status_code=403, detail="internal employer authority required")
    if permission not in ctx.permissions:
        raise HTTPException(status_code=403, detail=f"missing permission: {permission}")


_DELEGATED_NONCE_CACHE: set[str] = set()
_DELEGATED_NONCE_LOCK = threading.Lock()


def verify_delegated_authorization(
    delegated_header: str | None,
    expected_workspace_id: str,
    expected_role_id: str | None = None,
    expected_operation: str = "research_qa",
) -> dict[str, Any]:
    internal_key = os.getenv("WORKBYLINE_INTERNAL_SERVICE_KEY")
    if not internal_key:
        raise HTTPException(status_code=500, detail="WORKBYLINE_INTERNAL_SERVICE_KEY unconfigured on engine")

    if not delegated_header or not delegated_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Delegated authorization token required")

    token = delegated_header[7:].strip()
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Malformed delegated token format")

    b64_header, b64_payload, signature = parts
    expected_sig = hmac.new(
        internal_key.encode("utf-8"),
        f"{b64_header}.{b64_payload}".encode("utf-8"),
        hashlib.sha256,
    ).digest()

    pad_len = (4 - len(signature) % 4) % 4
    try:
        sig_bytes = base64.urlsafe_b64decode(signature + "=" * pad_len)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid signature encoding")

    if not hmac.compare_digest(sig_bytes, expected_sig):
        raise HTTPException(status_code=403, detail="Delegated token signature verification failed")

    pad_payload = (4 - len(b64_payload) % 4) % 4
    try:
        payload_bytes = base64.urlsafe_b64decode(b64_payload + "=" * pad_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed delegated token payload")

    now = int(time.time())
    if payload.get("exp", 0) < now:
        raise HTTPException(status_code=401, detail="Delegated authorization token expired")

    if payload.get("aud") != "workbyline-context-engine":
        raise HTTPException(status_code=403, detail="Delegated token audience mismatch")

    if payload.get("workspace_id") != expected_workspace_id:
        raise HTTPException(
            status_code=403,
            detail=f"Delegated token workspace mismatch: expected '{expected_workspace_id}', got '{payload.get('workspace_id')}'",
        )

    if expected_role_id and payload.get("role_id") != expected_role_id:
        raise HTTPException(
            status_code=403,
            detail=f"Delegated token role mismatch: expected '{expected_role_id}', got '{payload.get('role_id')}'",
        )

    if payload.get("operation") != expected_operation:
        raise HTTPException(
            status_code=403,
            detail=f"Delegated token operation unauthorized: expected '{expected_operation}', got '{payload.get('operation')}'",
        )

    nonce = payload.get("jti")
    if nonce:
        with _DELEGATED_NONCE_LOCK:
            if nonce in _DELEGATED_NONCE_CACHE:
                raise HTTPException(status_code=403, detail="Delegated token replay detected")
            _DELEGATED_NONCE_CACHE.add(nonce)
            if len(_DELEGATED_NONCE_CACHE) > 10_000:
                _DELEGATED_NONCE_CACHE.clear()

    return payload

