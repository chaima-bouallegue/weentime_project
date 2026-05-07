from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult, build_read_result


class LegacyActionInput(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class LegacyHrToolsAdapter:
    TOOL_SPECS = {
        "legacy.get_leave_balance": ("get_leave_balance", "read", {"EMPLOYEE", "MANAGER", "RH"}),
        "legacy.create_leave_request": ("create_leave", "write", {"EMPLOYEE"}),
        "legacy.request_document": ("request_document", "write", {"EMPLOYEE"}),
        "legacy.open_document": ("open_document", "read", {"EMPLOYEE", "RH"}),
        "legacy.create_telework": ("create_telework", "write", {"EMPLOYEE"}),
        "legacy.create_authorization": ("create_authorization", "write", {"EMPLOYEE"}),
        "legacy.get_my_requests": ("get_my_requests", "read", {"EMPLOYEE"}),
        "legacy.get_pending_validations": ("get_pending_validations", "read", {"MANAGER"}),
        "legacy.get_team_requests": ("get_team_requests", "read", {"MANAGER"}),
        "legacy.approve_request": ("approve_request", "write", {"MANAGER"}),
        "legacy.reject_request": ("reject_request", "write", {"MANAGER"}),
        "legacy.get_rh_stats": ("get_rh_stats", "read", {"RH"}),
        "legacy.get_all_requests": ("get_all_requests", "read", {"RH"}),
        "legacy.process_request": ("process_request", "write", {"RH"}),
    }

    def __init__(self, hr_tools: Any | None) -> None:
        self.hr_tools = hr_tools

    def register(self, registry: ToolRegistry) -> None:
        for tool_name, (action, kind, roles) in self.TOOL_SPECS.items():
            is_write = kind == "write"
            registry.register(
                ToolDefinition(
                    name=tool_name,
                    description=f"Legacy HRTools bridge for {action}.",
                    input_model=LegacyActionInput,
                    output_model=None,
                    type=kind,
                    allowed_roles=set(roles),
                    required_permissions=set(),
                    requires_confirmation=is_write,
                    idempotency_required=is_write,
                ),
                self._handler(tool_name, action, kind),
            )

    def _handler(self, tool_name: str, action: str, kind: str):
        async def run(payload: BaseModel, context: CurrentUserContext) -> ToolResult:
            if self.hr_tools is None:
                return self._read_failure(tool_name, 503, "legacy_tools_unavailable") if kind == "read" else ToolResult.fail(
                    "legacy_tools_unavailable",
                    "Legacy HR tools are unavailable.",
                    status_code=503,
                )
            result = await self.hr_tools.execute_action(
                action,
                getattr(payload, "payload", {}) or {},
                user_id=context.user_id,
                access_token=context.token,
                role=context.role,
            )
            if kind == "read":
                return self._normalize_read_result(tool_name, result)
            return ToolResult(
                success=bool(getattr(result, "success", False)),
                data=getattr(result, "data", None),
                warnings=[],
                error_code=getattr(result, "error", None),
                error_message=getattr(result, "text", None) or getattr(result, "error", None),
                status_code=getattr(result, "status_code", None),
            )

        return run

    def _normalize_read_result(self, tool_name: str, legacy_result: Any) -> ToolResult:
        status_code = getattr(legacy_result, "status_code", None)
        data = getattr(legacy_result, "data", None)
        success = bool(getattr(legacy_result, "success", False))
        if not success:
            code = self._error_code(status_code, getattr(legacy_result, "error", None))
            return self._read_failure(tool_name, status_code, code, data=data)

        items = self._extract_items(tool_name, data)
        count = len(items) if tool_name == "legacy.get_leave_balance" else self._extract_count(data, items)
        summary = self._summary_for(tool_name, data, items, count)
        read_result = build_read_result(
            tool_name=tool_name,
            summary=summary,
            items=items,
            count=count,
            data=data,
            backend_status=status_code,
            empty=count == 0 and not self._has_payload(data),
        )
        return ToolResult.ok(
            {"read_result": read_result},
            status_code=status_code,
        )

    def _read_failure(
        self,
        tool_name: str,
        status_code: int | None,
        code: str,
        *,
        data: Any = None,
    ) -> ToolResult:
        message = self._clean_error_message(status_code, code)
        read_result = build_read_result(
            tool_name=tool_name,
            summary=message,
            items=[],
            count=0,
            data=data,
            error={"code": code, "message": message},
            backend_status=status_code,
            empty=True,
        )
        return ToolResult.fail(
            code,
            message,
            status_code=status_code,
            data={"read_result": read_result},
        )

    def _summary_for(self, tool_name: str, data: Any, items: list[Any], count: int) -> str:
        if tool_name == "legacy.get_leave_balance":
            total = self._number_from(data, "total")
            if total is not None:
                return f"Il vous reste {self._format_number(total)} jours de conge."
            return "Aucun solde de conge disponible." if count == 0 else f"{count} solde(s) de conge disponible(s)."

        if tool_name == "legacy.get_my_requests":
            if count == 0:
                return "Aucune demande recente n'a ete trouvee."
            statuses = self._status_counts(items)
            suffix = self._status_suffix(statuses)
            return f"Vous avez {count} demande(s) recente(s){suffix}."

        if tool_name == "legacy.get_pending_validations":
            return "Vous n'avez aucune demande a valider." if count == 0 else f"Vous avez {count} demande(s) a valider."

        if tool_name == "legacy.get_team_requests":
            return "Aucune demande equipe n'a ete trouvee." if count == 0 else f"{count} demande(s) equipe retrouvee(s)."

        if tool_name == "legacy.get_rh_stats":
            if isinstance(data, dict):
                employees = data.get("employees") or data.get("employeeCount") or data.get("totalEmployees") or data.get("effectif")
                absents = data.get("absents") or data.get("absentCount")
                pending = data.get("pendingRequests") or data.get("pendingCount") or data.get("demandesEnAttente")
                parts = []
                if employees is not None:
                    parts.append(f"{employees} employe(s)")
                if absents is not None:
                    parts.append(f"{absents} absent(s)")
                if pending is not None:
                    parts.append(f"{pending} demande(s) en attente")
                if parts:
                    return "Statistiques RH: " + ", ".join(parts) + "."
            return "Les statistiques RH sont disponibles."

        if tool_name == "legacy.get_all_requests":
            return "Aucune demande RH n'a ete trouvee." if count == 0 else f"{count} demande(s) RH chargee(s)."

        if tool_name == "legacy.open_document":
            if isinstance(data, dict) and data.get("download_url"):
                return "Le document est pret a etre ouvert."
            return "Le document est disponible."

        return "Aucune donnee disponible." if count == 0 else f"{count} element(s) retrouve(s)."

    def _extract_items(self, tool_name: str, data: Any) -> list[Any]:
        if tool_name == "legacy.get_leave_balance" and isinstance(data, dict):
            balances = data.get("balances")
            return [item for item in balances if isinstance(item, dict)] if isinstance(balances, list) else []
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("items", "content", "requests", "pendingRequests", "recentRequests", "balances"):
                value = data.get(key)
                if isinstance(value, list):
                    return value
            nested = data.get("data")
            if nested is not data:
                return self._extract_items(tool_name, nested)
        return []

    @staticmethod
    def _extract_count(data: Any, items: list[Any]) -> int:
        if isinstance(data, dict):
            for key in ("count", "total", "totalElements", "totalCount"):
                value = data.get(key)
                if isinstance(value, int):
                    return value
                if isinstance(value, float) and value.is_integer():
                    return int(value)
        return len(items)

    @staticmethod
    def _has_payload(data: Any) -> bool:
        if data in (None, [], {}):
            return False
        return True

    @staticmethod
    def _status_counts(items: list[Any]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            status = str(item.get("statut") or item.get("status") or "INCONNU").upper()
            counts[status] = counts.get(status, 0) + 1
        return counts

    @staticmethod
    def _status_suffix(counts: dict[str, int]) -> str:
        if not counts:
            return ""
        parts = []
        for status, count in sorted(counts.items()):
            label = status.replace("_", " ").lower()
            parts.append(f"{count} {label}")
        return ": " + ", ".join(parts)

    @staticmethod
    def _number_from(data: Any, key: str) -> float | None:
        if not isinstance(data, dict):
            return None
        value = data.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _format_number(value: float) -> str:
        return str(int(value)) if value.is_integer() else f"{value:.1f}"

    @staticmethod
    def _error_code(status_code: int | None, error: Any) -> str:
        if status_code in (401, 403):
            return "permission_denied"
        if status_code == 404:
            return "data_unavailable"
        if status_code == 503:
            return "backend_unavailable"
        text = str(error or "").lower()
        if "connection" in text or "unreachable" in text or "timeout" in text or "attempt" in text:
            return "backend_unavailable"
        return "read_tool_failed"

    @staticmethod
    def _clean_error_message(status_code: int | None, code: str) -> str:
        if code == "permission_denied" or status_code in (401, 403):
            return "Vous n'avez pas les droits necessaires pour consulter ces donnees."
        if code == "data_unavailable" or status_code == 404:
            return "Les donnees demandees ne sont pas disponibles."
        if code == "backend_unavailable" or status_code == 503:
            return "Le service RH est momentanement indisponible. Reessayez dans quelques instants."
        return "Impossible de recuperer ces donnees pour le moment."


def register_legacy_hr_tools(registry: ToolRegistry, hr_tools: Any | None) -> LegacyHrToolsAdapter:
    adapter = LegacyHrToolsAdapter(hr_tools)
    adapter.register(registry)
    return adapter
