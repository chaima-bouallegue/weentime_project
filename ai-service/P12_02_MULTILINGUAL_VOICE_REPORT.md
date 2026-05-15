# P12-02 Multilingual Voice Support Report

## 1. MCP tools used

- filesystem MCP: inspected voice API, STT/TTS pipeline, language detection, normalization, router and tests.
- context7 MCP: checked faster-whisper automatic language detection and CPU int8 transcription patterns.
- context7 MCP: checked local TTS routing/fallback patterns for multilingual output.

## 2. Files changed

- `app/api/voice_v2.py`
- `app/nlp/language_detector.py`
- `app/nlp/normalization.py`
- `app/voice_pipeline/voice_request_processor.py`
- `voice/cleaner.py`
- `voice/tts_service.py`
- `tests/test_stt_multilingual.py`
- `tests/test_tts_multilingual.py`
- `tests/test_multilingual_router.py`
- `tests/test_voice_v2.py`
- `tests/test_voice_contract.py`
- `P12_02_MULTILINGUAL_VOICE_REPORT.md`

## 3. Language detection strategy

- Faster-whisper STT language metadata remains preserved as `language` and `language_confidence`.
- Voice runtime now resolves the final response language from, in order:
  1. explicit `language_hint`, if valid;
  2. transcript language markers, especially Tunisian/Arabic/English;
  3. STT detected language;
  4. transcript detector fallback.
- Tunisian/Franco-Arabic markers can override STT `fr` when the transcript clearly contains Tounsi terms such as `nheb`, `ghodwa`, `npointi`, or `nokhrej`.

## 4. Tunisian normalization strategy

- Expanded Tunisian hints for language detection:
  - `tounsi`, `tounes`, `baad`, `ba3d`, `dakhla`, `dakhel`, `khrouj`, `kharrej`, `congi`, `chnowa`.
- Expanded Tunisian normalization:
  - `npointi`, `dakhla`, `dakhel` -> check-in intent wording.
  - `khrouj`, `kharrej`, `nokhrej` -> check-out intent wording.
  - `konji`, `congi`, `conge` -> leave wording.
  - `ghodwa` and `baad ghodwa` remain mapped to relative date language handled by existing extraction.
- Short voice commands such as `ghodwa`, `npointi`, `nokhrej`, and `autorisation` are no longer rejected by the transcript cleaner.

## 5. STT behavior

- STT remains local and CPU-safe.
- No cloud STT was added.
- No GPU requirement was added.
- The stabilized finalized audio flow remains unchanged.
- Tests verify FR, EN, AR and TN/Franco-Arabic transcript preservation and language metadata behavior.

## 6. TTS routing behavior

- TTS continues to use local Coqui models only.
- FR uses `tts_models/fr/css10/vits`.
- EN uses `tts_models/en/ljspeech/tacotron2-DDC`.
- AR uses `tts_models/ar/cv/vits` when available.
- TN/Tounsi uses the French-compatible local fallback model.
- If TTS is unavailable, `/v2/voice` returns text safely with:
  - `audioStatus=unavailable`
  - `ttsUnavailable=true`
  - `audioUrl=null`

## 7. Confirmation safety

- Voice runtime still routes through verified context and deterministic copilot processing.
- ToolRegistry remains the only authority for business tools.
- ResponseGuard remains applied before voice responses are returned.
- Write actions still require confirmation.
- Provider/LLM output cannot execute tools from this change.

## 8. Tests added/updated

- `tests/test_stt_multilingual.py`
  - Added Tunisian transcript preservation.
  - Added short Tunisian command cleaner tests.
  - Added voice language resolution tests.
- `tests/test_tts_multilingual.py`
  - Added TN to French TTS fallback routing.
  - Added TTS unavailable safe fallback test.
- `tests/test_multilingual_router.py`
  - Added TN leave routing.
  - Added TN pointage routing.
  - Added TN authorization routing.
- `tests/test_voice_v2.py`
  - Added TN language metadata contract test.
- `tests/test_voice_contract.py`
  - Added TTS unavailable aliases contract test.

## 9. Validation results

Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed, printed `ok`.

```powershell
python -m pytest tests/test_stt_multilingual.py tests/test_tts_multilingual.py -v
```

Result: 17 passed, 1 warning.

```powershell
python -m pytest tests/test_multilingual_router.py tests/test_voice_v2.py tests/test_voice_contract.py -v
```

Result: 16 passed, 1 warning.

```powershell
python -m pytest tests/test_response_localization.py tests/test_entity_extraction_multilingual_followups.py -v
```

Result: 8 passed.

```powershell
python -m pytest tests/test_chat_v2.py tests/test_response_guard.py tests/test_role_intelligence.py -v
```

Result: 24 passed, 5 warnings.

Known warning during import: optional router `app.api.document_generation` remains unavailable as previously stabilized optional loading behavior.

## 10. Remaining limitations

- Arabic TTS depends on the local Coqui Arabic model being available. If unavailable, text response remains safe and audio is marked unavailable.
- Tunisian dialect support is rule-based and focused on WeenTime HR commands, not open-domain Tounsi transcription.
- No frontend changes were made for displaying `languageConfidence`, `audioStatus`, or `ttsUnavailable`.
- No real microphone/browser manual validation was performed in this task.

## 11. Exact files staged

Planned staged files for P12-02 only:

- `ai-service/app/api/voice_v2.py`
- `ai-service/app/nlp/language_detector.py`
- `ai-service/app/nlp/normalization.py`
- `ai-service/app/voice_pipeline/voice_request_processor.py`
- `ai-service/voice/cleaner.py`
- `ai-service/voice/tts_service.py`
- `ai-service/tests/test_stt_multilingual.py`
- `ai-service/tests/test_tts_multilingual.py`
- `ai-service/tests/test_multilingual_router.py`
- `ai-service/tests/test_voice_v2.py`
- `ai-service/tests/test_voice_contract.py`
- `ai-service/P12_02_MULTILINGUAL_VOICE_REPORT.md`

Unrelated dirty files intentionally not staged:

- `ai-service/evals/reports/local_eval_report.json`
- `ai-service/storage/`

## 12. Commit hash

Commit hash will be recorded after the clean P12-02 commit is created.
