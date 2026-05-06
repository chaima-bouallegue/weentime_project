from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any

BUSINESS_ROLES = {"ADMIN", "RH", "MANAGER", "EMPLOYEE"}
ROLE_PRIORITY = ["ADMIN", "RH", "MANAGER", "EMPLOYEE"]


@dataclass(slots=True)
class JwtClaims:
    raw: dict[str, Any] = field(default_factory=dict)
    token: str | None = None
    user_id: int | None = None
    email: str | None = None
    role: str | None = None
    entreprise_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    manager_id: int | None = None


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    value = authorization.strip()
    if value.lower().startswith("bearer "):
        value = value[7:].strip()
    return value or None


def parse_jwt(token: str | None) -> JwtClaims:
    if not token:
        return JwtClaims(token=None)
    parts = token.split(".")
    if len(parts) < 2:
        return JwtClaims(token=token)
    try:
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8"))
    except Exception:
        return JwtClaims(token=token)

    return JwtClaims(
        raw=claims,
        token=token,
        user_id=_first_int(claims, "user_id", "userId", "id", "sub"),
        email=_first_str(claims, "email", "preferred_username", "username", "sub"),
        role=_canonical_role(claims),
        entreprise_id=_first_int(claims, "entreprise_id", "entrepriseId", "tenant_id", "tenantId", "companyId"),
        department_id=_first_int(claims, "department_id", "departmentId", "departementId"),
        team_id=_first_int(claims, "team_id", "teamId", "equipeId"),
        manager_id=_first_int(claims, "manager_id", "managerId", "responsableId"),
    )


def _first_str(claims: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _first_int(claims: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = claims.get(key)
        if value in (None, ""):
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _role_candidates(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        candidates: list[str] = []
        for item in value:
            candidates.extend(_role_candidates(item))
        return candidates
    if isinstance(value, dict):
        return _role_candidates(value.get("role") or value.get("name") or value.get("nom") or value.get("authority"))
    return []


def normalize_role(value: Any) -> str | None:
    for candidate in _role_candidates(value):
        normalized = candidate.strip().upper()
        if normalized.startswith("ROLE_"):
            normalized = normalized[5:]
        if normalized in BUSINESS_ROLES:
            return normalized
    return None


def _canonical_role(claims: dict[str, Any]) -> str | None:
    candidates: list[str] = []
    for key in ("role", "roles", "authorities", "scope"):
        candidates.extend(_role_candidates(claims.get(key)))
    normalized = {normalize_role(candidate) for candidate in candidates}
    normalized.discard(None)
    for role in ROLE_PRIORITY:
        if role in normalized:
            return role
    return None
