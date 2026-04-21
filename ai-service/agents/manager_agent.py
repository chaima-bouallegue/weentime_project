from __future__ import annotations

from agents.base_agent import BaseAgent


class ManagerAgent(BaseAgent):
    role_name = "MANAGER"
    allowed_actions = {
        "get_notifications",
        "approve_request",
        "reject_request",
        "get_team_requests",
        "get_pending_validations",
    }

    def default_chat_message(self) -> str:
        return "Je peux vous aider a valider les demandes equipe, voir les dossiers en attente et suivre les notifications."
