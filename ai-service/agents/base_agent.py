from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field

from config import Settings
from core.decision_engine import DecisionEngine
from core.rag_guard import LocalRagEngine, RagHit, should_use_rag
from memory.session import SessionStore


@dataclass
class AgentReply:
    text: str
    sources: list[RagHit] = field(default_factory=list)


class BaseAgent:
    role_name = "EMPLOYEE"
    allowed_actions: set[str] = set()

    def __init__(
        self,
        settings: Settings,
        session_store: SessionStore,
        decision_engine: DecisionEngine,
        rag_engine: LocalRagEngine,
    ) -> None:
        self.settings = settings
        self.session_store = session_store
        self.decision_engine = decision_engine
        self.rag_engine = rag_engine

    def prepare(self, *, user_id: int, message: str, role: str) -> dict[str, object]:
        resolved_role = (role or self.role_name).upper()
        self.session_store.set_role(user_id, resolved_role)
        if message.strip():
            self.session_store.add_message(user_id, "user", message.strip())

        decision = self.decision_engine.decide(user_id, resolved_role, message)
        action = decision.get("action")
        if action and action not in self.allowed_actions:
            return {
                "type": "chat",
                "intent": "CHAT",
                "message": self.permission_message(),
                "action": None,
                "entities": decision.get("entities", {}),
                "missing_fields": [],
                "data": {"reason": "forbidden"},
            }
        return decision

    def reply(self, *, message: str, decision: dict[str, object]) -> AgentReply:
        decision_message = str(decision.get("message") or "").strip()
        if should_use_rag(message, self.settings):
            answer, hits = self.rag_engine.answer(message)
            return AgentReply(text=answer, sources=hits)
        if decision_message:
            return AgentReply(text=decision_message)
        return AgentReply(text=self.default_chat_message())

    def remember(self, user_id: int, text: str) -> None:
        if text.strip():
            self.session_store.add_message(user_id, "ai", text.strip())

    def default_chat_message(self) -> str:
        return "Formulez une demande RH claire sur les conges, documents, presences ou notifications."

    def permission_message(self) -> str:
        return "Cette action n'est pas disponible pour votre role."

    @staticmethod
    def resolve_role_from_token(access_token: str | None) -> str | None:
        if not access_token:
            return None
        parts = access_token.split(".")
        if len(parts) < 2:
            return None
        try:
            payload_part = parts[1]
            padding = "=" * (-len(payload_part) % 4)
            decoded = base64.urlsafe_b64decode(payload_part + padding).decode("utf-8")
            claims = json.loads(decoded)
        except Exception:  # noqa: BLE001
            return None

        candidates: list[str] = []
        for key in ("role", "roles", "authorities"):
            value = claims.get(key)
            if isinstance(value, str):
                candidates.append(value)
            elif isinstance(value, list):
                candidates.extend(str(item) for item in value)

        for candidate in candidates:
            normalized = candidate.strip().upper().replace("ROLE_", "")
            if normalized in {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}:
                return normalized
        return None
