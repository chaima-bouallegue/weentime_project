from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request

from app.models.envelopes import ApiEnvelope
from app.observability.braintrust_client import get_braintrust_status, send_test_event
from app.tools.backend_client import BackendClient

router = APIRouter()


@router.get("/health/deep")
async def health_deep(request: Request) -> ApiEnvelope:
    app_state = request.app.state
    settings = getattr(app_state, "settings", None)
    checks: dict[str, Any] = {
        "ai_import": {"ok": True},
        "ffmpeg": {"ok": shutil.which(getattr(settings, "ffmpeg_binary", "ffmpeg") if settings else "ffmpeg") is not None},
        "stt_model": {"ok": bool(getattr(settings, "stt_model", None)), "model": getattr(settings, "stt_model", None)},
        "tts": {"ok": bool(getattr(settings, "tts_enabled", False)), "model": getattr(settings, "tts_model", None)},
        "temp_dirs": {"ok": True},
        "backend_gateway": {"ok": False},
        "braintrust": get_braintrust_status(),
    }
    warnings: list[str] = []

    for attr in ("temp_audio_dir", "generated_audio_dir", "generated_docs_dir"):
        directory = Path(getattr(settings, attr, "./temp") if settings else "./temp")
        try:
            directory.mkdir(parents=True, exist_ok=True)
            probe = directory / ".ai_health_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
        except Exception as exc:
            checks["temp_dirs"] = {"ok": False, "error": str(exc), "path": str(directory)}
            warnings.append(f"{attr}_not_writable")

    backend_base = getattr(settings, "backend_base_url", None) if settings else None
    client = BackendClient(base_url=backend_base)
    try:
        async with httpx.AsyncClient(timeout=3.0) as http:
            response = await http.get(client.base_url.rsplit("/api/v1", 1)[0])
            checks["backend_gateway"] = {"ok": response.status_code < 500, "status_code": response.status_code}
    except Exception as exc:
        checks["backend_gateway"] = {"ok": False, "error": str(exc)}
        warnings.append("backend_gateway_unreachable")

    if not checks["ffmpeg"]["ok"]:
        warnings.append("ffmpeg_not_found")
    if not checks["tts"]["ok"]:
        warnings.append("tts_disabled")

    status = "ok" if not warnings else "degraded"
    return ApiEnvelope.ok({"status": status, "checks": checks, "braintrust": checks["braintrust"]}, warnings=warnings)


@router.post("/debug/braintrust/test-event")
async def braintrust_test_event(request: Request) -> ApiEnvelope:
    settings = getattr(request.app.state, "settings", None)
    env = str(getattr(settings, "braintrust_env", None) or getattr(settings, "app_env", "") or "").lower()
    app_env = str(getattr(settings, "app_env", "") or "").lower()
    if env not in {"local", "dev", "development", "test"} and app_env not in {"local", "dev", "development", "test"}:
        raise HTTPException(status_code=404, detail="Not found")
    result = send_test_event()
    if result.get("success"):
        return ApiEnvelope.ok({"status": "ok", "event": "braintrust.integration.test"})
    return ApiEnvelope.fail("braintrust_test_event_failed", str(result.get("error") or "Braintrust test event failed."), status_details=result)
