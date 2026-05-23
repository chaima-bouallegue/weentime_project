# AI-06 Router Import Stabilization Report

## 1. MCP Tools Used
- filesystem MCP: inspected `main.py`, `app/api/*`, router registration, startup imports, and current API module layout.
- context7 MCP: checked FastAPI modular API registration guidance for `APIRouter` and `app.include_router()` patterns.
- docker MCP: not used.
- redis MCP: not used.
- postgres MCP: not needed.
- playwright MCP: not needed.

## 2. Root Cause
`main.py` imported `app.api.document_generation` as a hard dependency:

```python
from app.api.document_generation import router as document_generation_router
```

The tracked `app/api` package only contains:
- `chat_v2.py`
- `health_v2.py`
- `voice_v2.py`
- `__init__.py`

`git ls-files` and repository search showed no tracked `document_generation.py`. The failing import was therefore a stale optional/legacy router import, and pytest collection failed before tests could run.

## 3. Router Architecture Analysis
Before this task:
- Core v2 routers were imported statically from `main.py`.
- A non-existent document generation router was also imported statically.
- Missing optional modules could crash startup and pytest collection.
- There was no structured record of registered/skipped routers.

After this task:
- Router loading is centralized in `app/api/router_loader.py`.
- Critical routers still fail fast if missing or invalid.
- Explicit optional routers may be skipped safely when the target module itself is missing.
- Optional skipped routers are logged and recorded on `app.state.api_router_registrations`.
- Existing v2 endpoints remain registered via normal FastAPI `include_router()`.

## 4. Files Changed
- `main.py`
- `app/api/router_loader.py`
- `tests/test_api_router_loading.py`
- `AI_06_ROUTER_IMPORT_STABILIZATION_REPORT.md`

## 5. Optional Loading Strategy
Added:
- `RouterSpec`
- `RouterRegistration`
- `include_router_from_spec()`
- `register_routers()`

Core routers are registered as critical:
- `app.api.chat_v2`
- `app.api.health_v2`
- `app.api.voice_v2`

Legacy document generation is registered as optional:
- `app.api.document_generation`

Behavior:
- Missing optional module -> warning + skipped registration.
- Missing critical module -> raises `ModuleNotFoundError`.
- Invalid optional router -> warning + skipped registration.
- Invalid critical router -> raises `RuntimeError`.

## 6. Startup Guarantees
Preserved:
- Core runtime does not silently degrade.
- Verified auth runtime remains untouched.
- Deterministic v2 chat and voice routers remain critical.
- Health endpoint remains critical.
- Missing optional legacy document generation route no longer blocks startup or pytest collection.

Not swallowed:
- Critical router import failures.
- Critical invalid router definitions.
- Nested missing dependency errors inside an existing optional module are not treated as the target optional module missing unless the missing module name is exactly the optional module path.

## 7. Tests Added or Updated
Added:
- `tests/test_api_router_loading.py`

Coverage:
- Optional missing router is skipped.
- Required missing router fails fast.
- Optional invalid router is skipped.
- Required invalid router fails.
- Router registrations are recorded in `app.state`.
- `main` imports successfully and registers `/v2/chat`, `/v2/voice`, and `/health/deep` while skipping `document_generation`.

## 8. Validation Results
Commands run from `C:\Users\DELL\Documents\GitHub\weentime_project\ai-service`:

```powershell
python -c "import main; print('ok')"
```

Result: passed (`ok`).

```powershell
python -m pytest tests/test_api_router_loading.py -v
```

Result: passed, 6 tests passed.

```powershell
python -m pytest tests/test_chat_v2.py -v
```

Result: passed, 4 tests passed.

```powershell
python -m pytest tests/test_voice_v2.py -v
```

Result: passed, 4 tests passed.

```powershell
python -m pytest tests -v
```

Result: passed, 401 tests passed, 6 warnings.

Warnings are existing dependency/runtime warnings:
- Python `audioop` deprecation from `voice/stt.py`.
- `pkg_resources` deprecation from `ctranslate2`.
- Redis `distutils.StrictVersion` deprecation warnings.

## 9. Remaining Limitations
- The optional `document_generation` API is not restored because no tracked module or route contract exists in the repository.
- If document-generation HTTP endpoints are required later, they should be implemented explicitly as a modern API module with tests instead of relying on stale imports.
- Router registration state is currently exposed internally on `app.state`; it is not surfaced through `/health/deep` in this task.

## 10. Exact Files Staged
Planned AI-06 staging only:
- `ai-service/main.py`
- `ai-service/app/api/router_loader.py`
- `ai-service/tests/test_api_router_loading.py`
- `ai-service/AI_06_ROUTER_IMPORT_STABILIZATION_REPORT.md`

## 11. Commit Hash
The commit hash is recorded in the final task response after creating the clean AI-06 commit.
