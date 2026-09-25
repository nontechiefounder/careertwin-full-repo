import unittest
from uuid import UUID

from careertwin.domain.enums import WorkflowStatus
from careertwin.domain.models import WorkflowRun
from careertwin.orchestration.pipeline import InMemoryRunStore, InvalidTransition, RunOrchestrator
from careertwin.orchestration.stages import RecordingStageExecutor


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.store = InMemoryRunStore()
        self.executor = RecordingStageExecutor()
        self.orchestrator = RunOrchestrator(self.store, self.executor)
        self.run = WorkflowRun(
            org_id=UUID("00000000-0000-0000-0000-000000000001"),
            role_id=UUID("00000000-0000-0000-0000-000000000002"),
            candidate_ids=(UUID("00000000-0000-0000-0000-000000000003"),),
        )

    async def test_workflow_stops_at_both_human_gates(self) -> None:
        role_review = await self.orchestrator.start(self.run)
        self.assertEqual(role_review.status, WorkflowStatus.ROLE_REVIEW)
        self.assertEqual(role_review.version, 3)

        human_review = await self.orchestrator.approve_role(self.run.id)
        self.assertEqual(human_review.status, WorkflowStatus.HUMAN_REVIEW)
        self.assertEqual(human_review.version, 8)

        released = await self.orchestrator.release(self.run.id)
        self.assertEqual(released.status, WorkflowStatus.RELEASED)
        self.assertEqual(released.version, 9)

    async def test_release_before_review_is_rejected(self) -> None:
        await self.orchestrator.start(self.run)
        with self.assertRaises(InvalidTransition):
            await self.orchestrator.release(self.run.id)

    async def test_start_is_idempotent_for_same_run_id(self) -> None:
        first = await self.orchestrator.start(self.run)
        second = await self.orchestrator.start(self.run)
        self.assertEqual(first, second)

    async def test_cancel_is_idempotent(self) -> None:
        await self.orchestrator.start(self.run)
        cancelled = await self.orchestrator.cancel(self.run.id)
        again = await self.orchestrator.cancel(self.run.id)
        self.assertEqual(cancelled.status, WorkflowStatus.CANCELLED)
        self.assertEqual(cancelled, again)


if __name__ == "__main__":
    unittest.main()

