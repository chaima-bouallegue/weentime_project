from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .chunking import chunk_text, redact_sensitive_text
from .policy_models import PolicySource

ALLOWED_SOURCE_TYPES = {
    "hr_policy",
    "hr_policy_markdown",
    "policy",
    "policy_markdown",
    "faq",
    "faq_markdown",
    "approved_text",
    "approved_markdown",
    "pdf_extracted_text",
    "fixture",
}

FORBIDDEN_SOURCE_TYPES = {
    "employee",
    "employee_profile",
    "payroll",
    "salary",
    "private_document",
    "contract",
    "leave_balance",
    "attendance",
    "pointage",
    "request_status",
    "approval",
    "user",
    "role",
}

SAFE_MANIFEST_SUFFIXES = {".md", ".txt", ".json", ".pdf"}


class ManifestValidationError(ValueError):
    pass


@dataclass(slots=True)
class ApprovedPolicySource:
    source_id: str
    tenant_id: int
    title: str
    language: str
    source_type: str
    approved: bool
    path: str
    citation_label: str
    content: str


@dataclass(slots=True)
class PolicyChunk:
    id: str
    text: str
    metadata: dict[str, object]


@dataclass(slots=True)
class ManifestLoadResult:
    sources: list[PolicySource]
    files_scanned: int
    approved_sources: int
    skipped_sources: int
    warnings: list[str]


def load_policy_source_manifest(source_dir: str | Path, *, tenant_id: int, manifest_name: str = "policy_sources.json") -> ManifestLoadResult:
    root = Path(source_dir).resolve()
    manifest_path = (root / manifest_name).resolve()
    if not root.exists() or not root.is_dir():
        raise ManifestValidationError(f"source_dir_not_found:{root}")
    if not manifest_path.exists() or not manifest_path.is_file():
        raise ManifestValidationError(f"manifest_not_found:{manifest_path}")
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise ManifestValidationError(f"manifest_invalid_json:{exc.msg}") from exc
    entries = payload.get("sources") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        raise ManifestValidationError("manifest_sources_must_be_list")

    sources: list[PolicySource] = []
    warnings: list[str] = []
    files_scanned = 0
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            warnings.append(f"source[{index}]:invalid_entry")
            continue
        files_scanned += 1
        try:
            source = _source_from_manifest_entry(entry, root=root, tenant_id=tenant_id, index=index)
        except ManifestValidationError as exc:
            warnings.append(f"source[{index}]:{exc}")
            continue
        if source is not None:
            sources.append(source)
    return ManifestLoadResult(
        sources=sources,
        files_scanned=files_scanned,
        approved_sources=len(sources),
        skipped_sources=max(0, files_scanned - len(sources)),
        warnings=warnings,
    )


def approved_source_from_policy_source(source: PolicySource) -> ApprovedPolicySource | None:
    if not is_indexable_policy_source(source):
        return None
    assert source.tenant_id is not None  # guarded by is_indexable_policy_source
    source_id = str(source.id).strip()
    title = str(source.title or source_id).strip()
    path = str(source.path_or_url or source.metadata.get("path") or source_id).strip()
    return ApprovedPolicySource(
        source_id=source_id,
        tenant_id=int(source.tenant_id),
        title=title,
        language=(source.language or "fr").lower(),
        source_type=(source.source_type or "hr_policy").lower(),
        approved=True,
        path=path,
        citation_label=str(source.metadata.get("citation_label") or title).strip(),
        content=source.content or "",
    )


def is_indexable_policy_source(source: PolicySource) -> bool:
    source_type = (source.source_type or "").strip().lower()
    if not source.approved or source.tenant_id is None:
        return False
    if source_type in FORBIDDEN_SOURCE_TYPES:
        return False
    if source_type not in ALLOWED_SOURCE_TYPES:
        return False
    suffix = Path(str(source.path_or_url or "")).suffix.lower()
    if suffix and suffix not in SAFE_MANIFEST_SUFFIXES:
        return False
    return bool((source.content or "").strip())


def build_policy_chunks(source: PolicySource, *, max_chars: int = 900, overlap_chars: int = 120) -> list[PolicyChunk]:
    approved_source = approved_source_from_policy_source(source)
    if approved_source is None:
        return []
    chunks: list[PolicyChunk] = []
    for chunk in chunk_text(approved_source.content, max_chars=max_chars, overlap_chars=overlap_chars):
        chunk_id = f"{approved_source.source_id}:{chunk.index}"
        citation_label = f"{approved_source.citation_label}#{chunk.index + 1}"
        chunks.append(
            PolicyChunk(
                id=chunk_id,
                text=chunk.text,
                metadata={
                    "tenant_id": approved_source.tenant_id,
                    "source_id": approved_source.source_id,
                    "source_title": approved_source.title,
                    "source_type": approved_source.source_type,
                    "source_location": approved_source.path,
                    "language": approved_source.language,
                    "approved": True,
                    "chunk_id": chunk_id,
                    "chunk_index": chunk.index,
                    "citation_label": citation_label,
                },
            )
        )
    return chunks


def iter_approved_sources(sources: Iterable[PolicySource]) -> list[ApprovedPolicySource]:
    approved: list[ApprovedPolicySource] = []
    for source in sources:
        item = approved_source_from_policy_source(source)
        if item is not None:
            approved.append(item)
    return approved


def iter_indexable_chunks(sources: Iterable[PolicySource]) -> list[PolicyChunk]:
    chunks: list[PolicyChunk] = []
    for source in sources:
        chunks.extend(build_policy_chunks(source))
    return chunks


def _source_from_manifest_entry(entry: dict[str, Any], *, root: Path, tenant_id: int, index: int) -> PolicySource | None:
    source_id = _required_str(entry, "source_id", index=index)
    entry_tenant = _read_int(entry.get("tenant_id"))
    if entry_tenant != int(tenant_id):
        raise ManifestValidationError(f"tenant_mismatch:{source_id}")
    approved = _read_bool(entry.get("approved"))
    if not approved:
        return None
    source_type = str(entry.get("source_type") or "").strip().lower()
    if source_type in FORBIDDEN_SOURCE_TYPES or source_type not in ALLOWED_SOURCE_TYPES:
        raise ManifestValidationError(f"forbidden_source_type:{source_id}:{source_type or 'missing'}")
    relative_path = _required_str(entry, "path", index=index)
    source_path = _safe_manifest_path(root, relative_path, source_id=source_id)
    content = source_path.read_text(encoding="utf-8-sig", errors="ignore").strip()
    if not content:
        raise ManifestValidationError(f"empty_source:{source_id}")
    return PolicySource(
        id=source_id,
        tenant_id=entry_tenant,
        title=str(entry.get("title") or source_id).strip(),
        source_type=source_type,
        path_or_url=str(source_path.relative_to(root)).replace("\\", "/"),
        language=str(entry.get("language") or "fr").strip().lower(),
        approved=True,
        updated_at=str(entry.get("updated_at") or entry.get("updatedAt") or "") or None,
        content=redact_sensitive_text(content),
        metadata={
            "citation_label": str(entry.get("citation_label") or entry.get("title") or source_id).strip(),
            "manifest_path": "policy_sources.json",
            "path": str(source_path.relative_to(root)).replace("\\", "/"),
        },
    )


def _safe_manifest_path(root: Path, relative_path: str, *, source_id: str) -> Path:
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ManifestValidationError(f"path_traversal:{source_id}") from exc
    if not candidate.exists() or not candidate.is_file():
        raise ManifestValidationError(f"source_file_not_found:{source_id}")
    if candidate.suffix.lower() not in SAFE_MANIFEST_SUFFIXES:
        raise ManifestValidationError(f"unsupported_file_type:{source_id}:{candidate.suffix.lower()}")
    return candidate


def _required_str(entry: dict[str, Any], key: str, *, index: int) -> str:
    value = str(entry.get(key) or "").strip()
    if not value:
        raise ManifestValidationError(f"missing_{key}:source[{index}]")
    return value


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
