from typing import Annotated
from uuid import UUID

from fastapi import Header, HTTPException, status
from pydantic import BaseModel, ConfigDict

from careertwin.config import get_settings

ALLOWED_ROLES = {"admin", "recruiter", "reviewer", "auditor"}


class AuthContext(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    org_id: UUID
    user_id: UUID
    role: str


async def get_auth_context(
    org_id: Annotated[UUID | None, Header(alias="X-CareerTwin-Org-ID")] = None,
    user_id: Annotated[UUID | None, Header(alias="X-CareerTwin-User-ID")] = None,
    role: Annotated[str | None, Header(alias="X-CareerTwin-Role")] = None,
) -> AuthContext:
    """Development-only identity shim; production refuses traffic until a real adapter replaces it."""

    settings = get_settings()
    if settings.environment not in {"development", "test"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="production identity adapter is not configured",
        )
    if org_id is None or user_id is None or role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="valid development identity headers are required",
        )
    return AuthContext(org_id=org_id, user_id=user_id, role=role)


def require_write_role(context: AuthContext) -> None:
    if context.role not in {"admin", "recruiter", "reviewer"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="write access denied")

