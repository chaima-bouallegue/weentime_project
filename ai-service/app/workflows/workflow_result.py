from __future__ import annotations

from dataclasses import dataclass, field

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse

from .workflow_state import WorkflowState


@dataclass(slots=True)
class WorkflowResult:
    response: AgentResponse
    state: WorkflowState
    context: CurrentUserContext | None = None
    warnings: list[str] = field(default_factory=list)
    http_status: int = 200
