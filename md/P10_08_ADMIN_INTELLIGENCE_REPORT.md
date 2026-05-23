# P10-08 Admin Intelligence Report

## 1. MCP tools used
- `filesystem` MCP: inspected `app/agents/role_copilots/admin_copilot.py` and confirmed the existing AdminCopilot summary path.
- `context7` MCP: queried OpenTelemetry observability guidance for structured diagnostics and sensitive data handling. The implementation uses structured diagnostic evidence and redacts secrets before exposure.
- `postgres`, `redis`, `docker`, and `playwright` MCPs were not needed. Redis behavior was inspected through the existing AI `app/events/publisher.py` code and tests; Redis remains non-authoritative.

## 2. Files changed
- `app/intelligence/admin_diagnostics.py`
- `app/intelligence/admin_digest_builder.py`
- `app/intelligence/__init__.py`
- `app/intelligence/role_intelligence.py`
- `app/agents/admin_agent.py`
- `app/agents/role_copilots/admin_copilot.py`
- `tests/test_admin_diagnostics.py`
- `tests/test_admin_digest_builder.py`
- `tests/test_admin_intelligence.py`
- `tests/test_admin_copilot.py`
- `tests/test_role_copilots.py`
- `P10_08_ADMIN_INTELLIGENCE_REPORT.md`

## 3. Admin intelligence architecture
Admin intelligence is implemented as a read-only diagnostics layer:
- `AdminDigestBuilder` builds an ADMIN-only digest from modern ToolRegistry read tools.
- `AdminDiagnostics` turns read sections and safe runtime config facts into deterministic diagnostic items.
- `RoleIntelligenceService` now selects `AdminDigestBuilder` for verified `ADMIN` contexts.
- `AdminAgent` and `AdminCopilot` now reuse the same admin digest path for summary responses.

The admin digest does not create confirmations, does not call write tools, and does not mutate backend state.

## 4. Governance diagnostics strategy
Governance diagnostics use only existing admin read tools:
- `admin.system_health`
- `admin.misconfigured_users`
- `admin.list_users`
- `admin.list_enterprises`

Misconfigured users are surfaced as warnings only when the backend/tool result contains real findings. User and enterprise counts are only taken from authoritative read results. No user, role, tenant, or enterprise mutation is performed.

## 5. Infra diagnostics strategy
Infrastructure diagnostics are derived from safe local settings and existing health/event helpers:
- provider mode and model names from AI settings
- Redis event status from `get_redis_event_status`
- RAG configuration flags from AI settings
- optional router loading status through safe import checks

The diagnostics intentionally avoid checking external service availability by inventing metrics. If availability is not known from an existing health result, it remains absent/null instead of being guessed.

## 6. Provider/Redis/RAG health strategy
Provider diagnostics include:
- provider mode
- chat model
- coder model
- fallback model
- CPU mode flag
- availability only if supplied

Redis diagnostics include:
- enabled flag
- mode (`redis` or `noop`)
- channel name
- SDK availability

RAG diagnostics include:
- provider
- Chroma enabled flag
- collection name
- top_k
- citation-required flag
- tenant-filter-required flag

Redis remains realtime/event infrastructure only. RAG remains policy/static-document retrieval only. Neither becomes a business authority.

## 7. Secret redaction strategy
`AdminDiagnostics.redact_secrets` recursively redacts:
- JWT/Bearer token patterns
- API key-like values
- DB URLs
- Redis URLs
- JDBC Postgres URLs
- password/token/secret assignments

Diagnostics never expose raw JWTs, Authorization headers, API keys, DB URLs, passwords, or raw env secrets.

## 8. Tests added/updated
Added:
- `tests/test_admin_diagnostics.py`
- `tests/test_admin_digest_builder.py`
- `tests/test_admin_intelligence.py`
- `tests/test_admin_copilot.py`

Updated:
- `tests/test_role_copilots.py` to account for the added admin misconfiguration read section in AdminCopilot summaries.

Coverage includes:
- verified ADMIN-only digest behavior
- non-admin denial / prompt-role non-authority
- provider, Redis, RAG diagnostics
- optional router warning representation
- secret redaction
- no admin write tool execution
- ResponseGuard acceptance for admin diagnostic digests

## 9. Validation results
Command:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
```

Result: `ok`.

Focused P10-08 tests:

```powershell
python -m pytest tests/test_admin_intelligence.py tests/test_admin_digest_builder.py tests/test_admin_copilot.py tests/test_admin_diagnostics.py -v
```

Result: `14 passed`, `4 warnings`.

Required regression slice:

```powershell
python -m pytest tests/test_chat_v2.py tests/test_role_intelligence.py tests/test_response_guard.py tests/test_provider_router.py tests/test_redis_event_publisher.py -v
```

Result: `36 passed`, `5 warnings`.

Additional AdminAgent/AdminCopilot regression:

```powershell
python -m pytest tests/test_admin_agent.py tests/test_role_copilots.py -v
```

Result: `21 passed`, `4 warnings`.

Full AI suite:

```powershell
python -m pytest tests -v
```

Result: `486 passed`, `6 warnings`.

Warnings are existing dependency/deprecation warnings (`audioop`, Redis hiredis version checks, `pkg_resources`, pytest-asyncio loop-scope warning).

## 10. Remaining limitations
- Admin infrastructure diagnostics are configuration/read-result based; they do not perform active network checks beyond existing health/tool paths.
- Communication service readiness is represented only through available admin/system health and Redis event configuration, not a new backend probe.
- Optional router diagnostics currently check known optional module `app.api.document_generation`.
- The existing legacy cloud provider configuration placeholder is detected as a configuration-drift warning, but this task did not modify provider configuration files.

## 11. Exact files staged
Planned P10-08 staging list:
- `ai-service/app/intelligence/admin_diagnostics.py`
- `ai-service/app/intelligence/admin_digest_builder.py`
- `ai-service/app/intelligence/__init__.py`
- `ai-service/app/intelligence/role_intelligence.py`
- `ai-service/app/agents/admin_agent.py`
- `ai-service/app/agents/role_copilots/admin_copilot.py`
- `ai-service/tests/test_admin_diagnostics.py`
- `ai-service/tests/test_admin_digest_builder.py`
- `ai-service/tests/test_admin_intelligence.py`
- `ai-service/tests/test_admin_copilot.py`
- `ai-service/tests/test_role_copilots.py`
- `ai-service/P10_08_ADMIN_INTELLIGENCE_REPORT.md`

Unrelated dirty files intentionally not staged:
- `ai-service/evals/reports/local_eval_report.json`
- `ai-service/storage/`

## 12. Commit hash
Pending at report creation time. The final commit hash is recorded in the task completion response after `git commit`.
