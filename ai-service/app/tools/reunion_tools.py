from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

REUNION_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}


class EmptyInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)


class ReunionDetailInput(BaseModel):
    uuid: str = Field(min_length=1, max_length=64)


class ReunionTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="reunion.list_mine",
                description="Liste les reunions auxquelles l'utilisateur authentifie participe.",
                input_model=EmptyInput,
                output_model=None,
                type="read",
                allowed_roles=REUNION_ROLES,
            ),
            self.list_mine,
        )
        registry.register(
            ToolDefinition(
                name="reunion.next",
                description="Retourne la prochaine reunion de l'utilisateur authentifie, si elle existe.",
                input_model=EmptyInput,
                output_model=None,
                type="read",
                allowed_roles=REUNION_ROLES,
            ),
            self.next_reunion,
        )
        registry.register(
            ToolDefinition(
                name="reunion.get_detail",
                description="Recupere les details d'une reunion par identifiant UUID.",
                input_model=ReunionDetailInput,
                output_model=None,
                type="read",
                allowed_roles=REUNION_ROLES,
            ),
            self.get_detail,
        )

    async def list_mine(self, payload: EmptyInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/reunions/mes-reunions", context=context)
        if not result.success:
            return _read_failure("reunion.list_mine", result, "Impossible de charger vos reunions.")
        items = _as_list(result.data)[: payload.limit]
        count = len(items)
        summary = "Aucune reunion planifiee pour vous." if count == 0 else f"Vous avez {count} reunion(s) planifiee(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="reunion.list_mine",
                    summary=summary,
                    items=items,
                    count=count,
                    data={"reunions": items},
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def next_reunion(self, payload: EmptyInput, context: CurrentUserContext) -> ToolResult:
        _ = payload
        result = await self.backend_client.get("/rh/reunions/prochaine", context=context)
        # 404 from backend means "no upcoming reunion" — handle as safe empty, not as error.
        if not result.success and result.status_code == 404:
            return ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name="reunion.next",
                        summary="Aucune reunion a venir n'est planifiee pour vous.",
                        items=[],
                        count=0,
                        data={"reunion": None},
                        backend_status=404,
                        empty=True,
                    )
                },
                warnings=result.warnings,
                status_code=200,
            )
        if not result.success:
            return _read_failure("reunion.next", result, "Impossible de recuperer la prochaine reunion.")
        reunion = result.data if isinstance(result.data, dict) else None
        if not reunion:
            return ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name="reunion.next",
                        summary="Aucune reunion a venir n'est planifiee pour vous.",
                        items=[],
                        count=0,
                        data={"reunion": None},
                        backend_status=result.status_code,
                        empty=True,
                    )
                },
                warnings=result.warnings,
                status_code=result.status_code,
            )
        titre = _safe_str(reunion.get("titre") or reunion.get("title") or "Reunion")
        date = _safe_str(reunion.get("dateHeure") or reunion.get("date") or "")
        suffix = f" le {date}" if date else ""
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="reunion.next",
                    summary=f"Prochaine reunion: {titre}{suffix}.",
                    items=[reunion],
                    count=1,
                    data={"reunion": reunion},
                    backend_status=result.status_code,
                    empty=False,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def get_detail(self, payload: ReunionDetailInput, context: CurrentUserContext) -> ToolResult:
        uuid = payload.uuid.strip()
        result = await self.backend_client.get(f"/rh/reunions/{uuid}", context=context)
        if not result.success:
            return _read_failure("reunion.get_detail", result, "Reunion introuvable.")
        reunion = result.data if isinstance(result.data, dict) else None
        if not reunion:
            return _read_failure("reunion.get_detail", result, "Reunion introuvable.")
        titre = _safe_str(reunion.get("titre") or reunion.get("title") or "Reunion")
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="reunion.get_detail",
                    summary=f"Reunion '{titre}'.",
                    items=[reunion],
                    count=1,
                    data={"reunion": reunion},
                    backend_status=result.status_code,
                    empty=False,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )


def register_reunion_tools(registry: ToolRegistry, backend_client: BackendClient) -> ReunionTools:
    tools = ReunionTools(backend_client)
    tools.register(registry)
    return tools


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("content", "items", "data", "reunions"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _read_failure(tool_name: str, result: ToolResult, fallback: str) -> ToolResult:
    message = _clean_error(result, fallback)
    return ToolResult.fail(
        result.error_code or "backend_error",
        message,
        status_code=result.status_code,
        data={
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=message,
                items=[],
                count=0,
                data=result.data if isinstance(result.data, dict) else {},
                error={"code": result.error_code, "message": message},
                backend_status=result.status_code,
                empty=True,
            )
        },
        warnings=result.warnings,
    )


def _clean_error(result: ToolResult, fallback: str) -> str:
    if result.status_code in (401, 403):
        return "Vous n'avez pas les droits necessaires pour consulter cette reunion."
    if result.status_code == 404:
        return "Cette reunion est introuvable."
    if result.status_code == 400:
        return "L'identifiant de reunion est invalide."
    if result.status_code is None or result.status_code >= 500:
        return "Le service reunions est momentanement indisponible."
    return result.error_message or fallback
