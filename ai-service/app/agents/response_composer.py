from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.providers.provider_request import ProviderRequest
from app.tools.result import ToolResult, get_read_result

if TYPE_CHECKING:
    from app.guards.response_guard import ResponseGuard
    from app.providers.provider_response import ProviderResponse
    from app.providers.router import ProviderRouter


SAFE_LLM_ENHANCEMENT_KINDS = {
    "read_result",
    "digest",
    "role_intelligence_digest",
    "no_data",
    "capability_unavailable",
    "planning_unavailable",
    "system_status",
    "system_health_report",
    "provider_status_report",
    "redis_status_report",
    "braintrust_status_report",
    "rag_status_report",
    "diagnostics_summary",
    "citation_result",
    "tool_safe_summary",
    "greeting",
}


def compose_tool_error(intent: str, result: ToolResult) -> AgentResponse:
    read_result = get_read_result(result.data)
    if read_result:
        return AgentResponse(
            type="error",
            text=str(read_result.get("summary") or result.error_message or "Impossible de recuperer ces donnees pour le moment."),
            intent=intent,
            confidence=0.9,
            actionResult=result.model_dump(mode="json"),
        )
    return AgentResponse(
        type="error",
        text=result.error_message or "L'action n'a pas pu etre executee.",
        intent=intent,
        confidence=0.9,
        actionResult=result.model_dump(mode="json"),
    )


def compose_read_response(intent: str, result: ToolResult, *, fallback_text: str, confidence: float = 0.88) -> AgentResponse:
    if not result.success:
        return compose_tool_error(intent, result)

    read_result = get_read_result(result.data)
    text = fallback_text
    if read_result:
        text = str(read_result.get("summary") or fallback_text)
    elif isinstance(result.data, dict):
        text_value = result.data.get("text") or result.data.get("message")
        if isinstance(text_value, str) and text_value.strip():
            text = text_value.strip()

    return AgentResponse(
        type="answer",
        text=text,
        intent=intent,
        confidence=confidence,
        actionResult=result.model_dump(mode="json"),
    )


def compact_value(value: Any) -> str:
    if value in (None, "", [], {}):
        return "non renseigne"
    return str(value)


async def enhance_safe_response_wording(
    response: AgentResponse,
    *,
    user_message: str | None,
    channel: str,
    context: CurrentUserContext,
    provider_router: "ProviderRouter",
    response_guard: "ResponseGuard",
    request_id: str | None = None,
) -> AgentResponse:
    """Let the provider improve wording while preserving deterministic authority."""
    _ = response_guard  # The workflow guard runs after this function by design.
    if not _is_llm_enhancement_candidate(response):
        return response

    if getattr(provider_router, "mode", "disabled") == "disabled":
        return _mark_enhancement_metadata(
            response,
            provider_used="disabled",
            model=getattr(provider_router, "default_model", None),
            fallback_used=False,
            enhancement_applied=False,
            reason="provider_disabled",
        )

    request = ProviderRequest.build(
        _build_enhancement_prompt(response, user_message=user_message, context=context),
        context=context,
        channel=channel,
        intent=response.intent,
        citations=_citations_from_action(response.actionResult),
        metadata={
            "request_id": request_id,
            "task_type": "wording_enhancement",
            "model_role": "chat",
            "response_kind": _response_kind(response),
        },
    )
    try:
        provider_response = await provider_router.generate(request)
    except Exception:  # pragma: no cover - ProviderRouter.generate already fails closed.
        return _mark_enhancement_metadata(
            response,
            provider_used=getattr(provider_router, "mode", "unknown"),
            model=getattr(provider_router, "default_model", None),
            fallback_used=True,
            enhancement_applied=False,
            reason="provider_exception",
        )

    if not provider_response.success or not provider_response.text.strip():
        return _mark_enhancement_metadata(
            response,
            provider_used=provider_response.provider_name,
            model=_provider_model(provider_response, provider_router),
            fallback_used=True,
            enhancement_applied=False,
            reason=provider_response.fallback_reason or provider_response.error_code or "provider_unavailable",
        )

    enhanced = response.model_copy(deep=True)
    enhanced.text = provider_response.text.strip()
    return _mark_enhancement_metadata(
        enhanced,
        provider_used=provider_response.provider_name,
        model=_provider_model(provider_response, provider_router),
        fallback_used=bool(provider_response.metadata.get("fallback_model_used")),
        enhancement_applied=True,
        reason="wording_enhanced",
        latency_ms=provider_response.latency_ms,
    )


def _is_llm_enhancement_candidate(response: AgentResponse) -> bool:
    if response.requiresConfirmation or response.confirmationId:
        return False
    if response.type in {"confirm_action", "execute_action", "error"}:
        return False
    if not (response.text or "").strip():
        return False
    return _response_kind(response) in SAFE_LLM_ENHANCEMENT_KINDS


def _response_kind(response: AgentResponse) -> str | None:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    kind = action.get("kind")
    if isinstance(kind, str) and kind.strip():
        return kind.strip()
    read_result = get_read_result(action)
    if read_result:
        return "read_result"
    if action.get("success") is True and _has_only_read_tool_calls(response):
        return "read_result"
    return None


def _has_only_read_tool_calls(response: AgentResponse) -> bool:
    if response.type != "answer" or not response.toolCalls:
        return False
    return all(_is_read_tool_name(call.name) and call.status == "success" for call in response.toolCalls)


def _is_read_tool_name(name: str | None) -> bool:
    value = str(name or "").lower()
    write_markers = (
        "create",
        "approve",
        "refuse",
        "reject",
        "decide",
        "assign",
        "update",
        "delete",
        "check_in",
        "check_out",
        "send_message",
    )
    read_markers = (
        "get_",
        "list_",
        "status",
        "stats",
        "summary",
        "workload",
        "presence",
        "health",
        "channels",
        "messages",
        "history",
    )
    return any(marker in value for marker in read_markers) and not any(marker in value for marker in write_markers)


def _build_enhancement_prompt(
    response: AgentResponse,
    *,
    user_message: str | None,
    context: CurrentUserContext,
) -> str:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    citations = _citations_from_action(action)
    citation_hint = ""
    if citations:
        citation_labels = [
            str(item.get("citation_label") or item.get("citationLabel") or item.get("source_id") or item.get("sourceId") or "").strip()
            for item in citations
            if isinstance(item, dict)
        ]
        labels = ", ".join(label for label in citation_labels if label)
        citation_hint = f"\nCitations to preserve exactly: {labels}" if labels else "\nPreserve the existing citations exactly."

    return (
        "Improve only the user-facing wording of this already-authoritative WeenTime answer.\n"
        "Rules:\n"
        "- Keep the same language/locale when possible.\n"
        "- Do not add facts, numbers, statuses, names, dates, approvals, balances, or system health.\n"
        "- Do not claim an action was executed.\n"
        "- Do not create tool calls, JSON, markdown tables, or code blocks.\n"
        "- If the answer says data is unavailable or missing, preserve that limitation.\n"
        "- Return only the improved final text.\n\n"
        f"Language: {context.language or 'fr'}\n"
        f"Role: {context.role or 'EMPLOYEE'}\n"
        f"Intent: {response.intent}\n"
        f"Safe response kind: {_response_kind(response)}\n"
        f"User message: {(user_message or '').strip()}\n"
        f"Deterministic answer: {response.text.strip()}"
        f"{citation_hint}"
    )


def _citations_from_action(action: Any) -> list[dict[str, Any]]:
    if not isinstance(action, dict):
        return []
    citations = action.get("citations")
    if isinstance(citations, list):
        return [dict(item) for item in citations if isinstance(item, dict)]
    data = action.get("data")
    if isinstance(data, dict):
        nested = data.get("citations")
        if isinstance(nested, list):
            return [dict(item) for item in nested if isinstance(item, dict)]
    read_result = action.get("read_result")
    if isinstance(read_result, dict):
        data = read_result.get("data")
        nested = data.get("citations") if isinstance(data, dict) else None
        if isinstance(nested, list):
            return [dict(item) for item in nested if isinstance(item, dict)]
    return []


def _mark_enhancement_metadata(
    response: AgentResponse,
    *,
    provider_used: str,
    model: str | None,
    fallback_used: bool,
    enhancement_applied: bool,
    reason: str,
    latency_ms: float | None = None,
) -> AgentResponse:
    action = dict(response.actionResult or {})
    action["providerUsed"] = provider_used
    action["fallbackUsed"] = fallback_used
    action["enhancementApplied"] = enhancement_applied
    action["llmEnhancementReason"] = reason
    if model is not None:
        action["model"] = model
    if latency_ms is not None:
        action["enhancementLatencyMs"] = latency_ms
    response.actionResult = action
    return response


def _provider_model(provider_response: "ProviderResponse", provider_router: "ProviderRouter") -> str | None:
    return provider_response.model or provider_response.metadata.get("model") or getattr(provider_router, "default_model", None)
