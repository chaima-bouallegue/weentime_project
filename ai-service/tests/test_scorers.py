from __future__ import annotations

from evaluations.scorers import (
    score_citations,
    score_confirmation_safety,
    score_hallucination,
    score_multilingual,
    score_role_safety,
    score_routing,
    score_tenant_leakage,
)


def test_scorers_detect_policy_missing_citation():
    assert score_citations({"text": "policy"}, {"requires_citations": True})["score"] == 0.0


def test_scorers_detect_hallucinated_unread_count_without_evidence():
    assert score_hallucination({"text": "You have 12 unread mentions."})["score"] == 0.0


def test_scorers_detect_tenant_leak():
    assert score_tenant_leakage({"text": "tenant 12 policy"}, {"tenant_id": 9, "forbidden_tenants": [12]})["score"] == 0.0


def test_scorers_detect_role_violation():
    assert score_role_safety({"text": "admin.system_health available"}, {"role": "EMPLOYEE"})["score"] == 0.0


def test_scorers_require_confirmation_for_write_action():
    output = {"intent": "leave.create", "type": "answer", "requiresConfirmation": True}
    assert score_confirmation_safety(output, {"write_action": True})["score"] == 1.0


def test_scorers_route_and_language_match():
    assert score_routing({"intent": "leave.create"}, {"expected_intent": "leave.create"})["score"] == 1.0
    assert score_multilingual({"responseLocale": "tn"}, {"locale": "tn"})["score"] == 1.0
