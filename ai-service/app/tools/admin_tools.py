from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result, build_write_result

try:  # Settings is the source of truth for diagnostics (no inventions).
    from config import get_settings
except Exception:  # pragma: no cover - defensive import for test scaffolding
    def get_settings():  # type: ignore[misc]
        class _Empty:
            pass
        return _Empty()

ADMIN_ROLE = {"ADMIN"}
BUSINESS_ROLES = {"ADMIN", "RH", "MANAGER", "EMPLOYEE"}
VALID_STATUSES = {"ACTIVE", "INACTIVE", "SUSPENDED"}


class PageInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=50, ge=1, le=100)


class EmptyAdminInput(BaseModel):
    pass


class CreateUserInput(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str = Field(min_length=8)
    role: str
    status: str = "ACTIVE"
    company_id: int = Field(gt=0)
    phone: str | None = None
    position: str | None = None
    department_id: int | None = Field(default=None, gt=0)
    team_id: int | None = Field(default=None, gt=0)
    manager_id: int | None = Field(default=None, gt=0)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        text = str(value or "").strip()
        if "@" not in text or "." not in text.rsplit("@", 1)[-1]:
            raise ValueError("email invalide")
        return text


class UpdateUserRoleInput(BaseModel):
    user_id: int = Field(gt=0)
    role: str


class AssignManagerInput(BaseModel):
    user_id: int = Field(gt=0)
    manager_id: int | None = Field(default=None, gt=0)


class AssignRhOwnerInput(BaseModel):
    rh_user_id: int = Field(gt=0)
    entreprise_id: int = Field(gt=0)


class AdminTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="admin.list_users",
                description="Liste les utilisateurs visibles par l'administrateur.",
                input_model=PageInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.list_users,
        )
        registry.register(
            ToolDefinition(
                name="admin.create_user",
                description="Cree un utilisateur via le contrat d'administration.",
                input_model=CreateUserInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_ROLE,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_user,
        )
        registry.register(
            ToolDefinition(
                name="admin.update_user_role",
                description="Remplace le role business d'un utilisateur par un role canonique unique.",
                input_model=UpdateUserRoleInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_ROLE,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.update_user_role,
        )
        registry.register(
            ToolDefinition(
                name="admin.assign_manager",
                description="Assigne ou retire le manager d'un utilisateur.",
                input_model=AssignManagerInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_ROLE,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.assign_manager,
        )
        registry.register(
            ToolDefinition(
                name="admin.assign_rh_owner",
                description="Assigne un proprietaire RH a une entreprise.",
                input_model=AssignRhOwnerInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_ROLE,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.assign_rh_owner,
        )
        registry.register(
            ToolDefinition(
                name="admin.list_enterprises",
                description="Liste les entreprises visibles par l'administrateur.",
                input_model=PageInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.list_enterprises,
        )
        registry.register(
            ToolDefinition(
                name="admin.misconfigured_users",
                description="Detecte les utilisateurs avec configuration incomplete depuis des lectures sures.",
                input_model=PageInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.misconfigured_users,
        )
        registry.register(
            ToolDefinition(
                name="admin.system_health",
                description="Verifie une sante systeme minimale via les endpoints disponibles.",
                input_model=PageInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.system_health,
        )
        registry.register(
            ToolDefinition(
                name="admin.provider_status",
                description="Retourne l'etat configure du fournisseur LLM (Ollama / disabled / cloud).",
                input_model=EmptyAdminInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.provider_status,
        )
        registry.register(
            ToolDefinition(
                name="admin.redis_status",
                description="Retourne l'etat configure de Redis pour les evenements temps-reel.",
                input_model=EmptyAdminInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.redis_status,
        )
        registry.register(
            ToolDefinition(
                name="admin.braintrust_status",
                description="Retourne l'etat configure de Braintrust (observabilite).",
                input_model=EmptyAdminInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.braintrust_status,
        )
        registry.register(
            ToolDefinition(
                name="admin.rag_status",
                description="Retourne l'etat configure du RAG (ChromaDB ou fallback local).",
                input_model=EmptyAdminInput,
                output_model=None,
                type="read",
                allowed_roles=ADMIN_ROLE,
            ),
            self.rag_status,
        )

    async def list_users(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        params = _page_params(payload)
        result = await self.backend_client.get("/users", context=context, params=params)
        if not result.success:
            return _read_failure("admin.list_users", result, "Impossible de charger les utilisateurs.")
        items = _extract_items(result.data)
        count = _extract_count(result.data, items)
        summary = "Aucun utilisateur trouve." if count == 0 else f"{count} utilisateur(s) trouve(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.list_users",
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data,
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def create_user(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        role = _normalize_role(getattr(payload, "role", None))
        if role not in BUSINESS_ROLES:
            return ToolResult.fail("invalid_role", "Role invalide. Roles autorises: ADMIN, RH, MANAGER, EMPLOYEE.", status_code=400)
        status = _normalize_status(getattr(payload, "status", None))
        if status not in VALID_STATUSES:
            return ToolResult.fail("invalid_status", "Statut invalide. Statuts autorises: ACTIVE, INACTIVE, SUSPENDED.", status_code=400)
        body = {
            "firstName": getattr(payload, "first_name"),
            "lastName": getattr(payload, "last_name"),
            "email": str(getattr(payload, "email")),
            "password": getattr(payload, "password"),
            "phone": getattr(payload, "phone", None),
            "position": getattr(payload, "position", None),
            "role": role,
            "status": status,
            "companyId": getattr(payload, "company_id"),
            "departmentId": getattr(payload, "department_id", None),
            "teamId": getattr(payload, "team_id", None),
            "managerId": getattr(payload, "manager_id", None),
        }
        result = await self.backend_client.post("/users", context=context, json=_drop_none(body))
        return _write_response("admin.create_user", result, "Utilisateur cree avec un role business unique.")

    async def update_user_role(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        user_id = int(getattr(payload, "user_id"))
        role = _normalize_role(getattr(payload, "role", None))
        if role not in BUSINESS_ROLES:
            return ToolResult.fail("invalid_role", "Role invalide. Roles autorises: ADMIN, RH, MANAGER, EMPLOYEE.", status_code=400)

        current = await self.backend_client.get(f"/organisations/users/{user_id}", context=context)
        if not current.success:
            return _write_response("admin.update_user_role", current, "Impossible de charger l'utilisateur avant mise a jour.")
        if not isinstance(current.data, dict):
            return ToolResult.fail("invalid_user_payload", "Le profil utilisateur retourne est invalide.", status_code=502)
        body = _utilisateur_update_body(current.data)
        body["role"] = role
        body["roleIds"] = []
        result = await self.backend_client.request("PATCH", f"/organisations/users/{user_id}", context=context, json=body)
        return _write_response(
            "admin.update_user_role",
            result,
            f"Role utilisateur remplace par {role}. La regle exactement-un-role reste appliquee par le backend.",
        )

    async def assign_manager(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        user_id = int(getattr(payload, "user_id"))
        manager_id = getattr(payload, "manager_id", None)
        params = {"managerId": manager_id} if manager_id is not None else {}
        result = await self.backend_client.request("PUT", f"/organisations/users/{user_id}/manager", context=context, params=params)
        summary = "Manager assigne." if manager_id is not None else "Manager retire."
        return _write_response("admin.assign_manager", result, summary)

    async def assign_rh_owner(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        rh_user_id = int(getattr(payload, "rh_user_id"))
        entreprise_id = int(getattr(payload, "entreprise_id"))
        result = await self.backend_client.request(
            "PUT",
            f"/organisations/rh/{rh_user_id}/assign-entreprise",
            context=context,
            json={"entrepriseId": entreprise_id},
        )
        return _write_response("admin.assign_rh_owner", result, "Entreprise assignee au proprietaire RH.")

    async def list_enterprises(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        params = _page_params(payload)
        result = await self.backend_client.get("/organisations/entreprises", context=context, params=params)
        if not result.success:
            return _read_failure("admin.list_enterprises", result, "Impossible de charger les entreprises.")
        items = _extract_items(result.data)
        count = _extract_count(result.data, items)
        active = sum(1 for item in items if isinstance(item, dict) and item.get("estActive") is True)
        summary = "Aucune entreprise trouvee." if count == 0 else f"{count} entreprise(s) trouvee(s), dont {active} active(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.list_enterprises",
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data,
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def misconfigured_users(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        params = _page_params(payload)
        params["size"] = min(int(params.get("size", 100)), 100)
        result = await self.backend_client.get("/organisations/users", context=context, params=params)
        if not result.success:
            return _read_failure("admin.misconfigured_users", result, "Impossible d'analyser la configuration utilisateurs.")
        users = _extract_items(result.data)
        findings = [_misconfiguration(user) for user in users if isinstance(user, dict)]
        findings = [item for item in findings if item is not None]
        summary = "Aucun utilisateur mal configure detecte." if not findings else f"{len(findings)} utilisateur(s) potentiellement mal configure(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.misconfigured_users",
                    summary=summary,
                    items=findings,
                    count=len(findings),
                    data={"sourceCount": len(users), "findings": findings},
                    backend_status=result.status_code,
                    empty=not findings,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def system_health(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        # In chatbot_public_context mode we have no backend token, so the
        # gateway probe would 401 and shadow the local config view. Report
        # only on what we can introspect deterministically: process mode +
        # local toggles. Real backend reachability lives in /v2/health.
        from_chatbot_context = (
            isinstance(context.metadata, dict)
            and context.metadata.get("chatbot_public_context") is True
        )
        if from_chatbot_context:
            return self._local_system_health()
        profile = await self.backend_client.get("/users/me", context=context)
        if not profile.success:
            return _read_failure("admin.system_health", profile, "La verification systeme minimale est indisponible.")
        settings = _safe_settings()
        item = {
            "service": "gateway/organisation",
            "status": "reachable",
            "authenticatedRole": context.role,
            "tenantId": context.tenant_id,
        }
        components = [item, *_local_component_items(settings)]
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.system_health",
                    summary="Gateway et organisation-service repondent pour l'utilisateur admin authentifie.",
                    items=components,
                    count=len(components),
                    data={
                        "kind": "system_health_report",
                        "profileAvailable": True,
                        "scope": "gateway_plus_local",
                        "components": components,
                    },
                    backend_status=profile.status_code,
                    empty=False,
                )
            },
            warnings=profile.warnings,
            status_code=profile.status_code,
        )

    def _local_system_health(self) -> ToolResult:
        settings = _safe_settings()
        components = _local_component_items(settings)
        summary = "Etat systeme local (mode chatbot public) : " + ", ".join(
            f"{c['service']}={c['status']}" for c in components
        )
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.system_health",
                    summary=summary,
                    items=components,
                    count=len(components),
                    data={
                        "kind": "system_health_report",
                        "scope": "local_only",
                        "components": components,
                    },
                    backend_status=None,
                    empty=False,
                )
            },
        )

    async def provider_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        settings = _safe_settings()
        mode = str(getattr(settings, "ai_provider_mode", "disabled") or "disabled").strip().lower()
        item = {
            "service": "ai_provider",
            "mode": mode,
            "status": "configured" if mode != "disabled" else "disabled",
            "model": str(getattr(settings, "ai_provider_model", "") or ""),
            "ollamaBaseUrl": str(getattr(settings, "ollama_base_url", "") or ""),
            "ollamaModel": str(getattr(settings, "ollama_model", "") or ""),
            "fallbackModel": str(getattr(settings, "ollama_fallback_model", "") or ""),
        }
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.provider_status",
                    summary=f"Fournisseur IA configure en mode '{mode}' (modele {item['model'] or item['ollamaModel'] or 'n/a'}).",
                    items=[item],
                    count=1,
                    data={"kind": "provider_status_report", "provider": item},
                )
            },
        )

    async def redis_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        settings = _safe_settings()
        enabled = bool(getattr(settings, "redis_enabled", False))
        url = str(getattr(settings, "redis_url", "") or "")
        item = {
            "service": "redis",
            "enabled": enabled,
            "status": "enabled" if enabled else "disabled",
            "channel": str(getattr(settings, "redis_ai_events_channel", "") or ""),
            "url": _mask_url(url),
        }
        summary = "Redis active." if enabled else "Redis desactive (les evenements temps-reel utilisent le bus en memoire)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.redis_status",
                    summary=summary,
                    items=[item],
                    count=1,
                    data={"kind": "redis_status_report", "redis": item},
                )
            },
        )

    async def braintrust_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        settings = _safe_settings()
        enabled = bool(getattr(settings, "braintrust_enabled", False))
        item = {
            "service": "braintrust",
            "enabled": enabled,
            "status": "enabled" if enabled else "disabled",
            "project": str(getattr(settings, "braintrust_project_name", "") or ""),
            "apiKeyConfigured": bool(getattr(settings, "braintrust_api_key", None)),
            "env": str(getattr(settings, "braintrust_env", "") or ""),
        }
        summary = "Braintrust active." if enabled else "Braintrust desactive (aucune trace n'est exportee)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.braintrust_status",
                    summary=summary,
                    items=[item],
                    count=1,
                    data={"kind": "braintrust_status_report", "braintrust": item},
                )
            },
        )

    async def rag_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        settings = _safe_settings()
        chroma_enabled = bool(getattr(settings, "chroma_enabled", False))
        item = {
            "service": "rag",
            "provider": str(getattr(settings, "rag_provider", "") or ""),
            "chromaEnabled": chroma_enabled,
            "status": "chroma" if chroma_enabled else "local_keyword",
            "collection": str(getattr(settings, "chroma_collection_name", "") or ""),
            "embeddingModel": str(getattr(settings, "chroma_embedding_model", "") or ""),
            "requireCitations": bool(getattr(settings, "rag_require_citations", True)),
        }
        summary = (
            "RAG ChromaDB active." if chroma_enabled
            else "RAG en mode local (mots-cles), aucune base vectorielle active."
        )
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="admin.rag_status",
                    summary=summary,
                    items=[item],
                    count=1,
                    data={"kind": "rag_status_report", "rag": item},
                )
            },
        )


def register_admin_tools(registry: ToolRegistry, backend_client: BackendClient) -> AdminTools:
    tools = AdminTools(backend_client)
    tools.register(registry)
    return tools


def _page_params(payload: BaseModel) -> dict[str, int]:
    return {"page": int(getattr(payload, "page", 0)), "size": int(getattr(payload, "size", 50))}


def _extract_items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("content", "items", "data", "users", "enterprises"):
            value = data.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict) and value is not data:
                nested = _extract_items(value)
                if nested:
                    return nested
    return []


def _extract_count(data: Any, items: list[Any]) -> int:
    if isinstance(data, dict):
        for key in ("totalElements", "total", "totalCount", "count"):
            value = data.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, float) and value.is_integer():
                return int(value)
    return len(items)


def _read_failure(tool_name: str, result: ToolResult, fallback: str) -> ToolResult:
    message = _clean_error(result, fallback)
    return ToolResult.fail(
        result.error_code or "backend_error",
        message,
        status_code=result.status_code,
        data={
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=message,
                items=[],
                count=0,
                data=result.data,
                error={"code": result.error_code, "message": message},
                backend_status=result.status_code,
                empty=True,
            )
        },
        warnings=result.warnings,
    )


def _write_response(tool_name: str, result: ToolResult, success_summary: str) -> ToolResult:
    if not result.success:
        return ToolResult.fail(
            result.error_code or "backend_error",
            _clean_error(result, "Action admin refusee par le backend."),
            status_code=result.status_code,
            data={
                "write_result": build_write_result(
                    tool_name=tool_name,
                    summary=_clean_error(result, "Action admin refusee par le backend."),
                    data=result.data,
                    error={"code": result.error_code, "message": result.error_message},
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
        )
    return ToolResult.ok(
        {
            "write_result": build_write_result(
                tool_name=tool_name,
                summary=success_summary,
                data=result.data,
                backend_status=result.status_code,
            )
        },
        warnings=result.warnings,
        status_code=result.status_code,
    )


def _clean_error(result: ToolResult, fallback: str) -> str:
    if result.status_code in (401, 403):
        return "Votre role ne permet pas cette action admin."
    if result.status_code == 404:
        return "La ressource admin demandee est indisponible."
    if result.status_code == 409:
        return result.error_message or "Conflit detecte par le backend."
    if result.status_code is None or result.status_code >= 500:
        return "Le service d'administration est momentanement indisponible. Reessayez dans quelques instants."
    return result.error_message or fallback


def _normalize_role(value: Any) -> str:
    text = str(value or "").strip().upper().replace("ROLE_", "")
    return text


def _normalize_status(value: Any) -> str:
    text = str(value or "ACTIVE").strip().upper()
    return {"ACTIF": "ACTIVE", "INACTIF": "INACTIVE", "SUSPENDU": "SUSPENDED"}.get(text, text)


def _drop_none(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}


def _utilisateur_update_body(user: dict[str, Any]) -> dict[str, Any]:
    return _drop_none(
        {
            "nom": user.get("nom") or _last_name_from(user),
            "prenom": user.get("prenom") or _first_name_from(user),
            "email": user.get("email"),
            "motDePasse": "",
            "telephone": user.get("telephone"),
            "poste": user.get("poste"),
            "statut": user.get("statut") or _normalize_status(user.get("status")),
            "entrepriseId": user.get("entrepriseId") or _nested_id(user.get("company")),
            "departementId": user.get("departementId"),
            "equipeId": user.get("equipeId"),
            "role": _normalize_role(user.get("role")),
            "roleIds": [],
        }
    )


def _first_name_from(user: dict[str, Any]) -> str:
    name = str(user.get("name") or "").strip()
    return name.split(" ", 1)[0] if name else "Utilisateur"


def _last_name_from(user: dict[str, Any]) -> str:
    name = str(user.get("name") or "").strip()
    if " " in name:
        return name.split(" ", 1)[1].strip() or "WeenTime"
    return "WeenTime"


def _nested_id(value: Any) -> int | None:
    if isinstance(value, dict):
        raw = value.get("id")
        try:
            return int(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None
    return None


def _misconfiguration(user: dict[str, Any]) -> dict[str, Any] | None:
    issues: list[str] = []
    role = _normalize_role(user.get("role"))
    roles = user.get("roles")
    if not user.get("email"):
        issues.append("email_missing")
    if role not in BUSINESS_ROLES:
        issues.append("invalid_or_missing_role")
    if isinstance(roles, list) and len(roles) != 1:
        issues.append("not_exactly_one_role")
    if isinstance(roles, set) and len(roles) != 1:
        issues.append("not_exactly_one_role")
    if not (user.get("entrepriseId") or user.get("company") or user.get("entrepriseNom")):
        issues.append("company_missing")
    status = _normalize_status(user.get("statut") or user.get("status"))
    if status not in VALID_STATUSES:
        issues.append("invalid_status")
    if not issues:
        return None
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "role": role or None,
        "issues": issues,
    }


def _safe_settings() -> Any:
    try:
        return get_settings()
    except Exception:  # pragma: no cover - defensive
        class _Empty:
            pass
        return _Empty()


def _mask_url(url: str) -> str:
    # Never echo credentials embedded in a Redis URL — ResponseGuard's
    # SecretLeakRule would reject the response anyway, but masking here is
    # defence-in-depth.
    if not url:
        return ""
    if "@" in url:
        scheme, rest = url.split("://", 1) if "://" in url else ("", url)
        creds_and_host = rest.split("@", 1)
        if len(creds_and_host) == 2:
            host = creds_and_host[1]
            return f"{scheme}://***@{host}" if scheme else f"***@{host}"
    return url


def _local_component_items(settings: Any) -> list[dict[str, Any]]:
    provider_mode = str(getattr(settings, "ai_provider_mode", "disabled") or "disabled")
    return [
        {
            "service": "ai_provider",
            "status": "configured" if provider_mode != "disabled" else "disabled",
            "mode": provider_mode,
            "model": str(getattr(settings, "ai_provider_model", "") or ""),
        },
        {
            "service": "redis",
            "status": "enabled" if getattr(settings, "redis_enabled", False) else "disabled",
        },
        {
            "service": "braintrust",
            "status": "enabled" if getattr(settings, "braintrust_enabled", False) else "disabled",
        },
        {
            "service": "rag",
            "status": "chroma" if getattr(settings, "chroma_enabled", False) else "local_keyword",
        },
        {
            "service": "chatbot_public_mode",
            "status": "enabled" if getattr(settings, "chatbot_public_mode", False) else "disabled",
        },
    ]


def _extract_name_and_email(text: str) -> tuple[str | None, str | None]:
    email_match = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text or "")
    email = email_match.group(0) if email_match else None
    name = None
    if email:
        before = text[: email_match.start()].strip()
        tokens = re.split(r"\s+", before)
        if tokens:
            name = tokens[-1].strip(" ,.;:") or None
    return name, email
