from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse

from .voice_summary_builder import VoiceSummaryBuilder

_MAX_SPOKEN_CHARS = 420


def optimize_voice_response(
    response: AgentResponse,
    context: CurrentUserContext,
    *,
    summary_builder: VoiceSummaryBuilder | None = None,
) -> AgentResponse:
    """Keep voice output concise without changing action semantics."""
    if response.requiresConfirmation or response.type == "confirm_action":
        return response

    action = response.actionResult or {}
    if isinstance(action, dict) and action.get("kind") == "role_intelligence_digest":
        voice = action.get("voice") if isinstance(action.get("voice"), dict) else {}
        if voice.get("optimized") is True:
            return response
        builder = summary_builder or VoiceSummaryBuilder()
        original = response.text or ""
        optimized_text = builder.build(action, context)
        response.text = _trim_for_voice(optimized_text)
        response.actionResult = _with_voice_metadata(
            action,
            optimized=True,
            reason="role_intelligence_digest",
            original_length=len(original),
            spoken_length=len(response.text),
        )
        return response

    if len(response.text or "") > _MAX_SPOKEN_CHARS:
        original = response.text or ""
        response.text = _trim_for_voice(original)
        response.actionResult = _with_voice_metadata(
            action if isinstance(action, dict) else {},
            optimized=True,
            reason="long_text_trimmed",
            original_length=len(original),
            spoken_length=len(response.text),
        )
    return response


def _trim_for_voice(text: str) -> str:
    normalized = " ".join((text or "").split())
    if len(normalized) <= _MAX_SPOKEN_CHARS:
        return normalized
    cut = normalized[: _MAX_SPOKEN_CHARS - 3].rstrip()
    sentence_break = max(cut.rfind(". "), cut.rfind("; "), cut.rfind("، "))
    if sentence_break >= 160:
        cut = cut[: sentence_break + 1]
    return cut.rstrip(" ,;:") + "..."


def _with_voice_metadata(action: dict[str, Any], *, optimized: bool, reason: str, original_length: int, spoken_length: int) -> dict[str, Any]:
    updated = deepcopy(action)
    voice = updated.get("voice") if isinstance(updated.get("voice"), dict) else {}
    voice.update(
        {
            "optimized": optimized,
            "reason": reason,
            "originalTextLength": original_length,
            "spokenTextLength": spoken_length,
        }
    )
    updated["voice"] = voice
    return updated
