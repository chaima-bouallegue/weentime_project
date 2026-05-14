# P10-01 Role Intelligence Report

## 1. MCP Tools Used
- filesystem MCP: inspected `app/agents/*`, role copilots, `app/tools/*`, `app/core/copilot_engine.py`, context models, confirmation flow, policy tools, communication tools, and prior AI/P8/P9 reports available in this checkout.
- context7 MCP: checked LangChain documentation for runtime-context role-based tool filtering and RAG source/citation patterns. The implementation keeps WeenTime's own ToolRegistry/ResponseGuard boundaries rather than adopting LangChain runtime.
- postgres MCP: not used; no private data or schema read was needed.
- redis MCP: not used; role intelligence does not use Redis as authority.
- docker MCP: not used.
- playwright MCP: not used.

Requested docs not present in this checkout:
- `PLAN.md`
- `IMPLEMENTATION_BACKLOG.md`
- `AI_SERVICE_AGENT_AUDIT.md`

Available reports were used instead:
- `AI_04_COMPATIBILITY_STABILIZATION_REPORT.md`
- `AI_05_LOCAL_CPU_MODEL_STRATEGY_REPORT.md`
- `P8_01_CHROMADB_RAG_FOUNDATION_REPORT.md`
- `P8_02_POLICY_INGESTION_CITATIONS_REPORT.md`
- `P9_01_RAG_RUNTIME_INGESTION_REPORT.md`
- `P2_02_TOOLREGISTRY_AUTHORITY_REPORT.md`

## 2. Files Changed
- `app/core/copilot_engine.py`
- `app/guards/rules.py`
- `app/intelligence/__init__.py`
- `app/intelligence/role_context.py`
- `app/intelligence/priority_engine.py`
- `app/intelligence/digest_builder.py`
- `app/intelligence/role_intelligence.py`
- `tests/test_role_intelligence.py`
- `tests/test_role_digest_builder.py`
- `tests/test_role_routing.py`
- `P10_01_ROLE_INTELLIGENCE_REPORT.md`

## 3. Role Intelligence Architecture
Added a dedicated `app/intelligence/` package:

- `RoleIntelligenceContext`: adapts verified `CurrentUserContext` into canonical role intelligence context.
- `RoleDigestBuilder`: collects read-only role-relevant sections through ToolExecutor.
- `PriorityEngine`: deterministically prioritizes only from read-result evidence.
- `RoleIntelligenceService`: builds final safe role digest responses.
- `RoleIntelligenceAgent`: router-compatible domain agent for explicit digest/prioritization prompts.

The agent is wired into `copilot_engine` as an extra RouterAgent candidate, but it only handles explicit role intelligence markers such as `digest`, `priorites`, `what should I focus`, or similar operational-priority prompts.

## 4. Digest Architecture
Role digests are deterministic and use only read tools.

EMPLOYEE sections:
- `get_pointage_status`
- `get_week_hours`
- `leave.get_balance`
- `leave.list_my_requests`
- `document.list_my_requests`
- `communication.list_channels`

MANAGER sections:
- `get_team_presence`
- `legacy.get_pending_validations`
- `legacy.get_team_requests`
- `communication.list_channels`

RH sections:
- `legacy.get_rh_stats`
- `legacy.get_all_requests`
- `document.list_my_requests`
- `communication.list_channels`

ADMIN sections:
- `admin.system_health`
- `admin.misconfigured_users`
- `admin.list_users`
- `admin.list_enterprises`

Every section records:
- title
- summary
- status: `ok`, `warning`, or `unavailable`
- tool name
- count
- items
- citations when present

## 5. Deterministic Prioritization Strategy
`PriorityEngine` does not use LLM-generated scores. It derives priorities only from read-result sections:

- EMPLOYEE: pending personal requests or visible communication items.
- MANAGER: pending validations, team requests, or team presence evidence.
- RH: RH backlog, document workload, and RH request summaries.
- ADMIN: misconfigured users, system health, users, and enterprise diagnostics.
- Unavailable sections become warning priorities instead of crashes.

All priorities include source tool evidence and `requiresConfirmation=false`.

## 6. Role Safety Guarantees
- Role source is `CurrentUserContext.role`, not the prompt text.
- Prompt claims such as `je suis admin` do not change the role used by the digest.
- Unverified contexts are rejected before any tool call.
- No write tools are included in role intelligence plans.
- No approval, user mutation, message send, or attendance mutation is executed.
- ToolRegistry/ToolExecutor remain the execution authority.
- ResponseGuard is updated to treat `role_intelligence_digest` as authoritative only because it carries tool-backed read evidence.

## 7. RAG Integration Behavior
- Role intelligence can include a policy section only when the prompt has policy/RAG focus markers such as `politique`, `policy`, `regle`, `source RH`, or `FAQ`.
- Policy retrieval still goes through `policy.search`.
- Citations from policy read results are preserved in the digest action result.
- If no citations are returned, the policy section is unavailable through existing policy-tool behavior.
- Tenant filtering and citation requirements remain in the policy retriever/tool layer.

## 8. Tests Added or Updated
Added:
- `tests/test_role_intelligence.py`
- `tests/test_role_digest_builder.py`
- `tests/test_role_routing.py`

Test coverage includes:
- employee digest
- manager digest
- RH digest
- admin digest
- verified context role beats prompt role claim
- unverified context rejects without tool calls
- no autonomous write execution
- deterministic prioritization
- tenant context propagation
- policy citations preserved
- role routing for explicit digest prompts
- leave and attendance actions are not stolen by role intelligence
- ResponseGuard accepts tool-backed role intelligence digest

## 9. Validation Results
Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -m pytest tests/test_role_intelligence.py tests/test_role_digest_builder.py tests/test_role_routing.py -v
```

Result: passed, 18 tests passed.

```powershell
python -c "import main; print('ok')"
```

Result: passed (`ok`). Existing optional-router warning is expected: `app.api.document_generation` is skipped as optional.

```powershell
python -m pytest tests/test_chat_v2.py tests/test_policy_agent.py tests/test_provider_router.py tests/test_response_guard.py tests/test_deterministic_fallback.py -v
```

Result: passed, 41 tests passed, 1 existing `audioop` deprecation warning.

## 10. Remaining Limitations
- The layer is deterministic and intentionally conservative; it does not perform LLM-based narrative rewriting beyond existing safe provider paths.
- Existing Manager/RH legacy read tools remain in the digest where modern endpoints are not yet fully available.
- Communication digest currently lists visible channels only; it does not infer unread counts unless backend tools expose them.
- The missing planning docs listed above were not available in this checkout and could not be read directly.

## 11. Exact Files Staged
Planned P10-01 staging only:
- `ai-service/app/core/copilot_engine.py`
- `ai-service/app/guards/rules.py`
- `ai-service/app/intelligence/__init__.py`
- `ai-service/app/intelligence/role_context.py`
- `ai-service/app/intelligence/priority_engine.py`
- `ai-service/app/intelligence/digest_builder.py`
- `ai-service/app/intelligence/role_intelligence.py`
- `ai-service/tests/test_role_intelligence.py`
- `ai-service/tests/test_role_digest_builder.py`
- `ai-service/tests/test_role_routing.py`
- `ai-service/P10_01_ROLE_INTELLIGENCE_REPORT.md`

## 12. Commit Hash
The commit hash is recorded in the final task response after creating the clean P10-01 commit.
