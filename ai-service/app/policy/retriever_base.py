from __future__ import annotations

from abc import ABC, abstractmethod

from .policy_models import PolicySearchResult, PolicySource


class BasePolicyRetriever(ABC):
    """Common interface for tenant-scoped policy retrievers."""

    @abstractmethod
    def search(
        self,
        *,
        query: str,
        tenant_id: int | None,
        language: str | None = None,
        limit: int = 3,
    ) -> PolicySearchResult:
        raise NotImplementedError

    @abstractmethod
    def get_source(self, *, source_id: str, tenant_id: int | None) -> PolicySource | None:
        raise NotImplementedError
