# AI-07 STT Multilingual Routing Report

## Files Changed
- `config.py`
- `voice/stt.py`
- `tests/test_stt_multilingual.py`
- `tests/test_stt_multilingual_chatbot.py`
- `tests/test_audio_pipeline.py`
- `tests/test_voice_v2.py`
- `AI_07_STT_MULTILINGUAL_REPORT.md`

## Root Cause
The text chatbot routing for FR/EN/AR/TN was already stable after AI-03 through AI-06, but the voice pipeline still needed explicit regression protection around STT transcript handling:
- valid short HR voice commands could be rejected before Whisper only because duration was below the normal minimum threshold;
- STT transcript examples were not all covered through the same chatbot routing path used by `/v2/voice`;
- STT unavailable behavior needed a direct v2 voice contract test to ensure no copilot/tool routing runs after transcription failure;
- uncertain language resolution needed a safe default.

## STT Pipeline Strategy
- Kept the normal `VOICE_MIN_DURATION_SECONDS=1.5` default intact.
- Added `VOICE_SHORT_COMMAND_MIN_DURATION_SECONDS=0.45` as a lower absolute floor for short but voiced HR commands.
- Short audio under the normal threshold can now continue to Whisper only when:
  - it is above the short-command floor;
  - it has meaningful volume/peak signal;
  - either VAD detects speech or the signal is strong enough to avoid treating VAD as authoritative for short commands.
- Silent or tiny audio still returns controlled `no_input` errors.

## Multilingual Routing Behavior
The tests now verify that STT-like transcripts route through the same chatbot pipeline for:
- FR leave and pointage status.
- EN leave and pointage status.
- AR leave and pointage status.
- TN leave, pointage actions, pointage status, meeting reads, and manager team presence.

## Language Handling
- Existing language detection remains the routing source for transcript text.
- Tunisian Franco-Arabic transcripts are still resolved as `tn` based on transcript markers even if Whisper reports `fr`.
- Unknown/low-information language falls back safely to `fr`.

## Clean Error Behavior
- `/v2/voice` now has regression coverage for `stt_unavailable`.
- When STT is unavailable, the endpoint returns a clean error envelope and does not call copilot routing or ToolRegistry.

## Security Guarantees Preserved
- Public chatbot context was not changed.
- Role agents were not changed.
- ToolRegistry remains authoritative.
- Confirmation flow is unchanged.
- No Ollama/provider changes were made.
- No backend data is fabricated.

## Tests Added or Updated
- `tests/test_audio_pipeline.py`
  - valid short HR command audio can continue to STT.
- `tests/test_stt_multilingual.py`
  - uncertain language falls back safely.
- `tests/test_stt_multilingual_chatbot.py`
  - FR/EN/AR/TN voice transcripts route to chatbot intents without fallback.
- `tests/test_voice_v2.py`
  - STT unavailable returns a clean envelope and skips copilot routing.

## Validation Results
- `python -c "import main; print('ok')"`: passed.
  - Existing optional router warning remains for `app.api.document_generation`.
- `python -m pytest tests/test_stt_multilingual.py tests/test_stt_multilingual_chatbot.py tests/test_audio_pipeline.py tests/test_voice_v2.py -v`: 39 passed, 1 warning.
- `python -m pytest tests/test_multilingual_chatbot_routing.py tests/test_pointage_intents.py tests/test_chat_v2.py -v`: 45 passed, 1 warning.
- `git diff --check`: passed with CRLF normalization warnings only.

## Remaining Limitations
- STT model quality still depends on local faster-whisper model availability and microphone/browser recording quality.
- Arabic/Tunisian speech recognition accuracy is constrained by the local Whisper model; this task stabilizes transcript routing, not acoustic model training.
- `nheb npointi` continues to follow the existing attendance action semantics from prior agent work.
- TTS behavior is not changed in AI-07; it remains for AI-08.

## Exact Files Staged
- `ai-service/config.py`
- `ai-service/voice/stt.py`
- `ai-service/tests/test_stt_multilingual.py`
- `ai-service/tests/test_stt_multilingual_chatbot.py`
- `ai-service/tests/test_audio_pipeline.py`
- `ai-service/tests/test_voice_v2.py`
- `ai-service/AI_07_STT_MULTILINGUAL_REPORT.md`

## Commit Hash
- Generated after commit; see final task response and `git log --oneline -3` output.