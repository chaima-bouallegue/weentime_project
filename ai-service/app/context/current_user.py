from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class CurrentUserContext:
    user_id: int
    email: str | None = None
    role: str = "EMPLOYEE"
    entreprise_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    manager_id: int | None = None
    permissions: set[str] = field(default_factory=set)
    token: str | None = None
    locale: str = "fr-FR"
    language: str = "unknown"
    metadata: dict[str, object] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def tenant_id(self) -> int | None:
        return self.entreprise_id

    @property
    def is_verified(self) -> bool:
        # Chatbot public context: no JWT but the role/user/entreprise came from
        # UI metadata. ToolRegistry treats it as verified so role-based
        # permission checks (NOT identity checks) keep gating tool calls; write
        # tools still require explicit confirmation through the standard flow.
        if self.metadata.get("chatbot_public_context") is True:
            return True
        if self.metadata.get("jwt_verified") is False:
            return False
        if self.metadata.get("jwt_verified") is True:
            return True
        return bool(self.token)

    def has_role(self, role: str) -> bool:
        return self.role.upper() == role.upper().replace("ROLE_", "")
