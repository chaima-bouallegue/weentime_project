from __future__ import annotations

from agents.base_agent import BaseAgent


class EmployeeAgent(BaseAgent):
    role_name = "EMPLOYEE"
    allowed_actions = {
        "get_leave_balance",
        "create_leave",
        "create_authorization",
        "create_telework",
        "request_document",
        "open_document",
        "get_notifications",
        "get_my_requests",
    }

    def default_chat_message(self) -> str:
        return "Je peux gerer vos conges, autorisations, teletravail, documents et notifications."
