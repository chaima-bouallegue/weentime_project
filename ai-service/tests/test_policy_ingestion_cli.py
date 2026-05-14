from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from scripts.ingest_policy_sources import build_parser, run_ingestion


class FakeRetriever:
    def __init__(self) -> None:
        self.indexed_chunks = []

    def index_chunks(self, chunks):
        self.indexed_chunks.extend(chunks)
        return len(chunks)


def _write_manifest(source_dir: Path, sources: list[dict]) -> None:
    source_dir.mkdir(parents=True, exist_ok=True)
    (source_dir / "policy_sources.json").write_text(json.dumps({"sources": sources}, ensure_ascii=False), encoding="utf-8")


def _write_source(source_dir: Path, name: str = "policy.md", content: str = "Approved HR policy content for leave requests.") -> None:
    (source_dir / name).write_text(content, encoding="utf-8")


def _base_source(**overrides) -> dict:
    payload = {
        "source_id": "policy-1",
        "tenant_id": 9,
        "title": "Leave Policy",
        "language": "en",
        "source_type": "hr_policy",
        "approved": True,
        "path": "policy.md",
        "citation_label": "Leave Policy",
    }
    payload.update(overrides)
    return payload


def _args(source_dir: Path, *extra: str) -> argparse.Namespace:
    return build_parser().parse_args(["--tenant-id", "9", "--source-dir", str(source_dir), *extra])


def _run(tmp_path: Path, *extra: str, retriever: FakeRetriever | None = None) -> tuple[int, dict, FakeRetriever]:
    from io import StringIO

    fake = retriever or FakeRetriever()
    output = StringIO()
    code = run_ingestion(_args(tmp_path, *extra), retriever_factory=lambda _source_dir: fake, output=output)
    return code, json.loads(output.getvalue()), fake


def test_cli_dry_run_indexes_nothing(tmp_path: Path) -> None:
    _write_source(tmp_path)
    _write_manifest(tmp_path, [_base_source()])

    code, summary, fake = _run(tmp_path)

    assert code == 0
    assert summary["dryRun"] is True
    assert summary["filesScanned"] == 1
    assert summary["approvedSources"] == 1
    assert summary["chunksPrepared"] == 1
    assert summary["chunksIndexed"] == 0
    assert fake.indexed_chunks == []


def test_cli_commit_indexes_approved_sources(tmp_path: Path) -> None:
    _write_source(tmp_path)
    _write_manifest(tmp_path, [_base_source()])

    code, summary, fake = _run(tmp_path, "--commit")

    assert code == 0
    assert summary["dryRun"] is False
    assert summary["chunksPrepared"] == 1
    assert summary["chunksIndexed"] == 1
    assert [chunk.id for chunk in fake.indexed_chunks] == ["policy-1:0"]
    assert fake.indexed_chunks[0].metadata["tenant_id"] == 9
    assert fake.indexed_chunks[0].metadata["citation_label"] == "Leave Policy#1"


def test_cli_missing_tenant_id_fails_before_ingestion(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["--source-dir", str(tmp_path)])


def test_cli_missing_manifest_fails_cleanly(tmp_path: Path) -> None:
    tmp_path.mkdir(exist_ok=True)

    code, summary, _fake = _run(tmp_path)

    assert code == 2
    assert summary["ok"] is False
    assert "manifest_not_found" in summary["error"]


def test_cli_rejects_source_path_traversal(tmp_path: Path) -> None:
    _write_manifest(tmp_path, [_base_source(path="../secret.md")])

    code, summary, fake = _run(tmp_path)

    assert code == 0
    assert summary["approvedSources"] == 0
    assert summary["skippedSources"] == 1
    assert summary["chunksPrepared"] == 0
    assert fake.indexed_chunks == []
    assert any("path_traversal:policy-1" in warning for warning in summary["warnings"])


def test_cli_rejects_tenant_mismatch(tmp_path: Path) -> None:
    _write_source(tmp_path)
    _write_manifest(tmp_path, [_base_source(tenant_id=7)])

    code, summary, _fake = _run(tmp_path)

    assert code == 0
    assert summary["approvedSources"] == 0
    assert summary["skippedSources"] == 1
    assert any("tenant_mismatch:policy-1" in warning for warning in summary["warnings"])


def test_cli_skips_unapproved_source(tmp_path: Path) -> None:
    _write_source(tmp_path)
    _write_manifest(tmp_path, [_base_source(approved=False)])

    code, summary, fake = _run(tmp_path)

    assert code == 0
    assert summary["approvedSources"] == 0
    assert summary["skippedSources"] == 1
    assert summary["chunksPrepared"] == 0
    assert fake.indexed_chunks == []


def test_cli_rejects_forbidden_source_type(tmp_path: Path) -> None:
    _write_source(tmp_path)
    _write_manifest(tmp_path, [_base_source(source_type="payroll")])

    code, summary, fake = _run(tmp_path)

    assert code == 0
    assert summary["approvedSources"] == 0
    assert summary["skippedSources"] == 1
    assert fake.indexed_chunks == []
    assert any("forbidden_source_type:policy-1:payroll" in warning for warning in summary["warnings"])


def test_cli_redacts_secret_like_text_before_indexing(tmp_path: Path) -> None:
    _write_source(tmp_path, content="Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret should not be indexed. password=secret")
    _write_manifest(tmp_path, [_base_source()])

    code, summary, fake = _run(tmp_path, "--commit")

    assert code == 0
    assert summary["chunksIndexed"] == 1
    indexed_text = "\n".join(chunk.text for chunk in fake.indexed_chunks)
    assert "Bearer eyJ" not in indexed_text
    assert "Authorization:" not in indexed_text
    assert "password=secret" not in indexed_text
    assert "[REDACTED]" in indexed_text
