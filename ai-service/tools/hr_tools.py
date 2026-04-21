from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from config import Settings
from tools.api_client import ApiClient, BinaryResult, ToolResult


DOCUMENT_CODE_FALLBACKS = {
    "ATTESTATION_TRAVAIL": "ATTESTATION_TRAVAIL",
    "BULLETIN_PAIE": "BULLETIN_PAIE",
    "ATTESTATION_SALAIRE": "ATTESTATION_SALAIRE",
    "CONTRAT_TRAVAIL": "CONTRAT_TRAVAIL",
    "CERTIFICAT_CONGE": "CERTIFICAT_CONGE",
    "ATTESTATION_ANCIENNETE": "ATTESTATION_ANCIENNETE",
    "FICHE_POSTE": "FICHE_POSTE",
}

SAFE_NOOP_STATUSES = {"already_processed", "already_exists", "already_checked_in"}


class HRTools:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.api = ApiClient(settings)

    async def aclose(self) -> None:
        await self.api.aclose()

    async def execute_action(
        self,
        action: str,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        dispatch = {
            "get_leave_balance": self.get_leave_balance,
            "create_leave": self.create_leave,
            "create_authorization": self.create_authorization,
            "create_telework": self.create_telework,
            "request_document": self.request_document,
            "open_document": self.open_document,
            "get_notifications": self.get_notifications,
            "get_my_requests": self.get_my_requests,
            "approve_request": self.approve_request,
            "reject_request": self.reject_request,
            "get_team_requests": self.get_team_requests,
            "get_pending_validations": self.get_pending_validations,
            "get_rh_stats": self.get_rh_stats,
            "get_all_requests": self.get_all_requests,
            "process_request": self.process_request,
        }
        handler = dispatch.get(action)
        if handler is None:
            return ToolResult(
                success=False,
                tool=action,
                status="error",
                text=f"Unsupported action: {action}",
                error="unsupported_action",
            )
        return await handler(payload, user_id=user_id, access_token=access_token, role=role)

    async def get_leave_balance(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        params: dict[str, Any] = {}
        target_user_id = payload.get("target_user_id")
        if role.upper() in {"MANAGER", "RH"} and target_user_id:
            params["userId"] = int(target_user_id)

        result = await self.api.get("/v1/leave-balances", access_token=access_token, params=params or None)
        if not result.success:
            result.text = "Impossible de recuperer le solde de conges."
            return result

        balances = result.data if isinstance(result.data, list) else []
        total = sum(float(item.get("joursRestants") or 0) for item in balances if isinstance(item, dict))
        result.data = {"total": total, "balances": balances}
        result.text = f"Votre solde disponible est de {total:.1f} jour(s)."
        return result

    async def create_leave(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = role
        leave_type_id = await self.resolve_leave_type_id(payload.get("leave_type_label"), access_token)
        body = {
            "utilisateurId": user_id,
            "dateDebut": payload.get("start_date"),
            "dateFin": payload.get("end_date"),
            "typeCongeId": leave_type_id or 1,
        }
        if payload.get("reason"):
            body["motif"] = payload["reason"]

        result = await self.api.post(
            "/v1/conges",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=body,
        )
        result = self._normalize_known_backend_state(result)
        if result.success:
            result.text = "Votre demande de conge a ete envoyee."
        elif result.status == "already_exists":
            result.text = "Une demande de conge existe deja sur cette periode."
        else:
            result.text = "La creation de la demande de conge a echoue."
        return result

    async def create_authorization(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = (user_id, role)
        auth_type = await self.resolve_authorization_type(payload.get("authorization_type"), access_token)
        body = {
            "dateAutorisation": payload.get("request_date"),
            "heureDebut": payload.get("time_start"),
            "heureFin": payload.get("time_end"),
            "motif": payload.get("reason") or "Demande creee via assistant",
            "typeAutorisation": auth_type,
        }
        result = await self.api.post(
            "/v1/autorisations",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=body,
        )
        result = self._normalize_known_backend_state(result)
        if result.success:
            result.text = "Votre demande d'autorisation a ete envoyee."
        elif result.status == "already_exists":
            result.text = "Une demande similaire est deja en cours."
        else:
            result.text = "La creation de la demande d'autorisation a echoue."
        return result

    async def create_telework(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = (user_id, role)
        body = {
            "type": payload.get("telework_type") or "JOURNEE_COMPLETE",
            "dateDebut": payload.get("start_date"),
            "dateFin": payload.get("end_date"),
            "periode": payload.get("telework_period"),
            "motif": payload.get("reason") or "Demande creee via assistant RH",
        }
        result = await self.api.post(
            "/v1/teletravail",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=body,
        )
        result = self._normalize_known_backend_state(result)
        if result.success:
            result.text = "Votre demande de teletravail a ete envoyee."
        elif result.status == "already_exists":
            result.text = "Une demande de teletravail existe deja sur cette periode."
        else:
            result.text = "La creation de la demande de teletravail a echoue."
        return result

    async def request_document(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = (user_id, role)
        document_code = await self.resolve_document_type_code(payload.get("document_type"), access_token)
        document_id = await self.resolve_document_type_id(document_code, access_token)
        body = {
            "type": document_code,
            "typeDocumentId": document_id,
            "moisConcerne": payload.get("month"),
            "motif": payload.get("reason") or document_code,
        }
        result = await self.api.post(
            "/v1/documents",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=body,
        )
        result = self._normalize_known_backend_state(result)
        if result.success:
            result.text = "Votre demande de document a ete envoyee."
        elif result.status == "already_exists":
            result.text = "Une demande de ce document est deja en cours."
        else:
            result.text = "La demande de document a echoue."
        return result

    async def open_document(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = user_id
        request_id = payload.get("request_id")
        if request_id in (None, ""):
            return ToolResult(
                success=False,
                tool="open_document",
                status="error",
                text="L'identifiant du document est obligatoire.",
                error="missing_document_id",
            )

        endpoint = (
            f"/v1/documents/{request_id}/file"
            if role.upper() == "RH"
            else f"/v1/documents/{request_id}/telecharger"
        )
        binary = await self.api.get_binary(endpoint, access_token=access_token)
        if not binary.success:
            return ToolResult(
                success=False,
                tool="open_document",
                status="error",
                text="Impossible d'ouvrir ce document.",
                error=binary.error,
                status_code=binary.status_code,
                details=binary.details,
            )

        download_url = self._store_document(binary, request_id=request_id)
        return ToolResult(
            success=True,
            tool="open_document",
            status="success",
            text="Le document est pret.",
            data={"download_url": download_url},
            details={"download_url": download_url},
        )

    async def get_notifications(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = (payload, user_id)
        primary_endpoint = "/v1/rh/notifications/mes-notifications" if role.upper() == "RH" else "/v1/notifications"
        fallback_endpoint = "/v1/notifications" if primary_endpoint != "/v1/notifications" else None

        result = await self.api.get(primary_endpoint, access_token=access_token)
        if not result.success and fallback_endpoint:
            result = await self.api.get(fallback_endpoint, access_token=access_token)
        if not result.success:
            result.text = "Impossible de charger les notifications."
            return result

        items = result.data if isinstance(result.data, list) else []
        result.data = {"count": len(items), "items": items}
        result.text = f"Vous avez {len(items)} notification(s)."
        return result

    async def get_my_requests(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
    ) -> ToolResult:
        _ = (payload, user_id, role)
        responses = await asyncio.gather(
            self.api.get("/v1/rh/conges/me", access_token=access_token),
            self.api.get("/v1/rh/autorisations/my-history", access_token=access_token, params={"page": 0, "size": 25}),
            self.api.get("/v1/rh/teletravails/mes-demandes", access_token=access_token),
            self.api.get("/v1/documents/mes-demandes", access_token=access_token),
            return_exceptions=True,
        )
        items = self._collect_request_items(list(responses))
        return ToolResult(
            success=True,
            tool="get_my_requests",
            status="success",
            text=(
                "Aucune demande n'a ete trouvee."
                if not items
                else f"{len(items)} demande(s) retrouvee(s)."
            ),
            data={"count": len(items), "items": items},
        )

    async def approve_request(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "MANAGER",
    ) -> ToolResult:
        _ = user_id
        return await self._send_decision(payload, role=role, approved=True, access_token=access_token)

    async def reject_request(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "MANAGER",
    ) -> ToolResult:
        _ = user_id
        return await self._send_decision(payload, role=role, approved=False, access_token=access_token)

    async def get_team_requests(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "MANAGER",
    ) -> ToolResult:
        _ = (payload, user_id, role)
        result = await self.api.get("/v1/manager/workspace", access_token=access_token)
        if result.success:
            items = self._extract_items_from_workspace(result.data)
            result.data = {"count": len(items), "items": items, "workspace": result.data}
            result.text = f"{len(items)} demande(s) equipe chargee(s)."
            return result

        fallback = await self.api.get(
            "/v1/demandes/manager/all",
            access_token=access_token,
            params={"page": 0, "size": 50},
        )
        items = self._extract_items(fallback.data)
        fallback.data = {"count": len(items), "items": items}
        fallback.text = (
            f"{len(items)} demande(s) equipe chargee(s)."
            if fallback.success
            else "Impossible de charger les demandes equipe."
        )
        return fallback

    async def get_pending_validations(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "MANAGER",
    ) -> ToolResult:
        _ = (payload, user_id, role)
        result = await self.api.get(
            "/v1/requests/manager/pending",
            access_token=access_token,
            params={"page": 0, "size": 50},
        )
        items = self._extract_items(result.data)
        if not result.success:
            workspace = await self.api.get("/v1/manager/workspace", access_token=access_token)
            items = self._extract_pending_items_from_workspace(workspace.data)
            workspace.data = {"count": len(items), "items": items, "workspace": workspace.data}
            workspace.text = (
                f"{len(items)} validation(s) en attente."
                if workspace.success
                else "Impossible de charger les validations en attente."
            )
            return workspace

        result.data = {"count": len(items), "items": items}
        result.text = f"{len(items)} validation(s) en attente."
        return result

    async def get_rh_stats(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "RH",
    ) -> ToolResult:
        _ = (payload, user_id, role)
        result = await self.api.get("/v1/rh/stats", access_token=access_token)
        result.text = "Les statistiques RH sont disponibles." if result.success else "Impossible de charger les statistiques RH."
        return result

    async def get_all_requests(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "RH",
    ) -> ToolResult:
        _ = (user_id, role)
        params = {"page": 0, "size": 50}
        if payload.get("type_demande"):
            params["type"] = str(payload["type_demande"])
        result = await self.api.get("/v1/rh/demandes", access_token=access_token, params=params)
        items = self._extract_items(result.data)
        result.data = {"count": len(items), "items": items}
        result.text = (
            f"{len(items)} demande(s) RH chargee(s)."
            if result.success
            else "Impossible de charger les demandes RH."
        )
        return result

    async def process_request(
        self,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None = None,
        role: str = "RH",
    ) -> ToolResult:
        _ = user_id
        approved = str(payload.get("decision") or "").upper() == "APPROUVE"
        return await self._send_decision(payload, role=role, approved=approved, access_token=access_token)

    async def fetch_request(
        self,
        payload: dict[str, Any],
        *,
        access_token: str | None = None,
        role: str = "MANAGER",
    ) -> ToolResult:
        request_id = payload.get("request_id")
        if request_id in (None, ""):
            return ToolResult(
                success=False,
                tool="fetch_request",
                status="error",
                text="L'identifiant de la demande est obligatoire.",
                error="missing_request_id",
            )

        request_type = str(payload.get("type_demande") or payload.get("request_type") or "").upper()
        if role.upper() == "RH":
            source = await self.get_all_requests(
                {"type_demande": request_type} if request_type else {},
                user_id=0,
                access_token=access_token,
                role=role,
            )
        else:
            source = await self.get_team_requests({}, user_id=0, access_token=access_token, role=role)

        if not source.success:
            return ToolResult(
                success=False,
                tool="fetch_request",
                status=source.status,
                text="Impossible de recuperer la demande cible.",
                error=source.error,
                status_code=source.status_code,
                details=source.details,
            )

        items = []
        if isinstance(source.data, dict):
            items = self._extract_items(source.data)
        elif isinstance(source.data, list):
            items = [item for item in source.data if isinstance(item, dict)]

        for item in items:
            if str(item.get("id")) != str(request_id):
                continue
            current_type = str(
                item.get("typeDemande")
                or item.get("type")
                or item.get("requestType")
                or ""
            ).upper()
            if request_type and current_type and current_type != request_type:
                continue
            return ToolResult(
                success=True,
                tool="fetch_request",
                status="success",
                text=f"Demande {request_id} retrouvee.",
                data=item,
                details={"request": item},
            )

        return ToolResult(
            success=False,
            tool="fetch_request",
            status="error",
            text="Demande introuvable.",
            error="request_not_found",
        )

    async def get_my_telework_requests(
        self,
        *,
        access_token: str | None = None,
    ) -> ToolResult:
        result = await self.api.get("/v1/rh/teletravails/mes-demandes", access_token=access_token)
        items = self._extract_items(result.data)
        result.data = {"count": len(items), "items": items}
        result.text = (
            f"{len(items)} demande(s) de teletravail chargee(s)."
            if result.success
            else "Impossible de verifier les demandes de teletravail existantes."
        )
        return result

    async def notify_user(
        self,
        user_id: int | str,
        *,
        title: str,
        message: str,
        notification_type: str = "SYSTEM",
        action_url: str | None = None,
        metadata: dict[str, Any] | None = None,
        access_token: str | None = None,
    ) -> ToolResult:
        result = await self.api.post(
            f"/v1/notifications/internal/users/{user_id}",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=self._notification_payload(
                title=title,
                message=message,
                notification_type=notification_type,
                action_url=action_url,
                metadata=metadata,
            ),
        )
        result.text = "Notification utilisateur envoyee." if result.success else "Notification utilisateur non envoyee."
        return result

    async def notify_role(
        self,
        role_name: str,
        *,
        title: str,
        message: str,
        notification_type: str = "SYSTEM",
        action_url: str | None = None,
        metadata: dict[str, Any] | None = None,
        access_token: str | None = None,
    ) -> ToolResult:
        result = await self.api.post(
            f"/v1/notifications/internal/roles/{role_name}",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=self._notification_payload(
                title=title,
                message=message,
                notification_type=notification_type,
                action_url=action_url,
                metadata=metadata,
            ),
        )
        result.text = "Notification role envoyee." if result.success else "Notification role non envoyee."
        return result

    async def notify_manager(
        self,
        manager_id: int | str,
        *,
        title: str,
        message: str,
        notification_type: str = "SYSTEM",
        action_url: str | None = None,
        metadata: dict[str, Any] | None = None,
        access_token: str | None = None,
    ) -> ToolResult:
        result = await self.api.post(
            f"/v1/notifications/internal/managers/{manager_id}",
            access_token=access_token,
            expected_statuses={200, 201},
            json_body=self._notification_payload(
                title=title,
                message=message,
                notification_type=notification_type,
                action_url=action_url,
                metadata=metadata,
            ),
        )
        result.text = "Notification manager envoyee." if result.success else "Notification manager non envoyee."
        return result

    async def resolve_document_type_code(self, document_type: Any, access_token: str | None = None) -> str:
        if document_type is None:
            return "ATTESTATION_TRAVAIL"
        raw_value = str(document_type).strip().upper()
        if raw_value in DOCUMENT_CODE_FALLBACKS:
            return raw_value

        result = await self.api.get("/v1/rh/parametres/types-documents", access_token=access_token)
        lookup = str(document_type).strip().lower().replace("_", " ")
        if result.success and isinstance(result.data, list):
            for item in result.data:
                if not isinstance(item, dict):
                    continue
                label = str(item.get("libelle") or "").strip().lower()
                code = str(item.get("code") or "").strip().upper()
                if lookup == label or lookup == code.lower() or lookup in label:
                    return code or DOCUMENT_CODE_FALLBACKS.get(raw_value, "ATTESTATION_TRAVAIL")
        return DOCUMENT_CODE_FALLBACKS.get(raw_value, "ATTESTATION_TRAVAIL")

    async def resolve_document_type_id(self, document_code: str, access_token: str | None = None) -> int | None:
        result = await self.api.get("/v1/rh/parametres/types-documents", access_token=access_token)
        if result.success and isinstance(result.data, list):
            for item in result.data:
                if not isinstance(item, dict):
                    continue
                code = str(item.get("code") or "").strip().upper()
                item_id = item.get("id")
                if code == document_code and isinstance(item_id, int):
                    return item_id
        return None

    async def resolve_leave_type_id(self, leave_type_label: Any, access_token: str | None = None) -> int | None:
        result = await self.api.get("/v1/rh/type-conges", access_token=access_token)
        preferred = str(leave_type_label or "conge annuel").strip().lower()
        first_available: int | None = None
        if result.success and isinstance(result.data, list):
            for item in result.data:
                if not isinstance(item, dict):
                    continue
                item_id = item.get("id")
                if first_available is None and isinstance(item_id, int):
                    first_available = item_id
                label = str(item.get("libelle") or "").strip().lower()
                if preferred == label or preferred in label:
                    if isinstance(item_id, int):
                        return item_id
        return first_available

    async def resolve_authorization_type(self, authorization_type: Any, access_token: str | None = None) -> dict[str, Any]:
        preferred = str(authorization_type or "AUTRE").strip().replace("_", " ").lower()
        result = await self.api.get("/v1/rh/parametres/types-autorisations", access_token=access_token)
        if result.success and isinstance(result.data, list):
            for item in result.data:
                if not isinstance(item, dict):
                    continue
                item_id = item.get("id")
                label = str(item.get("libelle") or "").strip().lower()
                if preferred == label or preferred in label:
                    if isinstance(item_id, int):
                        return {"id": item_id}
                    return {"libelle": label}
        return {"libelle": str(authorization_type or "AUTRE").replace("_", " ").title()}

    async def _send_decision(
        self,
        payload: dict[str, Any],
        *,
        role: str,
        approved: bool,
        access_token: str | None,
    ) -> ToolResult:
        request_id = payload.get("request_id")
        type_demande = str(payload.get("type_demande") or payload.get("request_type") or "").upper()
        comment = payload.get("comment") or payload.get("reason")
        if request_id in (None, "") or not type_demande:
            return ToolResult(
                success=False,
                tool="process_request",
                status="error",
                text="Le type de demande et l'identifiant sont obligatoires.",
                error="missing_request_reference",
            )

        generic_endpoint = (
            f"/v1/rh/demandes/{request_id}/statut"
            if role.upper() == "RH"
            else f"/v1/demandes/{request_id}/statut"
        )
        generic_body, _ = self._decision_request_options(
            request_type=type_demande,
            approved=approved,
            comment=comment,
            generic=True,
        )
        result = await self.api.put(
            generic_endpoint,
            access_token=access_token,
            expected_statuses={200},
            json_body=generic_body,
        )
        result = self._normalize_known_backend_state(result)
        if result.success or result.status in SAFE_NOOP_STATUSES:
            result.text = self._decision_result_text(type_demande, request_id, approved, result.status)
            return result

        fallback_endpoint, method = self._decision_route(type_demande, role.upper(), approved)
        if fallback_endpoint is None:
            result.text = "Cette demande ne peut pas etre traitee pour ce role."
            result.error = "unsupported_request_type"
            return result

        final_endpoint = fallback_endpoint.format(id=request_id)
        body, params = self._decision_request_options(
            request_type=type_demande,
            approved=approved,
            comment=comment,
            generic=False,
        )
        if method == "PUT":
            fallback = await self.api.put(
                final_endpoint,
                access_token=access_token,
                expected_statuses={200},
                json_body=body,
            )
        else:
            fallback = await self.api.patch(
                final_endpoint,
                access_token=access_token,
                expected_statuses={200},
                json_body=body,
                params=params,
            )

        fallback = self._normalize_known_backend_state(fallback)
        fallback.text = self._decision_result_text(type_demande, request_id, approved, fallback.status)
        return fallback

    def _decision_route(self, request_type: str, role: str, approve: bool) -> tuple[str | None, str]:
        routes = {
            ("CONGE", "MANAGER", True): ("/v1/rh/conges/{id}/valider", "PATCH"),
            ("CONGE", "MANAGER", False): ("/v1/rh/conges/{id}/refuser", "PATCH"),
            ("CONGE", "RH", True): ("/v1/rh/conges/{id}/valider-rh", "PATCH"),
            ("CONGE", "RH", False): ("/v1/rh/conges/{id}/refuser-rh", "PATCH"),
            ("AUTORISATION", "MANAGER", True): ("/v1/rh/autorisations/{id}/manager/validate", "PATCH"),
            ("AUTORISATION", "MANAGER", False): ("/v1/rh/autorisations/{id}/reject", "PATCH"),
            ("AUTORISATION", "RH", True): ("/v1/rh/autorisations/{id}/rh/validate", "PATCH"),
            ("AUTORISATION", "RH", False): ("/v1/rh/autorisations/{id}/reject", "PATCH"),
            ("TELETRAVAIL", "MANAGER", True): ("/v1/rh/teletravails/{id}/valider-manager", "PATCH"),
            ("TELETRAVAIL", "MANAGER", False): ("/v1/rh/teletravails/{id}/rejeter-manager", "PATCH"),
            ("TELETRAVAIL", "RH", True): ("/v1/rh/teletravails/{id}/valider-rh", "PATCH"),
            ("TELETRAVAIL", "RH", False): ("/v1/rh/teletravails/{id}/rejeter-rh", "PATCH"),
            ("DOCUMENT", "RH", True): ("/v1/documents/{id}/statut", "PUT"),
            ("DOCUMENT", "RH", False): ("/v1/documents/{id}/refuser", "PUT"),
            ("ABSENCE", "RH", True): ("/v1/rh/absences/{id}/valider", "PATCH"),
            ("ABSENCE", "RH", False): ("/v1/rh/absences/{id}/rejeter", "PATCH"),
        }
        return routes.get((request_type, role, approve), (None, "PATCH"))

    def _decision_request_options(
        self,
        *,
        request_type: str,
        approved: bool,
        comment: str | None,
        generic: bool,
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        if generic:
            return (
                {
                    "statut": "APPROUVEE" if approved else "REFUSEE",
                    "typeDemande": request_type,
                    "commentaire": comment,
                },
                None,
            )

        if request_type == "CONGE":
            body = {"commentaire": comment} if comment else {}
            return body, body or None
        if request_type == "AUTORISATION":
            body = {"commentaire": comment} if comment else {}
            return body, body or None
        if request_type == "TELETRAVAIL":
            return ({"commentaire": comment} if comment else {}), None
        if request_type == "DOCUMENT":
            if approved:
                return {"statut": "PRET", "commentaireRH": comment}, None
            return {"commentaireRH": comment}, None
        if request_type == "ABSENCE":
            if approved:
                return {}, None
            return {"motifRefus": comment or "Refus via assistant RH"}, None
        return {}, None

    def _decision_result_text(self, request_type: str, request_id: Any, approved: bool, status: str | None) -> str:
        if status == "already_processed":
            return "Cette demande a deja ete traitee."
        if status == "already_exists":
            return "Une action identique est deja en cours."
        verb = "approuvee" if approved else "refusee"
        return f"La demande {request_type.lower()} {request_id} a ete {verb}."

    def _normalize_known_backend_state(self, result: ToolResult) -> ToolResult:
        error_blob = " ".join(
            value
            for value in (
                self._to_text(result.error),
                self._to_text(result.text),
                self._to_text(result.details.get("payload") if isinstance(result.details, dict) else None),
            )
            if value
        ).lower()

        if result.success:
            return result
        if result.status_code == 409 or "deja" in error_blob or "already" in error_blob:
            status = "already_exists"
            if "traite" in error_blob or "traited" in error_blob or "transition de statut non autorisee" in error_blob:
                status = "already_processed"
            if "pointe" in error_blob or "session deja ouverte" in error_blob:
                status = "already_checked_in"
            return ToolResult(
                success=False,
                tool=result.tool,
                status=status,
                text=result.text,
                data=result.data,
                error=result.error,
                status_code=result.status_code,
                details=result.details,
            )
        return result

    def _collect_request_items(self, responses: list[Any]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for response in responses:
            if isinstance(response, Exception) or not isinstance(response, ToolResult) or not response.success:
                continue
            items.extend(self._normalize_request_collection(response.data))
        return sorted(items, key=lambda item: item.get("dateCreation") or "", reverse=True)

    def _normalize_request_collection(self, payload: Any) -> list[dict[str, Any]]:
        collection = self._extract_items(payload)
        normalized: list[dict[str, Any]] = []
        for item in collection:
            if not isinstance(item, dict):
                continue
            request_type = str(
                item.get("typeDemande")
                or item.get("type")
                or item.get("typeDocument")
                or ("AUTORISATION" if item.get("typeAutorisation") else None)
                or "DEMANDE"
            ).upper()
            label = (
                item.get("typeCongeNom")
                or item.get("label")
                or item.get("motif")
                or item.get("typeDocument")
                or item.get("typeAutorisation")
            )
            normalized.append(
                {
                    "id": item.get("id"),
                    "type": request_type,
                    "statut": item.get("statut"),
                    "dateCreation": item.get("dateCreation") or item.get("createdAt") or item.get("dateMiseAJour"),
                    "label": label,
                }
            )
        return normalized

    def _extract_items(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            for key in ("content", "items", "requests", "pendingRequests", "recentRequests"):
                value = payload.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
            data = payload.get("data")
            if isinstance(data, list):
                return [item for item in data if isinstance(item, dict)]
            if isinstance(data, dict):
                return self._extract_items(data)
        return []

    def _extract_items_from_workspace(self, payload: Any) -> list[dict[str, Any]]:
        if not isinstance(payload, dict):
            return []
        candidates: list[dict[str, Any]] = []
        for key in ("requests", "recentRequests", "pendingRequests", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                candidates.extend(item for item in value if isinstance(item, dict))
            elif isinstance(value, dict):
                candidates.extend(self._extract_items(value))
        return self._normalize_request_collection(candidates)

    def _extract_pending_items_from_workspace(self, payload: Any) -> list[dict[str, Any]]:
        if not isinstance(payload, dict):
            return []
        pending = payload.get("pendingRequests")
        if isinstance(pending, list):
            return self._normalize_request_collection(pending)
        return self._extract_items_from_workspace(payload)

    def _notification_payload(
        self,
        *,
        title: str,
        message: str,
        notification_type: str,
        action_url: str | None,
        metadata: dict[str, Any] | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "title": title,
            "message": message,
            "type": notification_type,
        }
        if action_url:
            payload["actionUrl"] = action_url
        if metadata:
            payload["metadata"] = metadata
        return payload

    def _store_document(self, binary: BinaryResult, *, request_id: Any) -> str:
        suffix = Path(binary.filename or f"document_{request_id}.pdf").suffix or ".pdf"
        filename = f"{uuid4().hex}_{request_id}{suffix}"
        target = self.settings.generated_docs_dir / filename
        target.write_bytes(binary.content or b"")
        return f"{self.settings.public_base_url}/document/files/{filename}"

    def _to_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)
