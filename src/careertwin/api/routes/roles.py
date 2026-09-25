from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from careertwin.api.auth import AuthContext, get_auth_context, require_write_role
from careertwin.api.dependencies import get_role_repository
from careertwin.api.schemas import CreateRoleRequest
from careertwin.domain.models import Role
from careertwin.persistence.repositories import PostgresRoleRepository

router = APIRouter(prefix="/v1/roles", tags=["roles"])


@router.post("", response_model=Role, status_code=status.HTTP_201_CREATED)
async def create_role(
    request: CreateRoleRequest,
    repo: PostgresRoleRepository = Depends(get_role_repository),
    auth: AuthContext = Depends(get_auth_context),
) -> Role:
    require_write_role(auth)
    role = request.to_domain(auth.org_id)
    return await repo.create(role)


@router.get("/{role_id}", response_model=Role)
async def get_role(
    role_id: UUID,
    repo: PostgresRoleRepository = Depends(get_role_repository),
    auth: AuthContext = Depends(get_auth_context),
) -> Role:
    role = await repo.get(role_id)
    if role is None or role.org_id != auth.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role not found")
    return role
