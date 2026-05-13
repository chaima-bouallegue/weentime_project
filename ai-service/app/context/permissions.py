from __future__ import annotations

ROLE_PERMISSIONS = {
    "EMPLOYEE": {"attendance:read:self", "attendance:write:self"},
    "MANAGER": {"attendance:read:self", "attendance:write:self", "attendance:read:team"},
    "RH": {"attendance:read:self", "attendance:write:self", "attendance:read:company"},
    "ADMIN": {"attendance:read:self", "attendance:write:self", "attendance:read:global"},
}


def permissions_for_role(role: str | None) -> set[str]:
    if not role:
        return set()
    return set(ROLE_PERMISSIONS.get(role.upper().replace("ROLE_", ""), set()))
