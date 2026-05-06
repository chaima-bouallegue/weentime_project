from __future__ import annotations

from typing import Literal, Type

from pydantic import BaseModel, ConfigDict, Field

ToolKind = Literal["read", "write"]


class ToolDefinition(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    description: str
    input_model: Type[BaseModel]
    output_model: Type[BaseModel] | None = None
    type: ToolKind
    allowed_roles: set[str] = Field(default_factory=set)
    required_permissions: set[str] = Field(default_factory=set)
    requires_confirmation: bool = False
    idempotency_required: bool = False
