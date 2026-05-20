"""HTTP client to the WeenTime Spring backend.

Mirrors ai-service/app/tools/backend_client.py: forwards the caller's Bearer
token if present; otherwise mints a short-lived service JWT signed with the
shared ``BACKEND_JWT_SECRET`` so the gateway will accept the call.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def decode_jwt_roles(token: str | None) -> list[str]:
    """Read role claims from a JWT WITHOUT verifying the signature.

    We only need the role to pick the right Spring endpoint -- Spring itself
    validates the token. Tolerates both ``roles: [...]``, ``role: "..."`` and
    a Spring-style ``authorities`` claim. Returns upper-cased role strings.
    """
    if not token:
        return []
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return []
        payload_b = parts[1]
        padding = "=" * (-len(payload_b) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b + padding))
    except Exception:  # malformed token -> no roles, caller falls back to default
        return []

    roles: list[str] = []
    raw_roles = claims.get("roles")
    if isinstance(raw_roles, list):
        roles.extend(str(r) for r in raw_roles)
    elif isinstance(raw_roles, str):
        roles.append(raw_roles)
    single = claims.get("role")
    if isinstance(single, str):
        roles.append(single)
    authorities = claims.get("authorities")
    if isinstance(authorities, list):
        roles.extend(str(a) for a in authorities)
    return [r.strip().upper() for r in roles if r and str(r).strip()]


def select_scope(roles: list[str]) -> tuple[str, str, str]:
    """Map caller roles to (scope, spring_endpoint, mint_role).

    ADMIN sees all enterprises; RH sees their company; a plain MANAGER sees
    only their team. ADMIN takes precedence when a user holds several roles.
    Unknown/empty roles default to the company scope (the historical behaviour).
    """
    admin_like = {"ROLE_ADMIN", "ADMIN"}
    rh_like = {"ROLE_RH", "RH"}
    manager_like = {"ROLE_MANAGER", "MANAGER"}
    role_set = set(roles)
    if role_set & admin_like:
        return "GLOBAL", "presence/global/today", "ADMIN"
    if role_set & rh_like:
        return "COMPANY", "presence/company/today", "RH"
    if role_set & manager_like:
        return "TEAM", "presence/team/today", "MANAGER"
    return "COMPANY", "presence/company/today", "RH"


def _normalize_role(role: str) -> str:
    """Spring AuthTokenFilter wraps roles claims directly into
    ``SimpleGrantedAuthority`` -- no ROLE_ prefix is added by the filter.
    Controllers gate access with ``@PreAuthorize("hasAuthority('ROLE_RH')")``
    (literal authority string, not ``hasRole``) so the JWT MUST contain
    the prefixed name.
    """
    upper = (role or "").strip().upper()
    if not upper:
        return "ROLE_ADMIN"
    return upper if upper.startswith("ROLE_") else f"ROLE_{upper}"


def _mint_service_token(user_id: int, role: str, tenant_id: int | None) -> str:
    settings = get_settings()
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    normalized = _normalize_role(role)
    payload: dict[str, Any] = {
        "sub": "ml-service",
        "userId": user_id,
        "roles": [normalized],
        "iss": settings.backend_jwt_issuer,
        "iat": now,
        "exp": now + settings.backend_jwt_ttl_seconds,
    }
    # Stamp the entreprise so Spring can scope the RH company query. Prefer an
    # explicit tenant from the caller; otherwise fall back to the configured
    # SERVICE_ENTREPRISE_ID. Spring returns an empty overview when this is absent.
    entreprise_id = tenant_id if tenant_id is not None else settings.service_entreprise_id
    if entreprise_id is not None:
        payload["entrepriseId"] = entreprise_id
    header_b = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b}.{payload_b}".encode()
    # CRITICAL: Spring derives its HMAC key with `jwtSecret.getBytes()` -- the
    # raw UTF-8 bytes of the secret STRING. The secret happens to be valid hex,
    # but Spring does NOT hex-decode it. We must use the same UTF-8 bytes or the
    # signatures differ and Spring rejects the token with 401 "Invalid token".
    key = settings.backend_jwt_secret.encode("utf-8")
    signature = hmac.new(key, signing_input, hashlib.sha256).digest()
    return f"{header_b}.{payload_b}.{_b64url(signature)}"


class WeenTimeBackendClient:
    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.backend_base_url).rstrip("/")
        self.timeout = timeout if timeout is not None else settings.backend_timeout_seconds

    async def get(
        self,
        path: str,
        *,
        token: str | None = None,
        user_id: int = 0,
        role: str = "RH",
        tenant_id: int | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        bearer = token or _mint_service_token(user_id or 1, role, tenant_id)
        headers = {"Authorization": f"Bearer {bearer}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            logger.warning("backend GET %s failed: %s", url, exc)
            return {"success": False, "error": "backend_unreachable", "message": str(exc)}

        if response.status_code >= 400:
            logger.warning(
                "backend GET %s -> %d body=%s", url, response.status_code, response.text[:500]
            )
            return {
                "success": False,
                "error": "backend_error",
                "status_code": response.status_code,
                "body": response.text[:500],
            }
        try:
            payload = response.json()
        except ValueError:
            logger.warning("backend GET %s -> 200 but invalid JSON: %s", url, response.text[:300])
            return {"success": False, "error": "invalid_json", "body": response.text[:500]}
        if logger.isEnabledFor(logging.DEBUG):
            keys = list(payload.keys()) if isinstance(payload, dict) else f"list[{len(payload)}]"
            logger.debug("backend GET %s -> 200 keys=%s sample=%s", url, keys, str(payload)[:300])
        return payload
