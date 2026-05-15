# P12-01 Voice Stabilization Report

## 1. MCP tools used
- filesystem MCP: inspected the AI service voice/audio stack, previous reports, and voice/audio tests before editing.
- context7 MCP: checked faster-whisper CPU/VAD guidance and FastAPI WebSocket/cancellation patterns.
- docker MCP: not used.
- redis MCP: not used.
- postgres MCP: not needed.
- playwright MCP: not used.

## 2. Files changed
- `app/api/voice_v2.py`
- `app/voice_pipeline/voice_errors.py`
- `main.py`
- `voice/stt.py`
- `voice/vad.py`
- `voice/whisper_service.py`
- `tests/test_audio_chunking.py`
- `tests/test_audio_pipeline.py`
- `tests/test_audio_stream.py`
- `tests/test_stt_integration.py`
- `tests/test_voice_streaming.py`
- `P12_01_VOICE_STABILIZATION_REPORT.md`

## 3. Pipeline architecture
Current stabilized flow:

`audio upload/chunk -> HTTP audio stream or /v2/voice -> buffering/finalization -> ffprobe/ffmpeg validation -> WAV conversion -> metrics -> VAD -> faster-whisper CPU STT -> transcript cleaning -> deterministic copilot route -> optional TTS`

The task did not add multilingual voice behavior and did not replace the existing deterministic fallback or ToolRegistry boundaries.

## 4. VAD strategy
- VAD is no longer a hard veto when audio metrics prove a real signal is present.
- If VAD reports no speech but duration, RMS volume, or peak amplitude passes the configured thresholds, the pipeline now continues to STT instead of returning `Je n'ai rien entendu` prematurely.
- `has_voice()` is less aggressive and now trusts any detected voiced frames instead of requiring a fixed 300 ms gate.
- VAD analysis exceptions are converted into a safe non-VAD analysis result instead of crashing the pipeline.

## 5. Websocket/audio-stream improvements
- The current runtime exposes `/audio-stream` as HTTP multipart stream, not a dedicated WebSocket voice endpoint.
- Final chunks can now bypass the low-size chunk filter with `accept_small=True`, preventing valid final fragments from being silently discarded.
- Stream cancellation now returns a controlled retryable payload with `status=audio_cancelled`.

## 6. FFmpeg fixes
- Existing FFmpeg conversion already logs stderr tail in `voice/audio_conversion.py`.
- This task preserved that behavior and added tests around clean conversion failure propagation through `AudioConversionError`.
- No new FFmpeg dependency or GPU path was introduced.

## 7. Chunk strategy
- Unsafe partial transcription remains removed.
- The stream uses finalized blob flow: chunks are buffered and STT runs only during finalization.
- Duplicate chunks are still ignored.
- Tiny non-final chunks are still ignored.
- Tiny final chunks are accepted so final user audio is not lost.

## 8. Cancellation fixes
- `SpeechToTextService.aprocess()` catches `asyncio.CancelledError` and returns `VoiceProcessingResult(status="cancelled", error="audio_cancelled")`.
- `/v2/voice` maps cancelled STT to a controlled HTTP 200 error envelope.
- `/audio-stream` finalization maps cancelled STT to a controlled retryable stream payload.

## 9. Tests
Added targeted tests for:
- finalized small chunk acceptance
- low-size non-final chunk skipping
- duplicate chunk skipping
- removed partial stream transcription helper
- VAD-negative but signal-positive audio continuing to STT
- FFmpeg/conversion failure propagation
- faster-whisper unavailable status
- STT unavailable mapping
- async cancellation handling
- stream finalization cancellation handling
- stream finalization STT-unavailable handling

## 10. Validation
Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```
Result: passed, printed `ok`.

```powershell
python -m pytest tests/test_audio_stream.py tests/test_audio_pipeline.py tests/test_voice_streaming.py -v
```
Result: 5 passed.

```powershell
python -m pytest tests/test_stt_integration.py tests/test_audio_chunking.py -v
```
Result: 7 passed.

```powershell
python -m pytest tests/test_voice_v2.py tests/test_voice_contract.py tests/test_voice_pipeline.py tests/test_voice_pipeline_fixed.py tests/test_audio_stream_integration.py -v
```
Result: 28 passed.

```powershell
python -m pytest tests -v
```
Result: 498 passed, 6 warnings.

## 11. Limitations
- No multilingual voice expansion was added in this task.
- `/audio-stream` remains HTTP multipart streaming rather than true WebSocket audio.
- Faster-whisper remains local CPU STT and can still be unavailable if its runtime/model dependencies are missing.
- `audioop` emits a Python 3.13 deprecation warning from the existing metrics path.
- Optional `app.api.document_generation` router still logs as unavailable during import; it is unrelated to P12 and remains optional.

## 12. Exact staged files
Intended staged files:
- `ai-service/app/api/voice_v2.py`
- `ai-service/app/voice_pipeline/voice_errors.py`
- `ai-service/main.py`
- `ai-service/voice/stt.py`
- `ai-service/voice/vad.py`
- `ai-service/voice/whisper_service.py`
- `ai-service/tests/test_audio_chunking.py`
- `ai-service/tests/test_audio_pipeline.py`
- `ai-service/tests/test_audio_stream.py`
- `ai-service/tests/test_stt_integration.py`
- `ai-service/tests/test_voice_streaming.py`
- `ai-service/P12_01_VOICE_STABILIZATION_REPORT.md`

Unrelated dirty files intentionally not staged:
- `ai-service/evals/reports/local_eval_report.json`
- `ai-service/storage/`

## 13. Commit hash
Pending before commit. The final response records the actual commit hash.
