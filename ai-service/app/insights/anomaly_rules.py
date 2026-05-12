from __future__ import annotations

from typing import Any

from .insight_models import Insight

LOW_LEAVE_BALANCE_THRESHOLD = 3.0
PENDING_WORKLOAD_THRESHOLD = 5
DOCUMENT_BACKLOG_THRESHOLD = 5
LATE_PATTERN_THRESHOLD = 2
ABSENCE_SPIKE_RATIO = 0.25


def missing_checkout(today: Any, *, current_hour: int | None = None) -> Insight | None:
    data = _as_dict(today)
    if not data:
        return None
    has_in = _truthy_any(data, ("checkedIn", "isCheckedIn", "hasCheckIn", "checkIn", "checkInTime", "heureEntree", "entree", "arrivalTime"))
    has_out = _truthy_any(data, ("checkedOut", "isCheckedOut", "hasCheckOut", "checkOut", "checkOutTime", "heureSortie", "sortie", "departureTime"))
    status = str(data.get("status") or data.get("statut") or "").upper()
    hour = 18 if current_hour is None else current_hour
    if has_in and not has_out and hour >= 17 and status not in {"CLOSED", "CHECKED_OUT", "TERMINE"}:
        return Insight(
            id="missing_checkout",
            type="missing_checkout",
            severity="warning",
            title="Sortie non pointee",
            summary="Une entree est detectee aujourd'hui mais aucune sortie n'est enregistree.",
            evidence={"status": status or None, "hasCheckIn": has_in, "hasCheckOut": has_out},
            confidence=0.86,
            source_tools=["get_pointage_status"],
            recommended_actions=["Verifier le pointage de sortie avant la fin de journee."],
        )
    return None


def late_arrival_pattern(history: Any) -> Insight | None:
    rows = _as_list(history)
    late_rows = []
    for row in rows:
        data = _as_dict(row)
        if not data:
            continue
        late_minutes = _number(data, ("lateMinutes", "minutesRetard", "retardMinutes")) or 0
        status = str(data.get("status") or data.get("statut") or "").lower()
        if late_minutes > 0 or bool(data.get("late") or data.get("isLate") or data.get("retard")) or "retard" in status or "late" in status:
            late_rows.append(data)
    if len(late_rows) >= LATE_PATTERN_THRESHOLD:
        return Insight(
            id="late_arrival_pattern",
            type="late_arrival_pattern",
            severity="warning",
            title="Retards repetes",
            summary=f"{len(late_rows)} arrivee(s) tardive(s) detectee(s) dans l'historique disponible.",
            evidence={"lateCount": len(late_rows), "sampleSize": len(rows)},
            confidence=0.74,
            source_tools=["get_presence_history"],
            recommended_actions=["Verifier les horaires et demander une regularisation si necessaire."],
        )
    return None


def absence_spike(team_presence: Any) -> Insight | None:
    data = _as_dict(team_presence)
    rows = _as_list(team_presence)
    absent = int(_number(data, ("absentCount", "absents", "totalAbsents")) or 0)
    total = int(_number(data, ("total", "totalEmployees", "employeeCount", "effectif")) or 0)
    if rows and (absent == 0 or total == 0):
        total = total or len(rows)
        absent = absent or sum(1 for row in rows if _is_absent(_as_dict(row)))
    ratio = (absent / total) if total else 0.0
    if absent >= 2 and ratio >= ABSENCE_SPIKE_RATIO:
        return Insight(
            id="absence_spike",
            type="absence_spike",
            severity="warning" if ratio < 0.5 else "critical",
            title="Niveau d'absence eleve",
            summary=f"{absent} absence(s) sur {total} personne(s) dans les donnees disponibles.",
            evidence={"absentCount": absent, "total": total, "ratio": round(ratio, 3)},
            confidence=0.72,
            source_tools=["get_team_presence"],
            recommended_actions=["Verifier les absences avec les demandes en cours."],
        )
    return None


def pending_workload(source: Any, *, source_tool: str = "legacy.get_pending_validations", threshold: int = PENDING_WORKLOAD_THRESHOLD) -> Insight | None:
    count = _count(source)
    if count > threshold:
        return Insight(
            id=f"pending_workload_{source_tool.replace('.', '_')}",
            type="pending_workload",
            severity="warning" if count <= threshold * 2 else "critical",
            title="Charge de validations en attente",
            summary=f"{count} element(s) sont en attente de traitement.",
            evidence={"pendingCount": count, "threshold": threshold},
            confidence=0.78,
            source_tools=[source_tool],
            recommended_actions=["Prioriser le traitement des demandes en attente."],
        )
    return None


def low_leave_balance(balance: Any, *, threshold: float = LOW_LEAVE_BALANCE_THRESHOLD) -> Insight | None:
    data = _as_dict(balance)
    rows = _as_list(balance)
    total = _number(data, ("total", "joursRestants", "remainingDays", "solde"))
    if total is None and rows:
        total = sum(_number(_as_dict(row), ("joursRestants", "remainingDays", "solde")) or 0 for row in rows)
    if total is not None and total < threshold:
        return Insight(
            id="low_leave_balance",
            type="low_leave_balance",
            severity="info" if total > 0 else "warning",
            title="Solde de conge bas",
            summary=f"Solde de conge disponible: {total:g} jour(s).",
            evidence={"remainingDays": total, "threshold": threshold},
            confidence=0.82,
            source_tools=["leave.get_balance"],
            recommended_actions=["Planifier les demandes de conge avec prudence."],
        )
    return None


def document_backlog(documents: Any, *, threshold: int = DOCUMENT_BACKLOG_THRESHOLD) -> Insight | None:
    rows = _as_list(documents)
    pending = 0
    for row in rows:
        status = str(_as_dict(row).get("status") or _as_dict(row).get("statut") or "").upper()
        if any(term in status for term in ("PENDING", "EN_ATTENTE", "EN_COURS", "IN_PROGRESS")):
            pending += 1
    if pending > threshold:
        return Insight(
            id="document_backlog",
            type="document_backlog",
            severity="warning",
            title="Backlog documents",
            summary=f"{pending} demande(s) de document semblent en attente ou en cours.",
            evidence={"pendingDocuments": pending, "threshold": threshold},
            confidence=0.7,
            source_tools=["document.list_my_requests"],
            recommended_actions=["Verifier les documents en attente de traitement."],
        )
    return None


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        read_result = value.get("read_result") if isinstance(value.get("read_result"), dict) else None
        if read_result:
            nested = read_result.get("data")
            return nested if isinstance(nested, dict) else read_result
        if value.get("kind") == "read_result":
            nested = value.get("data")
            return nested if isinstance(nested, dict) else value
        return value
    return {}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        read_result = value.get("read_result") if isinstance(value.get("read_result"), dict) else None
        if read_result:
            items = read_result.get("items")
            return items if isinstance(items, list) else []
        if value.get("kind") == "read_result":
            items = value.get("items")
            return items if isinstance(items, list) else []
        for key in ("items", "content", "data", "requests", "users", "sessions", "balances"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
            if isinstance(nested, dict):
                rows = _as_list(nested)
                if rows:
                    return rows
    return []


def _truthy_any(data: dict[str, Any], keys: tuple[str, ...]) -> bool:
    for key in keys:
        value = data.get(key)
        if value not in (None, "", False, [], {}):
            return True
    return False


def _number(data: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        try:
            if value not in (None, ""):
                return float(str(value))
        except (TypeError, ValueError):
            continue
    return None


def _count(value: Any) -> int:
    data = _as_dict(value)
    for key in ("count", "total", "totalElements", "pendingCount", "pendingRequests", "demandesEnAttente"):
        raw = data.get(key)
        if isinstance(raw, int):
            return raw
        if isinstance(raw, float) and raw.is_integer():
            return int(raw)
    rows = _as_list(value)
    return len(rows)


def _is_absent(row: dict[str, Any]) -> bool:
    status = str(row.get("status") or row.get("statut") or "").lower()
    return bool(row.get("absent") or row.get("isAbsent") or "absent" in status)
