"""Anonymous chatbot context builder for public/demo mode.

This helper is used ONLY by the AI chatbot endpoints (/v2/chat,
/v2/chat/confirm, /v2/voice) when CHATBOT_PUBLIC_MODE is enabled and the
incoming request has no valid Authorization header. It builds a minimal
CurrentUserContext from request metadata (role, userId, entrepriseId).

Trust model:
- Only the role is honoured from metadata, and only one of {ADMIN, RH,
  MANAGER, EMPLOYEE}; any other value falls back to EMPLOYEE.
- Permissions are derived from the role via permissions_for_role(); the
  request CANNOT inject arbitrary permissions.
- ToolRegistry role/permission checks still gate every tool call.
- Backend Spring APIs are not exposed; this only affects the AI chatbot.
"""

from __future__ import annotations

from typing import Any, Mapping

from .current_user import CurrentUserContext
from .jwt_parser import BUSINESS_ROLES, normalize_role
from .permissions import permissions_for_role

DEFAULT_ROLE = "EMPLOYEE"
DEFAULT_USER_ID = 1
DEFAULT_ENTREPRISE_ID = 1
DEFAULT_LANGUAGE = "fr"
ANONYMOUS_SOURCE = "anonymous_chatbot_demo"


def _read_int(meta: Mapping[str, Any], *keys: str, default: int) -> int:
    for key in keys:
        value = meta.get(key)
        if value in (None, ""):
            continue
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0:
            return parsed
    return default


def _read_str(meta: Mapping[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = meta.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def resolve_anonymous_role(value: Any) -> str:
    """Map any incoming role hint to one of the four business roles.

    Falls back to EMPLOYEE when the input is missing or not in BUSINESS_ROLES.
    """
    candidate = normalize_role(value)
    if candidate and candidate in BUSINESS_ROLES:
        return candidate
    if isinstance(value, str):
        upper = value.strip().upper().replace("ROLE_", "")
        if upper in BUSINESS_ROLES:
            return upper
    return DEFAULT_ROLE


def build_chatbot_context_from_metadata(
    metadata: Mapping[str, Any] | None,
    *,
    locale: str = "fr-FR",
    language: str | None = None,
    channel: str = "chat",
) -> CurrentUserContext:
    """Build a CurrentUserContext for anonymous public chatbot requests.

    Only invoked by chatbot endpoints when CHATBOT_PUBLIC_MODE=True and the
    incoming Authorization header is missing or invalid. The returned context
    is marked verified so ToolRegistry will accept tool calls; the role-based
    permission checks still apply, and write actions still go through the
    confirmation flow and ResponseGuard.
    """
    meta: Mapping[str, Any] = metadata or {}
    role = resolve_anonymous_role(
        meta.get("role")
        or meta.get("chatbotMode")
        or meta.get("chatbot_mode")
    )
    user_id = _read_int(meta, "userId", "user_id", default=DEFAULT_USER_ID)
    entreprise_id = _read_int(
        meta,
        "entrepriseId",
        "entreprise_id",
        "tenantId",
        "tenant_id",
        "companyId",
        default=DEFAULT_ENTREPRISE_ID,
    )
    resolved_language = (
        _read_str(meta, "language") or (language.strip().lower() if isinstance(language, str) else None) or DEFAULT_LANGUAGE
    )

    return CurrentUserContext(
        user_id=user_id,
        email=None,
        role=role,
        entreprise_id=entreprise_id,
        department_id=None,
        team_id=None,
        manager_id=None,
        permissions=permissions_for_role(role),
        token=None,
        locale=locale,
        language=resolved_language,
        metadata={
            "jwt_verified": True,
            "anonymous_chatbot": True,
            "source": ANONYMOUS_SOURCE,
            "channel": channel,
            "chatbot_public_mode": True,
        },
    )
