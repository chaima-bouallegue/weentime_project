from __future__ import annotations

from collections.abc import Iterable

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.observability.tracing import log_event, log_error

from .guard_result import GuardResult
from .rules import GuardRule, default_guard_rules

SAFE_FALLBACK_TEXT = "Je ne peux pas confirmer cette information sans donnees verifiees. Reessayez avec une demande basee sur les donnees du systeme."


class ResponseGuard:
    def __init__(self, rules: Iterable[GuardRule] | None = None) -> None:
        self.rules = list(rules or default_guard_rules())

    def validate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        result = GuardResult.allow()
        try:
            for rule in self.rules:
                rule_result = rule.evaluate(response, context)
                if not rule_result.allowed:
                    result = result.merge(rule_result)
        except Exception as exc:  # noqa: BLE001
            log_error("response_guard.error", exc, {"category": "guard_internal_error"})
            return GuardResult.reject("guard_internal_error", "Response guard failed safely.")
        return result

    def guard_response(self, response: AgentResponse, context: CurrentUserContext | None = None) -> AgentResponse:
        result = self.validate(response, context)
        if result.allowed:
            log_event("response_guard.accepted", metadata={"intent": response.intent, "type": response.type})
            return response

        category = result.primary_category or "guard_rejected"
        log_event("response_guard.rejected", metadata={"category": category, "intent": response.intent, "type": response.type})
        return AgentResponse(
            type="error",
            text=SAFE_FALLBACK_TEXT,
            intent="response.guard_rejected",
            confidence=1.0,
            requiresConfirmation=False,
            confirmationId=None,
            toolCalls=[],
            actionResult={
                "kind": "guard_rejection",
                "category": category,
                "reasons": [rejection.category for rejection in result.rejections],
            },
        )
