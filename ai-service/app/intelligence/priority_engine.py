from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class PriorityItem:
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


class PriorityEngine:
    """Deterministic prioritization over already-authoritative read sections."""

    def prioritize(self, *, role: str, sections: list[dict[str, Any]]) -> list[PriorityItem]:
        normalized_role = (role or "EMPLOYEE").upper().replace("ROLE_", "")
        priorities: list[PriorityItem] = []
        for index, section in enumerate(sections):
            status = str(section.get("status") or "").lower()
            title = str(section.get("title") or "Section")
            tool_name = str(section.get("toolName") or "")
            count = _section_count(section)
            if status in {"warning", "unavailable"}:
                priorities.append(
                    PriorityItem(
                        id=f"{normalized_role.lower()}-unavailable-{index}",
                        type="data_unavailable",
                        severity="warning",
                        title=f"Donnee indisponible: {title}",
                        summary=str(section.get("summary") or "Cette donnee est indisponible."),
                        evidence={"status": status, "toolName": tool_name},
                        source_tools=[tool_name] if tool_name else [],
                        recommended_actions=["Reessayer plus tard ou consulter l'ecran metier correspondant."],
                    )
                )
                continue
            priority = self._priority_for_count(role=normalized_role, section=section, count=count, index=index)
            if priority is not None:
                priorities.append(priority)
        return priorities

    def _priority_for_count(self, *, role: str, section: dict[str, Any], count: int, index: int) -> PriorityItem | None:
        if count <= 0:
            return None
        title = str(section.get("title") or "Section")
        tool_name = str(section.get("toolName") or "")
        evidence = {"count": count, "toolName": tool_name, "title": title}
        if role == "EMPLOYEE" and _tool_matches(tool_name, ("leave.list", "document.list", "telework.list", "authorization.list", "communication.")):
            return PriorityItem(
                id=f"employee-personal-{index}",
                type="personal_pending_or_unread",
                severity="info",
                title=f"A verifier: {title}",
                summary=str(section.get("summary") or f"{count} element(s) a consulter."),
                evidence=evidence,
                source_tools=[tool_name],
                recommended_actions=["Consulter le detail avant toute action."],
            )
        if role == "MANAGER" and _tool_matches(tool_name, ("pending", "team", "presence")):
            return PriorityItem(
                id=f"manager-work-{index}",
                type="manager_pending_work",
                severity="warning",
                title=f"Priorite manager: {title}",
                summary=str(section.get("summary") or f"{count} element(s) manager a traiter."),
                evidence=evidence,
                source_tools=[tool_name],
                recommended_actions=["Ouvrir la liste et examiner les demandes une par une."],
            )
        if role == "RH" and _tool_matches(tool_name, ("rh", "all_requests", "document")):
            return PriorityItem(
                id=f"rh-backlog-{index}",
                type="rh_backlog",
                severity="warning",
                title=f"Priorite RH: {title}",
                summary=str(section.get("summary") or f"{count} element(s) RH a traiter."),
                evidence=evidence,
                source_tools=[tool_name],
                recommended_actions=["Prioriser les dossiers anciens ou bloquants."],
            )
        if role == "ADMIN" and _tool_matches(tool_name, ("misconfigured", "system_health", "list_users", "list_enterprises")):
            return PriorityItem(
                id=f"admin-config-{index}",
                type="admin_configuration_attention",
                severity="warning" if "misconfigured" in tool_name else "info",
                title=f"Diagnostic admin: {title}",
                summary=str(section.get("summary") or f"{count} element(s) admin a verifier."),
                evidence=evidence,
                source_tools=[tool_name],
                recommended_actions=["Verifier la configuration dans le module admin."],
            )
        return None


def _section_count(section: dict[str, Any]) -> int:
    value = section.get("count")
    if isinstance(value, int):
        return max(0, value)
    items = section.get("items")
    if isinstance(items, list):
        return len(items)
    return 0


def _tool_matches(tool_name: str, markers: tuple[str, ...]) -> bool:
    lowered = (tool_name or "").lower()
    return any(marker in lowered for marker in markers)
