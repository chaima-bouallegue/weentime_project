from __future__ import annotations

from dataclasses import dataclass, field


SUPPORTED_BY_ROLE: dict[str, set[str]] = {
    "EMPLOYEE": {
        "attendance.self",
        "leave.create",
        "leave.list",
        "document.create",
        "document.list",
        "telework.create",
        "telework.list",
        "authorization.create",
        "authorization.list",
    },
    "MANAGER": {
        "attendance.self",
        "request.manager_approve",
        "request.manager_reject",
        "presence.team",
        "request.team_list",
    },
    "RH": {
        "attendance.self",
        "request.final_validate",
        "request.reject",
        "document.generate",
        "document.reject",
        "rh.analytics",
        "request.all_list",
    },
    "ADMIN": {
        "attendance.self",
        "user.list",
        "user.create",
        "user.update_role",
        "manager.assign",
        "rh.assign",
        "enterprise.list",
        "system.health",
    },
}


OPTIONAL_BACKEND_CAPABILITIES = {
    "department.create",
    "team.create",
    "leave_type.create",
    "authorization_type.create",
    "document_template.create",
    "leave_balance.initialize",
}


@dataclass(slots=True)
class CapabilityMatrix:
    endpoint_available: dict[str, bool] = field(default_factory=dict)

    def is_supported(self, role: str, capability: str) -> bool:
        normalized_role = (role or "EMPLOYEE").upper().replace("ROLE_", "")
        if capability in OPTIONAL_BACKEND_CAPABILITIES:
            return bool(self.endpoint_available.get(capability, False))
        return capability in SUPPORTED_BY_ROLE.get(normalized_role, set())

    def unsupported_reason(self, role: str, capability: str) -> str | None:
        if self.is_supported(role, capability):
            return None
        if capability in OPTIONAL_BACKEND_CAPABILITIES:
            return capability_unavailable_text(capability)
        return "Votre role ne permet pas cette action."


def capability_unavailable_text(capability: str) -> str:
    return f"Cette action ({capability}) n'est pas encore disponible dans le backend."
