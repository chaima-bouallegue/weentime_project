# AI-08 — Multilingual TTS Fallback Stabilization Report

## Files Changed

- `config.py`
- `voice/tts.py`
- `voice/tts_service.py`
- `app/api/voice_v2.py`
- `app/voice_pipeline/voice_request_processor.py`
- `tests/test_tts_chatbot.py`
- `tests/test_voice_v2.py`

## Root Cause

The voice response envelope already exposed `audioStatus`, `audioUrl`, and `ttsUnavailable`, but TTS generation was still a single-shot path. A Coqui runtime failure, audio write failure, or raised `VoiceRequestProcessor.generate_tts` could still escape the TTS layer and risk failing the whole `/v2/voice` request instead of preserving the text response.

## TTS Strategy

- Coqui remains the primary local TTS engine.
- FR uses the French model.
- EN uses the English model.
- AR uses the Arabic model when available.
- TN/Tounsi/Franco-Arabic maps to the French voice as the safest local fallback.
- Long replies are split into bounded chunks before Coqui synthesis.
- Generated chunk WAV files are concatenated into one cached WAV response.

## Piper Fallback

An optional Piper fallback was added without introducing a new dependency. Piper is used only when:

- `TTS_PIPER_BINARY` resolves to an executable.
- The language-specific model path exists:
  - `TTS_PIPER_MODEL_FR`
  - `TTS_PIPER_MODEL_EN`
  - `TTS_PIPER_MODEL_AR`

If Piper is not configured or fails, the final fallback is text-only.

## Safe Fallback Behavior

The `/v2/voice` endpoint now treats TTS as optional:

- If TTS is disabled, empty, unavailable, or throws an exception, the endpoint returns `200` with the text response preserved.
- Audio metadata is returned as:
  - `audioUrl: null`
  - `audioStatus: "unavailable"`
  - `ttsUnavailable: true`
- ToolRegistry, ResponseGuard, confirmations, STT, role agents, and public chatbot context were not changed.

## Tests Added/Updated

- Multilingual TTS routing for FR, EN, AR, and TN.
- TTS unavailable text-only fallback.
- Long response chunking.
- Coqui generation exception fallback.
- Voice processor TTS exception fallback.
- `/v2/voice` text preservation when audio generation raises.

## Validation Results

Passed:

```text
python -c "import main; print('ok')"
```

Output included the existing optional-router warning for `app.api.document_generation`.

Passed:

```text
python -m pytest tests/test_tts_chatbot.py tests/test_voice_v2.py tests/test_audio_pipeline.py -v
```

Result:

```text
19 passed, 1 warning
```

Passed:

```text
python -m pytest tests/test_chat_v2.py tests/test_multilingual_chatbot_routing.py -v
```

Result:

```text
38 passed, 1 warning
```

Additional safety validation passed:

```text
python -m pytest tests/test_tts_multilingual.py tests/test_voice_contract.py -v
```

Result:

```text
10 passed, 1 warning
```

## Exact Files Staged

- `ai-service/AI_08_TTS_MULTILINGUAL_REPORT.md`
- `ai-service/app/api/voice_v2.py`
- `ai-service/app/voice_pipeline/voice_request_processor.py`
- `ai-service/config.py`
- `ai-service/tests/test_tts_chatbot.py`
- `ai-service/tests/test_voice_v2.py`
- `ai-service/voice/tts.py`
- `ai-service/voice/tts_service.py`

## Commit Hash

The final commit hash is recorded in the task completion response after `git commit` because a commit cannot contain its own hash without amending it.
