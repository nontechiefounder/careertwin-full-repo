from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from careertwin.domain.enums import WorkflowStatus
from careertwin.domain.models import WorkflowRun
from careertwin.orchestration.ports import RunStore, StageExecutor
from careertwin.orchestration.stages import RecordingStageExecutor


class ConcurrencyConflict(RuntimeError):
    pass


class InvalidTransition(RuntimeError):
    pass


@dataclass
class InMemoryRunStore(RunStore):
    runs: dict[UUID, WorkflowRun] = field(default_factory=dict)

    async def get(self, run_id: UUID) -> WorkflowRun | None:
        return self.runs.get(run_id)

    async def create(self, run: WorkflowRun) -> WorkflowRun:
        if run.id in self.runs:
            return self.runs[run.id]
        self.runs[run.id] = run
        return run

    async def compare_and_set(self, run: WorkflowRun, expected_version: int) -> WorkflowRun:
        current = self.runs.get(run.id)
        if current is None:
            raise KeyError(run.id)
        if current.version != expected_version:
            raise ConcurrencyConflict(
                f"run {run.id} expected version {expected_version}, found {current.version}"
            )
        self.runs[run.id] = run
        return run


AUTOMATIC_NEXT: Mapping[WorkflowStatus, WorkflowStatus] = {
    WorkflowStatus.CREATED: WorkflowStatus.VALIDATING,
    WorkflowStatus.VALIDATING: WorkflowStatus.PARSING,
    WorkflowStatus.PARSING: WorkflowStatus.ROLE_REVIEW,
    WorkflowStatus.EXTRACTING: WorkflowStatus.LINKING,
    WorkflowStatus.LINKING: WorkflowStatus.SCORING,
    WorkflowStatus.SCORING: WorkflowStatus.PACKET_DRAFT,
    WorkflowStatus.PACKET_DRAFT: WorkflowStatus.HUMAN_REVIEW,
}

HUMAN_GATES = {WorkflowStatus.ROLE_REVIEW, WorkflowStatus.HUMAN_REVIEW}
TERMINAL = {WorkflowStatus.RELEASED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED}


@dataclass
class RunOrchestrator:
    store: RunStore
    executor: StageExecutor = field(default_factory=RecordingStageExecutor)

    async def start(self, run: WorkflowRun) -> WorkflowRun:
        current = await self.store.create(run)
        return await self.advance(current.id)

    async def advance(self, run_id: UUID) -> WorkflowRun:
        run = await self._required(run_id)
        while run.status not in HUMAN_GATES | TERMINAL:
            await self.executor.execute(run)
            next_status = AUTOMATIC_NEXT.get(run.status)
            if next_status is None:
                raise InvalidTransition(f"no automatic transition from {run.status}")
            run = await self._transition(run, next_status)
        return run

    async def approve_role(self, run_id: UUID) -> WorkflowRun:
        run = await self._required(run_id)
        if run.status != WorkflowStatus.ROLE_REVIEW:
            raise InvalidTransition("role approval is allowed only at role_review")
        run = await self._transition(run, WorkflowStatus.EXTRACTING)
        return await self.advance(run.id)

    async def release(self, run_id: UUID) -> WorkflowRun:
        run = await self._required(run_id)
        if run.status != WorkflowStatus.HUMAN_REVIEW:
            raise InvalidTransition("release is allowed only at human_review")
        return await self._transition(run, WorkflowStatus.RELEASED)

    async def cancel(self, run_id: UUID) -> WorkflowRun:
        run = await self._required(run_id)
        if run.status in TERMINAL:
            return run
        return await self._transition(run, WorkflowStatus.CANCELLED)

    async def _required(self, run_id: UUID) -> WorkflowRun:
        run = await self.store.get(run_id)
        if run is None:
            raise KeyError(run_id)
        return run

    async def _transition(self, run: WorkflowRun, status: WorkflowStatus) -> WorkflowRun:
        updated = run.model_copy(
            update={
                "status": status,
                "version": run.version + 1,
                "updated_at": datetime.now(timezone.utc),
            }
        )
        return await self.store.compare_and_set(updated, expected_version=run.version)

