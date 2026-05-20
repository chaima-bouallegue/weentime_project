"""Role-aware attendance scope selection (manager vs RH)."""
from __future__ import annotations

import asyncio
from datetime import date

import pytest

from app.inference.anomaly_detector import AnomalyDetector
from app.inference.backend_client import decode_jwt_roles, select_scope


def _mint(roles: list[str]) -> str:
    """Build an unsigned-but-decodable JWT carrying the given roles claim."""
    import base64
    import json

    def b64(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    header = b64({"alg": "HS256", "typ": "JWT"})
    payload = b64({"sub": "u", "roles": roles})
    return f"{header}.{payload}.sig"


# -- decode_jwt_roles --------------------------------------------------------

def test_decode_roles_list():
    token = _mint(["ROLE_MANAGER"])
    assert decode_jwt_roles(token) == ["ROLE_MANAGER"]


def test_decode_role_string_claim():
    import base64
    import json

    def b64(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    token = f"{b64({'alg': 'HS256'})}.{b64({'role': 'ROLE_RH'})}.sig"
    assert "ROLE_RH" in decode_jwt_roles(token)


def test_decode_garbage_token_is_safe():
    assert decode_jwt_roles("not-a-jwt") == []
    assert decode_jwt_roles(None) == []


# -- select_scope ------------------------------------------------------------

def test_manager_selects_team_endpoint():
    scope, endpoint, role = select_scope(["ROLE_MANAGER"])
    assert scope == "TEAM"
    assert endpoint == "presence/team/today"
    assert role == "MANAGER"


def test_rh_selects_company_endpoint():
    scope, endpoint, role = select_scope(["ROLE_RH"])
    assert scope == "COMPANY"
    assert endpoint == "presence/company/today"
    assert role == "RH"


def test_admin_selects_company_endpoint():
    scope, _, _ = select_scope(["ROLE_ADMIN"])
    assert scope == "COMPANY"


def test_rh_precedence_over_manager():
    # A user holding both should see the wider company scope.
    scope, _, _ = select_scope(["ROLE_MANAGER", "ROLE_RH"])
    assert scope == "COMPANY"


def test_unknown_role_defaults_to_company():
    scope, _, _ = select_scope(["ROLE_EMPLOYEE"])
    assert scope == "COMPANY"


# -- fetch_today_for_role dispatch (mocked backend) --------------------------

class _FakeBackend:
    """Records the endpoint hit and returns a TEAM-style payload with 2 absent members."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def get(self, path, *, token=None, user_id=0, role="RH", tenant_id=None, params=None):
        self.calls.append(path)
        return {
            "success": True,
            "data": {
                "members": [
                    {"utilisateurId": 1, "nomComplet": "Jean Dupont", "status": "ABSENT",
                     "heureEntree": None, "heureSortie": None, "lateArrival": False},
                    {"utilisateurId": 2, "nomComplet": "essia Dupont", "status": "ABSENT",
                     "heureEntree": None, "heureSortie": None, "lateArrival": False},
                ]
            },
        }


def test_manager_token_routes_to_team_endpoint():
    backend = _FakeBackend()
    detector = AnomalyDetector(backend=backend)
    token = _mint(["ROLE_MANAGER"])
    records, backend_ok, scope = asyncio.run(detector.fetch_today_for_role(token, user_id=0, tenant_id=None))
    assert backend.calls == ["presence/team/today"]
    assert scope == "TEAM"
    assert backend_ok is True
    assert len(records) == 2  # absent members still come back as records


def test_rh_token_routes_to_company_endpoint():
    backend = _FakeBackend()
    detector = AnomalyDetector(backend=backend)
    token = _mint(["ROLE_RH"])
    _, _, scope = asyncio.run(detector.fetch_today_for_role(token, user_id=0, tenant_id=None))
    assert backend.calls == ["presence/company/today"]
    assert scope == "COMPANY"


def test_backend_ok_with_absent_members_is_not_demo():
    """A 200 with all-absent members must NOT trigger the synthetic demo path."""
    backend = _FakeBackend()
    detector = AnomalyDetector(backend=backend)
    token = _mint(["ROLE_MANAGER"])
    records, backend_ok, _ = asyncio.run(detector.fetch_today_for_role(token, user_id=0, tenant_id=None))
    # Records present + backend_ok -> route takes analyze_today (not demo).
    assert backend_ok is True
    assert len(records) > 0


def test_spring_api_response_with_null_error_is_backend_ok():
    """Spring ApiResponse includes error=null on success; that is not a failure."""

    class _SpringEnvelopeBackend(_FakeBackend):
        async def get(self, path, *, token=None, user_id=0, role="RH", tenant_id=None, params=None):
            payload = await super().get(path, token=token, user_id=user_id, role=role, tenant_id=tenant_id, params=params)
            return {
                "success": True,
                "data": payload["data"],
                "error": None,
                "details": None,
                "message": None,
            }

    backend = _SpringEnvelopeBackend()
    detector = AnomalyDetector(backend=backend)
    token = _mint(["ROLE_RH"])

    records, backend_ok, scope = asyncio.run(detector.fetch_today_for_role(token, user_id=0, tenant_id=None))

    assert backend.calls == ["presence/company/today"]
    assert scope == "COMPANY"
    assert backend_ok is True
    assert len(records) == 2
