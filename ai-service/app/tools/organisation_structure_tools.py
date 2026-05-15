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
            "organisation.create_team",
            result,
            f"Equipe '{payload.nom.strip()}' creee.",
        )

    async def create_department(self, payload: CreateDepartmentInput, context: CurrentUserContext) -> ToolResult:
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
            "organisation.create_department",
            result,
            f"Departement '{payload.nom.strip()}' cree.",
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
