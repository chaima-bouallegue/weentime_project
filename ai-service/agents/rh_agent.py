from __future__ import annotations

from agents.base_agent import BaseAgent


class RHAgent(BaseAgent):
    role_name = "RH"
    allowed_actions = {
        "get_notifications",
        "get_rh_stats",
        "get_all_requests",
        "process_request",
        "open_document",
    }

    def default_chat_message(self) -> str:
        return "Je peux vous aider sur les validations RH, les demandes globales, les analytics et les procedures internes."
