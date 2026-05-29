from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .current_user import CurrentUserContext
from .jwt_parser import BUSINESS_ROLES, JwtClaims, JwtVerificationError, extract_bearer_token, normalize_role, normalize_roles, parse_jwt
from .permissions import permissions_for_role
from app.i18n.response_localizer import translate


@dataclass(slots=True)
class ContextError(Exception):
    code: str
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class ContextBuilder:
    """Builds trusted user context from JWT first, then backend /users/me when reachable."""

    def __init__(
        self,
        backend_client: Any | None = None,
        *,
        jwt_secret: str | None = None,
        jwt_algorithm: str | None = None,
        allow_unverified_tokens: bool | None = None,
        allow_tenantless_admin: bool = True,
    ) -> None:
        self.backend_client = backend_client
        self.jwt_secret = jwt_secret
        self.jwt_algorithm = jwt_algorithm
        self.allow_unverified_tokens = allow_unverified_tokens
        self.allow_tenantless_admin = allow_tenantless_admin

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

        try:
            claims = parse_jwt(
                token,
                secret=self.jwt_secret,
                algorithm=self.jwt_algorithm,
                allow_unverified=self.allow_unverified_tokens,
            )
        except JwtVerificationError as exc:
            raise ContextError(exc.code, exc.message, 401) from exc

        if claims.user_id is None:
            raise ContextError("invalid_jwt", "JWT does not contain a user id.", 401)

        if payload_user_id is not None and int(payload_user_id) != int(claims.user_id):
            raise ContextError("user_context_mismatch", "Payload user_id does not match authenticated user.", 403)

        context = self._from_claims(claims, token=token, locale=locale, language=language)
        if self.backend_client is None:
            self._validate_final_context(context, claims=claims)
            return context

        try:
            profile_result = await self.backend_client.get("/users/me", context=context)
        except Exception:
            context.warnings.append("backend_profile_unavailable")
            return context

        if not getattr(profile_result, "success", False):
            status_code = getattr(profile_result, "status_code", None)
            error_code = str(getattr(profile_result, "error_code", "") or "").lower()
            if status_code == 401 or error_code in {"auth_required", "missing_jwt", "invalid_jwt", "expired_jwt"}:
                raise ContextError("auth_required", translate("auth_required", language), 401)
            if status_code == 403 or error_code in {"access_denied", "permission_denied", "forbidden"}:
                raise ContextError("access_denied", translate("access_denied", language), 403)
            context.warnings.append("backend_profile_unavailable")
            self._validate_final_context(context, claims=claims)
            return context

        profile = profile_result.data if isinstance(profile_result.data, dict) else {}
        backend_user_id = self._read_int(profile, "id", "userId", "user_id")
        if backend_user_id is not None and backend_user_id != context.user_id:
            raise ContextError("user_context_mismatch", "Backend profile does not match authenticated user.", 403)

        role = self._canonical_backend_role(profile)
        if role:
            if claims.role and claims.role != role:
                raise ContextError("role_context_mismatch", "Backend profile role does not match authenticated token.", 403)
            if not claims.role and claims.roles and role not in claims.roles:
                raise ContextError("role_context_mismatch", "Backend profile role is not present in authenticated token.", 403)
            context.role = role
            context.permissions = permissions_for_role(role)

        context.email = self._read_str(profile, "email", "username") or context.email
        backend_tenant_id = self._read_int(profile, "entrepriseId", "entreprise_id", "companyId", "tenantId", "tenant_id")
        if backend_tenant_id is not None:
            if claims.entreprise_id is not None and claims.entreprise_id != backend_tenant_id:
                raise ContextError("tenant_context_mismatch", "Backend profile tenant does not match authenticated token.", 403)
            context.entreprise_id = backend_tenant_id
        context.department_id = self._read_int(profile, "departmentId", "departementId", "department_id") or context.department_id
        context.team_id = self._read_int(profile, "teamId", "equipeId", "team_id") or context.team_id
        context.manager_id = self._read_int(profile, "managerId", "responsableId", "manager_id") or context.manager_id
        self._validate_final_context(context, claims=claims, backend_profile=profile)
        return context

    def _from_claims(self, claims: JwtClaims, *, token: str, locale: str, language: str) -> CurrentUserContext:
        role = claims.role or ""
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
            metadata={"jwt_verified": claims.verified, "authorization_header": f"Bearer {token}"},
        )

    def _validate_final_context(
        self,
        context: CurrentUserContext,
        *,
        claims: JwtClaims,
        backend_profile: dict[str, Any] | None = None,
    ) -> None:
        role = normalize_role(context.role)
        if not role:
            raise ContextError("invalid_role_state", "Authenticated user has no valid role.", 403)
        if role not in BUSINESS_ROLES:
            raise ContextError("invalid_role_state", "Authenticated user role is not supported.", 403)

        if backend_profile is None and claims.roles and len(claims.roles) > 1 and claims.role is None:
            raise ContextError("invalid_role_state", "Authenticated token contains multiple roles without a canonical role.", 403)

        context.role = role
        context.permissions = permissions_for_role(role)
        if role != "ADMIN" and context.entreprise_id is None:
            raise ContextError("missing_tenant", "Authenticated non-admin user has no tenant.", 403)
        if role == "ADMIN" and context.entreprise_id is None and not self.allow_tenantless_admin:
            raise ContextError("missing_tenant", "Tenantless admin context is disabled.", 403)

    def _canonical_backend_role(self, profile: dict[str, Any]) -> str | None:
        explicit_role = normalize_role(profile.get("role") or profile.get("authority") or profile.get("name"))
        if explicit_role:
            return explicit_role
        roles = normalize_roles(profile.get("roles") or profile.get("authorities"))
        if len(roles) == 1:
            return next(iter(roles))
        if len(roles) > 1:
            raise ContextError("invalid_role_state", "Backend profile contains multiple roles without a canonical role.", 403)
        return None

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
