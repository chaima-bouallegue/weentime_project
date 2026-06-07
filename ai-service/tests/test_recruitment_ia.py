import io
import json

import httpx
import pytest
from fastapi import UploadFile

from app.api import document_generation, recruitment_ia
from app.api.document_generation import (
    DocumentGenerationRequest,
    DocumentGenerationResponse,
)
from app.api.recruitment_ia import extract_json_from_gemini
from config import Settings


def test_extract_json_from_gemini_accepts_plain_json():
    assert extract_json_from_gemini('{"score_global": 85}') == {"score_global": 85}


def test_extract_json_from_gemini_accepts_json_fence():
    raw = '```json\n{"score_global": 85}\n```'
    assert extract_json_from_gemini(raw) == {"score_global": 85}


def test_extract_json_from_gemini_accepts_generic_fence():
    raw = '```\n{"score_global": 85}\n```'
    assert extract_json_from_gemini(raw) == {"score_global": 85}


def test_extract_json_from_gemini_extracts_json_from_surrounding_text():
    raw = 'Voici le resultat: {"scores": {"global": 85}, "ok": true} Merci.'
    assert extract_json_from_gemini(raw) == {
        "scores": {"global": 85},
        "ok": True,
    }


def test_extract_json_from_gemini_rejects_empty_response():
    with pytest.raises(ValueError, match="vide"):
        extract_json_from_gemini("  ")


def test_extract_json_from_gemini_rejects_response_without_json():
    with pytest.raises(ValueError, match="Aucun objet JSON"):
        extract_json_from_gemini("Aucune evaluation disponible.")


def test_extract_json_from_gemini_rejects_invalid_json():
    with pytest.raises(ValueError, match="Objet JSON invalide"):
        extract_json_from_gemini('{"score_global": }')


def test_java_rh_service_url_environment_override(monkeypatch):
    monkeypatch.setenv("JAVA_RH_SERVICE_URL", "http://localhost:9999/")

    assert Settings().java_rh_service_url == "http://localhost:9999"


@pytest.mark.asyncio
async def test_generate_gemini_uses_json_mode_and_keeps_key_out_of_url(monkeypatch):
    captured = {}

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": '{"ok": true}'}]}}
                    ]
                },
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(document_generation.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(document_generation.settings, "gemini_api_key", "dummy-test-key")
    monkeypatch.setattr(document_generation, "last_call_time", 0)

    request = DocumentGenerationRequest(
        system_prompt="Return JSON.",
        user_prompt="Evaluate.",
        temperature=0.1,
        provider="gemini",
    )
    result = await document_generation._generate_gemini(
        request,
        response_mime_type="application/json",
    )

    assert result.content == '{"ok": true}'
    assert "key=" not in captured["url"]
    assert captured["headers"]["x-goog-api-key"] == "dummy-test-key"
    assert captured["json"]["generationConfig"]["temperature"] == 0.1
    assert (
        captured["json"]["generationConfig"]["responseMimeType"]
        == "application/json"
    )


@pytest.mark.asyncio
async def test_evaluate_cv_reports_callback_failure_without_losing_result(monkeypatch):
    evaluation = {
        "score_global": 82,
        "score_technique": 80,
        "score_experience": 84,
        "score_competences": 81,
        "recommandation": "RECOMMANDE",
        "points_forts": ["Python"],
        "points_faibles": [],
        "resume_evaluation": "Profil coherent.",
        "competences_trouvees": ["Python"],
        "competences_manquantes": [],
        "annees_experience_detectees": 4,
        "niveau_confiance": 90,
    }

    async def fake_generate_gemini(request, response_mime_type=None):
        assert response_mime_type == "application/json"
        return DocumentGenerationResponse(
            content=json.dumps(evaluation),
            model_used="gemini-test",
            provider="gemini",
        )

    class FailingAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, **kwargs):
            request = httpx.Request("POST", url)
            raise httpx.ConnectError("callback unavailable", request=request)

    monkeypatch.setattr(recruitment_ia, "_generate_gemini", fake_generate_gemini)
    monkeypatch.setattr(
        recruitment_ia,
        "_extract_pdf_text_from_bytes",
        lambda _: "Experience Python FastAPI " * 10,
    )
    monkeypatch.setattr(recruitment_ia.httpx, "AsyncClient", FailingAsyncClient)

    upload = UploadFile(filename="cv.pdf", file=io.BytesIO(b"%PDF-" + b"x" * 100))
    result = await recruitment_ia.evaluate_cv_endpoint(
        application_id=12,
        entreprise_id=34,
        job_title="Backend Engineer",
        job_description="API development",
        competences_requises='["Python", "FastAPI"]',
        experience_min_annees=3,
        niveau_experience="CONFIRME",
        file=upload,
    )

    assert result["status"] == "success"
    assert result["score_global"] == 82
    assert result["callback_status"] == "failed"
    assert "Evaluation IA terminee" in result["detail"]
