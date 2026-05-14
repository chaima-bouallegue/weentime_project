# P9-01 RAG Runtime Ingestion Report

## 1. MCP Tools Used
- filesystem MCP: inspected the AI policy package and CLI/script directory.
- context7 MCP: checked ChromaDB Python patterns for `PersistentClient`, `collection.upsert`, metadata-filtered `collection.query`, and Ollama embedding usage with `nomic-embed-text`.
- postgres MCP: not used; this task must not inspect or index live HR/private rows.
- redis MCP: not used; RAG remains outside Redis.
- docker MCP: not used; no container runtime check was required.
- playwright MCP: not used; no frontend validation was required.

## 2. Files Changed
- `app/policy/chunking.py`
- `app/policy/__init__.py`
- `app/policy/ingest.py`
- `app/policy/source_registry.py`
- `scripts/ingest_policy_sources.py`
- `tests/test_policy_ingestion_cli.py`
- `P9_01_RAG_RUNTIME_INGESTION_REPORT.md`

## 3. CLI Usage
Operator ingestion command added:

```powershell
python scripts/ingest_policy_sources.py --tenant-id 9 --source-dir ./storage/policies --dry-run
python scripts/ingest_policy_sources.py --tenant-id 9 --source-dir ./storage/policies --commit
```

Behavior:
- `--tenant-id` is required.
- `--source-dir` is required.
- `--dry-run` is the default safe mode.
- `--commit` is required before writing chunks to ChromaDB.
- The command prints a JSON summary with scanned files, approved/skipped sources, prepared chunks, indexed chunks, and warnings.

## 4. Manifest Format
The command expects `policy_sources.json` in `--source-dir` by default:

```json
{
  "sources": [
    {
      "source_id": "leave-policy",
      "tenant_id": 9,
      "title": "Leave Policy",
      "language": "en",
      "source_type": "hr_policy",
      "approved": true,
      "path": "leave-policy.md",
      "citation_label": "Leave Policy"
    }
  ]
}
```

Supported approved source types are policy/FAQ/static approved text types only. Forbidden source types include employee data, payroll, attendance, request status, approvals, users, and roles.

## 5. Dry-run and Commit Behavior
- Dry-run validates the manifest, loads approved sources, redacts secrets, chunks documents, and reports chunk counts without calling `index_chunks`.
- Commit performs the same validation and calls the retriever `index_chunks` method only for safe approved chunks.
- Missing manifest or source directory fails cleanly with JSON `{ "ok": false, "error": ... }`.
- Invalid manifest entries are skipped with warnings rather than indexed.

Manual dry-run validation result:

```json
{
  "ok": true,
  "dryRun": true,
  "tenantId": 9,
  "filesScanned": 1,
  "approvedSources": 1,
  "skippedSources": 0,
  "chunksPrepared": 1,
  "chunksIndexed": 0,
  "indexedSourceIds": ["sample-policy"],
  "skippedSourceIds": [],
  "warnings": []
}
```

## 6. Tenant Isolation Checks
- CLI tenant id must match each manifest source `tenant_id`.
- Tenant mismatches are rejected and reported as warnings.
- `ingest_policy_sources` filters sources by the requested tenant before chunking or indexing.
- Runtime Chroma retrieval continues to use metadata filters for `tenant_id`, `approved=true`, and language when provided.

## 7. Path Traversal Protections
- Manifest paths are resolved relative to `source-dir`.
- Any path outside `source-dir` is rejected with `path_traversal:<source_id>`.
- Only `.md`, `.txt`, `.json`, and `.pdf` source file extensions are accepted.
- Missing files and unsupported suffixes are skipped with warnings.

## 8. Citation Protections
- Every chunk receives metadata: `tenant_id`, `source_id`, `source_title`, `source_type`, `language`, `approved`, `chunk_id`, and `citation_label`.
- Citation labels are generated as `<citation_label>#<chunk_number>`.
- Policy runtime still requires citations; citation-less policy answers remain unavailable or rejected by the Response Guard.

## 9. Fallback Behavior
- The app does not auto-index at startup.
- ChromaDB remains optional.
- If Chroma is disabled or unavailable, `PolicyRetriever` falls back to local keyword retrieval.
- No live HR DB rows, private employee data, payroll data, approvals, attendance, roles, or users are indexed.

## 10. Secret Blocking
The ingestion/chunking redactor now blocks:
- Authorization Bearer tokens
- JWT-like tokens
- Braintrust/OpenAI style API keys
- env-style secret variables
- generic `api_key`, `password`, `passwd`, and `pwd` assignments
- direct DB URLs such as PostgreSQL/MySQL/MongoDB connection strings

## 11. Tests Added or Updated
Added:
- `tests/test_policy_ingestion_cli.py`

Updated:
- policy ingestion internals and redaction used by existing ingestion/retriever tests.

Coverage includes:
- dry-run indexes nothing
- commit indexes approved sources
- missing tenant id fails
- missing manifest fails cleanly
- path traversal rejected
- tenant mismatch rejected
- unapproved source skipped
- forbidden source type rejected
- secret-like text redacted before indexing
- Chroma fallback tests remain green
- policy answers still require citations

## 12. Validation Results
Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed (`ok`).

```powershell
python -m pytest tests/test_policy_ingestion_cli.py tests/test_policy_ingestion.py tests/test_chromadb_policy_retriever.py -v
```

Result: passed, 22 tests passed.

```powershell
python -m pytest tests/test_policy_agent.py tests/test_policy_retriever.py tests/test_response_guard.py -v
```

Result: passed, 27 tests passed.

```powershell
python -m pytest tests/test_chat_v2.py tests/test_provider_router.py tests/test_deterministic_fallback.py -v
```

Result: passed, 20 tests passed, 1 existing warning from `voice/stt.py` about Python `audioop` deprecation.

## 13. Remaining Limitations
- The CLI writes to Chroma only when a Chroma retriever is available; automated tests use a fake retriever and do not require Chroma/Ollama.
- PDF support assumes already-extracted text in approved source files; this task does not implement PDF binary extraction.
- No scheduled/background ingestion worker was added by design.
- No frontend or backend changes were made.

## 14. Exact Files Staged
Planned P9-01 staging only:
- `ai-service/app/policy/chunking.py`
- `ai-service/app/policy/__init__.py`
- `ai-service/app/policy/ingest.py`
- `ai-service/app/policy/source_registry.py`
- `ai-service/scripts/ingest_policy_sources.py`
- `ai-service/tests/test_policy_ingestion_cli.py`
- `ai-service/P9_01_RAG_RUNTIME_INGESTION_REPORT.md`

## 15. Commit Hash
Commit hash will be recorded in the final task response after the clean P9-01 commit is created.
