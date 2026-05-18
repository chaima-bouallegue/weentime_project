from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result, build_write_result

ADMIN_RH_ROLES = {"ADMIN", "RH"}
READ_ROLES = {"ADMIN", "RH", "MANAGER"}


class PageInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=50, ge=1, le=100)


class ListTeamsInput(PageInput):
    pass


class ListDepartmentsInput(PageInput):
    pass


class CreateTeamInput(BaseModel):
    nom: str = Field(min_length=1, max_length=120)
    departement_id: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=255)
    responsable_id: int | None = Field(default=None, gt=0)
    effectif_maximum: int | None = Field(default=None, ge=1, le=10_000)
    est_active: bool = True


class CreateDepartmentInput(BaseModel):
    nom: str = Field(min_length=2, max_length=100)
    code_interne: str = Field(min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=255)
    entreprise_id: int | None = Field(default=None, gt=0)

    @field_validator("code_interne")
    @classmethod
    def _validate_code_interne(cls, value: str) -> str:
        text = (value or "").strip().upper()
        if not text:
            raise ValueError("code_interne required")
        for char in text:
            if not (char.isalnum() or char == "-"):
                raise ValueError("code_interne accepte uniquement lettres majuscules, chiffres et tirets")
        return text


class UpdateDepartmentInput(BaseModel):
    department_id: int = Field(gt=0)
    nom: str | None = Field(default=None, min_length=2, max_length=100)
    code_interne: str | None = Field(default=None, min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=255)
    entreprise_id: int | None = Field(default=None, gt=0)

    @field_validator("code_interne")
    @classmethod
    def _validate_code_interne(cls, value: str | None) -> str | None:
        if value is None:
            return value
        text = (value or "").strip().upper()
        if not text:
            raise ValueError("code_interne required")
        for char in text:
            if not (char.isalnum() or char == "-"):
                raise ValueError("code_interne accepte uniquement lettres majuscules, chiffres et tirets")
        return text


class DeleteDepartmentInput(BaseModel):
    department_id: int = Field(gt=0)


class AssignEmployeeTeamInput(BaseModel):
    user_id: int = Field(gt=0)
    team_id: int = Field(gt=0)
    department_id: int | None = Field(default=None, gt=0)


class AssignManagerTeamInput(BaseModel):
    manager_id: int = Field(gt=0)
    team_id: int = Field(gt=0)


class OrganisationStructureTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="organisation.list_teams",
                description="Liste les equipes de l'entreprise du caller (lecture seule).",
                input_model=ListTeamsInput,
                output_model=None,
                type="read",
                allowed_roles=READ_ROLES,
            ),
            self.list_teams,
        )
        registry.register(
            ToolDefinition(
                name="organisation.list_departments",
                description="Liste les departements de l'entreprise du caller (lecture seule).",
                input_model=ListDepartmentsInput,
                output_model=None,
                type="read",
                allowed_roles=READ_ROLES,
            ),
            self.list_departments,
        )
        registry.register(
            ToolDefinition(
                name="organisation.create_team",
                description="Cree une nouvelle equipe rattachee a un departement existant.",
                input_model=CreateTeamInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_team,
        )
        registry.register(
            ToolDefinition(
                name="rh.structure.team.create",
                description="Cree une nouvelle equipe RH rattachee a un departement existant.",
                input_model=CreateTeamInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_team_rh,
        )
        registry.register(
            ToolDefinition(
                name="organisation.create_department",
                description="Cree un nouveau departement dans l'entreprise du caller.",
                input_model=CreateDepartmentInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_department,
        )
        registry.register(
            ToolDefinition(
                name="rh.structure.department.create",
                description="Cree un nouveau departement RH dans l'entreprise du caller.",
                input_model=CreateDepartmentInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_department_rh,
        )
        registry.register(
            ToolDefinition(
                name="rh.structure.department.update",
                description="Met a jour un departement existant apres confirmation.",
                input_model=UpdateDepartmentInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.update_department,
        )
        registry.register(
            ToolDefinition(
                name="rh.structure.department.delete",
                description="Supprime un departement existant apres confirmation.",
                input_model=DeleteDepartmentInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.delete_department,
        )
        registry.register(
            ToolDefinition(
                name="rh.structure.employee.assign_team",
                description="Affecte un employe existant a une equipe verifiee.",
                input_model=AssignEmployeeTeamInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.assign_employee_team,
        )
        registry.register(
            ToolDefinition(
                name="rh.structure.manager.assign_team",
                description="Affecte un manager existant comme responsable d'une equipe.",
                input_model=AssignManagerTeamInput,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.assign_manager_team,
        )

    async def list_teams(self, payload: ListTeamsInput, context: CurrentUserContext) -> ToolResult:
        params = {"page": payload.page, "size": payload.size}
        result = await self.backend_client.get("/organisations/equipes", context=context, params=params)
        if not result.success:
            return _read_failure("organisation.list_teams", result, "Impossible de charger les equipes.")
        items = _extract_items(result.data)
        count = _extract_count(result.data, items)
        summary = "Aucune equipe trouvee." if count == 0 else f"{count} equipe(s) trouvee(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="organisation.list_teams",
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

    async def list_departments(self, payload: ListDepartmentsInput, context: CurrentUserContext) -> ToolResult:
        params = {"page": payload.page, "size": payload.size}
        result = await self.backend_client.get("/organisations/departements", context=context, params=params)
        if not result.success:
            return _read_failure("organisation.list_departments", result, "Impossible de charger les departements.")
        items = _extract_items(result.data)
        count = _extract_count(result.data, items)
        summary = "Aucun departement trouve." if count == 0 else f"{count} departement(s) trouve(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="organisation.list_departments",
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

    async def create_team(self, payload: CreateTeamInput, context: CurrentUserContext) -> ToolResult:
        return await self._create_team(payload, context, "organisation.create_team")

    async def create_team_rh(self, payload: CreateTeamInput, context: CurrentUserContext) -> ToolResult:
        return await self._create_team(payload, context, "rh.structure.team.create")

    async def _create_team(self, payload: CreateTeamInput, context: CurrentUserContext, tool_name: str) -> ToolResult:
        body: dict[str, Any] = {
            "nom": payload.nom.strip(),
            "departementId": payload.departement_id,
            "description": payload.description.strip() if payload.description else None,
            "responsableId": payload.responsable_id,
            "effectifMaximum": payload.effectif_maximum,
            "estActive": payload.est_active,
        }
        result = await self.backend_client.post(
            "/organisations/equipes",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            tool_name,
            result,
            f"Equipe '{payload.nom.strip()}' creee.",
        )

    async def create_department(self, payload: CreateDepartmentInput, context: CurrentUserContext) -> ToolResult:
        return await self._create_department(payload, context, "organisation.create_department")

    async def create_department_rh(self, payload: CreateDepartmentInput, context: CurrentUserContext) -> ToolResult:
        return await self._create_department(payload, context, "rh.structure.department.create")

    async def _create_department(self, payload: CreateDepartmentInput, context: CurrentUserContext, tool_name: str) -> ToolResult:
        entreprise_id = payload.entreprise_id or context.tenant_id
        if not entreprise_id or int(entreprise_id) <= 0:
            return ToolResult.fail(
                "missing_entreprise",
                "Identifiant d'entreprise manquant pour creer un departement.",
                status_code=400,
            )
        body: dict[str, Any] = {
            "nom": payload.nom.strip(),
            "codeInterne": payload.code_interne.strip().upper(),
            "description": payload.description.strip() if payload.description else None,
            "entrepriseId": int(entreprise_id),
        }
        result = await self.backend_client.post(
            "/organisations/departements",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            tool_name,
            result,
            f"Departement '{payload.nom.strip()}' cree.",
        )

    async def update_department(self, payload: UpdateDepartmentInput, context: CurrentUserContext) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/departements/{payload.department_id}", context=context)
        if not current.success:
            return _write_response(
                "rh.structure.department.update",
                current,
                "Departement mis a jour.",
            )
        current_data = current.data if isinstance(current.data, dict) else {}
        entreprise_id = payload.entreprise_id or _as_positive_int(current_data.get("entrepriseId")) or context.tenant_id
        body = {
            "nom": (payload.nom or current_data.get("nom") or "").strip(),
            "description": payload.description if payload.description is not None else current_data.get("description"),
            "codeInterne": (payload.code_interne or current_data.get("codeInterne") or current_data.get("code") or "").strip().upper(),
            "entrepriseId": int(entreprise_id) if entreprise_id else None,
        }
        if not body["nom"] or not body["codeInterne"] or not body["entrepriseId"]:
            return ToolResult.fail(
                "department_update_payload_incomplete",
                "Impossible de preparer la mise a jour: nom, code interne ou entreprise manquant.",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/departements/{payload.department_id}",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            "rh.structure.department.update",
            result,
            f"Departement {payload.department_id} mis a jour.",
        )

    async def delete_department(self, payload: DeleteDepartmentInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.request(
            "DELETE",
            f"/organisations/departements/{payload.department_id}",
            context=context,
        )
        return _write_response(
            "rh.structure.department.delete",
            result,
            f"Departement {payload.department_id} supprime.",
        )

    async def assign_employee_team(self, payload: AssignEmployeeTeamInput, context: CurrentUserContext) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/users/{payload.user_id}", context=context)
        if not current.success:
            return _write_response(
                "rh.structure.employee.assign_team",
                current,
                "Employe affecte a l'equipe.",
            )
        current_data = current.data if isinstance(current.data, dict) else {}
        body = _user_update_body(current_data)
        body["equipeId"] = payload.team_id
        if payload.department_id is not None:
            body["departementId"] = payload.department_id
        missing = [key for key in ("nom", "prenom", "email", "statut") if not body.get(key)]
        if missing:
            return ToolResult.fail(
                "user_update_payload_incomplete",
                f"Impossible de preparer l'affectation: champs utilisateur manquants ({', '.join(missing)}).",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/users/{payload.user_id}",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            "rh.structure.employee.assign_team",
            result,
            f"Employe {payload.user_id} affecte a l'equipe {payload.team_id}.",
        )

    async def assign_manager_team(self, payload: AssignManagerTeamInput, context: CurrentUserContext) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/equipes/{payload.team_id}", context=context)
        if not current.success:
            return _write_response(
                "rh.structure.manager.assign_team",
                current,
                "Manager affecte a l'equipe.",
            )
        current_data = current.data if isinstance(current.data, dict) else {}
        departement_id = _as_positive_int(current_data.get("departementId"))
        body = {
            "nom": current_data.get("nom"),
            "description": current_data.get("description"),
            "responsableId": payload.manager_id,
            "effectifMaximum": current_data.get("effectifMaximum"),
            "estActive": current_data.get("estActive", True),
            "departementId": departement_id,
        }
        missing = [key for key in ("nom", "estActive", "departementId") if body.get(key) in (None, "")]
        if missing:
            return ToolResult.fail(
                "team_update_payload_incomplete",
                f"Impossible de preparer l'affectation manager: champs equipe manquants ({', '.join(missing)}).",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/equipes/{payload.team_id}",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            "rh.structure.manager.assign_team",
            result,
            f"Manager {payload.manager_id} affecte a l'equipe {payload.team_id}.",
        )


def register_organisation_structure_tools(
    registry: ToolRegistry,
    backend_client: BackendClient,
) -> OrganisationStructureTools:
    tools = OrganisationStructureTools(backend_client)
    tools.register(registry)
    return tools


def _extract_items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("content", "items", "data", "teams", "equipes", "departements", "departments"):
            value = data.get(key)
            if isinstance(value, list):
                return value
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
        message = _clean_error(result, "Action refusee par le backend.")
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "write_result": build_write_result(
                    tool_name=tool_name,
                    summary=message,
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
        return "Votre role ne permet pas cette action sur la structure d'organisation."
    if result.status_code == 404:
        return "La ressource demandee est introuvable."
    if result.status_code == 409:
        return result.error_message or "Conflit detecte par le backend (nom ou code deja utilise ?)."
    if result.status_code == 400:
        return result.error_message or "Donnees invalides pour la creation."
    if result.status_code is None or result.status_code >= 500:
        return "Le service d'organisation est momentanement indisponible."
    return result.error_message or fallback


def _drop_none(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}


def _as_positive_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _user_update_body(data: dict[str, Any]) -> dict[str, Any]:
    role_value = data.get("role")
    if not role_value and isinstance(data.get("roles"), list) and data["roles"]:
        first_role = data["roles"][0]
        if isinstance(first_role, dict):
            role_value = first_role.get("nom") or first_role.get("name")
        else:
            role_value = str(first_role)
    if isinstance(role_value, str) and role_value.startswith("ROLE_"):
        role_value = role_value.removeprefix("ROLE_")
    return {
        "nom": data.get("nom") or data.get("lastName"),
        "prenom": data.get("prenom") or data.get("firstName"),
        "email": data.get("email"),
        "motDePasse": data.get("motDePasse") or "",
        "telephone": data.get("telephone") or data.get("phone"),
        "poste": data.get("poste") or data.get("position"),
        "statut": data.get("statut") or data.get("status") or "ACTIF",
        "entrepriseId": data.get("entrepriseId"),
        "departementId": data.get("departementId"),
        "equipeId": data.get("equipeId"),
        "role": role_value,
        "roleIds": data.get("roleIds"),
    }
