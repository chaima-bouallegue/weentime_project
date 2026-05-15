from __future__ import annotations

from evaluations.eval_voice import run_eval


def test_voice_eval_multilingual_dataset_routes_and_confirms():
    results = run_eval()

    assert {item["id"] for item in results} >= {"voice-fr-leave", "voice-en-leave", "voice-ar-leave", "voice-tn-leave"}
    assert all(score["score"] == 1.0 for result in results for score in result["scores"])


def test_voice_eval_detects_locale_mismatch():
    results = run_eval(
        cases=[{"id": "voice", "locale": "ar", "transcript": "أريد إجازة غدا", "expected_intent": "leave.create"}],
        task=lambda _case: {"intent": "leave.create", "detectedLanguage": "fr", "responseLocale": "fr", "requiresConfirmation": True},
    )

    multilingual = next(score for score in results[0]["scores"] if score["name"] == "multilingual")
    assert multilingual["score"] == 0.0
