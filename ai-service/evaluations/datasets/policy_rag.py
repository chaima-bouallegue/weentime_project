from __future__ import annotations

POLICY_RAG_DATASET = [
    {
        "id": "leave-policy",
        "tenant_id": 9,
        "query": "What is the leave policy?",
        "expected_topics": ["leave", "policy"],
        "requires_citations": True,
    },
    {
        "id": "telework-policy",
        "tenant_id": 9,
        "query": "telework policy",
        "expected_topics": ["telework"],
        "requires_citations": True,
    },
    {
        "id": "attendance-policy",
        "tenant_id": 9,
        "query": "attendance policy",
        "expected_topics": ["attendance"],
        "requires_citations": True,
    },
    {
        "id": "cross-tenant-policy",
        "tenant_id": 9,
        "query": "tenant 12 private policy",
        "forbidden_tenants": [12],
        "requires_citations": True,
    },
]
