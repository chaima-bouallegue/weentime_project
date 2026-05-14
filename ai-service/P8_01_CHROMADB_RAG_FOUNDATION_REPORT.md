# P8-01 ChromaDB RAG Foundation Report

## 1. MCP Tools Used

- `filesystem` MCP: used to inspect the current policy package, policy tools, HRPolicyAgent, config, requirements, policy tests, and fixtures.
- `context7` MCP: used to resolve `/chroma-core/chroma` and inspect current ChromaDB Python patterns for `PersistentClient`, `get_or_create_collection`, `collection.query`, metadata `where` filters, `$and`, and `OllamaEmbeddingFunction` with `nomic-embed-text`.
- `postgres` MCP: attempted read-only schema inspection with `information_schema.tables`; connection failed due PostgreSQL password authentication, so no database schema or private data was read.
- `redis` MCP: not used; RAG does not use Redis as authority or vector store.
- `playwright` MCP: not used; no frontend validation was needed.

## 2. Files Inspected

- `ai-service/app/policy/*`
- `ai-service/app/tools/policy_tools.py`
- `ai-service/app/agents/hr_policy_agent.py`
- `ai-service/config.py`
- `ai-service/requirements.txt`
- `ai-service/tests/test_policy_retriever.py`
- `ai-service/tests/test_policy_agent.py`
- `ai-service/tests/test_response_guard.py`
- `ai-service/tests/fixtures/policies/*`
- `ai-service/app/api/health_v2.py`

## 3. Current Policy System Summary

Before this task, policy retrieval already had a safe baseline:

- `LocalPolicyStore` reads local `.json`, `.md`, and `.txt` policy files only.
- Sources without explicit `approved=true` metadata are ignored.
- Tenant scoping is enforced by `tenant_id` matching.
- `PolicyRetriever` used keyword scoring over approved tenant sources.
- `policy.search`, `policy.get_source`, and `policy.explain_rule` returned citations through stable `read_result` output.
- `HRPolicyAgent` returned policy answers only when citations exist.
- `ResponseGuard` rejects policy answers that claim availability without citations.

## 4. ChromaDB Architecture

Added an optional local ChromaDB retriever foundation:

- New `BasePolicyRetriever` interface.
- Existing keyword retriever preserved as `KeywordPolicyRetriever`.
- `PolicyRetriever` now routes to Chroma only when both are true:
  - `RAG_PROVIDER=chromadb`
  - `CHROMA_ENABLED=true`
- If ChromaDB is unavailable, misconfigured, missing embeddings, or throws at query time, `PolicyRetriever` records the error and falls back to local keyword retrieval.
- `ChromaPolicyRetriever` imports Chroma lazily, so the AI service still imports and starts when ChromaDB is not installed.
- Chroma collection access uses a persistent local client when enabled:
  - `CHROMA_PERSIST_DIR=./storage/chroma`
  - `CHROMA_COLLECTION_NAME=weentime_policy`
- Embeddings are designed for local Ollama only:
  - `CHROMA_EMBEDDING_MODEL=nomic-embed-text`
  - no cloud embedding provider was added.

## 5. Ingestion Rules

Added an ingestion contract for approved local docs only:

- `app/policy/source_registry.py` builds chunks with safe metadata.
- `app/policy/ingest.py` indexes approved chunks into a vector retriever by duck-typed `index_chunks()`.
- Every indexed chunk includes:
  - `tenant_id`
  - `source_id`
  - `source_title`
  - `source_type`
  - `source_location`
  - `language`
  - `approved=true`
  - `chunk_id`
  - `citation_label`
- Forbidden source types are explicitly rejected, including payroll, employee profile, attendance, leave balance, request status, approval, user, and role data.
- Sensitive token/API key patterns are redacted before text is sent to Chroma/embedding functions.

## 6. Tenant Isolation Strategy

Chroma queries apply metadata filters:

```python
{
    "$and": [
        {"tenant_id": {"$eq": tenant_id}},
        {"approved": {"$eq": True}},
        {"language": {"$eq": language}},
    ]
}
```

Additional post-filtering rejects any returned document whose metadata does not match the requested tenant, approved flag, and language. This protects against malformed test doubles, stale vector metadata, or unexpected vector-store behavior.

## 7. Citation Strategy

Chroma results are converted to `PolicyCitation` objects with:

- `source_id`
- `title`
- `excerpt`
- `score`
- `location`

`location` uses `citation_label` when available, otherwise source location metadata. Policy tools continue returning citations in `actionResult.kind=policy_answer`, and ResponseGuard continues blocking citation-less policy answers.

## 8. Fallback Behavior

Fallback paths are intentionally conservative:

- Default config remains `RAG_PROVIDER=local_keyword` and `CHROMA_ENABLED=false`.
- ChromaDB is optional and lazy-loaded.
- If Chroma is unavailable, the existing keyword retriever answers from approved local sources.
- If no approved citation exists, policy tools return `policy_unavailable` instead of inventing an answer.
- RAG is still not used for live balances, pointage status, current request status, approvals, users, roles, payroll, or private data.

## 9. Files Changed

- `ai-service/.env.example`
- `ai-service/config.py`
- `ai-service/requirements.txt`
- `ai-service/app/api/health_v2.py`
- `ai-service/app/policy/__init__.py`
- `ai-service/app/policy/policy_retriever.py`
- `ai-service/app/policy/retriever_base.py`
- `ai-service/app/policy/chromadb_retriever.py`
- `ai-service/app/policy/source_registry.py`
- `ai-service/app/policy/ingest.py`
- `ai-service/tests/test_chromadb_policy_retriever.py`
- `ai-service/P8_01_CHROMADB_RAG_FOUNDATION_REPORT.md`

## 10. Tests Added / Updated

Added `tests/test_chromadb_policy_retriever.py` covering:

- Chroma disabled uses keyword fallback.
- Chroma unavailable does not crash and falls back to keyword retrieval.
- Chroma query applies tenant, approved, and language metadata filters.
- Post-filtering blocks cross-tenant and unapproved vector results.
- Ingestion rejects live/private HR source types.
- Ingestion redacts JWT/Authorization text before embedding payloads.
- Citations include source title and chunk/source location.

Existing policy and guard tests were not weakened.

## 11. Validation Results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed, output `ok`.

```powershell
python -m pytest tests/test_policy_retriever.py tests/test_policy_agent.py tests/test_response_guard.py -v
```

Result: `27 passed`.

```powershell
python -m pytest tests/test_chromadb_policy_retriever.py -v
```

Result: `7 passed`.

```powershell
python -m pytest tests/test_chat_v2.py tests/test_provider_router.py tests/test_ollama_provider.py tests/test_deterministic_fallback.py -v
```

Result: `33 passed, 1 warning`.

Warning: existing Python `audioop` deprecation warning from `voice/stt.py`.

Optional `ollama pull nomic-embed-text` was not run because CI/tests do not require the embedding model and Chroma remains disabled by default.

## 12. Remaining Limitations

- ChromaDB is configured as optional infrastructure but not automatically ingested at service startup.
- No live vector store benchmark was performed.
- PostgreSQL MCP schema inspection could not authenticate, and no DB data was read or indexed.
- Runtime policy corpus ingestion must remain an explicit admin/operator workflow in a later task.
- Chroma query quality depends on local `nomic-embed-text` availability when `CHROMA_ENABLED=true`.

## 13. Exact Files Staged

Planned targeted staging only:

```text
ai-service/.env.example
ai-service/config.py
ai-service/requirements.txt
ai-service/app/api/health_v2.py
ai-service/app/policy/__init__.py
ai-service/app/policy/policy_retriever.py
ai-service/app/policy/retriever_base.py
ai-service/app/policy/chromadb_retriever.py
ai-service/app/policy/source_registry.py
ai-service/app/policy/ingest.py
ai-service/tests/test_chromadb_policy_retriever.py
ai-service/P8_01_CHROMADB_RAG_FOUNDATION_REPORT.md
```

`ai-service/tests/test_policy_retriever.py` appears dirty from pre-existing line-ending state and is intentionally not staged.

## 14. Commit Hash

Pending at report creation time. The final commit hash is recorded in the task response after commit.
