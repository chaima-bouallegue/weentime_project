from __future__ import annotations

from datetime import date
from typing import Any

from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult, get_read_result


class LeaveRiskAnalyzer:
    """Read-only leave risk checks based only on backend/tool data."""

    def __init__(self, executor: ToolExecutor) -> None:
        self.executor = executor

    async def analyze(self, tool_input: dict[str, Any], context: CurrentUserContext) -> dict[str, Any]:
        risks: list[dict[str, Any]] = []
        warnings: list[str] = []
        evidence: list[dict[str, Any]] = []

        balance_result = await self.executor.execute("leave.get_balance", {}, context)
        balance_read = get_read_result(balance_result.data)
        if balance_result.success and balance_read:
            evidence.append({"tool": "leave.get_balance", "summary": balance_read.get("summary")})
            balance_risk = self._balance_risk(tool_input, balance_read)
            if balance_risk:
                risks.append(balance_risk)
        else:
            warnings.append(self._warning_for_unavailable(balance_result, "solde de conge"))

        requests_result = await self.executor.execute("leave.list_my_requests", {}, context)
        requests_read = get_read_result(requests_result.data)
        if requests_result.success and requests_read:
            evidence.append({"tool": "leave.list_my_requests", "summary": requests_read.get("summary")})
            overlap_risk = self._overlap_risk(tool_input, requests_read)
            if overlap_risk:
                risks.append(overlap_risk)
        else:
            warnings.append(self._warning_for_unavailable(requests_result, "demandes existantes"))

        return {
            "kind": "leave_risk_analysis",
            "risks": risks,
            "warnings": [warning for warning in warnings if warning],
            "evidence": evidence,
            "canAssess": bool(evidence),
        }

    @staticmethod
    def build_confirmation_text(base_text: str, analysis: dict[str, Any] | None) -> str:
        if not analysis:
            return base_text
        risks = analysis.get("risks") if isinstance(analysis, dict) else None
        warnings = analysis.get("warnings") if isinstance(analysis, dict) else None
        details: list[str] = []
        if isinstance(risks, list) and risks:
            details.extend(str(item.get("summary") or "") for item in risks if isinstance(item, dict))
        elif isinstance(warnings, list) and warnings:
            details.append("Je ne peux pas evaluer le risque complet car certaines donnees RH ne sont pas disponibles.")
        clean_details = [item for item in details if item]
        return f"{' '.join(clean_details)} {base_text}".strip() if clean_details else base_text

    @staticmethod
    def _balance_risk(tool_input: dict[str, Any], read_result: dict[str, Any]) -> dict[str, Any] | None:
        data = read_result.get("data") if isinstance(read_result, dict) else {}
        balances = []
        if isinstance(data, dict) and isinstance(data.get("balances"), list):
            balances = data["balances"]
        elif isinstance(read_result.get("items"), list):
            balances = read_result["items"]
        leave_type = _normalize_label(tool_input.get("leave_type_label"))
        selected_balance: float | None = None
        total_balance = _to_float(data.get("total") if isinstance(data, dict) else None)
        for item in balances:
            if not isinstance(item, dict):
                continue
            label = _normalize_label(item.get("libelle") or item.get("type") or item.get("nom") or item.get("name"))
            value = _first_number(item, ("joursRestants", "solde", "remaining", "balance"))
            if leave_type and label and (leave_type in label or label in leave_type):
                selected_balance = value
                break
        if selected_balance is not None and selected_balance <= 0:
            return {
                "type": "leave_balance_empty",
                "severity": "warning",
                "summary": "Votre solde pour ce type de conge semble epuise.",
                "evidence": {"leaveType": tool_input.get("leave_type_label"), "remaining": selected_balance},
            }
        if selected_balance is None and total_balance is not None and total_balance <= 0:
            return {
                "type": "leave_balance_empty",
                "severity": "warning",
                "summary": "Votre solde de conge disponible semble epuise.",
                "evidence": {"remaining": total_balance},
            }
        return None

    @staticmethod
    def _overlap_risk(tool_input: dict[str, Any], read_result: dict[str, Any]) -> dict[str, Any] | None:
        start = _parse_date(tool_input.get("start_date"))
        end = _parse_date(tool_input.get("end_date") or tool_input.get("start_date"))
        if not start or not end:
            return None
        for item in read_result.get("items") if isinstance(read_result.get("items"), list) else []:
            if not isinstance(item, dict):
                continue
            existing_start = _parse_date(_first_value(item, ("dateDebut", "startDate", "start_date", "date_debut")))
            existing_end = _parse_date(_first_value(item, ("dateFin", "endDate", "end_date", "date_fin")) or existing_start)
            if not existing_start or not existing_end:
                continue
            if start <= existing_end and end >= existing_start:
                status = str(_first_value(item, ("statut", "status")) or "").lower()
                return {
                    "type": "leave_overlap",
                    "severity": "warning",
                    "summary": "Vous avez deja une demande sur cette periode.",
                    "evidence": {"status": status, "request": item},
                }
        return None

    @staticmethod
    def _warning_for_unavailable(result: ToolResult, label: str) -> str:
        if result.status_code in (401, 403):
            return f"Les {label} ne sont pas accessibles avec votre role actuel."
        return f"Les {label} ne sont pas disponibles pour l'analyse."


def _first_value(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def _first_number(item: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = _to_float(item.get(key))
        if value is not None:
            return value
    return None


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _normalize_label(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ").replace("-", " ")
