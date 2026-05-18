from __future__ import annotations

import unicodedata

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.policy.source_citation import valid_citation_dicts
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
        citations = valid_citation_dicts(data.get("citations") if isinstance(data, dict) else [])
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
        text_without_accents = _strip_accents(raw_text)
        if _has_arabic(raw_text) and _is_arabic_live_data_question(raw_text):
            return None, 0.0
        if _is_live_data_question(text_without_accents):
            return None, 0.0
        if _has_arabic(raw_text):
            if any(term in raw_text for term in ("\u0639\u0637\u0644", "\u0639\u0637\u0644\u0629", "\u0627\u062c\u0627\u0632", "\u0625\u062c\u0627\u0632", "\u0633\u064a\u0627\u0633\u0629")):
                return "policy.leave_rule", 0.9
            if any(term in raw_text for term in ("\u0639\u0646 \u0628\u0639\u062f", "remote")):
                return "policy.telework_rule", 0.88
            return "policy.question", 0.82
        text = text_without_accents
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


def _is_live_data_question(text: str) -> bool:
    if _has_policy_marker(text):
        return False
    live_markers = (
        "leave balance",
        "solde conge",
        "solde de conge",
        "combien me reste",
        "combien il me reste",
        "jours restants",
        "how many leave",
        "how many days",
        "pointage",
        "attendance status",
        "did i check",
        "checked in",
        "presence aujourd",
        "pending approvals",
        "approvals",
        "validations",
        "rh backlog",
        "system health",
        "provider status",
        "redis status",
        "braintrust status",
        "chroma status",
        "users",
        "utilisateurs",
        "entreprises",
    )
    return any(marker in text for marker in live_markers)


def _has_policy_marker(text: str) -> bool:
    return any(
        marker in text
        for marker in (
            "politique",
            "policy",
            "regle",
            "rule",
            "procedure",
            "faq",
            "comment declarer",
            "comment fonctionne",
            "que dit",
        )
    )


def _is_arabic_live_data_question(text: str) -> bool:
    if "\u0633\u064a\u0627\u0633\u0629" in text or "\u0642\u0627\u0646\u0648\u0646" in text:
        return False
    return any(
        marker in text
        for marker in (
            "\u0643\u0645 \u0628\u0642\u064a",  # how many left
            "\u0631\u0635\u064a\u062f",  # balance
            "\u0627\u0644\u062d\u0636\u0648\u0631",  # attendance
            "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062d\u0636\u0648\u0631",
            "\u0627\u0644\u062e\u0631\u0648\u062c",
            "\u0627\u0644\u0646\u0638\u0627\u0645",  # system
            "\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646",  # users
            "\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062a",  # approvals
        )
    )
