from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from config import get_settings

from .policy_models import PolicySource


class LocalPolicyStore:
    """Approved local HR policy store.

    Files without explicit approval metadata are ignored. This avoids using random
    documents in `data/rag` as policy authority.
    """

    def __init__(self, root_dir: str | Path | None = None) -> None:
        settings = get_settings()
        self.root_dir = Path(root_dir or settings.rag_documents_dir)

    def list_sources(self, *, tenant_id: int | None, approved_only: bool = True) -> list[PolicySource]:
        if tenant_id is None:
            return []
        sources: list[PolicySource] = []
        if not self.root_dir.exists():
            return sources
        for path in sorted(self.root_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".json", ".md", ".txt"}:
                continue
            source = self._read_source(path)
            if source is None:
                continue
            if approved_only and not source.approved:
                continue
            if source.tenant_id != tenant_id:
                continue
            sources.append(source)
        return sources

    def get_source(self, *, source_id: str, tenant_id: int | None) -> PolicySource | None:
        for source in self.list_sources(tenant_id=tenant_id, approved_only=True):
            if source.id == source_id:
                return source
        return None

    def _read_source(self, path: Path) -> PolicySource | None:
        try:
            if path.suffix.lower() == ".json":
                return self._read_json(path)
            return self._read_text(path)
        except Exception:
            return None

    def _read_json(self, path: Path) -> PolicySource | None:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(payload, dict):
            return None
        content = str(payload.get("content") or payload.get("body") or "").strip()
        if not content:
            return None
        return PolicySource(
            id=str(payload.get("id") or path.stem),
            tenant_id=_read_int(payload.get("tenant_id") or payload.get("tenantId")),
            title=str(payload.get("title") or path.stem),
            source_type=str(payload.get("source_type") or payload.get("sourceType") or "local_json"),
            path_or_url=str(payload.get("path_or_url") or payload.get("pathOrUrl") or path.name),
            language=str(payload.get("language") or "fr").lower(),
            approved=_read_bool(payload.get("approved")),
            updated_at=str(payload.get("updated_at") or payload.get("updatedAt") or "") or None,
            content=content,
            metadata={key: value for key, value in payload.items() if key not in {"content", "body"}},
        )

    def _read_text(self, path: Path) -> PolicySource | None:
        raw = path.read_text(encoding="utf-8-sig", errors="ignore").strip()
        if not raw:
            return None
        metadata: dict[str, Any] = {}
        content = raw
        if raw.startswith("---"):
            parts = raw.split("---", 2)
            if len(parts) >= 3:
                metadata = _parse_front_matter(parts[1])
                content = parts[2].strip()
        if not content:
            return None
        return PolicySource(
            id=str(metadata.get("id") or path.stem),
            tenant_id=_read_int(metadata.get("tenant_id") or metadata.get("tenantId")),
            title=str(metadata.get("title") or path.stem),
            source_type=str(metadata.get("source_type") or metadata.get("sourceType") or "local_text"),
            path_or_url=str(metadata.get("path_or_url") or metadata.get("pathOrUrl") or path.name),
            language=str(metadata.get("language") or "fr").lower(),
            approved=_read_bool(metadata.get("approved")),
            updated_at=str(metadata.get("updated_at") or metadata.get("updatedAt") or "") or None,
            content=content,
            metadata=metadata,
        )


def _parse_front_matter(raw: str) -> dict[str, str]:
    data: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"\'')
    return data


def _read_int(value: Any) -> int | None:
    if value in (None, "", "null", "None"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _read_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "approved", "on"}
