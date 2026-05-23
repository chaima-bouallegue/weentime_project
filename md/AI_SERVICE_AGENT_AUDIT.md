# AI Service Agent Audit

## Scope

This document audits the AI agents and copilots currently present in `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`. It covers both the legacy system under `agents/*` and the modern v2 system under `app/agents/*`.

The audit is based on repository inspection, not runtime behavior in a live browser session.

## Executive Findings

- The AI service has two active architectures: legacy role agents and modern v2 domain/role agents.
- Modern v2 is the right direction because it uses ContextBuilder, ToolRegistry, ToolExecutor, confirmation store, and backend JWT forwarding.
- Legacy remains necessary as fallback but should not receive new features.
- Manager and RH workflows are still partly legacy-backed, especially approvals and request processing.
- CommunicationAgent exists but is not active; it is a placeholder.
- Role copilots are useful as read-only orchestration/summarization layers, not business authorities.
- No agent should directly call backend APIs outside ToolExecutor once modernization is complete.

## Legacy Agent Inventory

| Agent | File path | Role/domain | Current responsibility | Tools/dependencies | Readiness | Keep/refactor/delete later |
| --- | --- | --- | --- | --- | --- | --- |
| BaseAgent | `ai-service/agents/base_agent.py` | Legacy foundation | Common reply structure and base behavior | Legacy memory/workflow assumptions | Legacy only | Keep until LegacyAgent fallback can be removed |
| AgentRouter | `ai-service/agents/router.py` | Legacy routing | Routes legacy chat to role agents | Legacy role agents, deterministic routing | Superseded by `app/agents/router_agent.py` | Freeze; delete later after migration |
| EmployeeAgent | `ai-service/agents/employee_agent.py` | Employee legacy | Handles employee-style HR requests | Legacy HRTools/decision flow | Partial, unsafe for new work | Keep as fallback only |
| ManagerAgent | `ai-service/agents/manager_agent.py` | Manager legacy | Handles manager validation style requests | Legacy HRTools | Partial | Replace with modern ManagerAgent tools |
| RHAgent | `ai-service/agents/rh_agent.py` | RH legacy | Handles RH statistics and processing | Legacy HRTools | Partial | Replace with modern RHAgent tools |
| AdminAgent | `ai-service/agents/admin_agent.py` | Admin legacy | Handles admin prompts | Legacy assumptions | Partial | Replace with modern AdminAgent tools |

### Legacy Risks

- Legacy system is not the authority path for new architecture.
- It may depend on frontend-provided context in older flows.
- Error contracts are less stable than v2 envelopes.
- It can hide missing modern tools by answering generally.

### Legacy Decision

Keep LegacyAgent as a last fallback only. Do not add new business capability to `agents/*` or old HRTools unless it is a temporary adapter needed for compatibility.

## Modern Agent Inventory

| Agent | File path | Role/domain | Supported responsibility | Tools used | Legacy dependency | V2 readiness | Gaps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RouterAgent | `ai-service/app/agents/router_agent.py` | Global routing | Selects domain/role agent; deterministic multilingual routing; legacy fallback | All agents indirectly | Fallback to LegacyAgent | High | Needs provider-router awareness later, better route explanations, and stricter ambiguity handling |
| LegacyAgent | `ai-service/app/agents/legacy_agent.py` | Compatibility | Wraps old `/chat` behavior | Legacy process handler | Yes | Compatibility only | Must remain last fallback and never bypass modern security |
| AttendanceAgent | `ai-service/app/agents/attendance_agent.py` | Pointage/presence | Status, check-in, check-out, week hours, team/company/global presence routing | `get_pointage_status`, `check_in`, `check_out`, `get_week_hours`, `get_team_presence` | No | High | Needs stronger response guard and full role endpoint tests |
| LeaveAgent | `ai-service/app/agents/leave_agent.py` | Leave | Balance, personal list, status, create request, risk planner | `leave.*`, confirmation store, leave planner | Low/no | Medium-high | Needs policy-linked explanations and stronger overlap/date tests |
| DocumentAgent | `ai-service/app/agents/document_agent.py` | Documents | Create/list/status/open, RH generate/reject when supported | `document.*` | No | Medium-high | Needs request detail resolution and safer RH processing UX |
| TeleworkAgent | `ai-service/app/agents/telework_agent.py` | Telework | Create/list/status, manager/RH decision tools | `telework.*` | No | Medium | Needs request detail resolution before decisions |
| AuthorizationAgent | `ai-service/app/agents/authorization_agent.py` | Authorizations | Create/list/status, manager/RH decision tools | `authorization.*` | No | Medium | Endpoint mapping must stay aligned with RH service; needs decision details before approvals |
| ManagerAgent | `ai-service/app/agents/manager_agent.py` | Manager actions | Pending validations, team requests, approve/reject | `legacy.get_pending_validations`, `legacy.get_team_requests`, `legacy.approve_request`, `legacy.reject_request` | Yes | Medium-low | Must be modernized first for approval details and endpoint-safe decisions |
| RHAgent | `ai-service/app/agents/rh_agent.py` | RH actions | RH stats, all requests, process request | `legacy.get_rh_stats`, `legacy.get_all_requests`, `legacy.process_request` | Yes | Medium-low | Must be modernized first for final validation/document processing |
| AdminAgent | `ai-service/app/agents/admin_agent.py` | Admin actions | List/create/update users, assign manager/RH, enterprises, health | `admin.*` | No | Medium-high | Need one-role invariant enforcement tests and endpoint capability matrix sync |
| HRPolicyAgent | `ai-service/app/agents/hr_policy_agent.py` | Policy/RAG | Search/explain approved tenant policy sources | `policy.*` | No | Medium | Local keyword retrieval only; needs ChromaDB and citations guard later |
| InsightAgent | `ai-service/app/agents/insight_agent.py` | Read-only intelligence | Employee/manager/RH/admin insight reports | `insights.*` | Indirect legacy via role tools may exist | Medium | Needs stronger evidence contracts and no-invented-number guard |
| CommunicationAgent | `ai-service/app/agents/communication_agent.py` | Communication | Placeholder response that agent is not active | None | No | Low | Implement first real communication tools later |
| BaseDomainAgent | `ai-service/app/agents/base_domain_agent.py` | Abstract base | Common agent interface | None | No | High | Keep |
| ResponseComposer | `ai-service/app/agents/response_composer.py` | Response utility | Normalizes tool/read responses | ToolResult | No | High | Extend with Response Guard hooks later |

## Role Copilot Inventory

| Copilot | File path | Allowed role | Current responsibility | Tools | Business authority? | Gaps |
| --- | --- | --- | --- | --- | --- | --- |
| BaseRoleCopilot | `ai-service/app/agents/role_copilots/base_role_copilot.py` | Abstract | Builds role summaries/capabilities | Read tools only | No | Needs provider-assisted summarization later, guarded |
| EmployeeCopilot | `ai-service/app/agents/role_copilots/employee_copilot.py` | EMPLOYEE, plus personal workspace for elevated roles | Personal daily summary/status | Attendance, leave, document, telework, authorization read tools | No | Should stay read-only |
| ManagerCopilot | `ai-service/app/agents/role_copilots/manager_copilot.py` | MANAGER | Team summary/pending work | Legacy pending/team tools, team presence | No | Needs modern manager tools |
| RHCopilot | `ai-service/app/agents/role_copilots/rh_copilot.py` | RH | RH daily/workload/stats summary | Legacy RH stats/all requests plus supported tools | No | Needs modern RH analytics/tools |
| AdminCopilot | `ai-service/app/agents/role_copilots/admin_copilot.py` | ADMIN | System/admin summary | Admin read tools | No | Needs admin health and misconfiguration endpoint hardening |

## Tool and Security Readiness By Agent

### Stronger readiness

- AttendanceAgent: modern tools, confirmation on writes, endpoint mapping inspected.
- LeaveAgent: modern tools and risk planner exist.
- DocumentAgent: modern tools exist, though RH flows need detail handling.
- AdminAgent: modern tools exist, but exact one-role handling must be tested carefully.
- HRPolicyAgent: tenant-scoped approved local policy retrieval exists.

### Medium readiness

- TeleworkAgent and AuthorizationAgent: modern tools exist, but approval/refusal detail resolution must improve.
- InsightAgent: useful read-only foundation, but source evidence and confidence guard must mature.

### Low readiness

- CommunicationAgent: placeholder only.
- Legacy role agents: compatibility only.
- ManagerAgent/RHAgent: still partly legacy-backed.

## Security and Tenant Rules

All modern agents must follow these rules:

- Context comes from JWT/backend profile, not frontend payload.
- `CurrentUserContext` must carry `user_id`, role, tenant/company, token, locale, and permissions.
- ToolRegistry validates role and required permissions before tool execution.
- ToolExecutor enforces confirmation for write tools.
- Backend authorization remains final gate.
- No tool should accept tenant/user identity from LLM-generated input when backend can derive it.
- All write tools require confirmation and idempotency where supported.
- Policy answers require tenant-scoped approved sources and citations.

## Confirmation Requirements

| Domain | Reads | Writes | Confirmation required |
| --- | --- | --- | --- |
| Attendance | status/history/stats | check-in/check-out | Yes for check-in/check-out |
| Leave | balance/list/status | create/cancel/approve/reject | Yes |
| Documents | list/status/open | create/generate/reject/process/upload | Yes for mutations |
| Telework | list/status/quota | create/approve/reject/cancel | Yes |
| Authorizations | list/status/kpis | create/approve/reject/cancel | Yes |
| Admin | list/health | create user/update role/assign manager/RH | Yes |
| Policy | search/get/explain | none | No |
| Insights | reports | none | No |
| Communication | list/read | send/update/react if implemented | Yes for destructive/write actions where appropriate |

## Modernization Plan Per Agent

### RouterAgent

- Keep deterministic priority routing.
- Add provider router only for clarification/rewrite/summarization, not direct tool selection authority.
- Add route explainability metadata for debugging.
- Add tests for explicit domain list commands vs role summary commands.

### AttendanceAgent

- Keep current modern tools.
- Add response guard checks for status and timestamps.
- Add tests for all roles: EMPLOYEE, MANAGER, RH, ADMIN.
- Ensure team/company/global endpoints match backend role contracts.

### LeaveAgent

- Keep modern tools.
- Strengthen date/type/reason slot filling.
- Use leave planner only with real backend data.
- Add policy citations only when policy sources exist.

### DocumentAgent

- Keep modern tools.
- Add request detail resolution for open/status/RH processing.
- Ensure no raw storage path is returned.
- Improve document list summaries.

### TeleworkAgent

- Keep modern tools.
- Add manager/RH detail-before-confirmation flows.
- Add endpoint capability checks for unsupported operations.

### AuthorizationAgent

- Keep modern tools.
- Maintain verified endpoint mapping against `/api/v1/rh/autorisations` controller.
- Add detail-before-confirmation for manager/RH decisions.

### ManagerAgent

- Replace legacy approval tools with modern manager tools.
- Always fetch request details before approve/refuse confirmation.
- Resolve ambiguous request references with choices.

### RHAgent

- Replace legacy final validation/document processing with modern tools.
- Never accidentally create employee personal requests when RH intent is approval/processing.
- Add RH workload and analytics tools backed by real endpoints.

### AdminAgent

- Keep modern admin tools.
- Enforce one-role-only update semantics.
- Add capability matrix for endpoints not implemented.
- Add safe summary from real admin/read endpoints only.

### HRPolicyAgent

- Keep local policy retriever.
- Add ChromaDB later behind same `policy.*` tool contract.
- Add Response Guard to prevent policy answers without citations.

### InsightAgent

- Keep read-only behavior.
- Add evidence source references to every insight.
- Refuse invented numbers when endpoint unavailable.

### CommunicationAgent

- Implement from scratch using communication-service REST endpoints.
- Start with read-only tools: list channels, read messages, summarize existing messages through provider only after guard.
- Add send-message as confirmed write action later.

### Role Copilots

- Keep orchestration/read-only role.
- Do not let them execute writes directly.
- Use them for daily briefings, summaries, and capability discovery.

## Test Coverage Observed

The repository contains many AI tests under `ai-service/tests`, including:

- `test_context_builder.py`
- `test_tool_registry.py`
- `test_chat_v2.py`
- `test_attendance_agent.py`
- `test_leave_tools.py`
- `test_document_agent.py`
- `test_telework_authorization_agents.py`
- `test_admin_agent.py`
- `test_policy_agent.py`
- `test_insight_agent.py`
- `test_voice_v2.py`
- `test_response_localization.py`
- `test_routing_precision.py`

## Missing Tests To Add

- Provider router disabled/Ollama timeout/fallback tests.
- Response Guard hallucination rejection tests.
- Manager/RH approval detail-before-confirmation tests across all request types.
- CommunicationAgent tool tests.
- ChromaDB policy indexing and tenant isolation tests.
- Persistent confirmation replay/idempotency tests.
- Config drift test asserting `BACKEND_BASE_URL` is deployment-profile controlled.

## Delete-Later Candidates

Do not delete now. Delete only after modern equivalents are implemented and tests pass:

- `ai-service/agents/router.py`
- `ai-service/agents/employee_agent.py`
- `ai-service/agents/manager_agent.py`
- `ai-service/agents/rh_agent.py`
- `ai-service/agents/admin_agent.py`
- Legacy HRTools write flows that duplicate modern tools.

## Final Agent Direction

The modern architecture should remain agent + tool first. LLM/provider integration should augment the agents with language quality and summarization, not replace ToolRegistry authority. That is the safest path for HR SaaS.
