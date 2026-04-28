# Voice fixtures

`fr_leave_request.webm` — ~2s WebM/Opus recording of the phrase
"Je veux un congé demain", used by `tests/test_audio_stream_integration.py`.

To regenerate from TTS (no mic required):

    cd ai-service
    .venv\Scripts\python.exe tests/fixtures/generate_fixture.py

To re-record from the machine microphone (platform-specific; adjust input device syntax as needed):

    ffmpeg -y -f <input-format> -i <input-device> -t 2.5 -ac 1 -ar 48000 -c:a libopus -b:a 64k fr_leave_request.webm

The fixture is committed to the repo so tests run offline.

## Notes on the TTS path

`tts_models/fr/css10/vits` is a narrow single-speaker French model.
Under Coqui 0.22.0, it can occasionally drop the nasal "en" on short
phrases, producing transcriptions like "je veux un conger demain" or
"je veux des congés demain". The integration test accepts any of
`{congé, conge, veux, demain}` so these variants pass. If the test
starts failing because the transcription lost ALL four keywords,
prefer re-recording with a real mic over tweaking
`EXPECTED_KEYWORDS`.
