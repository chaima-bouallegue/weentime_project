"""AI-FE-MASTER-CHATBOT-01 — public chatbot context (no JWT) coverage.

The chatbot endpoints (/v2/chat, /v2/chat/confirm, /v2/voice) accept requests
without a verified Authorization header when CHATBOT_PUBLIC_MODE=True. They
must:
  * Build a CurrentUserContext from request metadata (role/userId/entreprise).
  * Tag the context with chatbot_public_context=True, jwt_verified=False,
    role_verified_from_ui=True, source="chatbot_metadata".
  * Make CurrentUserContext.is_verified return True so ToolRegistry accepts
    role-permission-gated tool calls.
  * Fall back to EMPLOYEE / user 1 / entreprise 1 when metadata is missing
    or invalid.
"""

from __future__ import annotations

from app.context.anonymous_context import (
    DEFAULT_ENTREPRISE_ID,
    DEFAULT_ROLE,
    DEFAULT_USER_ID,
    build_chatbot_context_from_metadata,
)


def test_metadata_builds_role_context_with_public_flags() -> None:
    context = build_chatbot_context_from_metadata(
        {"role": "RH", "userId": 42, "entrepriseId": 7, "language": "fr"}
    )
    assert context.role == "RH"
    assert context.user_id == 42
    assert context.entreprise_id == 7
    assert context.language == "fr"
    # Spec-mandated metadata flags — frontend and backend rely on these names.
    assert context.metadata["chatbot_public_context"] is True
    assert context.metadata["jwt_verified"] is False
    assert context.metadata["role_verified_from_ui"] is True
    assert context.metadata["source"] == "chatbot_metadata"
    assert context.metadata["chatbot_public_mode"] is True


def test_is_verified_true_for_chatbot_public_context() -> None:
    context = build_chatbot_context_from_metadata({"role": "EMPLOYEE", "userId": 5})
    # ToolRegistry.validate_access requires is_verified for tool calls; without
    # this the chatbot would 401 every tool. jwt_verified must remain False so
    # downstream code can tell the JWT was NOT actually parsed.
    assert context.is_verified is True
    assert context.metadata["jwt_verified"] is False


def test_invalid_role_falls_back_to_employee() -> None:
    context = build_chatbot_context_from_metadata({"role": "SUPERADMIN", "userId": 1})
    assert context.role == DEFAULT_ROLE == "EMPLOYEE"


def test_missing_metadata_uses_defaults() -> None:
    context = build_chatbot_context_from_metadata(None)
    assert context.role == DEFAULT_ROLE
    assert context.user_id == DEFAULT_USER_ID
    assert context.entreprise_id == DEFAULT_ENTREPRISE_ID


def test_role_aliases_accepted() -> None:
    for hint in ("ROLE_ADMIN", "admin", "Admin"):
        context = build_chatbot_context_from_metadata({"role": hint, "userId": 1})
        assert context.role == "ADMIN", hint
