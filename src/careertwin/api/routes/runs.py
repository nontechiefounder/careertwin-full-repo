from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from careertwin.api.auth import AuthContext, get_auth_context, require_write_role
from careertwin.api.dependencies import get_orchestrator, get_run_store
from careertwin.api.schemas import CreateRunRequest
from careertwin.domain.models import WorkflowRun
from careertwin.orchestration.pipeline import InvalidTransition, RunOrchestrator
from careertwin.orchestration.ports import RunStore

router = APIRouter(prefix="/v1/runs", tags=["runs"])


@router.post("", response_model=WorkflowRun, status_code=status.HTTP_202_ACCEPTED)
async def create_run(
    request: CreateRunRequest,
    orchestrator: RunOrchestrator = Depends(get_orchestrator),
    auth: AuthContext = Depends(get_auth_context),
) -> WorkflowRun:
    require_write_role(auth)
    return await orchestrator.start(request.to_domain(auth.org_id))


@router.get("/{run_id}", response_model=WorkflowRun)
async def get_run(
    run_id: UUID,
    store: RunStore = Depends(get_run_store),
    auth: AuthContext = Depends(get_auth_context),
) -> WorkflowRun:
    run = await store.get(run_id)
    if run is None or run.org_id != auth.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")
    return run


@router.post("/{run_id}/role-approval", response_model=WorkflowRun)
async def approve_role(
    run_id: UUID,
    orchestrator: RunOrchestrator = Depends(get_orchestrator),
    auth: AuthContext = Depends(get_auth_context),
) -> WorkflowRun:
    require_write_role(auth)
    existing = await orchestrator.store.get(run_id)
    if existing is None or existing.org_id != auth.org_id:
        raise HTTPException(status_code=404, detail="run not found")
    try:
        return await orchestrator.approve_role(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="run not found") from exc
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{run_id}/release", response_model=WorkflowRun)
async def release_run(
    run_id: UUID,
    orchestrator: RunOrchestrator = Depends(get_orchestrator),
    auth: AuthContext = Depends(get_auth_context),
) -> WorkflowRun:
    require_write_role(auth)
    existing = await orchestrator.store.get(run_id)
    if existing is None or existing.org_id != auth.org_id:
        raise HTTPException(status_code=404, detail="run not found")
    try:
        return await orchestrator.release(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="run not found") from exc
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
