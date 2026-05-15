from __future__ import annotations

from typing import Any


def text_from_output(output: Any) -> str:
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        parts: list[str] = []
        for key in ("text", "response", "message", "summary", "intent"):
            value = output.get(key)
            if value is not None:
                parts.append(str(value))
        action = output.get("actionResult") or output.get("action_result")
        if isinstance(action, dict):
            parts.append(str(action.get("summary") or ""))
        return " ".join(parts)
    return str(output or "")


def score_result(name: str, score: float, **metadata: Any) -> dict[str, Any]:
    return {"name": name, "score": max(0.0, min(1.0, float(score))), "metadata": metadata}


def action_result(output: Any) -> dict[str, Any]:
    if not isinstance(output, dict):
        return {}
    value = output.get("actionResult") or output.get("action_result") or {}
    return value if isinstance(value, dict) else {}
