from __future__ import annotations

import unicodedata

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

from .base_domain_agent import DomainAgent

POLICY_UNAVAILABLE_TEXT = "Je n'ai pas trouve de source RH approuvee pour repondre a cette question."


class HRPolicyAgent(DomainAgent):
    name = "hr_policy"

    def __init__(self, executor: ToolExecutor | None = None) -> None:
        self.executor = executor

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message)
        if self.executor is None:
            return self._unavailable(intent or "policy.question", confidence)
        result = await self.executor.execute(
            "policy.explain_rule",
            {"query": context.metadata.get("original_text") or message, "language": context.language or "fr"},
            context,
        )
        read_result = get_read_result(result.data)
        data = read_result.get("data", {}) if isinstance(read_result, dict) else {}
        citations = data.get("citations") if isinstance(data, dict) else []
        policy_available = bool(data.get("policyAvailable")) if isinstance(data, dict) else False
        if not result.success or not policy_available or not citations:
            return self._unavailable(intent or "policy.question", confidence)
        answer = str(data.get("answer") or read_result.get("summary") or "")
        return AgentResponse(
            type="answer",
            text=answer,
            intent=intent or "policy.question",
            confidence=float(data.get("confidence") or confidence),
            toolCalls=[ToolCallRecord(name="policy.explain_rule", arguments={"query": message}, status="success")],
            actionResult={
                "kind": "policy_answer",
                "answer": answer,
                "citations": citations,
                "confidence": float(data.get("confidence") or confidence),
                "policyAvailable": True,
                "agent": "HRPolicyAgent",
            },
        )

    def detect_intent(self, message: str) -> tuple[str | None, float]:
        raw_text = (message or "").lower()
        if _has_arabic(raw_text):
            if any(term in raw_text for term in ("\u0639\u0637\u0644", "\u0639\u0637\u0644\u0629", "\u0627\u062c\u0627\u0632", "\u0625\u062c\u0627\u0632", "\u0633\u064a\u0627\u0633\u0629")):
                return "policy.leave_rule", 0.9
            if any(term in raw_text for term in ("\u0639\u0646 \u0628\u0639\u062f", "remote")):
                return "policy.telework_rule", 0.88
            return "policy.question", 0.82
        text = _strip_accents(raw_text)
        has_policy = any(term in text for term in ("politique", "policy", "regle", "rule", "procedure"))
        if any(term in text for term in ("conge", "leave", "maladie", "sick")) and has_policy:
            return "policy.leave_rule", 0.93
        if any(term in text for term in ("teletravail", "remote", "work from home", "friday")) and (has_policy or "can i" in text):
            return "policy.telework_rule", 0.9
        if any(term in text for term in ("autorisation", "authorization", "permission")) and has_policy:
            return "policy.authorization_rule", 0.89
        if any(term in text for term in ("document", "attestation", "certificate")) and has_policy:
            return "policy.document_rule", 0.86
        if has_policy or any(term in text for term in ("que dit", "quelle est", "what is", "can i")):
            return "policy.question", 0.82
        return None, 0.0

    @staticmethod
    def _unavailable(intent: str, confidence: float) -> AgentResponse:
        return AgentResponse(
            type="answer",
            text=POLICY_UNAVAILABLE_TEXT,
            intent=intent,
            confidence=confidence,
            actionResult={
                "kind": "policy_answer",
                "answer": POLICY_UNAVAILABLE_TEXT,
                "citations": [],
                "confidence": 0.0,
                "policyAvailable": False,
                "agent": "HRPolicyAgent",
            },
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char))
