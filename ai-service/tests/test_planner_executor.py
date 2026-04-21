import unittest
from unittest.mock import AsyncMock

from config import Settings
from core.executor import TaskExecutor
from core.planner import plan_task
from memory.session import SessionStore
from tools.api_client import ToolResult


class PlannerTests(unittest.TestCase):
    def test_plan_leave_and_balance_request(self) -> None:
        plan = plan_task(
            "CREATE_LEAVE",
            {"raw_text": "je veux un conge et voir mon solde"},
            "EMPLOYEE",
        )

        self.assertTrue(any(step["step"] == "create_leave" for step in plan))
        self.assertTrue(any(step["step"] == "get_leave_balance" for step in plan))

    def test_employee_approval_plan_starts_with_permission_check(self) -> None:
        plan = plan_task(
            "APPROVE_REQUEST",
            {"raw_text": "approuve conge 42", "request_id": 42, "type_demande": "CONGE"},
            "EMPLOYEE",
        )

        self.assertGreater(len(plan), 0)
        self.assertEqual(plan[0]["step"], "check_permission")


class TaskExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.settings = Settings()
        self.session_store = SessionStore()
        self.hr_tools = type("FakeHRTools", (), {})()
        self.hr_tools.execute_action = AsyncMock()
        self.executor = TaskExecutor(self.settings, self.session_store, self.hr_tools)

    async def test_executor_retries_transient_failure_once(self) -> None:
        self.hr_tools.execute_action.side_effect = [
            ToolResult(
                success=False,
                tool="get_rh_stats",
                status="error",
                text="Erreur serveur",
                error="backend_request_failed",
            ),
            ToolResult(
                success=True,
                tool="get_rh_stats",
                status="success",
                text="Les statistiques RH sont disponibles.",
                data={"pendingRequests": 4},
            ),
        ]

        result = await self.executor.execute(
            intent="GET_RH_STATS",
            action="get_rh_stats",
            entities={"raw_text": "donne moi les stats rh"},
            user_id=51,
            role="RH",
        )

        self.assertTrue(result.success)
        self.assertEqual(result.status, "success")
        self.assertEqual(self.hr_tools.execute_action.await_count, 2)

    async def test_executor_blocks_duplicate_pending_task(self) -> None:
        entities = {"raw_text": "approuve conge 42", "request_id": 42, "type_demande": "CONGE"}
        plan = plan_task("APPROVE_REQUEST", entities, "MANAGER")
        task_key = self.executor._task_key("APPROVE_REQUEST", entities, "MANAGER", plan)
        self.session_store.start_task(
            52,
            task_id="existing-task",
            task_key=task_key,
            intent="APPROVE_REQUEST",
            role="MANAGER",
            plan=plan,
        )

        result = await self.executor.execute(
            intent="APPROVE_REQUEST",
            action="approve_request",
            entities=entities,
            user_id=52,
            role="MANAGER",
        )

        self.assertFalse(result.success)
        self.assertEqual(result.error, "duplicate_task")


if __name__ == "__main__":
    unittest.main()
