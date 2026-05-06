from __future__ import annotations

import logging
import uuid
from typing import Any

from app.context.current_user import CurrentUserContext

logger = logging.getLogger(__name__)


class ToolAuditLogger:
    def log(
        self,
        *,
        request_id: str | None,
        context: CurrentUserContext,
        tool_name: str,
        status: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        logger.info(
            "ai_tool_audit request_id=%s user_id=%s tenant_id=%s tool=%s status=%s details=%s",
            request_id or str(uuid.uuid4()),
            context.user_id,
            context.tenant_id,
            tool_name,
            status,
            details or {},
        )
