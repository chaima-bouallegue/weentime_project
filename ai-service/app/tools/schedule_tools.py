from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.backend_client import BackendClient
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult, build_read_result, build_write_result


class ScheduleListInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=20, ge=1, le=100)


class ScheduleCreateInput(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=120)
    type: str = Field(default="FIXE", max_length=40)
    heures_hebdo: float | None = Field(default=None, ge=1, le=168)
    is_defaut: bool = False
    statut: str = Field(default="ACTIF", max_length=40)
    jours: list[dict[str, Any]] | None = None

    @field_validator("type", "statut")
    @classmethod
    def _uppercase(cls, value: str) -> str:
        return (value or "").strip().upper()


class ScheduleAssignInput(BaseModel):
    horaire_id: int = Field(gt=0)
    cible_type: str = Field(default="UTILISATEUR")
    cible_id: int = Field(ge=0)
    date_debut: str | None = Field(default=None)
    date_fin: str | None = Field(default=None)
    motif: str | None = Field(default=None, max_length=255)

    @field_validator("cible_type")
    @classmethod
    def _validate_cible_type(cls, value: str) -> str:
        text = (value or "").strip().upper()
        if text not in {"UTILISATEUR", "EQUIPE", "ENTREPRISE"}:
            raise ValueError("cible_type doit etre UTILISATEUR, EQUIPE ou ENTREPRISE")
        return text


class ScheduleTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="schedule.list",
                description="List RH/admin work schedules from the verified horaires backend.",
                input_model=ScheduleListInput,
                type="read",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.list_schedules,
        )
        registry.register(
            ToolDefinition(
                name="rh.schedule.create",
                description="Cree un modele horaire RH/admin depuis le backend horaires verifie.",
                input_model=ScheduleCreateInput,
                type="write",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=True,
                idempotency_required=True,
                tenant_scoped=True,
            ),
            self.create_schedule,
        )
        registry.register(
            ToolDefinition(
                name="rh.schedule.assign",
                description="Affecte un horaire a un employe, une equipe ou l'entreprise.",
                input_model=ScheduleAssignInput,
                type="write",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=True,
                idempotency_required=True,
                tenant_scoped=True,
            ),
            self.assign_schedule,
        )

    async def list_schedules(self, payload: ScheduleListInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get(
            "/horaires",
            context=context,
            params={"page": payload.page, "size": payload.size},
        )
        if not result.success:
            return result
        items = _items(result.data)
        count = _count(result.data, items)
        summary = "Horaires recuperes depuis le backend." if count else "Aucun horaire disponible."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="schedule.list",
                    summary=summary,
                    items=items,
                    data=result.data,
                    count=count,
                    empty=count == 0,
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def create_schedule(self, payload: ScheduleCreateInput, context: CurrentUserContext) -> ToolResult:
        body = {
            "nom": payload.nom or _default_schedule_name(payload.heures_hebdo),
            "type": payload.type or "FIXE",
            "heuresHebdo": payload.heures_hebdo if payload.heures_hebdo is not None else 35.0,
            "jours": payload.jours,
            "isDefaut": payload.is_defaut,
            "statut": payload.statut or "ACTIF",
        }
        result = await self.backend_client.post(
            "/horaires",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            "rh.schedule.create",
            result,
            f"Horaire '{body['nom']}' cree.",
        )

    async def assign_schedule(self, payload: ScheduleAssignInput, context: CurrentUserContext) -> ToolResult:
        body = {
            "horaireId": payload.horaire_id,
            "cibleType": payload.cible_type,
            "cibleId": payload.cible_id,
            "dateDebut": payload.date_debut,
            "dateFin": payload.date_fin,
            "motif": payload.motif,
        }
        result = await self.backend_client.post(
            "/horaires/assign",
            context=context,
            json=_drop_none(body),
        )
        return _write_response(
            "rh.schedule.assign",
            result,
            f"Horaire {payload.horaire_id} affecte a {payload.cible_type} {payload.cible_id}.",
        )


def register_schedule_tools(registry: ToolRegistry, backend_client: BackendClient) -> None:
    ScheduleTools(backend_client).register(registry)


def _items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("content", "items", "horaires", "data"):
            value = data.get(key)
            if isinstance(value, list):
                return value
        nested = data.get("read_result")
        if isinstance(nested, dict) and isinstance(nested.get("items"), list):
            return nested["items"]
    return []


def _count(data: Any, items: list[Any]) -> int:
    if isinstance(data, dict):
        for key in ("totalElements", "total", "count"):
            value = data.get(key)
            if isinstance(value, int):
                return value
    return len(items)


def _write_response(tool_name: str, result: ToolResult, success_summary: str) -> ToolResult:
    if not result.success:
        message = _clean_error(result, "Action horaire refusee par le backend.")
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "write_result": build_write_result(
                    tool_name=tool_name,
                    summary=message,
                    data=result.data,
                    error={"code": result.error_code, "message": message},
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
        return "Votre role ne permet pas cette action sur les horaires."
    if result.status_code == 404:
        return "L'horaire ou la cible demandee est introuvable."
    if result.status_code == 400:
        return result.error_message or "Donnees invalides pour l'horaire."
    if result.status_code == 409:
        return result.error_message or "Conflit d'horaire detecte par le backend."
    if result.status_code is None or result.status_code >= 500:
        return "Le service horaires est momentanement indisponible."
    return result.error_message or fallback


def _drop_none(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}


def _default_schedule_name(hours: float | None) -> str:
    if hours is not None:
        return f"Horaire {hours:g}h"
    return "Horaire WeenTime"
