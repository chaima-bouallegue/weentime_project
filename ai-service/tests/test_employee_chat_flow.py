import unittest
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from tools.api_client import ToolResult


class EmployeeChatFlowTests(unittest.TestCase):
    def test_leave_request_missing_dates_does_not_call_backend(self) -> None:
        with TestClient(main.app) as client:
            response = client.post(
                "/chat",
                json={"user_id": 16, "role": "EMPLOYEE", "message": "je veux un conge"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ask")
        self.assertEqual(body["intent"], "CREATE_LEAVE")
        self.assertEqual(body["missing_fields"], ["start_date", "end_date"])

    def test_leave_follow_up_executes_once(self) -> None:
        with TestClient(main.app) as client:
            client.post("/chat", json={"user_id": 17, "role": "EMPLOYEE", "message": "je veux un conge"})
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
                    data={"id": 77},
                    text="Votre demande de conge a ete envoyee.",
                )
            )
            client.app.state.hr_tools.execute_action = execute_mock
            client.app.state.hr_tools.notify_role = AsyncMock(
                return_value=ToolResult(success=True, tool="/v1/notifications/internal/roles/ROLE_MANAGER")
            )
            response = client.post(
                "/chat",
                json={"user_id": 17, "role": "EMPLOYEE", "message": "demain"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["type"], "workflow")
        self.assertEqual(body["action"], "create_leave")
        self.assertEqual(execute_mock.await_count, 1)

    def test_document_request_executes_without_form(self) -> None:
        with TestClient(main.app) as client:
            execute_mock = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/documents",
                    data={"id": 91},
                    text="Votre demande de document a ete envoyee.",
                )
            )
            client.app.state.hr_tools.execute_action = execute_mock
            client.app.state.hr_tools.open_document = AsyncMock(
                return_value=ToolResult(
                    success=True,
                    tool="/v1/documents/91/telecharger",
                    data={"download_url": "http://localhost:8000/document/files/doc-91.pdf"},
                    text="Le document est pret.",
                )
            )
            response = client.post(
                "/chat",
                json={"user_id": 21, "role": "EMPLOYEE", "message": "donne moi un bulletin de paie"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["intent"], "REQUEST_DOCUMENT")
        self.assertEqual(body["action"], "request_document")
        self.assertEqual(body["type"], "workflow")
        self.assertEqual(execute_mock.await_count, 1)


if __name__ == "__main__":
    unittest.main()
