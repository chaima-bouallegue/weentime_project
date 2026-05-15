# AI-FE-07 — Slice 2: natural-language routing for organisation + reunion tools

Date: 2026-05-15
Branch: main
Parent slice: `13ac286` — `feat(ai): build role based intelligent chatbot agents`

## 1. What this slice ships

Slice 1 registered seven new ToolRegistry entries (`organisation.list_teams`, `list_departments`, `create_team`, `create_department`, `reunion.list_mine`, `reunion.next`, `reunion.get_detail`) but left them only callable via `ToolExecutor.execute(...)`. The chatbot itself could not yet *understand* "créer équipe IA dans département 3" or "ma prochaine réunion" — those phrases would either fall through to `LegacyAgent` or to `fallback.unknown`.

This slice wires the natural-language path:

- New `OrganisationAgent` (`name="organisation"`) routes FR/EN/AR/TN intents for **list teams**, **list departments**, **create team**, **create department**. Reads execute immediately; creates return a single-message confirmation envelope when all required fields are present and an `ask` response naming the missing field otherwise.
- New `ReunionAgent` (`name="reunion"`) routes FR/EN/AR/TN intents for **mes réunions / my meetings**, **ma prochaine réunion / my next meeting**, and planning-style queries like "c quoi mon planning aujourd'hui". Read-only, available to every business role.
- `RouterAgent._explicit_domain` extended to recognise `"organisation"` and `"reunion"` keywords + verbs, so domain queries short-circuit the confidence-ranking step (matching the existing pattern for `document`, `leave`, `telework`, `authorization`).
- Both agents wired into `extra_agents` in `copilot_engine.py` and stored on `state` for re-use across requests.

## 2. Scope ruthlessly cut from this slice

- **Multi-turn slot-filling for org creates.** `app/core/slot_filling.py::FLOW_CONFIG` only tracks `leave.create` and `authorization.create`. Extending it requires new entity-extractor intents (`CREATE_TEAM`, `CREATE_DEPARTMENT`) and field-merge rules — a meaningful change to the conversation-state surface. For now, "creer équipe IA" responds with "Pour quel département (ID) ?" and the user must re-issue the full request. Adding slot-filling is a self-contained Slice 3.
- **Bare-UUID detail lookup.** `reunion.get_detail` is registered as a tool but `ReunionAgent` does not auto-route a stray UUID to it — too many false positives on random hex strings. Detail can be reached via direct tool execution; agent wiring deferred.
- **Frontend quick-prompt buttons.** The chatbot widget's `quickActions` (per `AI_FE_05`) does not yet expose "Mes réunions" or "Créer équipe" buttons. The routing accepts these phrases now; the UI surface is a separate, non-blocking change.

## 3. Files changed

```
ai-service/app/agents/organisation_agent.py             (new, 285 lines)
ai-service/app/agents/reunion_agent.py                  (new, 152 lines)
ai-service/app/agents/router_agent.py                   (+14 lines in _explicit_domain)
ai-service/app/core/copilot_engine.py                   (+8 lines: 2 imports + 2 instances + 2 extra_agents + 2 state-stash)
ai-service/tests/test_organisation_agent_routing.py     (new, 21 tests)
ai-service/tests/test_reunion_agent_routing.py          (new, 16 tests)
AI_FE_07_SLICE_2_ROUTING_REPORT.md                      (this file)
```

No backend Spring code changed. No DB migration. No new env vars. No new dependencies.

## 4. Multilingual coverage (with proof)

Each row below is a parametrized test case in `tests/test_organisation_agent_routing.py::test_intent_detection_multilingual` and `tests/test_reunion_agent_routing.py::test_intent_detection_multilingual` — they all pass at `confidence >= 0.7`.

### Organisation

| Language | Phrase | Detected intent |
|---|---|---|
| FR | `liste les equipes` | `organisation.list_teams` |
| FR | `voir les departements` | `organisation.list_departments` |
| FR | `creer equipe IA dans departement 3` | `organisation.create_team` |
| FR | `creer departement Recherche` | `organisation.create_department` (asks for code) |
| EN | `show all teams` | `organisation.list_teams` |
| EN | `list departments` | `organisation.list_departments` |
| EN | `create team frontend in department 4` | `organisation.create_team` |
| EN | `create department Engineering` | `organisation.create_department` |
| TN | `nheb naamel equipe jdida fi departement 3` | `organisation.create_team` |
| AR | `أنشئ فريق IA` | `organisation.create_team` |
| topic-only | `equipes` / `departments` | list intent |

### Reunion

| Language | Phrase | Detected intent |
|---|---|---|
| FR | `ma prochaine reunion` | `reunion.next` |
| FR | `c quoi mon prochaine reunion` | `reunion.next` |
| FR | `c quoi mon planning aujourd hui` | `reunion.list_mine` |
| FR | `mes reunions` | `reunion.list_mine` |
| EN | `what is my next meeting` | `reunion.next` |
| EN | `when is my upcoming meeting` | `reunion.next` |
| EN | `my meetings` / `meetings` | `reunion.list_mine` |
| EN | `what is my schedule today` | `reunion.list_mine` |

### One non-obvious Unicode lesson

`unicodedata.normalize("NFKD", text)` followed by stripping combining marks decomposes Arabic hamza-bearing characters and removes the hamza, e.g. `أ` → `ا`, `ئ` → `ي`. A naïve membership check on the post-normalization string therefore misses tokens like `"أنشئ"` if you only stored their original spelling. The agent now checks Arabic patterns against the **raw lowercased** message in parallel with the normalized form — `_CREATE_VERBS_RAW`, `_TEAM_TERMS_RAW`, etc. The Latin patterns continue to check the normalized form (which is the right call for accents like `é`/`è`).

## 5. Safety properties (still intact)

- **ToolRegistry is authoritative.** New agents are routing-only — they call `executor.execute(...)` which still runs the role check, the confirmation gate (for writes), and the deterministic fallback wrapper. The agents themselves declare no role gates; that's correct.
- **No invented data.** When the user asks "show teams" but the backend returns an empty list, the agent surfaces the tool's `read_result.summary` ("Aucune equipe trouvee.") — no fabrication.
- **No write before confirmation.** `test_create_team_with_department_returns_confirmation` asserts that even though the agent has all required fields, the backend POST is NOT executed; the response is a `confirm_action` envelope. The actual write happens later via `WorkflowOrchestrator.confirm_action(...)` when the user accepts the confirmation.
- **Reunion 404 is a safe-empty answer, not an error.** `reunion.next` returning HTTP 404 means "no upcoming meeting" — `test_next_meeting_404_is_safe_empty_answer_not_error` proves the agent surfaces this as a normal `type=answer` with the "Aucune reunion a venir" string instead of bubbling up an error/fallback.
- **No router regression.** All sibling-agent suites pass unchanged: `test_attendance_agent`, `test_leave_agent`, `test_authorization_agent`, `test_document_agent`, `test_communication_agent`, `test_admin_agent`, `test_telework_authorization_agents`, `test_slot_filling_flows` — 56 passing, plus `test_intent_routing_priority`, `test_role_action_routing`, `test_routing_precision`, `test_role_routing` — 22 more.

## 6. Router priority — where these slot in

Matches the order documented in `AI_FE_05_CHATBOT_ROLE_CAPABILITIES_FIX_REPORT.md` §4 / `router_agent.py:handle`:

1. Deterministic greeting → `system.greeting` (unchanged).
2. Role-action (manager/RH approve/reject verbs) → `manager_agent` / `rh_agent` (unchanged).
3. **Explicit domain** — now recognises `"organisation"` (team/department + create-or-list verb) and `"reunion"` (any meeting/planning term). These short-circuit the rest of the pipeline when matched.
4. Multilingual `match_intent` shortcut for CHECK_IN/CHECK_OUT/GET_STATUS → `attendance_agent` (unchanged).
5. Confidence-based max over `attendance_agent + extra_agents` (now includes `organisation_agent`, `reunion_agent`).
6. `LegacyAgent` fallback (unchanged).

Because OrganisationAgent and ReunionAgent both implement `can_handle` returning `0.0` for unrelated messages, they cannot accidentally win step 5 for "show my leave balance" or "did I check in" — these still go to LeaveAgent and AttendanceAgent respectively. Three negative-case tests pin this behaviour.

## 7. Validation results

### New tests (37 / 37 pass)
```
$ python -m pytest tests/test_organisation_agent_routing.py tests/test_reunion_agent_routing.py -v
collected 37 items
============================= 37 passed in 0.28s ==============================
```

### Routing + registry + guard regression (69 / 69 pass)
```
$ python -m pytest tests/test_intent_routing_priority.py tests/test_role_action_routing.py \
                   tests/test_routing_precision.py tests/test_role_routing.py \
                   tests/test_tool_registry.py tests/test_tool_registry_authority.py \
                   tests/test_response_guard.py tests/test_chat_v2.py \
                   tests/test_organisation_structure_tools.py tests/test_reunion_tools.py
======================= 69 passed, 5 warnings in 6.13s ========================
```

### Sibling-agent regression (56 / 56 pass)
```
$ python -m pytest tests/test_attendance_agent.py tests/test_leave_agent.py \
                   tests/test_authorization_agent.py tests/test_document_agent.py \
                   tests/test_communication_agent.py tests/test_admin_agent.py \
                   tests/test_telework_authorization_agents.py tests/test_slot_filling_flows.py
======================= 56 passed, 4 warnings in 3.47s ========================
```

### Smoke import
```
$ python -c "import main; print('main imports ok')"
main imports ok
```

### What I did NOT run
- Full `python -m pytest tests -q` — same baseline-noise reasoning as Slice 1. The targeted sweeps above are tighter and more diagnostic than a full run on a noisy suite.
- `npx tsc --noEmit -p tsconfig.app.json` / `npm run build` — no frontend files changed.
- Live Playwright — no dev server running (same blocker as Slice 1 and `AI_FE_05`).

## 8. Recommended next session (AI-FE-07 Slice 3)

1. **Multi-turn slot-filling for org creates.** Extend `app/core/slot_filling.py::FLOW_CONFIG` with `organisation.create_team` and `organisation.create_department` entries. Define entity-extractor intents `CREATE_TEAM` / `CREATE_DEPARTMENT` in `core/entity_extractor.py` that pull `nom`, `departement_id`, `code_interne`. Add `FIELD_LABELS` entries. Three additional integration tests proving "creer equipe IA" → "Pour quel departement ?" → "3" → confirmation.
2. **Frontend quick-prompts.** Add "Mes réunions" and "Ma prochaine réunion" to the EMPLOYEE/MANAGER quick-action lists in `chat-widget.component.ts:quickActions`; add "Lister équipes" / "Créer équipe" to the RH/ADMIN lists.
3. **Backend prerequisites for the deferred tools** (no AI work yet):
   - `POST /api/v1/users/{id}/affectations` for `organisation.assign_employee` (analysis report §11 B3).
   - `GET /api/v1/admin/diagnostics/tenant/{id}` for `admin.tenant_diagnostics` (analysis report §11 B4).

## 9. Files staged

```
new file:   AI_FE_07_SLICE_2_ROUTING_REPORT.md
new file:   ai-service/app/agents/organisation_agent.py
new file:   ai-service/app/agents/reunion_agent.py
modified:   ai-service/app/agents/router_agent.py
modified:   ai-service/app/core/copilot_engine.py
new file:   ai-service/tests/test_organisation_agent_routing.py
new file:   ai-service/tests/test_reunion_agent_routing.py
```

Pre-existing untracked files (`.playwright-mcp/`, `fix_auth.py`, `fe-ai-06-admin-*.png`, the `.lnk` file, `weentime-frontend/.../test-results/`) and the pre-existing modification of `ai-service/evals/reports/local_eval_report.json` are NOT part of this PR.

## 10. Commit hash

See trailing `git log --oneline` in the staging output.
