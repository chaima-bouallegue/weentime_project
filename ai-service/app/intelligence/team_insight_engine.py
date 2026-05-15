from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .priority_engine import PriorityItem


@dataclass(frozen=True, slots=True)
class TeamInsightItem:
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


class TeamInsightEngine:
    """Deterministic manager insights derived from manager-visible read sections."""

    overloaded_queue_threshold = 5
    stale_days_threshold = 2

    def build_manager_insights(self, sections: list[dict[str, Any]]) -> list[TeamInsightItem]:
        insights: list[TeamInsightItem] = []
        section_by_tool = {str(section.get("toolName") or ""): section for section in sections}

        presence = section_by_tool.get("get_team_presence")
        if presence:
            insights.extend(self._attendance_insights(presence))

        for tool_name, label in (
            ("leave.list_manager_requests", "conge"),
            ("telework.list_manager_requests", "teletravail"),
            ("authorization.list_manager_requests", "autorisation"),
        ):
            section = section_by_tool.get(tool_name)
            if section:
                insights.extend(self._approval_workload_insights(section, label=label))

        communication = section_by_tool.get("communication.list_channels")
        if communication:
            insight = self._communication_insight(communication)
            if insight is not None:
                insights.append(insight)

        return _dedupe_insights(insights)

    def insights_to_priorities(self, insights: list[TeamInsightItem]) -> list[PriorityItem]:
        return [
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
            for item in insights
        ]

    def _approval_workload_insights(self, section: dict[str, Any], *, label: str) -> list[TeamInsightItem]:
        if str(section.get("status") or "").lower() != "ok":
            return []
        pending_items = [item for item in _dict_items(section) if _is_pending(item)]
        if not pending_items:
            return []
        stale_items = [item for item in pending_items if _age_days(item) is not None and _age_days(item) >= self.stale_days_threshold]
        severity = "warning" if len(pending_items) < self.overloaded_queue_threshold else "critical"
        insights = [
            TeamInsightItem(
                id=f"manager-pending-{label}",
                type="approval_workload",
                severity=severity,
                title=f"Demandes de {label} a prioriser",
                summary=f"{len(pending_items)} demande(s) de {label} attendent une decision manager.",
                evidence={"pendingCount": len(pending_items), "totalCount": _section_count(section), "sampleIds": _sample_ids(pending_items)},
                source_tools=[str(section.get("toolName") or "")],
                recommended_actions=["Examiner les demandes une par une avant approbation ou refus."],
            )
        ]
        if stale_items:
            insights.append(
                TeamInsightItem(
                    id=f"manager-stale-{label}",
                    type="stale_approval",
                    severity="warning",
                    title=f"Demandes de {label} anciennes",
                    summary=f"{len(stale_items)} demande(s) de {label} semblent attendre depuis au moins {self.stale_days_threshold} jour(s).",
                    evidence={"staleCount": len(stale_items), "sampleIds": _sample_ids(stale_items)},
                    source_tools=[str(section.get("toolName") or "")],
                    recommended_actions=["Traiter les demandes anciennes en premier."],
                )
            )
        return insights

    def _attendance_insights(self, section: dict[str, Any]) -> list[TeamInsightItem]:
        if str(section.get("status") or "").lower() != "ok":
            return []
        items = _dict_items(section)
        missing_checkout = [item for item in items if _has_checkin_without_checkout(item)]
        absent = [item for item in items if _status_contains(item, ("ABSENT", "ABSENCE"))]
        late = [item for item in items if _status_contains(item, ("LATE", "RETARD")) or _truthy_any(item, ("late", "isLate", "retard"))]
        insights: list[TeamInsightItem] = []
        if missing_checkout:
            insights.append(
                TeamInsightItem(
                    id="manager-missing-checkout",
                    type="team_missing_checkout",
                    severity="warning",
                    title="Sorties de pointage a verifier",
                    summary=f"{len(missing_checkout)} membre(s) d'equipe ont une entree sans sortie visible.",
                    evidence={"count": len(missing_checkout), "sampleEmployees": _sample_employees(missing_checkout)},
                    source_tools=["get_team_presence"],
                    recommended_actions=["Verifier avec les personnes concernees avant toute action."],
                )
            )
        if absent:
            insights.append(
                TeamInsightItem(
                    id="manager-team-absent",
                    type="team_absence",
                    severity="info",
                    title="Absences visibles aujourd'hui",
                    summary=f"{len(absent)} membre(s) d'equipe apparaissent absent(s) dans les donnees visibles.",
                    evidence={"count": len(absent), "sampleEmployees": _sample_employees(absent)},
                    source_tools=["get_team_presence"],
                    recommended_actions=["Consulter le planning avant de replanifier le travail."],
                )
            )
        if late:
            insights.append(
                TeamInsightItem(
                    id="manager-team-late",
                    type="team_late_arrival",
                    severity="info",
                    title="Retards visibles",
                    summary=f"{len(late)} retard(s) visible(s) dans l'equipe.",
                    evidence={"count": len(late), "sampleEmployees": _sample_employees(late)},
                    source_tools=["get_team_presence"],
                    recommended_actions=["Verifier les details dans la presence equipe."],
                )
            )
        return insights

    def _communication_insight(self, section: dict[str, Any]) -> TeamInsightItem | None:
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
        parts = []
        if unread_total:
            parts.append(f"{unread_total} message(s) non lu(s)")
        if mention_total:
            parts.append(f"{mention_total} mention(s)")
        return TeamInsightItem(
            id="manager-communication-unread",
            type="manager_communication_activity",
            severity="info",
            title="Communication manager a consulter",
            summary="Vous avez " + " et ".join(parts) + " dans les canaux visibles.",
            evidence={"unreadCount": unread_total, "mentionCount": mention_total},
            source_tools=["communication.list_channels"],
            recommended_actions=["Lire les canaux visibles avant de repondre."],
        )


def _dict_items(section: dict[str, Any]) -> list[dict[str, Any]]:
    items = section.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _section_count(section: dict[str, Any]) -> int:
    count = section.get("count")
    if isinstance(count, int):
        return max(0, count)
    return len(_dict_items(section))


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


def _status_contains(item: dict[str, Any], markers: tuple[str, ...]) -> bool:
    status = str(_first_present(item, ("status", "statut", "etat", "state", "presenceStatus")) or "").upper()
    return any(marker in status for marker in markers)


def _truthy_any(item: dict[str, Any], keys: tuple[str, ...]) -> bool:
    return any(bool(item.get(key)) for key in keys)


def _has_checkin_without_checkout(item: dict[str, Any]) -> bool:
    check_in = _first_present(item, ("checkIn", "check_in", "heureEntree", "entree", "arrivalTime", "startTime"))
    check_out = _first_present(item, ("checkOut", "check_out", "heureSortie", "sortie", "departureTime", "endTime"))
    return bool(check_in and not check_out)


def _age_days(item: dict[str, Any]) -> int | None:
    explicit = _first_number(item, ("ageDays", "daysPending", "pendingDays"))
    if explicit is not None:
        return int(explicit)
    raw_date = _first_present(item, ("createdAt", "dateCreation", "submittedAt", "dateDemande"))
    if not raw_date:
        return None
    try:
        value = str(raw_date).replace("Z", "+00:00")
        created = datetime.fromisoformat(value)
    except ValueError:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - created).days)


def _sample_ids(items: list[dict[str, Any]]) -> list[Any]:
    values: list[Any] = []
    for item in items[:5]:
        value = _first_present(item, ("id", "requestId", "demandeId"))
        if value is not None:
            values.append(value)
    return values


def _sample_employees(items: list[dict[str, Any]]) -> list[Any]:
    values: list[Any] = []
    for item in items[:5]:
        value = _first_present(item, ("employee", "employe", "fullName", "displayName", "name", "nom"))
        if value is not None:
            values.append(value)
    return values


def _dedupe_insights(values: list[TeamInsightItem]) -> list[TeamInsightItem]:
    seen: set[str] = set()
    output: list[TeamInsightItem] = []
    for item in values:
        if item.id in seen:
            continue
        seen.add(item.id)
        output.append(item)
    return output
