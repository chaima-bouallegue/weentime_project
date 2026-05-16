"""Per-turn LLM-provider observability metadata.

Injects four keys into every `AgentResponse.actionResult` so observability /
frontend can answer "did this turn use the LLM? which provider/model? did
the LLM change the intent?":

  - llm_used (bool)         — True only when the response carries
                              `actionResult.kind == 'provider_response'`
  - provider (str)          — configured provider mode ("ollama", "cloud",
                              "disabled"). Present even when not used so
                              consumers can distinguish "not configured"
                              from "configured but unused this turn".
  - model (str | None)      — configured default model; for provider_response
                              responses, the actual model returned by the
                              provider wins.
  - intent_before_llm (str) — the deterministic intent the router picked
                              before any LLM classification.
  - intent_after_llm (str | None) — set only when the LLM altered the intent
                              (today: provider_response candidates carry
                              intent="provider.response").

This module does NOT change LLM behavior or call sites. It is pure metadata.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.models.agent_models import AgentResponse

if TYPE_CHECKING:
    from app.providers.router import ProviderRouter


def annotate_provider_metadata(
    response: AgentResponse,
    *,
    provider_router: "ProviderRouter",
    intent_before_llm: str | None = None,
) -> AgentResponse:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    if not isinstance(response.actionResult, dict):
        # Replace None / non-dict actionResult with a fresh dict so the
        # metadata keys land somewhere observable.
        action = {}

    provider_name = provider_router.mode or "disabled"
    configured_model = provider_router.default_model
    llm_used = action.get("kind") == "provider_response"

    if llm_used:
        # Prefer the model the provider actually used over the configured one.
        action["model"] = action.get("model") or configured_model
        action["intent_after_llm"] = response.intent
    else:
        action["model"] = configured_model

    action["llm_used"] = llm_used
    action["provider"] = provider_name
    action["intent_before_llm"] = intent_before_llm

    response.actionResult = action
    return response
