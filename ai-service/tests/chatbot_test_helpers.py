from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import process_copilot_message
from app.tools.result import ToolResult


class ChatbotFakeBackend:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Any]] = []

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role, "entrepriseId": context.entreprise_id or 9})
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "PRESENT", "state": "OPEN", "active": True, "checkIn": "08:30", "checkOut": None})
        if path == "/presence/me/stats":
            return ToolResult.ok({"weekHours": 37.5, "overtimeHours": 1.5})
        if path == "/presence/me/history":
            return ToolResult.ok({"items": [{"date": "2026-05-17", "hours": 7.5}]})
        if path == "/presence/team/today":
            return ToolResult.ok({"scope": "TEAM", "totalMembers": 5, "presentCount": 4, "absentCount": 1, "lateCount": 0})
        if path == "/presence/company/today":
            return ToolResult.ok({"scope": "COMPANY", "totalMembers": 20, "presentCount": 16, "absentCount": 4, "lateCount": 2})
        if path == "/presence/global/analytics":
            return ToolResult.ok({"scope": "GLOBAL", "totalTrackedUsers": 20, "presentToday": 16, "absentToday": 4, "lateToday": 2})
        if path == "/rh/solde-conges/me/all":
            return ToolResult.ok([{"libelle": "Conge annuel", "joursRestants": 12}])
        if path == "/rh/conges/me":
            return ToolResult.ok([{"id": 1, "statut": "EN_ATTENTE", "dateDebut": "2026-05-20", "dateFin": "2026-05-21"}])
        if path == "/rh/conges/manager":
            return ToolResult.ok([{"id": 42, "statut": "EN_ATTENTE_MANAGER", "employe": "Essia", "dateDebut": "2026-05-20"}])
        if path == "/rh/conges/rh/pending":
            return ToolResult.ok({"content": [{"id": 42, "statut": "EN_ATTENTE_RH", "employe": "Essia", "dateDebut": "2026-05-20"}]})
        if path.startswith("/rh/conges/"):
            return ToolResult.ok({"id": 42, "statut": "EN_ATTENTE", "employe": "Essia", "dateDebut": "2026-05-20"})
        if path == "/rh/teletravail/mes-demandes":
            return ToolResult.ok({"content": [{"id": 2, "statut": "EN_ATTENTE", "dateDebut": "2026-05-22"}]})
        if path == "/rh/teletravail/demandes-equipe":
            return ToolResult.ok({"content": [{"id": 43, "statut": "EN_ATTENTE_MANAGER", "employe": "Ahmed"}]})
        if path == "/rh/teletravail/en-attente-rh":
            return ToolResult.ok({"content": [{"id": 44, "statut": "EN_ATTENTE_RH", "employe": "Amin Dupont", "dateDebut": "2026-05-20"}]})
        if path.startswith("/rh/teletravail/"):
            return ToolResult.ok({"id": 44, "statut": "EN_ATTENTE", "employe": "Sarah", "dateDebut": "2026-05-22"})
        if path == "/rh/autorisations/me":
            return ToolResult.ok({"content": [{"id": 3, "statut": "EN_ATTENTE", "dateAutorisation": "2026-05-18"}]})
        if path == "/rh/autorisations/manager":
            return ToolResult.ok({"content": [{"id": 45, "statut": "EN_ATTENTE_MANAGER", "employe": "Amin"}]})
        if path == "/rh/autorisations/rh/history":
            return ToolResult.ok({"content": [{"id": 46, "statut": "EN_ATTENTE_RH", "employe": "Amin"}]})
        if path == "/rh/parametres/types-autorisations":
            return ToolResult.ok([{"id": 1, "libelle": "AUTRE"}])
        if path.startswith("/rh/autorisations/"):
            return ToolResult.ok({"id": 46, "statut": "EN_ATTENTE", "employe": "Amin", "dateAutorisation": "2026-05-18"})
        if path == "/documents/mes-demandes":
            return ToolResult.ok({"content": [{"id": 5, "type": "ATTESTATION_TRAVAIL", "statut": "PRET", "dateDemande": "2026-05-10"}]})
        if path == "/documents/rh/demandes":
            return ToolResult.ok({"content": [{"id": 6, "type": "ATTESTATION_TRAVAIL", "statut": "EN_ATTENTE"}]})
        if path == "/rh/stats":
            return ToolResult.ok({"totalEmployees": 20, "pendingRequests": 3})
        if path == "/rh/reunions/mes-reunions":
            return ToolResult.ok([{"uuid": "r1", "titre": "Daily", "dateHeure": "2026-05-17T09:00:00"}])
        if path == "/rh/reunions/prochaine":
            return ToolResult.ok({"uuid": "r1", "titre": "Daily", "dateHeure": "2026-05-17T09:00:00"})
        if path == "/horaires":
            return ToolResult.ok({"content": [{"id": 7, "nom": "Standard 35h", "heuresHebdomadaires": 35}], "totalElements": 1})
        if path == "/organisations/departements":
            return ToolResult.ok({"content": [{"id": 3, "nom": "Engineering", "codeInterne": "ENG", "entrepriseId": context.tenant_id}], "totalElements": 1})
        if path.startswith("/organisations/departements/") and path.count("/") == 3:
            department_id = int(path.rsplit("/", 1)[-1])
            return ToolResult.ok({"id": department_id, "nom": "Engineering", "codeInterne": "ENG", "entrepriseId": context.tenant_id})
        if path == "/organisations/equipes":
            return ToolResult.ok({"content": [{"id": 8, "nom": "Frontend", "departementId": 3, "estActive": True}], "totalElements": 1})
        if path.startswith("/organisations/equipes/") and path.count("/") == 3:
            team_id = int(path.rsplit("/", 1)[-1])
            return ToolResult.ok({"id": team_id, "nom": "Frontend", "departementId": 3, "responsableId": None, "estActive": True})
        if path in {"/structure/employees", "/organisations/users"}:
            return ToolResult.ok(
                {
                    "content": [
                        {
                            "id": 22,
                            "nom": "Dupont",
                            "prenom": "Amin",
                            "fullName": "Amin Dupont",
                            "email": "amin.dupont@example.com",
                            "statut": "ACTIF",
                            "entrepriseId": context.tenant_id,
                            "departementId": 3,
                            "equipeId": None,
                            "role": "EMPLOYEE",
                        },
                        {
                            "id": 23,
                            "nom": "Ben Ali",
                            "prenom": "Amin",
                            "fullName": "Amin Ben Ali",
                            "email": "amin.benali@example.com",
                            "statut": "ACTIF",
                            "entrepriseId": context.tenant_id,
                            "departementId": 3,
                            "equipeId": None,
                            "role": "EMPLOYEE",
                        },
                        {
                            "id": 24,
                            "nom": "Ben Ali",
                            "prenom": "Ahmed",
                            "fullName": "Ahmed Ben Ali",
                            "email": "ahmed.benali@example.com",
                            "statut": "ACTIF",
                            "entrepriseId": context.tenant_id,
                            "departementId": 3,
                            "equipeId": None,
                            "role": "EMPLOYEE",
                        },
                    ],
                    "totalElements": 3,
                }
            )
        if path == "/structure/managers":
            return ToolResult.ok(
                {
                    "content": [
                        {
                            "id": 31,
                            "nom": "Manager",
                            "prenom": "Mina",
                            "fullName": "Mina Manager",
                            "email": "mina.manager@example.com",
                            "statut": "ACTIF",
                            "entrepriseId": context.tenant_id,
                            "role": "MANAGER",
                        }
                    ],
                    "totalElements": 1,
                }
            )
        if path.startswith("/organisations/users/") and path.count("/") == 3:
            user_id = int(path.rsplit("/", 1)[-1])
            return ToolResult.ok(
                {
                    "id": user_id,
                    "nom": "Ben Ali",
                    "prenom": "Amin",
                    "email": "amin@example.com",
                    "statut": "ACTIF",
                    "entrepriseId": context.tenant_id,
                    "departementId": 3,
                    "equipeId": None,
                    "role": "EMPLOYEE",
                }
            )
        return ToolResult.fail("capability_unavailable", "Cette capacite n'est pas encore disponible dans le backend.", status_code=404)

    async def post(self, path: str, *, context: CurrentUserContext, json: dict[str, Any] | None = None, headers=None) -> ToolResult:
        self.calls.append(("POST", path, json))
        return ToolResult.ok({"id": 99, "path": path, **(json or {})}, status_code=201)

    async def request(self, method: str, path: str, *, context: CurrentUserContext, params=None, json=None, headers=None) -> ToolResult:
        self.calls.append((method.upper(), path, json))
        return ToolResult.ok({"id": 99, "path": path, **(json or {})}, status_code=200)


def make_context(role: str = "EMPLOYEE", *, user_id: int = 12, tenant_id: int = 9, language: str = "fr") -> CurrentUserContext:
    return build_chatbot_context_from_metadata(
        {
            "chatbotPublicContext": True,
            "role": role,
            "userId": user_id,
            "entrepriseId": tenant_id,
            "language": language,
        },
        language=language,
    )


def make_context_with_metadata(
    role: str = "EMPLOYEE",
    *,
    user_id: int = 12,
    tenant_id: int = 9,
    language: str = "fr",
    current_page: str | None = None,
    conversation_id: str | None = None,
    channel: str = "chat",
) -> CurrentUserContext:
    context = make_context(role, user_id=user_id, tenant_id=tenant_id, language=language)
    context.metadata["channel"] = channel
    if current_page:
        context.metadata["current_page"] = current_page
    if conversation_id:
        context.metadata["conversation_id"] = conversation_id
    return context


def make_state(backend: ChatbotFakeBackend | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        copilot_ready=False,
        copilot_backend_client=backend or ChatbotFakeBackend(),
        settings=SimpleNamespace(
            backend_timeout_seconds=1,
            backend_base_url="http://localhost:8222/api/v1",
            workflow_session_ttl_seconds=1800,
            redis_enabled=False,
            redis_url="redis://localhost:6379",
            ai_provider_mode="disabled",
        ),
    )


async def send_chatbot_message(
    message: str,
    *,
    role: str = "EMPLOYEE",
    session_id: str = "chatbot-test",
    language: str = "fr",
    backend: ChatbotFakeBackend | None = None,
    current_page: str | None = None,
    conversation_id: str | None = None,
    channel: str = "chat",
):
    state = make_state(backend)
    context = make_context_with_metadata(
        role,
        language=language,
        current_page=current_page,
        conversation_id=conversation_id,
        channel=channel,
    )
    response = await process_copilot_message(
        context.user_id,
        message,
        None,
        role,
        channel=channel,
        metadata={
            "app_state": state,
            "session_id": session_id,
            "language": language,
            "current_page": current_page,
            "conversation_id": conversation_id or session_id,
        },
        context=context,
    )
    return response, state
