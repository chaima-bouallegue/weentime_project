from __future__ import annotations

from typing import Final

# High-level safe chatbot response contracts. These are not tool permissions;
# they only tell ResponseGuard that a deterministic agent produced a structured
# response shape that can be validated without falling back to unsafe_response.
SAFE_CHATBOT_RESPONSE_CONTRACTS: Final[tuple[str, ...]] = (
    "read_result",
    "digest",
    "no_data",
    "capability_unavailable",
    "planning_unavailable",
    "role_summary",
    "system_status",
    "citation_result",
    "approval_confirmation",
    "tool_safe_summary",
)
