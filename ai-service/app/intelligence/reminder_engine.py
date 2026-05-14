from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .priority_engine import PriorityItem


@dataclass(frozen=True, slots=True)
class ReminderItem:
    id: str
    type: str
    severity: str
    title: str
    summary: str
    evidence: dict[str, Any]
    source_tools: list[str]
    recommended_actions: list[str] = field(default_factory=list)
    requires_confirmation: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "summary": self.summary,
            "evidence": self.evidence,
            "sourceTools": self.source_tools,
            "recommendedActions": self.recommended_actions,
            "requiresConfirmation": self.requires_confirmation,
        }


class ReminderEngine:
    """Deterministic employee reminders derived only from read-tool evidence."""

    low_leave_threshold_days = 2.0

    def build_employee_reminders(self, sections: list[dict[str, Any]]) -> list[ReminderItem]:
        reminders: list[ReminderItem] = []
        section_by_tool = {str(section.get("toolName") or ""): section for section in sections}

        pointage = section_by_tool.get("get_pointage_status")
        if pointage:
            reminder = self._missing_checkout_reminder(pointage)
            if reminder is not None:
                reminders.append(reminder)

        leave_balance = section_by_tool.get("leave.get_balance")
        if leave_balance:
            reminders.extend(self._leave_balance_reminders(leave_balance))

        for tool_name, label in (
            ("leave.list_my_requests", "conge"),
            ("telework.list_my_requests", "teletravail"),
            ("authorization.list_my_requests", "autorisation"),
            ("document.list_my_requests", "document"),
        ):
            section = section_by_tool.get(tool_name)
            if section:
                reminder = self._pending_request_reminder(section, label=label)
                if reminder is not None:
                    reminders.append(reminder)

        communication = section_by_tool.get("communication.list_channels")
        if communication:
            reminder = self._communication_reminder(communication)
            if reminder is not None:
                reminders.append(reminder)

        return _dedupe_reminders(reminders)

    def reminders_to_priorities(self, reminders: list[ReminderItem]) -> list[PriorityItem]:
        priorities: list[PriorityItem] = []
        for item in reminders:
            priorities.append(
                PriorityItem(
                    id=item.id,
                    type=item.type,
                    severity=item.severity,
                    title=item.title,
                    summary=item.summary,
                    evidence=item.evidence,
                    source_tools=item.source_tools,
                    recommended_actions=item.recommended_actions,
                    requires_confirmation=False,
                )
            )
        return priorities

    def _missing_checkout_reminder(self, section: dict[str, Any]) -> ReminderItem | None:
        if str(section.get("status") or "").lower() != "ok":
            return None
        data = _section_data(section)
        candidates = [data, *(_dict_items(section))]
        for item in candidates:
            check_in = _first_present(item, ("checkIn", "check_in", "heureEntree", "entree", "arrivalTime", "startTime"))
            check_out = _first_present(item, ("checkOut", "check_out", "heureSortie", "sortie", "departureTime", "endTime"))
            status = str(_first_present(item, ("status", "statut", "etat")) or "").upper()
            if check_in and not check_out and (not status or any(marker in status for marker in ("CHECKED_IN", "PRESENT", "EN_COURS", "ACTIVE"))):
                return ReminderItem(
                    id="employee-missing-checkout",
                    type="missing_checkout",
                    severity="warning",
                    title="Sortie de pointage a verifier",
                    summary="Vous avez une entree de pointage sans sortie visible. Verifiez votre sortie si votre journee est terminee.",
                    evidence={"checkIn": check_in, "status": status or None, "generatedAt": datetime.now(timezone.utc).isoformat()},
                    source_tools=["get_pointage_status"],
                    recommended_actions=["Ouvrir le pointage et confirmer la sortie uniquement si necessaire."],
                )
        return None

    def _leave_balance_reminders(self, section: dict[str, Any]) -> list[ReminderItem]:
        if str(section.get("status") or "").lower() != "ok":
            return []
        reminders: list[ReminderItem] = []
        balances = _as_list(_section_data(section).get("balances")) or _dict_items(section)
        for index, balance in enumerate(balances):
            remaining = _first_number(balance, ("joursRestants", "remainingDays", "solde", "balance", "daysRemaining"))
            if remaining is None or remaining > self.low_leave_threshold_days:
                continue
            label = str(_first_present(balance, ("typeConge", "type", "libelle", "label", "name")) or "conge").strip()
            severity = "critical" if remaining <= 0 else "warning"
            reminders.append(
                ReminderItem(
                    id=f"employee-low-leave-balance-{index}",
                    type="low_leave_balance",
                    severity=severity,
                    title="Solde de conge bas",
                    summary=f"Votre solde {label} est bas ({_format_number(remaining)} jour(s) restant(s)).",
                    evidence={"remainingDays": remaining, "leaveType": label},
                    source_tools=["leave.get_balance"],
                    recommended_actions=["Verifier le solde avant de preparer une nouvelle demande."],
                )
            )
        return reminders

    def _pending_request_reminder(self, section: dict[str, Any], *, label: str) -> ReminderItem | None:
        if str(section.get("status") or "").lower() != "ok":
            return None
        pending_items = [item for item in _dict_items(section) if _is_pending(item)]
        if not pending_items:
            return None
        tool_name = str(section.get("toolName") or "")
        return ReminderItem(
            id=f"employee-pending-{label}",
            type=f"pending_{label}_requests",
            severity="info",
            title=f"Demande(s) de {label} en attente",
            summary=f"Vous avez {len(pending_items)} demande(s) de {label} a suivre.",
            evidence={"pendingCount": len(pending_items), "totalCount": _section_count(section), "sampleIds": _sample_ids(pending_items)},
            source_tools=[tool_name] if tool_name else [],
            recommended_actions=["Consulter le detail dans le module correspondant."],
        )

    def _communication_reminder(self, section: dict[str, Any]) -> ReminderItem | None:
        if str(section.get("status") or "").lower() != "ok":
            return None
        unread_total = 0
        mention_total = 0
        for channel in _dict_items(section):
            unread = _first_number(channel, ("unreadCount", "unread", "nonLus"))
            mentions = _first_number(channel, ("mentionCount", "mentionsCount", "mentions"))
            if unread is not None:
                unread_total += int(unread)
            if mentions is not None:
                mention_total += int(mentions)
        if unread_total <= 0 and mention_total <= 0:
            return None
        summary_parts = []
        if unread_total > 0:
            summary_parts.append(f"{unread_total} message(s) non lu(s)")
        if mention_total > 0:
            summary_parts.append(f"{mention_total} mention(s)")
        return ReminderItem(
            id="employee-communication-unread",
            type="communication_unread",
            severity="info",
            title="Communication a consulter",
            summary="Vous avez " + " et ".join(summary_parts) + " dans les canaux visibles.",
            evidence={"unreadCount": unread_total, "mentionCount": mention_total},
            source_tools=["communication.list_channels"],
            recommended_actions=["Lire les canaux visibles avant de repondre."],
        )


def _section_data(section: dict[str, Any]) -> dict[str, Any]:
    data = section.get("data")
    return data if isinstance(data, dict) else {}


def _dict_items(section: dict[str, Any]) -> list[dict[str, Any]]:
    items = section.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _first_present(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, "", []):
            return value
    return None


def _first_number(item: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    value = _first_present(item, keys)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", ".").strip())
        except ValueError:
            return None
    return None


def _is_pending(item: dict[str, Any]) -> bool:
    status = str(_first_present(item, ("status", "statut", "etat", "state")) or "").upper()
    return any(marker in status for marker in ("PENDING", "EN_ATTENTE", "EN_COURS", "IN_PROGRESS"))


def _section_count(section: dict[str, Any]) -> int:
    count = section.get("count")
    if isinstance(count, int):
        return max(0, count)
    return len(_dict_items(section))


def _sample_ids(items: list[dict[str, Any]]) -> list[Any]:
    values: list[Any] = []
    for item in items[:5]:
        value = _first_present(item, ("id", "requestId", "demandeId"))
        if value is not None:
            values.append(value)
    return values


def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}".rstrip("0").rstrip(".")


def _dedupe_reminders(values: list[ReminderItem]) -> list[ReminderItem]:
    seen: set[str] = set()
    output: list[ReminderItem] = []
    for item in values:
        if item.id in seen:
            continue
        seen.add(item.id)
        output.append(item)
    return output
