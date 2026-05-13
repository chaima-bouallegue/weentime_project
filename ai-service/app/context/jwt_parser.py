from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

BUSINESS_ROLES = {"ADMIN", "RH", "MANAGER", "EMPLOYEE"}
SUPPORTED_HMAC_ALGORITHMS = {
    "HS256": hashlib.sha256,
    "HS384": hashlib.sha384,
    "HS512": hashlib.sha512,
}


@dataclass(slots=True)
class JwtVerificationError(Exception):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class JwtClaims:
    raw: dict[str, Any] = field(default_factory=dict)
    header: dict[str, Any] = field(default_factory=dict)
    token: str | None = None
    verified: bool = False
    user_id: int | None = None
    email: str | None = None
    role: str | None = None
    roles: set[str] = field(default_factory=set)
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


def parse_jwt(
    token: str | None,
    *,
    secret: str | None = None,
    algorithm: str | None = None,
    allow_unverified: bool | None = None,
    leeway_seconds: int = 30,
) -> JwtClaims:
    if not token:
        return JwtClaims(token=None)
    parts = token.split(".")
    if len(parts) != 3:
        raise JwtVerificationError("invalid_jwt", "JWT format is invalid.")
    try:
        header = _decode_segment(parts[0])
        claims = _decode_segment(parts[1])
    except Exception:
        raise JwtVerificationError("invalid_jwt", "JWT payload is invalid.")

    resolved_allow_unverified = (
        _env_bool("AI_JWT_ALLOW_UNVERIFIED", False)
        if allow_unverified is None
        else bool(allow_unverified)
    )
    verified = False
    if not resolved_allow_unverified:
        _verify_signature(
            token,
            header=header,
            secret=secret or _jwt_secret_from_env(),
            algorithm=algorithm or os.getenv("JWT_ALGORITHM", "HS256"),
        )
        verified = True

    _validate_temporal_claims(claims, leeway_seconds=leeway_seconds)
    roles = normalize_roles(_claim_role_values(claims))

    return JwtClaims(
        raw=claims,
        header=header,
        token=token,
        verified=verified,
        user_id=_first_int(claims, "user_id", "userId", "id", "sub"),
        email=_first_str(claims, "email", "preferred_username", "username", "sub"),
        role=_canonical_role(claims, roles),
        roles=roles,
        entreprise_id=_first_int(claims, "entreprise_id", "entrepriseId", "tenant_id", "tenantId", "companyId"),
        department_id=_first_int(claims, "department_id", "departmentId", "departementId"),
        team_id=_first_int(claims, "team_id", "teamId", "equipeId"),
        manager_id=_first_int(claims, "manager_id", "managerId", "responsableId"),
    )


def _decode_segment(value: str) -> dict[str, Any]:
    padded = value + "=" * (-len(value) % 4)
    decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
    payload = json.loads(decoded)
    if not isinstance(payload, dict):
        raise ValueError("jwt_segment_not_object")
    return payload


def _jwt_secret_from_env() -> str | None:
    return (
        os.getenv("JWT_SECRET")
        or os.getenv("AI_JWT_SECRET")
        or os.getenv("JWT_VERIFICATION_SECRET")
        or os.getenv("AI_JWT_VERIFICATION_SECRET")
    )


def _verify_signature(token: str, *, header: dict[str, Any], secret: str | None, algorithm: str | None) -> None:
    if not secret:
        raise JwtVerificationError("jwt_verification_not_configured", "JWT verification secret is not configured.")

    header_algorithm = str(header.get("alg") or "").upper()
    configured_algorithm = (algorithm or "HS256").upper()
    if header_algorithm != configured_algorithm:
        raise JwtVerificationError("unsupported_jwt_algorithm", "JWT signing algorithm is not allowed.")
    digest_factory = SUPPORTED_HMAC_ALGORITHMS.get(header_algorithm)
    if digest_factory is None:
        raise JwtVerificationError("unsupported_jwt_algorithm", "JWT signing algorithm is not supported.")

    signing_input, _, signature = token.rpartition(".")
    expected = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), digest_factory).digest()
    expected_signature = base64.urlsafe_b64encode(expected).decode("ascii").rstrip("=")
    if not hmac.compare_digest(expected_signature, signature):
        raise JwtVerificationError("invalid_jwt_signature", "JWT signature is invalid.")


def _validate_temporal_claims(claims: dict[str, Any], *, leeway_seconds: int) -> None:
    now = int(time.time())
    exp = _first_int(claims, "exp")
    if exp is not None and now > exp + leeway_seconds:
        raise JwtVerificationError("expired_jwt", "JWT token has expired.")
    nbf = _first_int(claims, "nbf")
    if nbf is not None and now + leeway_seconds < nbf:
        raise JwtVerificationError("invalid_jwt", "JWT token is not active yet.")


def _env_bool(key: str, default: bool) -> bool:
    value = os.getenv(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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
        return [item for item in value.replace(",", " ").split() if item] or [value]
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


def normalize_roles(value: Any) -> set[str]:
    normalized = {normalize_role(candidate) for candidate in _role_candidates(value)}
    normalized.discard(None)
    return {role for role in normalized if role is not None}


def _claim_role_values(claims: dict[str, Any]) -> list[Any]:
    return [claims.get("role"), claims.get("roles"), claims.get("authorities"), claims.get("scope")]


def _canonical_role(claims: dict[str, Any], roles: set[str]) -> str | None:
    explicit_role = normalize_role(claims.get("role"))
    if explicit_role:
        return explicit_role
    if len(roles) == 1:
        return next(iter(roles))
    return None
