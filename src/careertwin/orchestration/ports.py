from typing import Protocol, TypeVar
from uuid import UUID

from pydantic import BaseModel

from careertwin.domain.models import WorkflowRun

OutputT = TypeVar("OutputT", bound=BaseModel)


class ModelClient(Protocol):
    async def generate_structured(
        self,
        *,
        operation: str,
        input_records: tuple[BaseModel, ...],
        output_type: type[OutputT],
    ) -> OutputT:
        """Return schema-validated data without network, shell or messaging tools."""


class RunStore(Protocol):
    async def get(self, run_id: UUID) -> WorkflowRun | None: ...

    async def create(self, run: WorkflowRun) -> WorkflowRun: ...

    async def compare_and_set(self, run: WorkflowRun, expected_version: int) -> WorkflowRun: ...


class StageExecutor(Protocol):
    async def execute(self, run: WorkflowRun) -> None:
        """Write an immutable stage artifact and return only after it is committed."""

