from __future__ import annotations

import pytest
from voice.text_normalizer import (
    normalize_for_tts,
    normalize_percentages,
    normalize_currencies,
    normalize_numbers,
)


class TestNormalizePercentages:
    def test_integer_percent_fr(self):
        assert "pourcent" in normalize_percentages("91%", "fr")
        assert "quatre-vingt" in normalize_percentages("91%", "fr")

    def test_integer_percent_en(self):
        assert "percent" in normalize_percentages("91%", "en")

    def test_no_percent(self):
        assert normalize_percentages("bonjour", "fr") == "bonjour"


class TestNormalizeCurrencies:
    def test_dt(self):
        result = normalize_currencies("1250 DT", "fr")
        assert "dinars" in result
        assert "mille" in result

    def test_euro(self):
        result = normalize_currencies("350 \u20ac", "fr")
        assert "euros" in result

    def test_no_currency(self):
        assert normalize_currencies("bonjour", "fr") == "bonjour"


class TestNormalizeNumbers:
    def test_simple_integer(self):
        result = normalize_numbers("1234 collaborateurs", "fr")
        assert "mille" in result
        assert "collaborateurs" in result

    def test_decimal(self):
        result = normalize_numbers("3.5 jours", "fr")
        assert "trois" in result
        assert "jours" in result

    def test_year_preserved(self):
        result = normalize_numbers("2026", "fr")
        assert "2026" in result

    def test_ref_preserved(self):
        assert "REF-123" in normalize_numbers("REF-123", "fr")

    def test_iso_preserved(self):
        assert "ISO-9001" in normalize_numbers("ISO-9001", "fr")

    def test_version_preserved(self):
        assert "v2" in normalize_numbers("v2", "fr")

    def test_http_404_preserved(self):
        assert "404" in normalize_numbers("HTTP 404", "fr")

    def test_rh_id_preserved(self):
        assert "4589" in normalize_numbers("ID 4589", "fr")

    def test_matricule_preserved(self):
        assert "4589" in normalize_numbers("Matricule 4589", "fr")


class TestNormalizeForTts:
    def test_full_pipeline_fr(self):
        result = normalize_for_tts("1234 collaborateurs", "fr")
        assert "mille" in result

    def test_percentage_pipeline(self):
        result = normalize_for_tts("91% de couverture", "fr")
        assert "pourcent" in result

    def test_currency_pipeline(self):
        result = normalize_for_tts("1250 DT de salaire", "fr")
        assert "dinars" in result

    def test_date_preserved(self):
        result = normalize_for_tts("r\u00e9union le 01/06/2026", "fr")
        assert "01/06/2026" in result

    def test_date_iso_preserved(self):
        result = normalize_for_tts("depuis 2026-07-05", "fr")
        assert "2026-07-05" in result

    def test_empty_string(self):
        assert normalize_for_tts("", "fr") == ""

    def test_no_numbers(self):
        assert normalize_for_tts("bonjour tout le monde", "fr") == \
               "bonjour tout le monde"

    def test_lang_en(self):
        result = normalize_for_tts("1234 employees", "en")
        assert "thousand" in result

    def test_fallback_on_error(self):
        result = normalize_for_tts("texte normal", "fr")
        assert isinstance(result, str)
