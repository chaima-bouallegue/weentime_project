"""Mint short-lived backend JWTs for public-mode chatbot tool calls.

Trust model
-----------
CHATBOT_PUBLIC_MODE accepts requests with no JWT and builds the
CurrentUserContext from request metadata (role / userId / entrepriseId).
Tool calls fan out to the Spring backend, which always requires JWT — so
without a token every tool call 401s and the chatbot can never return real
data in public mode.

When (and only when) the operator opts in via
CHATBOT_BACKEND_JWT_MINT=true AND a JWT signing secret is configured, this
helper mints a short-lived backend JWT for the metadata-claimed user using
the same HS256 layout Spring's auth-service produces:

    {
      sub: email (or chatbot+<userId>@weentime.local),
      userId: <int>,
      role: ROLE_<EMPLOYEE|MANAGER|RH|ADMIN>,
      roles: [ROLE_<...>],
      entrepriseId: <int>,
      iat: now,
      exp: now + ttl,
      iss: "weentime-ai-chatbot"
    }

Security note: in public mode the request's metadata is trusted. The role
the UI claims becomes the role Spring sees. Operators MUST NOT enable
CHATBOT_BACKEND_JWT_MINT on an Internet-exposed AI service — public mode is
intended for internal demo / test environments where access to /v2/chat is
already controlled. The flag is OFF by default; enabling it is an explicit
choice. The fallback when the flag is off is the current behaviour: tool
calls 401 and surface as per-section errors (no data forgery).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from .current_user import CurrentUserContext

_DEFAULT_TTL_SECONDS = 300


def _env_bool(key: str, default: bool = False) -> bool:
    value = os.getenv(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _read_secret() -> str | None:
    # Order matches what the Spring side and the AI service already accept.
    # The dedicated chatbot key wins so operators can run a separate, locked-
    # down signing key for the public-mode mint path without touching the
    # main JWT_SECRET.
    return (
        os.getenv("CHATBOT_BACKEND_JWT_SECRET")
        or os.getenv("JWT_SECRET")
        or os.getenv("AI_JWT_SECRET")
        or os.getenv("JWT_VERIFICATION_SECRET")
        or os.getenv("AI_JWT_VERIFICATION_SECRET")
    )


def chatbot_backend_jwt_enabled() -> bool:
    """Operator opt-in flag.  Defaults False."""
    return _env_bool("CHATBOT_BACKEND_JWT_MINT", False)


def mint_chatbot_backend_token(
    context: CurrentUserContext,
    *,
    secret: str | None = None,
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
    now: int | None = None,
) -> str | None:
    """Return a signed HS256 JWT for chatbot-public-context calls, or None.

    Returns None (and never raises) when:
      * the operator has not opted in via CHATBOT_BACKEND_JWT_MINT, OR
      * no signing secret is configured, OR
      * the context is not a chatbot_public_context one (real JWT path
        should not pass through this helper at all).
    """
    if not chatbot_backend_jwt_enabled():
        return None
    if not isinstance(context.metadata, dict):
        return None
    if context.metadata.get("chatbot_public_context") is not True:
        return None

    signing_secret = secret if secret is not None else _read_secret()
    if not signing_secret:
        return None

    user_id = int(context.user_id) if context.user_id else 1
    entreprise_id = int(context.entreprise_id) if context.entreprise_id else 1
    raw_role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
    spring_role = f"ROLE_{raw_role}"
    issued_at = int(now if now is not None else time.time())
    expires_at = issued_at + max(60, int(ttl_seconds))

    subject = (context.email or "").strip() or f"chatbot+{user_id}@weentime.local"
    claims = {
        "sub": subject,
        "userId": user_id,
        "role": spring_role,
        "roles": [spring_role],
        "entrepriseId": entreprise_id,
        "iat": issued_at,
        "exp": expires_at,
        "iss": "weentime-ai-chatbot",
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = f"{_b64(json.dumps(header, separators=(',', ':')).encode('utf-8'))}.{_b64(json.dumps(claims, separators=(',', ':')).encode('utf-8'))}"
    signature = hmac.new(signing_secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64(signature)}"


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")
