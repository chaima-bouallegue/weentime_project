from __future__ import annotations

from collections.abc import Iterable

from app.context.current_user import CurrentUserContext
from app.core.deterministic_fallback import SAFE_FALLBACK_MESSAGES, deterministic_fallback_response
from app.models.agent_models import AgentResponse
from app.observability.tracing import log_event, log_error

from .guard_result import GuardResult
from .rules import GuardRule, default_guard_rules

SAFE_FALLBACK_TEXT = SAFE_FALLBACK_MESSAGES["guard_rejected"]["fr"]


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
        return deterministic_fallback_response("guard_rejected", context=context, guard_result=result)
