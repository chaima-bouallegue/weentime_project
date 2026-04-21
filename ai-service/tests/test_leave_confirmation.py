import unittest
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from tools.api_client import ToolResult


class LeaveDecisionTests(unittest.TestCase):
    def test_ambiguous_leave_dates_require_confirmation(self) -> None:
        with TestClient(main.app) as client:
            response = client.post(
                "/chat",
                json={"user_id": 22, "role": "EMPLOYEE", "message": "je veux un conge du 12 au 15"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "confirm")
        self.assertEqual(body["type"], "ask")
        self.assertEqual(body["intent"], "CREATE_LEAVE")

    def test_confirmation_reply_executes_pending_leave(self) -> None:
        with TestClient(main.app) as client:
            client.post(
                "/chat",
                json={"user_id": 23, "role": "EMPLOYEE", "message": "je veux un conge du 12 au 15"},
            )
            client.app.state.hr_tools.get_leave_balance = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/leave-balances",
                    data={"total": 12.0},
                    text="Votre solde disponible est de 12 jour(s).",
                )
            )
            execute_mock = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/conges",
                    data={"id": 92},
                    text="Votre demande de conge a ete envoyee.",
                )
            )
            client.app.state.hr_tools.execute_action = execute_mock
            client.app.state.hr_tools.notify_role = AsyncMock(
                return_value=ToolResult(success=True, tool="/v1/notifications/internal/roles/ROLE_MANAGER")
            )
            response = client.post(
                "/chat",
                json={"user_id": 23, "role": "EMPLOYEE", "message": "oui confirme"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["type"], "workflow")
        self.assertEqual(body["action"], "create_leave")
        self.assertEqual(execute_mock.await_count, 1)

    def test_manager_approval_executes_with_request_reference(self) -> None:
        with TestClient(main.app) as client:
            client.app.state.hr_tools.fetch_request = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/manager/workspace",
                    data={"id": 42, "statut": "EN_ATTENTE_MANAGER", "typeDemande": "CONGE", "employeId": 11},
                    text="Demande 42 retrouvee.",
                )
            )
            approve_mock = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/demandes/42/statut",
                    data={"id": 42},
                    text="La demande leave 42 a ete validee.",
                )
            )
            client.app.state.hr_tools.approve_request = approve_mock
            client.app.state.hr_tools.notify_user = AsyncMock(
                return_value=ToolResult(success=True, tool="/v1/notifications/internal/users/11")
            )
            client.app.state.hr_tools.notify_role = AsyncMock(
                return_value=ToolResult(success=True, tool="/v1/notifications/internal/roles/ROLE_RH")
            )
            response = client.post(
                "/chat",
                json={"user_id": 18, "role": "MANAGER", "message": "approuve le conge 42"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["action"], "approve_request")
        self.assertEqual(body["intent"], "APPROVE_REQUEST")
        self.assertEqual(body["type"], "workflow")
        self.assertEqual(approve_mock.await_count, 1)

    def test_failed_workflow_can_resume(self) -> None:
        with TestClient(main.app) as client:
            client.app.state.hr_tools.get_leave_balance = AsyncMock(
                side_effect=[
                    ToolResult(
                        success=False,
                        tool="/v1/leave-balances",
                        status="error",
                        text="Erreur serveur",
                        error="backend_request_failed",
                    ),
                    ToolResult(
                        success=False,
                        tool="/v1/leave-balances",
                        status="error",
                        text="Erreur serveur",
                        error="backend_request_failed",
                    ),
                    ToolResult(
                        success=True,
                        tool="/v1/leave-balances",
                        data={"total": 8.0},
                        text="Votre solde disponible est de 8 jour(s).",
                    ),
                ]
            )
            execute_mock = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/conges",
                    data={"id": 105},
                    text="Votre demande de conge a ete envoyee.",
                )
            )
            client.app.state.hr_tools.execute_action = execute_mock
            client.app.state.hr_tools.notify_role = AsyncMock(
                return_value=ToolResult(success=True, tool="/v1/notifications/internal/roles/ROLE_MANAGER")
            )

            failed_response = client.post(
                "/chat",
                json={"user_id": 32, "role": "EMPLOYEE", "message": "je veux un conge demain"},
            )
            resumed_response = client.post(
                "/chat",
                json={"user_id": 32, "role": "EMPLOYEE", "message": "reprends le workflow"},
            )

        self.assertEqual(failed_response.status_code, 200)
        self.assertEqual(failed_response.json()["status"], "failed")
        self.assertEqual(resumed_response.status_code, 200)
        self.assertEqual(resumed_response.json()["status"], "success")
        self.assertEqual(resumed_response.json()["type"], "workflow")
        self.assertEqual(execute_mock.await_count, 1)

    def test_document_request_asks_when_type_missing(self) -> None:
        with TestClient(main.app) as client:
            response = client.post(
                "/chat",
                json={"user_id": 19, "role": "EMPLOYEE", "message": "je veux un document"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ask")
        self.assertEqual(body["intent"], "REQUEST_DOCUMENT")
        self.assertEqual(body["missing_fields"], ["document_type"])

    def test_rh_stats_are_routed_to_rh_intent(self) -> None:
        with TestClient(main.app) as client:
            execute_mock = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="get_rh_stats",
                    data={"pendingRequests": 4},
                    text="Les statistiques RH sont disponibles.",
                )
            )
            client.app.state.hr_tools.execute_action = execute_mock
            response = client.post(
                "/chat",
                json={"user_id": 20, "role": "RH", "message": "donne moi les stats rh"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["intent"], "GET_RH_STATS")
        self.assertEqual(body["type"], "workflow")
        self.assertEqual(execute_mock.await_count, 1)


if __name__ == "__main__":
    unittest.main()
