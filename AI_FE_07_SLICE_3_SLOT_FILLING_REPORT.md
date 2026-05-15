# AI-FE-07 — Slice 3: multi-turn slot-filling for organisation creates

Date: 2026-05-15
Branch: main
Parent: `9648fbf` — `feat(ai): route natural-language org-structure and meeting queries`

## 1. What this slice ships

Slice 2 wired `OrganisationAgent` to detect "creer equipe IA" but only completed the create in a single message when all required fields were present. Asking the user a follow-up question and then continuing on their reply needed the conversation-state slot-filling machinery — same machinery that already powers `leave.create` and `authorization.create`.

This slice extends `app/core/slot_filling.py` with two new flow configs and the supporting field-merge, missing-field, question, tool-input, confirmation-text, and domain-term entries for:

- `organisation.create_team` — collects `name`, `departement_id`. Final tool input: `{nom, departement_id, est_active}`.
- `organisation.create_department` — collects `name`, `code_interne`. Final tool input: `{nom, code_interne}`.

A two-turn flow now works end-to-end:
```
user: creer equipe IA
bot:  Pour quel departement (ID numerique)... ?       (intent=organisation.create_team, type=ask)
user: 3
bot:  Confirmez-vous la creation de l'equipe 'IA'...   (intent=organisation.create_team, type=confirm_action,
                                                        toolCalls=[organisation.create_team{nom=IA, departement_id=3, est_active=True}])
```

The reply `"3"` is plain text; the slot-filler merges it with the `name="IA"` already in the pending flow and builds the confirmation envelope without a second router round-trip.

## 2. Architecture: which extension path I took

Two ways to extend the slot-filling machinery:
- **Path A**: add `CREATE_TEAM` / `CREATE_DEPARTMENT` intents to `core/entity_extractor.py` so the shared extractor returns the right fields, then mostly re-use the existing merge flow.
- **Path B**: dispatch on `flow.intent` inside `_merge_flow_fields` and use the existing `organisation_agent` helpers (`_extract_named_target`, `_extract_int_after`, `_extract_code_interne`) directly.

I took Path B. `core/entity_extractor.py` is a big shared module returning date/time/leave-type fields; extending it with org concepts would mean either polluting its return shape with `nom`/`departement_id` for every caller, or adding intent-conditional branches deep inside it. The org agent already has correct, tested extractors. So `_merge_flow_fields` now checks the flow's `entity_intent` against a `_NO_ENTITY_INTENT` sentinel; org flows skip the shared extractor and route to `_merge_team_fields` / `_merge_department_fields`, both of which reuse the agent's helpers. No change to `core/entity_extractor.py`.

## 3. Two real bugs found while writing this slice

Both surfaced when running the wider regression suite, not from the new tests alone.

### 3.1 "rendez-vous medical" broke authorization slot-filling

`test_authorization_complete_followup_returns_confirmation` started failing. In Slice 2 I had added `"rdv"` / `"rendez-vous"` / `"rendez vous"` to `RouterAgent._explicit_domain`'s reunion branch and to `ReunionAgent`'s `_MEETING_TERMS`. But `"rendez-vous"` is also a legitimate **authorization reason** — `authorization_agent._infer_reason` explicitly matches it. So a user mid-flow on an authorization request who replies `"rendez-vous medical"` would now route to the reunion agent (because `_explicit_domain` matched) instead of completing the authorization slot-fill.

Fix: removed `"rdv"` / `"rendez-vous"` / `"rendez vous"` from `RouterAgent._explicit_domain` reunion branch. Restricted that branch to unambiguous meeting vocabulary (`reunion`, `meeting`, `planning`, `agenda`, plus Arabic). Comment in code calls this out so the next person doesn't add it back. Same trim applied to the reunion escape group inside `_ESCAPE_PATTERNS`.

### 3.2 `_MY_CUES` substring-matched "j'ai"

`ReunionAgent._MY_CUES` contained a bare `"i"`. Substring matching on `_normalize("j'ai rdv medical demain")` would find `"i"` inside `"j'ai"` and treat the message as a meeting query.

Fix: dropped bare `"i"` from `_MY_CUES`. Kept `"my"`, `"i have"`, `"do i"` which are unambiguous.

Both fixes have visible regression coverage now: the existing `test_authorization_complete_followup_returns_confirmation` re-passes, and the wider sweep is clean.

## 4. Cross-domain escape behaviour

When a user is mid-flow on an org create and pivots to an unrelated query, the flow now correctly aborts. New test `test_create_team_escapes_when_user_pivots_to_meeting_query` exercises: `"creer equipe IA"` → `"mes reunions"` → flow is cleared and routed to `reunion`.

When a user is mid-flow and provides a domain-on-topic clarification, the flow continues. New test `test_create_team_stays_alive_when_user_clarifies_department_naturally` covers `"creer equipe IA"` → `"departement 5"` → confirmation. The `_FLOW_DOMAIN_TERMS` map now includes `("equipe", "team", "departement", "department", "dept")` for `organisation.create_team` and `("departement", "department", "dept", "code")` for `organisation.create_department`.

## 5. Safety properties

- **Confirmation gate still required.** `test_pending_flow_never_hits_backend_post` proves that even after slot-filling completes, the backend POST does NOT happen — the response is a `confirm_action` envelope. The actual write happens later via `WorkflowOrchestrator.confirm_action(...)` when the user accepts. Verified by inspecting `FakeBackendClient.calls` after three complete slot-fill flows.
- **Cancel works.** `"annuler"` mid-flow yields `intent=organisation.create_team.cancelled`, flow cleared.
- **Confidence floor unchanged.** RouterAgent still requires ≥0.55 confidence to pick an agent in the ranking step; `OrganisationAgent.can_handle` returns 0.0 for unrelated messages.
- **No new env vars, no new dependencies, no DB migration, no Spring change, no frontend change.**

## 6. Files changed

```
ai-service/app/agents/router_agent.py          (-1 / +3 lines, trim reunion explicit-domain terms)
ai-service/app/agents/reunion_agent.py         (-3 / +5 lines, drop bare "i" from _MY_CUES)
ai-service/app/core/slot_filling.py            (+115 lines: org flow entries, merge, missing, question, input, confirm, escape)
ai-service/tests/test_organisation_slot_filling.py  (new, 8 tests)
AI_FE_07_SLICE_3_SLOT_FILLING_REPORT.md        (this file)
```

## 7. Validation

### New tests (8 / 8 pass)
```
$ python -m pytest tests/test_organisation_slot_filling.py -v
============================== 8 passed in 0.37s ==============================
```

### Wide regression sweep (142 / 142 pass)
```
$ python -m pytest tests/test_slot_filling_flows.py tests/test_intent_routing_priority.py \
                   tests/test_organisation_agent_routing.py tests/test_reunion_agent_routing.py \
                   tests/test_organisation_slot_filling.py tests/test_organisation_structure_tools.py \
                   tests/test_reunion_tools.py tests/test_attendance_agent.py tests/test_leave_agent.py \
                   tests/test_authorization_agent.py tests/test_document_agent.py tests/test_admin_agent.py \
                   tests/test_routing_precision.py tests/test_role_action_routing.py \
                   tests/test_tool_registry.py tests/test_tool_registry_authority.py \
                   tests/test_response_guard.py tests/test_chat_v2.py
======================= 142 passed, 5 warnings in 5.53s =======================
```

### Smoke
```
$ python -c "import main; print('main imports ok')"
main imports ok
```

## 8. Next session

Slice 3 is the last natural-language-routing piece needed for the two unblocked tool categories (`organisation.*` and `reunion.*`). The remaining AI-FE-07 items all depend on backend prereqs:

- `organisation.assign_employee` tool — needs `POST /api/v1/users/{id}/affectations` (analysis report §11 B3).
- `admin.tenant_diagnostics` tool — needs `GET /api/v1/admin/diagnostics/tenant/{id}` (analysis report §11 B4).
- Live Playwright validation — needs dev server running.

These are not single-session deliverables.
