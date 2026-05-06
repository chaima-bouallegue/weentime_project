from __future__ import annotations

from app.models.tool_models import ToolDefinition


def requires_confirmation(definition: ToolDefinition) -> bool:
    return definition.type == "write" and definition.requires_confirmation
