from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.context.current_user import CurrentUserContext

CANONICAL_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}


def canonical_role(value: str | None) -> str:
    role = (value or "EMPLOYEE").upper().replace("ROLE_", "").strip()
    return role if role in CANONICAL_ROLES else "EMPLOYEE"


@dataclass(frozen=True, slots=True)
class RoleIntelligenceContext:
    user_id: int
    role: str
    tenant_id: int | None
    language: str = "fr"
    verified: bool = False
    locale: str = "fr-FR"
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_current_user(cls, context: CurrentUserContext) -> "RoleIntelligenceContext":
        return cls(
            user_id=int(context.user_id),
            role=canonical_role(context.role),
            tenant_id=context.tenant_id,
            language=(context.language or "fr").lower(),
            verified=bool(context.is_verified),
            locale=context.locale,
            metadata=dict(context.metadata or {}),
        )

    @property
    def is_tenant_scoped(self) -> bool:
        return self.role != "ADMIN" and self.tenant_id is not None
