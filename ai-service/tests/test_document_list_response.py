from __future__ import annotations

import asyncio
from typing import Any

from app.agents.document_agent import DocumentAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    async def execute(self, tool_name, payload, context, **kwargs):
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary="documents",
                    count=3,
                    items=[
                        {"id": 1, "type": "ATTESTATION_TRAVAIL", "statut": "EN_ATTENTE", "dateDemande": "2026-05-07"},
                        {"id": 2, "type": "BULLETIN_PAIE", "statut": "PRET", "dateDemande": "2026-05-04"},
                        {"id": 3, "type": "ATTESTATION_SALAIRE", "statut": "REFUSE", "dateDemande": "2026-05-01"},
                    ],
                )
            },
            status_code=200,
        )


def context() -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role="EMPLOYEE", entreprise_id=2, token="token")


def test_document_list_response_is_domain_only_structured_summary() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Montre mes documents", context()))

    assert response.intent == "document.list"
    assert "demande(s) de documents" in response.text
    assert "Dernieres demandes" in response.text
    assert "conge" not in response.text.lower()
    assert "teletravail" not in response.text.lower()
