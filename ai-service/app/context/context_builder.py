from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .current_user import CurrentUserContext
from .jwt_parser import JwtClaims, extract_bearer_token, normalize_role, parse_jwt
from .permissions import permissions_for_role


@dataclass(slots=True)
class ContextError(Exception):
    code: str
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class ContextBuilder:
    """Builds trusted user context from JWT first, then backend /users/me when reachable."""

    def __init__(self, backend_client: Any | None = None) -> None:
        self.backend_client = backend_client

    async def build(
        self,
        authorization: str | None,
        *,
        payload_user_id: int | None = None,
        locale: str = "fr-FR",
        language: str = "unknown",
    ) -> CurrentUserContext:
        token = extract_bearer_token(authorization)
        if not token:
            raise ContextError("missing_jwt", "Authorization header is required.", 401)

        claims = parse_jwt(token)
        if claims.user_id is None:
            raise ContextError("invalid_jwt", "JWT does not contain a user id.", 401)

        if payload_user_id is not None and int(payload_user_id) != int(claims.user_id):
            raise ContextError("user_context_mismatch", "Payload user_id does not match authenticated user.", 403)

        context = self._from_claims(claims, token=token, locale=locale, language=language)
        if self.backend_client is None:
            return context

        try:
            profile_result = await self.backend_client.get("/users/me", context=context)
        except Exception:
            context.warnings.append("backend_profile_unavailable")
            return context

        if not getattr(profile_result, "success", False):
            context.warnings.append("backend_profile_unavailable")
            return context

        profile = profile_result.data if isinstance(profile_result.data, dict) else {}
        backend_user_id = self._read_int(profile, "id", "userId", "user_id")
        if backend_user_id is not None and backend_user_id != context.user_id:
            raise ContextError("user_context_mismatch", "Backend profile does not match authenticated user.", 403)

        role = normalize_role(profile.get("role") or profile.get("roles") or profile.get("authorities"))
        if role:
            context.role = role
            context.permissions = permissions_for_role(role)

        context.email = self._read_str(profile, "email", "username") or context.email
        context.entreprise_id = self._read_int(profile, "entrepriseId", "entreprise_id", "companyId") or context.entreprise_id
        context.department_id = self._read_int(profile, "departmentId", "departementId", "department_id") or context.department_id
        context.team_id = self._read_int(profile, "teamId", "equipeId", "team_id") or context.team_id
        context.manager_id = self._read_int(profile, "managerId", "responsableId", "manager_id") or context.manager_id
        return context

    def _from_claims(self, claims: JwtClaims, *, token: str, locale: str, language: str) -> CurrentUserContext:
        role = claims.role or "EMPLOYEE"
        return CurrentUserContext(
            user_id=int(claims.user_id or 0),
            email=claims.email,
            role=role,
            entreprise_id=claims.entreprise_id,
            department_id=claims.department_id,
            team_id=claims.team_id,
            manager_id=claims.manager_id,
            permissions=permissions_for_role(role),
            token=token,
            locale=locale,
            language=language,
        )

    @staticmethod
    def _read_int(payload: dict[str, Any], *keys: str) -> int | None:
        for key in keys:
            value = payload.get(key)
            if value in (None, ""):
                continue
            try:
                return int(value)
            except (TypeError, ValueError):
                continue
        return None

    @staticmethod
    def _read_str(payload: dict[str, Any], *keys: str) -> str | None:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None
