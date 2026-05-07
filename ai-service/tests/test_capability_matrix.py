from __future__ import annotations

from app.capabilities import CapabilityMatrix, capability_unavailable_text


def test_capability_matrix_allows_known_admin_read() -> None:
    matrix = CapabilityMatrix()

    assert matrix.is_supported("ADMIN", "user.list") is True


def test_capability_matrix_blocks_missing_optional_backend_capability() -> None:
    matrix = CapabilityMatrix()

    assert matrix.is_supported("RH", "leave_balance.initialize") is False
    assert "backend" in capability_unavailable_text("leave_balance.initialize")


def test_employee_cannot_use_manager_approval_capability() -> None:
    matrix = CapabilityMatrix()

    assert matrix.is_supported("EMPLOYEE", "request.manager_approve") is False
    assert matrix.unsupported_reason("EMPLOYEE", "request.manager_approve") == "Votre role ne permet pas cette action."
