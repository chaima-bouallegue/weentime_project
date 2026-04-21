from __future__ import annotations

from agents.admin_agent import AdminAgent
from agents.base_agent import BaseAgent
from agents.employee_agent import EmployeeAgent
from agents.manager_agent import ManagerAgent
from agents.rh_agent import RHAgent
from config import Settings
from core.decision_engine import DecisionEngine
from core.rag_guard import LocalRagEngine
from memory.session import SessionStore


def route_agent(role: str) -> type[BaseAgent]:
    normalized = (role or "EMPLOYEE").strip().upper()
    if normalized == "MANAGER":
        return ManagerAgent
    if normalized == "RH":
        return RHAgent
    if normalized == "ADMIN":
        return AdminAgent
    return EmployeeAgent


class AgentRouter:
    def __init__(
        self,
        *,
        settings: Settings,
        session_store: SessionStore,
        decision_engine: DecisionEngine,
        rag_engine: LocalRagEngine,
    ) -> None:
        self.settings = settings
        self.session_store = session_store
        self.decision_engine = decision_engine
        self.rag_engine = rag_engine
        self._agents: dict[str, BaseAgent] = {}

    def resolve_role(
        self,
        *,
        user_id: int,
        requested_role: str | None,
        access_token: str | None,
    ) -> str:
        explicit_role = (requested_role or "").strip().upper()
        if explicit_role in {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}:
            return explicit_role

        state_role = self.session_store.get_state(user_id).role
        if state_role in {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}:
            return state_role

        token_role = BaseAgent.resolve_role_from_token(access_token)
        return token_role or "EMPLOYEE"

    def get_agent(self, role: str) -> BaseAgent:
        resolved_role = (role or "EMPLOYEE").upper()
        if resolved_role not in self._agents:
            agent_class = route_agent(resolved_role)
            self._agents[resolved_role] = agent_class(
                settings=self.settings,
                session_store=self.session_store,
                decision_engine=self.decision_engine,
                rag_engine=self.rag_engine,
            )
        return self._agents[resolved_role]
