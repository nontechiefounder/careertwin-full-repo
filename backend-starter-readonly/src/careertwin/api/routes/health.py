from fastapi import APIRouter

from careertwin.api.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health/live", response_model=HealthResponse)
async def live() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=HealthResponse)
async def ready() -> HealthResponse:
    # Add database, broker and object-store checks before production traffic.
    return HealthResponse(status="ready")

