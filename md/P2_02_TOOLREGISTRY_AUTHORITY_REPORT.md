# P2-02 ToolRegistry Authority Report

Date: 2026-05-13
Project: WeenTime AI service
Scope: Modern v2 ToolRegistry authority audit and enforcement

## Files changed

- `ai-service/app/models/tool_models.py`
- `ai-service/app/context/current_user.py`
- `ai-service/app/tools/registry.py`
- `ai-service/app/agents/role_copilots/base_role_copilot.py`
- `ai-service/tests/test_tool_registry.py`
- `ai-service/tests/test_tool_registry_authority.py`
- `ai-service/tests/test_admin_tools.py`
- `ai-service/tests/test_authorization_tools.py`
- `ai-service/tests/test_document_tools.py`
- `ai-service/tests/test_insight_tools.py`
- `ai-service/tests/test_leave_tools.py`
- `ai-service/tests/test_telework_tools.py`
- `P2_02_TOOLREGISTRY_AUTHORITY_REPORT.md`

## Tool inventory summary

The modern v2 registry was instantiated with:

- attendance tools
- leave tools
- document tools
- telework tools
- authorization tools
- admin tools
- policy tools
- legacy HR adapter tools
- insight tools

Inventory result:

| Domain | Read tools | Write tools | Notes |
| --- | ---: | ---: | --- |
| attendance | 4 | 2 | Personal status/history/stats/team views; check-in/check-out are writes |
| leave | 3 | 1 | Balance/list/status plus create leave |
| document | 3 | 3 | List/status/open plus create/RH generate/RH reject |
| telework | 2 | 3 | List/status plus create/manager decision/RH decision |
| authorization | 2 | 3 | List/status plus create/manager decision/RH decision |
| admin | 4 | 4 | Users, enterprises, misconfig, health plus admin mutations |
| policy | 3 | 0 | Tenant-approved policy search/source/explain only |
| insights | 4 | 0 | Read-only role insight reports |
| legacy adapter | 7 | 7 | Compatibility-only HRTools bridge; still constrained by ToolRegistry |

Total registered tools audited: `55`

- Reads: `32`
- Writes: `23`

## Write tools requiring confirmation

All registered write tools require confirmation and idempotency policy.

| Tool | Roles | Confirmation | Idempotency |
| --- | --- | --- | --- |
| `check_in` | ADMIN, EMPLOYEE, MANAGER, RH | yes | required |
| `check_out` | ADMIN, EMPLOYEE, MANAGER, RH | yes | required |
| `leave.create_request` | EMPLOYEE | yes | required |
| `document.create_request` | EMPLOYEE | yes | required |
| `document.rh_generate` | RH | yes | required |
| `document.rh_reject` | RH | yes | required |
| `telework.create_request` | EMPLOYEE | yes | required |
| `telework.manager_decide` | MANAGER | yes | required |
| `telework.rh_decide` | RH | yes | required |
| `authorization.create_request` | EMPLOYEE | yes | required |
| `authorization.manager_decide` | MANAGER | yes | required |
| `authorization.rh_decide` | RH | yes | required |
| `admin.create_user` | ADMIN | yes | required |
| `admin.update_user_role` | ADMIN | yes | required |
| `admin.assign_manager` | ADMIN | yes | required |
| `admin.assign_rh_owner` | ADMIN | yes | required |
| `legacy.create_leave_request` | EMPLOYEE | yes | required |
| `legacy.request_document` | EMPLOYEE | yes | required |
| `legacy.create_telework` | EMPLOYEE | yes | required |
| `legacy.create_authorization` | EMPLOYEE | yes | required |
| `legacy.approve_request` | MANAGER | yes | required |
| `legacy.reject_request` | MANAGER | yes | required |
| `legacy.process_request` | RH | yes | required |

## Enforcement implemented

`ToolRegistry.register()` now validates every tool definition before it can enter the registry:

- tool name is required.
- `allowed_roles` is required.
- allowed roles must be one of `ADMIN`, `RH`, `MANAGER`, `EMPLOYEE`.
- duplicate tool names are rejected.
- write tools must set `requires_confirmation=True`.
- write tools must set `idempotency_required=True` or explicitly mark `idempotency_safe_exception=True`.

`ToolRegistry.validate_access()` now validates runtime authority before handler execution:

- missing or invalid user id is denied.
- invalid role is denied.
- explicitly unverified context is denied.
- tenant-scoped non-admin tools require tenant context.
- role mismatch returns stable `role_not_allowed`.
- missing permission returns stable `permission_denied`.

`ToolExecutor` already stops confirmed writes before handler execution when confirmation is absent. P2-02 tests verify this remains true.

## Role enforcement summary

Stable role boundaries validated:

- EMPLOYEE cannot execute manager validation tools.
- EMPLOYEE cannot execute RH/admin tools.
- MANAGER cannot execute RH tools.
- MANAGER cannot execute admin tools.
- RH cannot execute admin tools.
- ADMIN tools remain admin-scoped.
- Personal read tools continue to execute for allowed roles.

Backend remains final authorization gate because all concrete backend tools still forward the verified context token through `BackendClient`.

## Tenant and identity source

Runtime caller identity is taken from `CurrentUserContext`, which is created by the verified ContextBuilder from P2-01.

- `CurrentUserContext.is_verified` returns false when `metadata.jwt_verified` is explicitly false.
- test/dev contexts with a token remain compatible for direct unit tests.
- tenant-scoped non-admin tools deny missing tenant with `missing_tenant`.
- admin may remain tenantless when the business flow allows platform-level admin access.

Tools that accept IDs, roles, or company-like values do so as business target fields, not as caller authority. Caller user, caller role, caller tenant, and caller permissions remain context-owned and must not be taken from prompt text or frontend payload.

## Idempotency findings

All current write tools already had idempotency policy through `idempotency_required=True`.

P2-02 adds central registration-time enforcement so future write tools cannot be registered unless they either:

- require idempotency, or
- explicitly declare a safe exception with `idempotency_safe_exception=True`.

No current tool required a safe exception.

## Denial codes added or used

Stable denial codes now used by the modern v2 tool path:

- `unverified_context`
- `missing_user`
- `missing_tenant`
- `invalid_role`
- `role_not_allowed`
- `permission_denied`
- `confirmation_required`
- `idempotency_required` as registration-time contract enforcement

Updated old `forbidden_role` expectations to `role_not_allowed` in modern tool tests and role-copilot fallback summarization.

## Tests added or updated

Added:

- `ai-service/tests/test_tool_registry_authority.py`

Updated:

- `ai-service/tests/test_tool_registry.py`
- `ai-service/tests/test_admin_tools.py`
- `ai-service/tests/test_authorization_tools.py`
- `ai-service/tests/test_document_tools.py`
- `ai-service/tests/test_insight_tools.py`
- `ai-service/tests/test_leave_tools.py`
- `ai-service/tests/test_telework_tools.py`

Coverage added:

- every write tool has confirmation and idempotency policy.
- every tool uses valid roles.
- write tool without confirmation is rejected at registration.
- write tool without idempotency policy is rejected at registration.
- unverified context is denied.
- missing user is denied.
- missing tenant is denied for tenant-scoped non-admin tools.
- invalid role is denied.
- employee/manager/RH/admin role hierarchy denials are stable.
- confirmation-required write does not execute handler directly.
- context token and request metadata reach the handler.
- existing allowed read tool still executes.

## Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: `ok`

```powershell
python -m pytest tests/test_tool_registry.py tests/test_attendance_permissions.py tests/test_admin_tools.py -v
```

Result: `16 passed`

```powershell
python -m pytest tests/test_tool_registry_authority.py -v
```

Result: `12 passed`

```powershell
python -m pytest tests/test_tool_registry.py tests/test_attendance_permissions.py tests/test_admin_tools.py tests/test_tool_registry_authority.py -v
```

Result: `28 passed`

Additional focused validation because related role-denial assertions were updated:

```powershell
python -m pytest tests/test_authorization_tools.py tests/test_document_tools.py tests/test_insight_tools.py tests/test_leave_tools.py tests/test_telework_tools.py -v
```

Result: `39 passed`

Warnings observed:

- `pytest_asyncio` warns that `asyncio_default_fixture_loop_scope` is unset. This is unrelated to P2-02.

## Remaining risks

- Legacy HRTools still exists behind `legacy.*` adapter tools. It remains compatibility-only and must not receive new authority-sensitive features.
- `CurrentUserContext.is_verified` permits direct unit-test contexts with a token when no explicit `jwt_verified=False` flag is present. Runtime v2 context is still expected to come from P2-01 verified ContextBuilder.
- Tool input models still contain business target identifiers such as request IDs, managed user IDs, target roles, or target enterprise IDs for admin/approval workflows. These must remain clearly separated from caller identity in prompts and UI.
- Future provider/LLM integration must not bypass ToolRegistry. Provider output should only clarify, summarize, reformulate, or draft.

## Exact files staged for P2-02

Planned staged files:

- `ai-service/app/models/tool_models.py`
- `ai-service/app/context/current_user.py`
- `ai-service/app/tools/registry.py`
- `ai-service/app/agents/role_copilots/base_role_copilot.py`
- `ai-service/tests/test_tool_registry.py`
- `ai-service/tests/test_tool_registry_authority.py`
- `ai-service/tests/test_admin_tools.py`
- `ai-service/tests/test_authorization_tools.py`
- `ai-service/tests/test_document_tools.py`
- `ai-service/tests/test_insight_tools.py`
- `ai-service/tests/test_leave_tools.py`
- `ai-service/tests/test_telework_tools.py`
- `P2_02_TOOLREGISTRY_AUTHORITY_REPORT.md`

## Commit

Commit message:

```text
test(ai): enforce tool registry authority
```

Commit hash: recorded after commit in the final task response.
