from __future__ import annotations

import json
from typing import Any

from app.context.current_user import CurrentUserContext
from app.providers.provider_request import ProviderRequest
from app.providers.router import ProviderRouter

from .hybrid_intent_router import HybridIntentResult


class LLMIntentClassifier:
    """JSON-only fallback classifier for ambiguous RH prompts.

    The classifier is intentionally not an answer generator and does not know
    how to execute tools. It can only return a structured intent proposal that
    the deterministic router/agent must still validate.
    """

    def __init__(self, provider_router: ProviderRouter) -> None:
        self.provider_router = provider_router

    async def classify_rh(
        self,
        message: str,
        *,
        context: CurrentUserContext,
        current_page: str | None = None,
        candidates: tuple[str, ...] = (),
    ) -> HybridIntentResult:
        prompt = _build_prompt(message, context=context, current_page=current_page, candidates=candidates)
        provider_response = await self.provider_router.generate(
            ProviderRequest.build(
                prompt,
                context=context,
                channel=str(context.metadata.get("channel") or "chat"),
                intent="rh.intent.classification",
                metadata={"model_role": "chat", "classifier": "rh_intent_json"},
            )
        )
        if not provider_response.success:
            return HybridIntentResult(None, 0.0, source="llm", reason=provider_response.error_code or "provider_unavailable")
        return parse_llm_intent_json(provider_response.text)


def parse_llm_intent_json(text: str | None) -> HybridIntentResult:
    try:
        payload = json.loads(_json_slice(text or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return HybridIntentResult(None, 0.0, source="llm", reason="invalid_json")
    if not isinstance(payload, dict):
        return HybridIntentResult(None, 0.0, source="llm", reason="invalid_payload")
    intent = payload.get("intent")
    confidence = _safe_float(payload.get("confidence"))
    entities = payload.get("entities") if isinstance(payload.get("entities"), dict) else {}
    missing_value = payload.get("missing")
    missing = tuple(str(item) for item in missing_value) if isinstance(missing_value, list) else ()
    reason = str(payload.get("reason") or "llm_json")
    if not isinstance(intent, str) or not intent.strip():
        return HybridIntentResult(None, confidence, entities=entities, missing=missing, source="llm", reason=reason)
    return HybridIntentResult(intent.strip(), confidence, entities=entities, missing=missing, source="llm", reason=reason)


def _build_prompt(
    message: str,
    *,
    context: CurrentUserContext,
    current_page: str | None,
    candidates: tuple[str, ...],
) -> str:
    role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
    safe_candidates = ", ".join(candidates[:40])
    return (
        "Classify this WeenTime RH chatbot prompt. Return JSON only with keys: "
        "intent, confidence, entities, missing, reason. Do not answer the user. "
        "Do not execute tools. Do not invent backend data.\n"
        f"role={role}\n"
        f"current_page={current_page or ''}\n"
        f"candidate_intents={safe_candidates}\n"
        f"message={message}"
    )


def _json_slice(text: str) -> str:
    stripped = (text or "").strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end >= start:
        return stripped[start : end + 1]
    return stripped


def _safe_float(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0

