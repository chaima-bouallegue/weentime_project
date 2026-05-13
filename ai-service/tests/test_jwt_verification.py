from __future__ import annotations

import time

import pytest

from app.context.jwt_parser import JwtVerificationError, parse_jwt
from jwt_test_utils import TEST_JWT_SECRET, make_token, make_unsigned_token


def test_valid_verified_token_builds_claims() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})

    claims = parse_jwt(token, secret=TEST_JWT_SECRET)

    assert claims.verified is True
    assert claims.user_id == 12
    assert claims.role == "EMPLOYEE"
    assert claims.entreprise_id == 9


def test_invalid_token_signature_is_rejected() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9}, secret="wrong-secret")

    with pytest.raises(JwtVerificationError) as exc_info:
        parse_jwt(token, secret=TEST_JWT_SECRET)

    assert exc_info.value.code == "invalid_jwt_signature"


def test_unsigned_token_is_rejected_in_strict_mode() -> None:
    token = make_unsigned_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})

    with pytest.raises(JwtVerificationError) as exc_info:
        parse_jwt(token, secret=TEST_JWT_SECRET)

    assert exc_info.value.code == "invalid_jwt_signature"


def test_unverified_compatibility_requires_explicit_flag() -> None:
    token = make_unsigned_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})

    claims = parse_jwt(token, allow_unverified=True)

    assert claims.verified is False
    assert claims.user_id == 12


def test_missing_secret_is_not_silently_accepted() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})

    with pytest.raises(JwtVerificationError) as exc_info:
        parse_jwt(token, secret=None, allow_unverified=False)

    assert exc_info.value.code == "jwt_verification_not_configured"


def test_expired_token_is_rejected() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9, "exp": int(time.time()) - 120})

    with pytest.raises(JwtVerificationError) as exc_info:
        parse_jwt(token, secret=TEST_JWT_SECRET)

    assert exc_info.value.code == "expired_jwt"

