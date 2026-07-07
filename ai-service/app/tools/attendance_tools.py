from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result, build_write_result

ALL_BUSINESS_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}
TEAM_PRESENCE_UNAVAILABLE = "Cette vue de presence n'est pas encore disponible pour votre role."
ATTENDANCE_READ_SUCCESS_CODES = {200}
ATTENDANCE_WRITE_SUCCESS_CODES = {200, 201}


class EmptyToolInput(BaseModel):
    pass


class HistoryInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=30, ge=1, le=100)


class TeamPresenceInput(BaseModel):
    team_id: int | None = None


class OvertimeDecisionInput(BaseModel):
    id: int = Field(gt=0)
    reason: str | None = Field(default=None, max_length=255)


class AttendanceTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    async def _backend_get(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        params: dict[str, Any] | None = None,
        tool_name: str | None = None,
        success_status_codes: set[int] | None = None,
    ) -> ToolResult:
        try:
            return await self.backend_client.get(
                path,
                context=context,
                params=params,
                tool_name=tool_name,
                success_status_codes=success_status_codes,
            )
        except TypeError as exc:
            if "tool_name" not in str(exc) and "success_status_codes" not in str(exc):
                raise
            return await self.backend_client.get(path, context=context, params=params)

    async def _backend_post(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        tool_name: str | None = None,
        success_status_codes: set[int] | None = None,
    ) -> ToolResult:
        try:
            return await self.backend_client.post(
                path,
                context=context,
                json=json,
                headers=headers,
                tool_name=tool_name,
                success_status_codes=success_status_codes,
            )
        except TypeError as exc:
            if "tool_name" not in str(exc) and "success_status_codes" not in str(exc):
                raise
            return await self.backend_client.post(path, context=context, json=json, headers=headers)

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="attendance.status",
                description="Retourne le statut de pointage du jour.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_pointage_status_alias,
        )
        registry.register(
            ToolDefinition(
                name="attendance.self.status",
                description="Retourne le pointage du jour de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_pointage_status_alias,
        )
        registry.register(
            ToolDefinition(
                name="get_pointage_status",
                description="Retourne le pointage du jour de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_pointage_status,
        )
        registry.register(
            ToolDefinition(
                name="attendance.check_in",
                description="Pointe l'entree de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_in_alias,
        )
        registry.register(
            ToolDefinition(
                name="attendance.self.check_in",
                description="Pointe l'entree de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_in_alias,
        )
        registry.register(
            ToolDefinition(
                name="check_in",
                description="Pointe l'entree de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_in,
        )
        registry.register(
            ToolDefinition(
                name="attendance.check_out",
                description="Pointe la sortie de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_out_alias,
        )
        registry.register(
            ToolDefinition(
                name="attendance.self.check_out",
                description="Pointe la sortie de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_out_alias,
        )
        registry.register(
            ToolDefinition(
                name="check_out",
                description="Pointe la sortie de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_out,
        )
        registry.register(
            ToolDefinition(
                name="attendance.today_summary",
                description="Retourne le resume de pointage du jour avec horaires et anomalies.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_pointage_status_alias,
        )
        registry.register(
            ToolDefinition(
                name="get_presence_history",
                description="Retourne l'historique personnel de presence.",
                input_model=HistoryInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_presence_history,
        )
        registry.register(
            ToolDefinition(
                name="get_week_hours",
                description="Retourne les statistiques personnelles de presence.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_week_hours,
        )
        registry.register(
            ToolDefinition(
                name="get_team_presence",
                description="Retourne la presence collective selon le role authentifie.",
                input_model=TeamPresenceInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
            ),
            self.get_team_presence,
        )
        registry.register(
            ToolDefinition(
                name="attendance.anomalies",
                description="Retourne les anomalies de presence visibles pour le role courant.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"MANAGER", "RH", "ADMIN"},
            ),
            self.attendance_anomalies,
        )
        registry.register(
            ToolDefinition(
                name="rh.attendance.today",
                description="Retourne la presence entreprise du jour pour la RH.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"RH", "ADMIN"},
            ),
            self.rh_attendance_today,
        )
        registry.register(
            ToolDefinition(
                name="rh.attendance.missing",
                description="Retourne les absences ou pointages manquants du jour pour la RH.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"RH", "ADMIN"},
            ),
            self.rh_attendance_missing,
        )
        registry.register(
            ToolDefinition(
                name="rh.attendance.absent",
                description="Retourne les absences du jour pour la RH.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"RH", "ADMIN"},
            ),
            self.rh_attendance_absent,
        )
        registry.register(
            ToolDefinition(
                name="rh.attendance.late",
                description="Retourne les retards du jour pour la RH.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"RH", "ADMIN"},
            ),
            self.rh_attendance_late,
        )
        registry.register(
            ToolDefinition(
                name="overtime.pending",
                description="Retourne les heures supplementaires en attente.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"MANAGER", "RH", "ADMIN"},
            ),
            self.overtime_pending,
        )
        registry.register(
            ToolDefinition(
                name="overtime.my_summary",
                description="Retourne le resume mensuel des heures supplementaires de l'utilisateur.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"EMPLOYEE", "MANAGER", "RH", "ADMIN"},
            ),
            self.overtime_my_summary,
        )
        registry.register(
            ToolDefinition(
                name="overtime.stats",
                description="Retourne les statistiques RH des heures supplementaires.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles={"RH", "ADMIN"},
            ),
            self.overtime_stats,
        )
        registry.register(
            ToolDefinition(
                name="overtime.approve",
                description="Approuve une demande d'heures supplementaires.",
                input_model=OvertimeDecisionInput,
                output_model=None,
                type="write",
                allowed_roles={"MANAGER", "RH", "ADMIN"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.overtime_approve,
        )
        registry.register(
            ToolDefinition(
                name="overtime.reject",
                description="Rejette une demande d'heures supplementaires.",
                input_model=OvertimeDecisionInput,
                output_model=None,
                type="write",
                allowed_roles={"MANAGER", "RH", "ADMIN"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.overtime_reject,
        )

    async def get_pointage_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._backend_get(
            "/presence/me/today",
            context=context,
            tool_name="attendance.status",
            success_status_codes=ATTENDANCE_READ_SUCCESS_CODES,
        )

    async def get_pointage_status_alias(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.get_pointage_status(_, context)

    async def check_in(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self._backend_post(
            "/presence/me/check-in",
            context=context,
            json=_attendance_write_body(context, action="check_in"),
            tool_name="attendance.check_in",
            success_status_codes=ATTENDANCE_WRITE_SUCCESS_CODES,
        )
        return _strict_attendance_write_result(result)

    async def check_in_alias(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.check_in(_, context)
        return _attendance_write_result(result, "attendance.self.check_in", "Pointage d'entree enregistre.")

    async def check_out(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self._backend_post(
            "/presence/me/check-out",
            context=context,
            json=_attendance_write_body(context, action="check_out"),
            tool_name="attendance.check_out",
            success_status_codes=ATTENDANCE_WRITE_SUCCESS_CODES,
        )
        return _strict_attendance_write_result(result)

    async def check_out_alias(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.check_out(_, context)
        return _attendance_write_result(result, "attendance.self.check_out", "Pointage de sortie enregistre.")

    async def get_presence_history(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        data = payload.model_dump()
        return await self.backend_client.get("/presence/me/history", context=context, params=data)

    async def get_week_hours(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.get("/presence/me/stats", context=context)

    async def get_team_presence(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        params: dict[str, Any] = {}
        team_id = getattr(payload, "team_id", None)
        if role == "MANAGER" and team_id is not None:
            params["teamId"] = team_id
        if role == "MANAGER":
            return await self.backend_client.get("/presence/team/today", context=context, params=params or None)
        if role == "RH":
            return await self.backend_client.get("/presence/company/today", context=context)
        if role == "ADMIN":
            return await self.backend_client.get("/presence/global/analytics", context=context)
        return ToolResult.fail(
            "capability_unavailable",
            TEAM_PRESENCE_UNAVAILABLE,
            status_code=403,
        )

    async def rh_attendance_today(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._rh_presence_view("rh.attendance.today", context, mode="today")

    async def rh_attendance_missing(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._rh_presence_view("rh.attendance.missing", context, mode="missing")

    async def rh_attendance_absent(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._rh_presence_view("rh.attendance.absent", context, mode="absent")

    async def rh_attendance_late(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._rh_presence_view("rh.attendance.late", context, mode="late")

    async def attendance_anomalies(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._rh_presence_view("attendance.anomalies", context, mode="missing")

    async def overtime_pending(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._backend_get(
            "/overtime/manager/pending",
            context=context,
            tool_name="overtime.pending",
            success_status_codes=ATTENDANCE_READ_SUCCESS_CODES,
        )

    async def overtime_my_summary(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._backend_get(
            "/overtime/me/monthly-summary",
            context=context,
            tool_name="overtime.my_summary",
            success_status_codes=ATTENDANCE_READ_SUCCESS_CODES,
        )

    async def overtime_stats(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._backend_get(
            "/overtime/rh/stats",
            context=context,
            tool_name="overtime.stats",
            success_status_codes=ATTENDANCE_READ_SUCCESS_CODES,
        )

    async def overtime_approve(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        data = payload.model_dump()
        return await self._backend_post(
            f"/overtime/{data['id']}/approve",
            context=context,
            json={},
            tool_name="overtime.approve",
            success_status_codes=ATTENDANCE_WRITE_SUCCESS_CODES,
        )

    async def overtime_reject(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        data = payload.model_dump()
        body = {"reason": data.get("reason")} if data.get("reason") else {}
        return await self._backend_post(
            f"/overtime/{data['id']}/reject",
            context=context,
            json=body,
            tool_name="overtime.reject",
            success_status_codes=ATTENDANCE_WRITE_SUCCESS_CODES,
        )

    async def _rh_presence_view(self, tool_name: str, context: CurrentUserContext, *, mode: str) -> ToolResult:
        path = "/presence/company/today" if (context.role or "").upper().replace("ROLE_", "") == "RH" else "/presence/global/analytics"
        result = await self.backend_client.get(path, context=context)
        if not result.success:
            return result
        data = result.data if isinstance(result.data, dict) else {}
        items = _presence_items_for_mode(data, mode=mode)
        summary = _presence_summary(data, mode=mode)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=summary,
                    items=items,
                    count=len(items),
                    data=data,
                    backend_status=result.status_code,
                    empty=not items,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )


def register_attendance_tools(registry: ToolRegistry, backend_client: BackendClient) -> AttendanceTools:
    tools = AttendanceTools(backend_client)
    tools.register(registry)
    return tools


def _attendance_write_body(context: CurrentUserContext, *, action: str) -> dict[str, Any]:
    # Spring backend (PresenceController) requires `source` on every write —
    # missing it surfaces as "source: La source est obligatoire". Tag rows the
    # AI copilot wrote so reporting can distinguish them from manual punches.
    channel = "chat"
    if isinstance(context.metadata, dict):
        candidate = context.metadata.get("channel")
        if isinstance(candidate, str) and candidate.strip():
            channel = candidate.strip()
    body: dict[str, Any] = {
        "source": "AI_CHATBOT",
        "channel": channel,
        "action": action,
    }
    # Forward browser GPS coordinates when the chat widget injected them into
    # the confirmation metadata.  This mirrors the manual check-in flow where
    # the Angular frontend sends lat/lon directly.
    if isinstance(context.metadata, dict):
        lat = context.metadata.get("latitude")
        lon = context.metadata.get("longitude")
        if lat is not None and lon is not None:
            try:
                body["latitude"] = float(lat)
                body["longitude"] = float(lon)
                body["accuracy"] = float(context.metadata.get("accuracy") or 0)
                body["source"] = "COPILOT_GPS"
            except (TypeError, ValueError):
                pass  # silently skip malformed coordinates
    return body


def _attendance_write_result(result: ToolResult, tool_name: str, summary: str) -> ToolResult:
    if not result.success:
        return result
    return ToolResult.ok(
        {
            "write_result": build_write_result(
                tool_name=tool_name,
                summary=summary,
                data=result.data,
                backend_status=result.status_code,
            )
        },
        warnings=result.warnings,
        status_code=result.status_code,
    )


def _strict_attendance_write_result(result: ToolResult) -> ToolResult:
    if not result.success:
        return result
    if result.status_code in ATTENDANCE_WRITE_SUCCESS_CODES:
        return result
    return ToolResult.fail(
        "backend_error",
        "Le backend n'a pas confirme le pointage.",
        status_code=result.status_code,
        data=result.data,
        warnings=result.warnings,
    )


def _presence_items_for_mode(data: dict[str, Any], *, mode: str) -> list[Any]:
    members = data.get("members")
    if isinstance(members, list):
        if mode == "late":
            return [item for item in members if _member_status(item) in {"LATE", "RETARD"}]
        if mode in {"missing", "absent"}:
            return [item for item in members if _member_status(item) in {"ABSENT", "MISSING", "NO_CHECK_IN"}]
        return members
    if mode == "late":
        count = _numeric(data, "lateCount", "lateToday")
        return [{"count": count}] if count is not None else []
    if mode in {"missing", "absent"}:
        count = _numeric(data, "absentCount", "absentToday", "missingCheckInCount")
        return [{"count": count}] if count is not None else []
    return [data] if data else []


def _presence_summary(data: dict[str, Any], *, mode: str) -> str:
    if mode == "late":
        count = _numeric(data, "lateCount", "lateToday") or 0
        return "Aucun retard detecte aujourd'hui." if count == 0 else f"{count} retard(s) detecte(s) aujourd'hui."
    if mode == "absent":
        count = _numeric(data, "absentCount", "absentToday") or 0
        return "Aucun absent detecte aujourd'hui." if count == 0 else f"{count} absent(s) detecte(s) aujourd'hui."
    if mode == "missing":
        count = _numeric(data, "missingCheckInCount", "absentCount", "absentToday") or 0
        return "Aucun pointage manquant detecte aujourd'hui." if count == 0 else f"{count} pointage(s) manquant(s) detecte(s) aujourd'hui."
    total = _numeric(data, "totalMembers", "totalTrackedUsers") or 0
    present = _numeric(data, "presentCount", "presentToday") or 0
    absent = _numeric(data, "absentCount", "absentToday") or 0
    late = _numeric(data, "lateCount", "lateToday") or 0
    return f"Presence du jour: {present} present(s), {absent} absent(s), {late} en retard sur {total} collaborateur(s)."


def _numeric(data: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
    return None


def _member_status(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    return str(item.get("status") or item.get("statut") or "").upper()
