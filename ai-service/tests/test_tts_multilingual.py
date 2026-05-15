from __future__ import annotations

from pathlib import Path

import pytest

from voice import tts_service


class FakeTTS:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def tts_to_file(self, *, text: str, file_path: str) -> None:
        self.calls.append(text)
        Path(file_path).write_bytes(b"fake wav")


@pytest.mark.parametrize(
    ("text", "language", "expected_model"),
    [
        ("Bonjour", "fr", "tts_models/fr/css10/vits"),
        ("Hello", "en", "tts_models/en/ljspeech/tacotron2-DDC"),
        ("مرحبا", "ar", "tts_models/ar/cv/vits"),
        ("Chnowa el motif?", "tn", "tts_models/fr/css10/vits"),
    ],
)
def test_tts_selects_language_model_and_generates_audio(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    text: str,
    language: str,
    expected_model: str,
) -> None:
    fake = FakeTTS()
    requested_models: list[str] = []

    def fake_get_tts(model_name: str, use_gpu: bool):
        requested_models.append(model_name)
        return fake

    monkeypatch.setattr(tts_service, "_get_tts", fake_get_tts)

    first_path = tts_service.generate_audio(text, output_dir=tmp_path, language=language)
    second_path = tts_service.generate_audio(text, output_dir=tmp_path, language=language)

    assert first_path
    assert Path(first_path).exists()
    assert second_path == first_path
    assert requested_models == [expected_model]
    assert fake.calls == [text]


def test_tts_unavailable_returns_text_only_safe_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tts_service, "_get_tts", lambda model_name, use_gpu: False)

    assert tts_service.generate_audio("مرحبا", output_dir=tmp_path, language="ar") is None
