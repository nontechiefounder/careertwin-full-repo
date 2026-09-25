from dataclasses import dataclass, field
from uuid import UUID

from careertwin.domain.enums import WorkflowStatus
from careertwin.domain.models import WorkflowRun


@dataclass
class RecordingStageExecutor:
    """Deterministic development executor; production adapters replace each stage independently."""

    executed: list[tuple[UUID, WorkflowStatus, int]] = field(default_factory=list)

    async def execute(self, run: WorkflowRun) -> None:
        marker = (run.id, run.status, run.version)
        if marker not in self.executed:
            self.executed.append(marker)

