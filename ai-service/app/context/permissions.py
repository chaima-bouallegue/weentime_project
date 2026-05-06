from __future__ import annotations

ROLE_PERMISSIONS = {
    "EMPLOYEE": {"attendance:read:self", "attendance:write:self"},
    "MANAGER": {"attendance:read:self", "attendance:write:self", "attendance:read:team"},
    "RH": {"attendance:read:self", "attendance:write:self", "attendance:read:company", "attendance:read:team"},
    "ADMIN": {"attendance:read:self", "attendance:write:self", "attendance:read:global", "attendance:read:team"},
}


def permissions_for_role(role: str | None) -> set[str]:
    return set(ROLE_PERMISSIONS.get((role or "EMPLOYEE").upper().replace("ROLE_", ""), set()))
