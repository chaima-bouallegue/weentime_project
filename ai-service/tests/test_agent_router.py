import unittest

from agents.router import AgentRouter
from config import Settings
from core.decision_engine import DecisionEngine
from core.rag_guard import LocalRagEngine
from memory.session import SessionStore


class AgentRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = Settings()
        self.session_store = SessionStore()
        self.decision_engine = DecisionEngine(self.settings, self.session_store)
        self.rag_engine = LocalRagEngine(self.settings)
        self.router = AgentRouter(
            settings=self.settings,
            session_store=self.session_store,
            decision_engine=self.decision_engine,
            rag_engine=self.rag_engine,
        )

    def test_router_uses_explicit_manager_role(self) -> None:
        role = self.router.resolve_role(user_id=5, requested_role="MANAGER", access_token=None)
        agent = self.router.get_agent(role)
        self.assertEqual(agent.role_name, "MANAGER")

    def test_router_defaults_to_employee(self) -> None:
        role = self.router.resolve_role(user_id=7, requested_role=None, access_token=None)
        agent = self.router.get_agent(role)
        self.assertEqual(agent.role_name, "EMPLOYEE")


if __name__ == "__main__":
    unittest.main()
