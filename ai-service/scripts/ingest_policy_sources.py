from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable, TextIO

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.policy.chromadb_retriever import ChromaPolicyRetriever
from app.policy.ingest import IngestionResult, ingest_policy_sources
from app.policy.policy_store import LocalPolicyStore
from app.policy.source_registry import ManifestValidationError, load_policy_source_manifest
from config import get_settings

RetrieverFactory = Callable[[Path], object]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest approved tenant-scoped HR policy sources into local ChromaDB.")
    parser.add_argument("--tenant-id", type=int, required=True, help="Tenant/enterprise id to ingest. Required.")
    parser.add_argument("--source-dir", type=Path, required=True, help="Directory containing policy_sources.json and approved source files.")
    parser.add_argument("--manifest", default="policy_sources.json", help="Manifest filename inside source-dir.")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Validate and prepare chunks without writing to Chroma. Default.")
    parser.add_argument("--commit", action="store_true", help="Write prepared chunks to ChromaDB. Required for indexing.")
    return parser


def main(argv: list[str] | None = None) -> int:
    return run_ingestion(build_parser().parse_args(argv))


def run_ingestion(args: argparse.Namespace, *, retriever_factory: RetrieverFactory | None = None, output: TextIO | None = None) -> int:
    out = output or sys.stdout
    source_dir = Path(args.source_dir).resolve()
    commit = bool(args.commit)
    try:
        manifest = load_policy_source_manifest(source_dir, tenant_id=int(args.tenant_id), manifest_name=str(args.manifest))
    except ManifestValidationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=out)
        return 2

    retriever = retriever_factory(source_dir) if retriever_factory is not None else _build_retriever(source_dir)
    result = ingest_policy_sources(
        retriever,
        manifest.sources,
        tenant_id=int(args.tenant_id),
        commit=commit,
        warnings=manifest.warnings,
        files_scanned=manifest.files_scanned,
    )
    _print_summary(result, output=out)
    return 0


def _build_retriever(source_dir: Path) -> ChromaPolicyRetriever:
    settings = get_settings()
    return ChromaPolicyRetriever(
        LocalPolicyStore(source_dir),
        persist_dir=getattr(settings, "chroma_persist_dir", PROJECT_ROOT / "storage" / "chroma"),
        collection_name=str(getattr(settings, "chroma_collection_name", "weentime_policy")),
        embedding_model=str(getattr(settings, "chroma_embedding_model", "nomic-embed-text")),
        ollama_base_url=str(getattr(settings, "ollama_base_url", "http://localhost:11434")),
        top_k=int(getattr(settings, "chroma_top_k", 5)),
    )


def _print_summary(result: IngestionResult, *, output: TextIO) -> None:
    summary = {
        "ok": True,
        "dryRun": result.dry_run,
        "tenantId": result.tenant_id,
        "filesScanned": result.files_scanned,
        "approvedSources": result.approved_sources,
        "skippedSources": result.skipped_sources,
        "chunksPrepared": result.prepared_chunks,
        "chunksIndexed": result.indexed_chunks,
        "indexedSourceIds": result.indexed_source_ids,
        "skippedSourceIds": result.skipped_source_ids,
        "warnings": result.warnings,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2), file=output)


if __name__ == "__main__":
    raise SystemExit(main())
