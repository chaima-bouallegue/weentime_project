from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class GuardRejection:
    category: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GuardResult:
    allowed: bool
    rejections: list[GuardRejection] = field(default_factory=list)

    @classmethod
    def allow(cls) -> "GuardResult":
        return cls(allowed=True)

    @classmethod
    def reject(cls, category: str, message: str, *, details: dict[str, Any] | None = None) -> "GuardResult":
        return cls(allowed=False, rejections=[GuardRejection(category=category, message=message, details=details or {})])

    @property
    def primary_category(self) -> str | None:
        return self.rejections[0].category if self.rejections else None

    def merge(self, other: "GuardResult") -> "GuardResult":
        if other.allowed:
            return self
        return GuardResult(allowed=self.allowed and other.allowed, rejections=[*self.rejections, *other.rejections])
