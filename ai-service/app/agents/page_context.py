from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PageContext:
    route: str
    page_context: str
    intents: tuple[str, ...]


RH_PAGE_CONTEXTS: tuple[PageContext, ...] = (
    PageContext(
        "/app/rh/structure/departments",
        "RH_STRUCTURE_DEPARTMENTS",
        (
            "rh.structure.department.list",
            "rh.structure.department.create",
            "rh.structure.department.update",
            "rh.structure.department.delete",
        ),
    ),
    PageContext(
        "/app/rh/structure/departements",
        "RH_STRUCTURE_DEPARTMENTS",
        (
            "rh.structure.department.list",
            "rh.structure.department.create",
            "rh.structure.department.update",
            "rh.structure.department.delete",
        ),
    ),
    PageContext(
        "/app/rh/structure/equipes",
        "RH_STRUCTURE_TEAMS",
        (
            "rh.structure.team.list",
            "rh.structure.team.create",
            "rh.structure.team.assign_manager",
            "rh.structure.employee.assign_team",
        ),
    ),
    PageContext(
        "/app/rh/structure/employes",
        "RH_STRUCTURE_EMPLOYEES",
        (
            "rh.structure.employee.list",
            "rh.structure.employee.create",
            "rh.structure.employee.update",
            "rh.structure.employee.assign_team",
            "rh.structure.employee.activate",
            "rh.structure.employee.deactivate",
        ),
    ),
    PageContext(
        "/app/rh/structure/managers",
        "RH_STRUCTURE_MANAGERS",
        (
            "rh.structure.manager.list",
            "rh.structure.manager.create",
            "rh.structure.manager.assign_team",
            "rh.structure.manager.remove_team",
        ),
    ),
    PageContext(
        "/app/rh/conges",
        "RH_LEAVE",
        ("rh.leave.list", "rh.leave.pending", "rh.leave.approve", "rh.leave.reject", "rh.leave.rejected"),
    ),
    PageContext(
        "/app/rh/horaires",
        "RH_SCHEDULES",
        ("rh.schedule.list", "rh.schedule.create", "rh.schedule.assign", "rh.schedule.default"),
    ),
    PageContext(
        "/app/rh/pointage",
        "RH_ATTENDANCE",
        (
            "rh.attendance.status",
            "rh.attendance.today",
            "rh.attendance.missing",
            "rh.attendance.sync",
            "rh.attendance.manual_fix",
        ),
    ),
    PageContext(
        "/app/rh/presence",
        "RH_ATTENDANCE",
        ("rh.attendance.today", "rh.attendance.missing", "rh.attendance.absent", "rh.attendance.late"),
    ),
    PageContext(
        "/app/rh/autorisations",
        "RH_AUTHORIZATIONS",
        (
            "rh.authorization.list",
            "rh.authorization.approve",
            "rh.authorization.reject",
            "rh.authorization.urgent",
        ),
    ),
    PageContext(
        "/app/rh/teletravail",
        "RH_TELEWORK",
        ("rh.telework.list", "rh.telework.approve", "rh.telework.reject", "rh.telework.pending"),
    ),
    PageContext(
        "/app/rh/documents",
        "RH_DOCUMENTS",
        ("rh.document.list", "rh.document.generate", "rh.document.upload", "rh.document.urgent"),
    ),
    PageContext(
        "/app/rh/parametres",
        "RH_SETTINGS",
        (
            "rh.settings.leave_type.create",
            "rh.settings.leave_balance.update",
            "rh.settings.telework_config",
            "rh.settings.document_template",
        ),
    ),
    PageContext("/app/rh/profil", "RH_PROFILE", ("rh.profile.show", "rh.profile.update")),
    PageContext(
        "/app/messages",
        "MESSAGES",
        ("rh.message.list_channels", "rh.message.read", "rh.message.send"),
    ),
)


def normalize_current_page(value: object | None) -> str:
    page = str(value or "").strip().replace("\\", "/")
    if not page:
        return ""
    if not page.startswith("/"):
        page = "/" + page
    return page.rstrip("/") or "/"


def resolve_page_context(page: object | None) -> PageContext | None:
    normalized = normalize_current_page(page)
    if not normalized:
        return None
    for item in RH_PAGE_CONTEXTS:
        route = normalize_current_page(item.route)
        if normalized == route or normalized.startswith(route + "/"):
            return item
    return None


def intents_for_page(page: object | None) -> tuple[str, ...]:
    context = resolve_page_context(page)
    return context.intents if context else ()

