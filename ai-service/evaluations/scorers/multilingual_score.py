from __future__ import annotations

from typing import Any

from .common import score_result


def score_multilingual(output: Any, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    expected = expected or {}
    expected_locale = str(expected.get("locale") or expected.get("expected_locale") or "").lower()
    actual = ""
    if isinstance(output, dict):
        actual = str(output.get("responseLocale") or output.get("response_locale") or output.get("detectedLanguage") or output.get("detected_language") or "").lower()
    if not expected_locale:
        return score_result("multilingual", 1.0, actual_locale=actual)
    compatible = actual == expected_locale or (expected_locale == "tn" and actual in {"tn", "fr"})
    return score_result("multilingual", 1.0 if compatible else 0.0, expected_locale=expected_locale, actual_locale=actual)
