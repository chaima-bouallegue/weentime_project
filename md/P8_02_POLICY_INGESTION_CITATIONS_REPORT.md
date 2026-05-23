# P8-02 Policy Ingestion and Citation Hardening Report

## MCP Tools Used

- `filesystem` MCP: inspected P8-01/AI-05 planning reports, current policy package, policy tools, HRPolicyAgent, tests, and fixtures.
- `context7` MCP: checked current ChromaDB Python ingestion/query patterns for `PersistentClient`, `collection.upsert`, `collection.query`, `include=["documents", "metadatas", "distances"]`, and `$and` metadata filters.
- `postgres` MCP: not used in this task because live DB schema/data was not needed and RAG must not ingest live HR rows.
- `redis` MCP: not used; Redis is not part of policy RAG authority or vector storage.
- `playwright` MCP: not used; no frontend validation was needed.

## Files Changed

- `ai-service/app/policy/__init__.py`
- `ai-service/app/policy/chunking.py`
- `ai-service/app/policy/chromadb_retriever.py`
- `ai-service/app/policy/ingest.py`
- `ai-service/app/policy/policy_models.py`
- `ai-service/app/policy/policy_retriever.py`
- `ai-service/app/policy/source_registry.py`
- `ai-service/app/tools/policy_tools.py`
- `ai-service/tests/test_policy_ingestion.py`
- `ai-service/tests/test_chromadb_policy_retriever.py`
- `ai-service/tests/test_policy_agent.py`
- `ai-service/P8_02_POLICY_INGESTION_CITATIONS_REPORT.md`

## Ingestion Architecture

P8-02 hardens the P8-01 Chroma foundation with a clearer ingestion pipeline:

1. `LocalPolicyStore` reads approved local policy/FAQ source files.
2. `source_registry.py` converts eligible `PolicySource` records into `ApprovedPolicySource` registry entries.
3. `chunking.py` redacts secrets and chunks approved text.
4. `ingest.py` indexes only approved chunks into a retriever exposing `index_chunks()`.
5. `ChromaPolicyRetriever.index_chunks()` upserts chunk text and metadata into Chroma.

The ingestion function is deliberately library-light and duck-typed so tests can validate the contract without a running ChromaDB or embedding model.

## Approved Source Rules

A source can be indexed only when all are true:

- `approved=true`
- `tenant_id` is present
- source type is an allowed policy/FAQ/static text type
- source content is non-empty
- source path suffix is a safe local document type: `.md`, `.txt`, `.json`, or `.pdf`

Forbidden source types remain blocked:

- employee/profile data
- payroll/salary data
- private documents/contracts
- live leave balances
- attendance/pointage data
- request status/approval state
- users/roles

Secrets/JWT/API-key-like text is redacted before embedding/indexing.

## Tenant Isolation

Retrieval remains tenant scoped in two layers:

- Chroma query metadata filter:

```python
{
    "$and": [
        {"tenant_id": {"$eq": tenant_id}},
        {"approved": {"$eq": True}},
        {"language": {"$eq": language}},
    ]
}
```

- Post-query verification rejects results whose metadata does not match tenant, approval, and language.

Ingestion also indexes only the current tenant's approved local sources when called with `tenant_id`.

## Citation Format

`PolicyCitation` now carries stronger citation fields:

- `sourceId`
- `title`
- `excerpt`
- `score`
- `location`
- `chunkId`
- `citationLabel`

Keyword fallback citations now include deterministic `chunkId` values like `tenant42-sick-leave:keyword`.

Chroma citations use indexed metadata such as `chunk_id` and `citation_label`.

Policy answers now mention the approved source and citation identifier in the user-facing text. If citations are missing, policy tools and HRPolicyAgent return the safe unavailable answer rather than inventing a rule.

## Tests Added / Updated

Added `tests/test_policy_ingestion.py` covering:

- approved source ingestion
- unapproved source skipping
- rejected private/non-policy source types
- required citation metadata on chunks
- JWT/Authorization redaction before indexing
- tenant A ingestion excluding tenant B source

Updated existing tests to cover:

- Chroma citation chunk id and citation label
- HRPolicyAgent answer text includes the source/citation id
- existing ResponseGuard citation-less policy rejection remains green

## Validation Results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed, output `ok`.

```powershell
python -m pytest tests/test_policy_ingestion.py tests/test_chromadb_policy_retriever.py -v
```

Result: `13 passed`.

```powershell
python -m pytest tests/test_policy_agent.py tests/test_policy_retriever.py tests/test_response_guard.py -v
```

Result: `27 passed`.

```powershell
python -m pytest tests/test_chat_v2.py tests/test_provider_router.py tests/test_deterministic_fallback.py -v
```

Result: `20 passed, 1 warning`.

Warning: existing Python `audioop` deprecation warning from `voice/stt.py`.

Optional `ollama pull nomic-embed-text` was not run; tests use mocked Chroma/embedding behavior and Chroma remains optional.

## Limitations

- No automatic startup ingestion is enabled yet; ingestion should remain an explicit admin/operator action until policy publishing workflow is defined.
- No live ChromaDB benchmark was performed.
- No backend DB rows are indexed by design.
- PDF extraction is allowed only if extracted text is already presented through approved local policy source files.
- Chroma retrieval quality still depends on local `nomic-embed-text` availability when `CHROMA_ENABLED=true`.

## Exact Files Staged

Planned targeted staging only:

```text
ai-service/app/policy/__init__.py
ai-service/app/policy/chunking.py
ai-service/app/policy/chromadb_retriever.py
ai-service/app/policy/ingest.py
ai-service/app/policy/policy_models.py
ai-service/app/policy/policy_retriever.py
ai-service/app/policy/source_registry.py
ai-service/app/tools/policy_tools.py
ai-service/tests/test_policy_ingestion.py
ai-service/tests/test_chromadb_policy_retriever.py
ai-service/tests/test_policy_agent.py
ai-service/P8_02_POLICY_INGESTION_CITATIONS_REPORT.md
```

`ai-service/tests/test_policy_retriever.py` remains dirty from pre-existing line-ending state and is intentionally not staged.

## Commit Hash

Pending at report creation time. Final commit hash is recorded in the task response after commit.
