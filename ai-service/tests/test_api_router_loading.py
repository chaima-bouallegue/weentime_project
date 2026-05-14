from __future__ import annotations

import sys
from types import ModuleType

import pytest
from fastapi import APIRouter, FastAPI

from app.api.router_loader import RouterSpec, include_router_from_spec, register_routers


def test_optional_missing_router_is_skipped() -> None:
    app = FastAPI()

    result = include_router_from_spec(
        app,
        RouterSpec(name="optional_missing", module_path="missing_optional_router_for_test", critical=False),
    )

    assert result.status == "skipped"
    assert result.error == "module_not_found"
    assert result.critical is False


def test_required_missing_router_fails_fast() -> None:
    app = FastAPI()

    with pytest.raises(ModuleNotFoundError):
        include_router_from_spec(
            app,
            RouterSpec(name="required_missing", module_path="missing_required_router_for_test", critical=True),
        )


def test_optional_invalid_router_is_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    module_name = "test_optional_invalid_router_module"
    module = ModuleType(module_name)
    module.router = object()
    monkeypatch.setitem(sys.modules, module_name, module)
    app = FastAPI()

    result = include_router_from_spec(app, RouterSpec(name="invalid", module_path=module_name, critical=False))

    assert result.status == "skipped"
    assert result.error == "invalid_router"


def test_required_invalid_router_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    module_name = "test_required_invalid_router_module"
    module = ModuleType(module_name)
    module.router = object()
    monkeypatch.setitem(sys.modules, module_name, module)
    app = FastAPI()

    with pytest.raises(RuntimeError):
        include_router_from_spec(app, RouterSpec(name="invalid", module_path=module_name, critical=True))


def test_register_routers_records_registered_and_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    module_name = "test_valid_router_module"
    module = ModuleType(module_name)
    router = APIRouter()

    @router.get("/probe")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    module.router = router
    monkeypatch.setitem(sys.modules, module_name, module)
    app = FastAPI()

    results = register_routers(
        app,
        [
            RouterSpec(name="valid", module_path=module_name, critical=True),
            RouterSpec(name="missing_optional", module_path="missing_optional_router_for_registration_test", critical=False),
        ],
    )

    assert [result.status for result in results] == ["registered", "skipped"]
    assert any(route.path == "/probe" for route in app.routes)
    assert app.state.api_router_registrations[0]["name"] == "valid"
    assert app.state.api_router_registrations[1]["error"] == "module_not_found"


def test_main_import_registers_core_routers_and_skips_legacy_document_generation() -> None:
    import main

    paths = {getattr(route, "path", "") for route in main.app.routes}
    registrations = {item["name"]: item for item in main.app.state.api_router_registrations}

    assert "/v2/chat" in paths
    assert "/v2/voice" in paths
    assert "/health/deep" in paths
    assert registrations["chat_v2"]["status"] == "registered"
    assert registrations["health_v2"]["status"] == "registered"
    assert registrations["voice_v2"]["status"] == "registered"
    assert registrations["document_generation"]["status"] == "skipped"
    assert registrations["document_generation"]["error"] == "module_not_found"
