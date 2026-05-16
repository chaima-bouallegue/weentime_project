"""Mint a chatbot-public-context JWT for backend tool calls.

Locks the trust contract: minting only happens behind an explicit opt-in
flag AND requires a signing secret AND requires the context to actually be
chatbot_public_context. The minted token's claims must match what Spring's
auth-service produces so the backend filter accepts it.
"""

from __future__ import annotations

import base64
import json

from app.context.chatbot_backend_token import mint_chatbot_backend_token
from app.context.current_user import CurrentUserContext


_SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"


def _ctx(**overrides) -> CurrentUserContext:
    metadata = {"chatbot_public_context": True, "jwt_verified": False}
    metadata.update(overrides.pop("metadata", {}))
    return CurrentUserContext(
        user_id=overrides.get("user_id", 7),
        role=overrides.get("role", "EMPLOYEE"),
        entreprise_id=overrides.get("entreprise_id", 3),
        email=overrides.get("email"),
        token=None,
        metadata=metadata,
    )


def _decode_claims(token: str) -> dict:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")))


def test_minter_returns_none_without_opt_in(monkeypatch) -> None:
    monkeypatch.delenv("CHATBOT_BACKEND_JWT_MINT", raising=False)
    assert mint_chatbot_backend_token(_ctx(), secret=_SECRET) is None


def test_minter_returns_none_without_secret(monkeypatch) -> None:
    monkeypatch.setenv("CHATBOT_BACKEND_JWT_MINT", "true")
    for key in ("CHATBOT_BACKEND_JWT_SECRET", "JWT_SECRET", "AI_JWT_SECRET",
                "JWT_VERIFICATION_SECRET", "AI_JWT_VERIFICATION_SECRET"):
        monkeypatch.delenv(key, raising=False)
    assert mint_chatbot_backend_token(_ctx()) is None


def test_minter_returns_none_when_not_public_context(monkeypatch) -> None:
    monkeypatch.setenv("CHATBOT_BACKEND_JWT_MINT", "true")
    ctx = CurrentUserContext(
        user_id=1, role="EMPLOYEE", entreprise_id=1, token="real-user-jwt",
        metadata={"jwt_verified": True},
    )
    assert mint_chatbot_backend_token(ctx, secret=_SECRET) is None


def test_minter_emits_claims_spring_understands(monkeypatch) -> None:
    monkeypatch.setenv("CHATBOT_BACKEND_JWT_MINT", "true")
    ctx = _ctx(user_id=42, role="MANAGER", entreprise_id=9)
    token = mint_chatbot_backend_token(ctx, secret=_SECRET, ttl_seconds=120, now=1_700_000_000)
    assert token is not None
    claims = _decode_claims(token)
    assert claims["userId"] == 42
    assert claims["entrepriseId"] == 9
    # Spring's JwtAuthenticationFilter expects ROLE_-prefixed values.
    assert claims["role"] == "ROLE_MANAGER"
    assert claims["roles"] == ["ROLE_MANAGER"]
    assert claims["iat"] == 1_700_000_000
    assert claims["exp"] == 1_700_000_120
    assert claims["iss"] == "weentime-ai-chatbot"
    assert claims["sub"].startswith("chatbot+42@")


def test_minter_honours_email_when_metadata_carries_one(monkeypatch) -> None:
    monkeypatch.setenv("CHATBOT_BACKEND_JWT_MINT", "true")
    ctx = _ctx(user_id=7, email="hayet@example.com")
    token = mint_chatbot_backend_token(ctx, secret=_SECRET)
    assert token is not None
    claims = _decode_claims(token)
    assert claims["sub"] == "hayet@example.com"


def test_minter_normalises_role_aliases(monkeypatch) -> None:
    monkeypatch.setenv("CHATBOT_BACKEND_JWT_MINT", "true")
    for role_input, expected in (("ADMIN", "ROLE_ADMIN"), ("ROLE_RH", "ROLE_RH"), ("employee", "ROLE_EMPLOYEE")):
        token = mint_chatbot_backend_token(_ctx(role=role_input), secret=_SECRET)
        assert token is not None
        assert _decode_claims(token)["role"] == expected


def test_minter_uses_default_user_id_and_entreprise_for_missing_metadata(monkeypatch) -> None:
    monkeypatch.setenv("CHATBOT_BACKEND_JWT_MINT", "true")
    ctx = CurrentUserContext(
        user_id=0, role="EMPLOYEE", entreprise_id=None, token=None,
        metadata={"chatbot_public_context": True},
    )
    token = mint_chatbot_backend_token(ctx, secret=_SECRET)
    assert token is not None
    claims = _decode_claims(token)
    assert claims["userId"] == 1
    assert claims["entrepriseId"] == 1
