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


class ScheduleDefaultInput(BaseModel):
    email: str | None = None


class EmptyEmployeeScheduleInput(BaseModel):
    pass


class EmptyManagerTeamScheduleInput(BaseModel):
    pass


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
                name="schedule.create",
                description="Cree un modele horaire RH/admin depuis le backend horaires verifie.",
                input_model=ScheduleCreateInput,
                type="write",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=True,
                idempotency_required=True,
                tenant_scoped=True,
            ),
            self.create_schedule_alias,
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
                name="schedule.assign",
                description="Affecte un horaire a un employe, une equipe ou l'entreprise.",
                input_model=ScheduleAssignInput,
                type="write",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=True,
                idempotency_required=True,
                tenant_scoped=True,
            ),
            self.assign_schedule_alias,
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

        registry.register(
            ToolDefinition(
                name="schedule.default",
                description="Retourne l'horaire resolu pour l'utilisateur courant ou l'email fourni.",
                input_model=ScheduleDefaultInput,
                type="read",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.get_default_schedule,
        )

        registry.register(
            ToolDefinition(
                name="employee.schedule",
                description="Retourne l'horaire/planning de l'employe connecte.",
                input_model=EmptyEmployeeScheduleInput,
                output_model=None,
                type="read",
                allowed_roles={"EMPLOYEE"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.employee_schedule,
        )

        registry.register(
            ToolDefinition(
                name="manager.team_schedule",
                description="Retourne les horaires de l'equipe du manager connecte.",
                input_model=EmptyManagerTeamScheduleInput,
                output_model=None,
                type="read",
                allowed_roles={"MANAGER"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.manager_team_schedule,
        )

    async def employee_schedule(
        self,
        payload: EmptyEmployeeScheduleInput,
        context: CurrentUserContext,
    ) -> ToolResult:
        _ = payload

        result = await self.backend_client.get(
            "/horaires/resolve",
            context=context,
            tool_name="employee.schedule",
            success_status_codes={200},
        )

        if not result.success:
            message = _clean_error(result, "Impossible de charger votre planning.")
            return ToolResult.fail(
                result.error_code or "employee_schedule_unavailable",
                message,
                status_code=result.status_code,
                data={
                    "read_result": build_read_result(
                        tool_name="employee.schedule",
                        summary=message,
                        items=[],
                        data={},
                        count=0,
                        empty=True,
                        backend_status=result.status_code,
                    )
                },
                warnings=result.warnings,
            )

        item = result.data if isinstance(result.data, dict) else {"value": result.data}
        formatted_item = _format_employee_schedule_item(item)

        summary = _employee_schedule_summary(formatted_item)

        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="employee.schedule",
                    summary=summary,
                    items=[formatted_item] if formatted_item else [],
                    data={"schedule": formatted_item, "raw": result.data},
                    count=1 if formatted_item else 0,
                    empty=not bool(formatted_item),
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def manager_team_schedule(
        self,
        payload: EmptyManagerTeamScheduleInput,
        context: CurrentUserContext,
    ) -> ToolResult:
        _ = payload

        result = await self.backend_client.get(
            "/horaires/team",
            context=context,
            tool_name="manager.team_schedule",
            success_status_codes={200},
        )

        if not result.success:
            message = _clean_error(result, "Impossible de charger les horaires de votre equipe.")
            return ToolResult.fail(
                result.error_code or "manager_team_schedule_unavailable",
                message,
                status_code=result.status_code,
                data={
                    "read_result": build_read_result(
                        tool_name="manager.team_schedule",
                        summary=message,
                        items=[],
                        data={},
                        count=0,
                        empty=True,
                        backend_status=result.status_code,
                    )
                },
                warnings=result.warnings,
            )

        raw_items = _items(result.data)
        formatted_items = [_format_team_schedule_item(x) for x in raw_items]
        formatted_items = [x for x in formatted_items if x]

        count = len(formatted_items)
        summary = (
            "Aucun horaire equipe disponible."
            if count == 0
            else f"Horaires equipe charges pour {count} employe(s)."
        )

        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="manager.team_schedule",
                    summary=summary,
                    items=formatted_items,
                    data={"schedules": formatted_items, "raw": result.data},
                    count=count,
                    empty=count == 0,
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
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

    async def create_schedule_alias(self, payload: ScheduleCreateInput, context: CurrentUserContext) -> ToolResult:
        result = await self.create_schedule(payload, context)
        return _rename_write_tool(result, "schedule.create")

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

    async def assign_schedule_alias(self, payload: ScheduleAssignInput, context: CurrentUserContext) -> ToolResult:
        result = await self.assign_schedule(payload, context)
        return _rename_write_tool(result, "schedule.assign")

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

    async def get_default_schedule(self, payload: ScheduleDefaultInput, context: CurrentUserContext) -> ToolResult:
        params = {"email": payload.email} if payload.email else None
        result = await self.backend_client.get("/horaires/resolve", context=context, params=params)
        if not result.success:
            return result

        item = result.data if isinstance(result.data, dict) else {"value": result.data}
        summary = "Horaire par defaut resolu depuis le backend."

        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="schedule.default",
                    summary=summary,
                    items=[item] if item else [],
                    data=item,
                    count=1 if item else 0,
                    empty=not bool(item),
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )


def register_schedule_tools(registry: ToolRegistry, backend_client: BackendClient) -> None:
    ScheduleTools(backend_client).register(registry)


def _format_employee_schedule_item(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return {
            "title": "Mon planning",
            "subtitle": str(item),
            "raw": item,
        }

    horaire = item.get("horaire") if isinstance(item.get("horaire"), dict) else {}
    schedule = item.get("schedule") if isinstance(item.get("schedule"), dict) else {}
    planning = item.get("planning") if isinstance(item.get("planning"), dict) else {}

    schedule_name = (
        item.get("nom")
        or item.get("name")
        or item.get("horaireName")
        or item.get("horaireNom")
        or item.get("scheduleName")
        or item.get("nomHoraire")
        or horaire.get("nom")
        or horaire.get("name")
        or schedule.get("nom")
        or schedule.get("name")
        or planning.get("nom")
        or planning.get("name")
        or "Horaire"
    )

    start = (
        item.get("heureDebut")
        or item.get("startTime")
        or item.get("timeStart")
        or item.get("debut")
        or item.get("start")
        or horaire.get("heureDebut")
        or horaire.get("startTime")
        or horaire.get("debut")
        or schedule.get("heureDebut")
        or schedule.get("startTime")
        or schedule.get("start")
        or planning.get("heureDebut")
        or planning.get("startTime")
        or planning.get("start")
    )

    end = (
        item.get("heureFin")
        or item.get("endTime")
        or item.get("timeEnd")
        or item.get("fin")
        or item.get("end")
        or horaire.get("heureFin")
        or horaire.get("endTime")
        or horaire.get("fin")
        or schedule.get("heureFin")
        or schedule.get("endTime")
        or schedule.get("end")
        or planning.get("heureFin")
        or planning.get("endTime")
        or planning.get("end")
    )

    weekly_hours = (
        item.get("heuresHebdo")
        or item.get("heures_hebdo")
        or item.get("weeklyHours")
        or item.get("weekly_hours")
        or horaire.get("heuresHebdo")
        or horaire.get("weeklyHours")
        or schedule.get("heuresHebdo")
        or schedule.get("weeklyHours")
    )

    days = (
        item.get("jours")
        or item.get("days")
        or horaire.get("jours")
        or horaire.get("days")
        or schedule.get("jours")
        or schedule.get("days")
        or planning.get("jours")
        or planning.get("days")
    )

    status = (
        item.get("statut")
        or item.get("status")
        or horaire.get("statut")
        or horaire.get("status")
        or schedule.get("statut")
        or schedule.get("status")
        or ""
    )

    parts = [str(schedule_name)]

    if start and end:
        parts.append(f"{start} - {end}")

    if weekly_hours:
        parts.append(f"{weekly_hours}h/semaine")

    if days:
        parts.append(_format_days(days))

    subtitle = " | ".join(part for part in parts if part)

    return {
        "title": "Mon planning",
        "subtitle": subtitle,
        "status": str(status) if status else "",
        "raw": item,
    }


def _employee_schedule_summary(item: dict[str, Any] | None) -> str:
    if not item:
        return "Aucun planning disponible pour votre compte."

    subtitle = item.get("subtitle")
    if subtitle:
        return f"Votre planning: {subtitle}"

    return "Votre planning a ete charge."


def _format_team_schedule_item(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return {
            "title": str(item),
            "subtitle": "Horaire equipe",
            "raw": item,
        }

    employee = (
        item.get("fullName")
        or item.get("employeeName")
        or item.get("nomComplet")
        or item.get("name")
        or item.get("displayName")
        or item.get("email")
        or _join_names(item.get("prenom"), item.get("nom"))
        or _nested_get(item, "employee", "fullName")
        or _nested_get(item, "employee", "name")
        or _nested_get(item, "employee", "email")
        or _nested_get(item, "user", "fullName")
        or _nested_get(item, "user", "name")
        or _nested_get(item, "user", "email")
        or "Employe"
    )

    horaire = item.get("horaire") if isinstance(item.get("horaire"), dict) else {}
    schedule = item.get("schedule") if isinstance(item.get("schedule"), dict) else {}
    planning = item.get("planning") if isinstance(item.get("planning"), dict) else {}

    schedule_name = (
        item.get("horaireName")
        or item.get("horaireNom")
        or item.get("scheduleName")
        or item.get("nomHoraire")
        or item.get("planningName")
        or horaire.get("nom")
        or horaire.get("name")
        or schedule.get("nom")
        or schedule.get("name")
        or planning.get("nom")
        or planning.get("name")
        or "Horaire"
    )

    start = (
        item.get("heureDebut")
        or item.get("startTime")
        or item.get("timeStart")
        or item.get("debut")
        or item.get("start")
        or horaire.get("heureDebut")
        or horaire.get("startTime")
        or horaire.get("debut")
        or schedule.get("heureDebut")
        or schedule.get("startTime")
        or schedule.get("start")
        or planning.get("heureDebut")
        or planning.get("startTime")
        or planning.get("start")
    )

    end = (
        item.get("heureFin")
        or item.get("endTime")
        or item.get("timeEnd")
        or item.get("fin")
        or item.get("end")
        or horaire.get("heureFin")
        or horaire.get("endTime")
        or horaire.get("fin")
        or schedule.get("heureFin")
        or schedule.get("endTime")
        or schedule.get("end")
        or planning.get("heureFin")
        or planning.get("endTime")
        or planning.get("end")
    )

    days = (
        item.get("jours")
        or item.get("days")
        or horaire.get("jours")
        or horaire.get("days")
        or schedule.get("jours")
        or schedule.get("days")
        or planning.get("jours")
        or planning.get("days")
    )

    status = (
        item.get("statut")
        or item.get("status")
        or horaire.get("statut")
        or horaire.get("status")
        or schedule.get("statut")
        or schedule.get("status")
        or ""
    )

    parts = [str(schedule_name)]

    if start and end:
        parts.append(f"{start} - {end}")

    if days:
        parts.append(_format_days(days))

    subtitle = " | ".join(part for part in parts if part)

    return {
        "title": str(employee),
        "subtitle": subtitle,
        "status": str(status) if status else "",
        "raw": item,
    }


def _nested_get(data: dict[str, Any], parent: str, child: str) -> Any:
    value = data.get(parent)
    if isinstance(value, dict):
        return value.get(child)
    return None


def _join_names(first: Any, last: Any) -> str | None:
    values = [str(value).strip() for value in (first, last) if value]
    return " ".join(values) if values else None


def _format_days(days: Any) -> str:
    if isinstance(days, list):
        labels = []
        for day in days:
            if isinstance(day, dict):
                label = (
                    day.get("jour")
                    or day.get("day")
                    or day.get("dayOfWeek")
                    or day.get("nom")
                    or day.get("name")
                )
                start = day.get("heureDebut") or day.get("startTime") or day.get("start")
                end = day.get("heureFin") or day.get("endTime") or day.get("end")
                if label and start and end:
                    labels.append(f"{label}: {start}-{end}")
                elif label:
                    labels.append(str(label))
            else:
                labels.append(str(day))
        return ", ".join(labels)

    if isinstance(days, dict):
        return ", ".join(f"{key}: {value}" for key, value in days.items())

    return str(days)


def _items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for key in ("content", "items", "horaires", "schedules", "data"):
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


def _rename_write_tool(result: ToolResult, tool_name: str) -> ToolResult:
    if not isinstance(result.data, dict):
        return result

    write_result = result.data.get("write_result")

    if isinstance(write_result, dict):
        cloned = dict(write_result)
        cloned["toolName"] = tool_name
        return ToolResult(
            success=result.success,
            data={"write_result": cloned},
            warnings=result.warnings,
            error_code=result.error_code,
            error_message=result.error_message,
            status_code=result.status_code,
        )

    if result.data.get("kind") == "write_result":
        cloned = dict(result.data)
        cloned["toolName"] = tool_name
        return ToolResult(
            success=result.success,
            data=cloned,
            warnings=result.warnings,
            error_code=result.error_code,
            error_message=result.error_message,
            status_code=result.status_code,
        )

    return result