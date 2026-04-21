from __future__ import annotations

from agents.base_agent import BaseAgent


class AdminAgent(BaseAgent):
    role_name = "ADMIN"
    allowed_actions = {
        "get_notifications",
    }

    def default_chat_message(self) -> str:
        return "Je peux vous aider sur les notifications et l'etat general des services."
