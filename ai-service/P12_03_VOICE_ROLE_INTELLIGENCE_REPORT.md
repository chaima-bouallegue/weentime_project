# P12-03 Voice Role Intelligence Report

## 1. MCP tools used

- filesystem MCP: inspected P12-01/P12-02 and P10 role-intelligence reports, voice API, Role Intelligence builders, role copilots, response localization, and TTS/voice contract tests.
- context7 MCP: checked enterprise assistant orchestration and human-in-the-loop approval patterns from Microsoft Agent Framework docs.
- context7 MCP: checked assistant response metadata/concise summary patterns from AI SDK docs.
- redis/postgres/docker/playwright MCPs were not needed.

## 2. Files changed

- `app/api/voice_v2.py`
- `app/voice/__init__.py`
- `app/voice/voice_role_router.py`
- `app/voice/voice_summary_builder.py`
- `app/voice/voice_response_optimizer.py`
- `tests/test_voice_role_router.py`
- `tests/test_voice_role_intelligence.py`
- `tests/test_voice_summary_builder.py`
- `tests/test_voice_localization.py`
- `P12_03_VOICE_ROLE_INTELLIGENCE_REPORT.md`

## 3. Voice architecture

P12-03 adds a small voice-specific presentation layer on top of the existing deterministic Role Intelligence system:

`/v2/voice -> STT -> language resolution -> confirmation handling -> VoiceRoleRouter -> RoleIntelligenceService -> VoiceSummaryBuilder -> ResponseGuard -> optional TTS`

The new layer does not own business data, does not execute write tools, and does not replace Role Intelligence. It only detects spoken briefing intents and converts existing role-intelligence digests into concise spoken responses.

New components:

- `VoiceRoleRouter`: detects voice briefing prompts and invokes `RoleIntelligenceService` with verified context.
- `VoiceSummaryBuilder`: converts authoritative role digest data into short spoken summaries.
- `optimize_voice_response`: shortens role digests and long text for TTS while preserving confirmation responses unchanged.

## 4. Role routing strategy

Voice briefing routing uses only verified `CurrentUserContext.role`.

Supported examples:

- EMPLOYEE: `what should I do today?`, `que dois-je faire`, `quoi faire aujourd'hui`.
- MANAGER: `give me today's summary`, daily/briefing prompts with MANAGER context.
- RH: `what requires attention?`, `backlog RH`, `validations RH`.
- ADMIN: `system health`, `sante systeme`, `diagnostic systeme`.

The prompt never grants role access. For example, a MANAGER saying `I am admin` still receives a manager briefing.

Write/action prompts such as `nheb conge ghodwa` are deliberately not handled by `VoiceRoleRouter`; they continue through normal domain agents and confirmation flow.

## 5. Localization behavior

Spoken summaries are localized from context language:

- `fr`: French summary.
- `en`: English summary.
- `ar`: Arabic text summary.
- `tn`: Tunisian-friendly/simple Franco-Tunisian summary.

The implementation is deterministic and template-based. It does not invent data while translating; it only formats digest priorities, reminders, sections, and warnings already present in the Role Intelligence action result.

## 6. TTS optimization

Voice responses are optimized before final payload creation:

- Role digests become concise spoken summaries.
- Long non-confirmation text is trimmed to a safe spoken length.
- Confirmation responses are not modified, preserving confirmation IDs and summaries.
- Action result metadata records voice optimization details under `actionResult.voice` for role digests and long-text trimming.

This avoids dumping long role-intelligence payloads or technical details into TTS.

## 7. Confirmation guarantees

- Voice role intelligence is read-only.
- No autonomous approvals or mutations were added.
- Confirmation responses are preserved unchanged by the optimizer.
- ToolRegistry remains the only authority for business tools.
- ResponseGuard still validates final voice responses.
- Backend authorization remains the final gate for read-tool data.

## 8. Tests

Added:

- `tests/test_voice_role_router.py`
  - employee, manager, RH, admin voice briefings
  - verified role enforcement
  - prompt role claim ignored
  - unsupported role safe
  - write intent not stolen
  - unverified context rejected without tool calls

- `tests/test_voice_role_intelligence.py`
  - `/v2/voice` routes role briefing requests to role intelligence
  - employee/manager/RH/admin voice digests
  - generic copilot path bypassed for voice role briefing
  - no confirmation required for read-only summaries

- `tests/test_voice_summary_builder.py`
  - concise spoken summary generation
  - FR/EN/AR/TN formatting
  - long summary shortening
  - confirmation preservation

- `tests/test_voice_localization.py`
  - voice briefing localization for FR/EN/AR/TN

## 9. Validation

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed, printed `ok`.

```powershell
python -m pytest tests/test_voice_role_router.py tests/test_voice_role_intelligence.py tests/test_voice_summary_builder.py -v
```

Result: 17 passed, 5 warnings.

```powershell
python -m pytest tests/test_voice_localization.py tests/test_voice_v2.py tests/test_voice_contract.py -v
```

Result: 14 passed, 1 warning.

```powershell
python -m pytest tests/test_role_intelligence.py tests/test_response_guard.py tests/test_chat_v2.py -v
```

Result: 24 passed, 5 warnings.

Known warnings are existing dependency/deprecation warnings and the expected optional-router warning for `app.api.document_generation`.

## 10. Limitations

- Voice role intelligence currently summarizes digest priorities and reminders; it does not add new read tools beyond Role Intelligence.
- Spoken summaries are deterministic templates, not LLM-generated prose.
- Arabic/Tunisian output is intentionally simple and conservative.
- No frontend display changes were made for `actionResult.voice` metadata.
- No real microphone/TTS manual validation was performed in this task.

## 11. Staged files

Planned P12-03 staging set:

- `ai-service/app/api/voice_v2.py`
- `ai-service/app/voice/__init__.py`
- `ai-service/app/voice/voice_role_router.py`
- `ai-service/app/voice/voice_summary_builder.py`
- `ai-service/app/voice/voice_response_optimizer.py`
- `ai-service/tests/test_voice_role_router.py`
- `ai-service/tests/test_voice_role_intelligence.py`
- `ai-service/tests/test_voice_summary_builder.py`
- `ai-service/tests/test_voice_localization.py`
- `ai-service/P12_03_VOICE_ROLE_INTELLIGENCE_REPORT.md`

## 12. Commit hash

The commit hash is recorded in the final task response after creating the clean P12-03 commit.
