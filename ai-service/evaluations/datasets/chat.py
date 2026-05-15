from __future__ import annotations

CHAT_DATASET = [
    {
        "id": "employee-leave-balance",
        "role": "EMPLOYEE",
        "input": "how many leave days left",
        "expected_intent": "leave.balance",
        "expected_output": {"intent": "leave.balance", "type": "answer", "authoritative_source": "tool"},
    },
    {
        "id": "employee-pending-requests",
        "role": "EMPLOYEE",
        "input": "show pending requests",
        "expected_intent": "employee.requests",
        "expected_output": {"intent": "employee.requests", "type": "answer", "authoritative_source": "tool"},
    },
    {
        "id": "manager-pending-approvals",
        "role": "MANAGER",
        "input": "show pending approvals",
        "expected_intent": "manager.approvals",
        "expected_output": {"intent": "manager.approvals", "type": "answer", "authoritative_source": "tool"},
    },
    {
        "id": "rh-backlog",
        "role": "RH",
        "input": "HR backlog",
        "expected_intent": "rh.backlog",
        "expected_output": {"intent": "rh.backlog", "type": "answer", "authoritative_source": "tool"},
    },
    {
        "id": "admin-health",
        "role": "ADMIN",
        "input": "system health",
        "expected_intent": "admin.diagnostics",
        "expected_output": {"intent": "admin.diagnostics", "type": "answer", "authoritative_source": "diagnostics"},
    },
]

ROLE_INTELLIGENCE_DATASET = [
    {
        "id": "employee-digest",
        "role": "EMPLOYEE",
        "input": "what should I do today?",
        "expected_intent": "role_intelligence.employee_digest",
        "expected_sections": ["leave", "attendance", "communication"],
    },
    {
        "id": "manager-digest",
        "role": "MANAGER",
        "input": "give me today's summary",
        "expected_intent": "role_intelligence.manager_digest",
        "expected_sections": ["approvals", "attendance", "team"],
    },
    {
        "id": "rh-digest",
        "role": "RH",
        "input": "what requires attention?",
        "expected_intent": "role_intelligence.rh_digest",
        "expected_sections": ["validations", "documents", "anomalies"],
    },
    {
        "id": "admin-digest",
        "role": "ADMIN",
        "input": "AI status",
        "expected_intent": "role_intelligence.admin_digest",
        "expected_sections": ["provider", "redis", "rag", "braintrust"],
    },
]

MULTILINGUAL_CHAT_DATASET = [
    {"id": "fr-leave", "locale": "fr", "input": "je veux un congé demain", "expected_intent": "leave.create"},
    {"id": "en-leave", "locale": "en", "input": "I need leave tomorrow", "expected_intent": "leave.create"},
    {"id": "ar-leave", "locale": "ar", "input": "أريد إجازة غدا", "expected_intent": "leave.create"},
    {"id": "tn-leave", "locale": "tn", "input": "nheb congé ghodwa", "expected_intent": "leave.create"},
]
