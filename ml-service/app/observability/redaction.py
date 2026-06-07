"""Redaction helpers used before data crosses the Braintrust boundary."""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import date, datetime
from enum import Enum
from typing import Any

JWT_PATTERN = re.compile(r"\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
BEARER_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._-]+", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
DB_URL_PATTERN = re.compile(
    r"\b(?:postgresql|postgres|mysql|mariadb|mongodb|redis)://[^\s\"')]+",
    re.IGNORECASE,
)
SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|token|authorization)"
    r"\s*[:=]\s*[^\s,;}]+" 
)

_PROCESS_SALT = secrets.token_bytes(32)
_SECRET_KEYS = {
    "authorization",
    "access_token",
    "token",
    "jwt",
    "api_key",
    "api-key",
    "x-api-key",
    "braintrust_api_key",
    "password",
    "passwd",
    "secret",
    "client_secret",
    "database_url",
    "db_url",
}
_PERSONAL_TEXT_KEYS = {
    "email",
    "employee_email",
    "employee_name",
    "employeename",
    "full_name",
    "fullname",
    "first_name",
    "firstname",
    "last_name",
    "lastname",
    "nom",
    "prenom",
    "name",
    "cv",
    "resume",
}
_IDENTIFIER_KEYS = {
    "employee_id",
    "employeeid",
    "user_id",
    "userid",
    "company_id",
    "companyid",
    "entreprise_id",
    "entrepriseid",
    "tenant_id",
    "tenantid",
    "team_id",
    "teamid",
    "department_id",
    "departmentid",
    "manager_id",
    "managerid",
}


def anonymize_identifier(value: Any) -> str:
    digest = hashlib.sha256(_PROCESS_SALT + str(value).encode("utf-8")).hexdigest()
    return f"anon_{digest[:12]}"


def _normalize_key(key: Any) -> str:
    return str(key).strip().lower().replace("-", "_")


def redact_value(value: Any, *, max_text_length: int = 500) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return "[redacted-bytes]"
    if isinstance(value, str):
        text = BEARER_PATTERN.sub("Bearer [redacted]", value)
        text = JWT_PATTERN.sub("[redacted-jwt]", text)
        text = DB_URL_PATTERN.sub("[redacted-db-url]", text)
        text = SECRET_ASSIGNMENT_PATTERN.sub(
            lambda match: f"{match.group(1)}=[redacted]",
            text,
        )
        text = EMAIL_PATTERN.sub("[redacted-email]", text)
        if len(text) > max_text_length:
            return text[:max_text_length] + "...[truncated]"
        return text
    if isinstance(value, dict):
        safe: dict[str, Any] = {}
        for key, item in value.items():
            normalized = _normalize_key(key)
            if normalized in _SECRET_KEYS:
                safe[str(key)] = "[redacted]"
            elif normalized in _PERSONAL_TEXT_KEYS:
                safe[str(key)] = "[redacted-personal-data]"
            elif normalized in _IDENTIFIER_KEYS:
                safe[str(key)] = anonymize_identifier(item) if item is not None else None
            else:
                safe[str(key)] = redact_value(item, max_text_length=max_text_length)
        return safe
    if isinstance(value, (list, tuple, set)):
        return [redact_value(item, max_text_length=max_text_length) for item in value]
    return redact_value(str(value), max_text_length=max_text_length)
