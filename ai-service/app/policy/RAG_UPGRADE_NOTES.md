# Policy RAG Upgrade Notes

The current production-safe path remains approved static HR policy and FAQ
sources only. RAG must not index live HR rows, private employee records,
payroll data, mutable request state, users, roles, approvals, or system health.

Future upgrades can be evaluated in this order:

1. Docling for offline extraction from explicitly approved HR policy PDFs.
2. BGE-M3 embeddings for stronger multilingual retrieval across FR/EN/AR/TN.
3. pgvector for tenant-scoped vector storage when Postgres operations are
   formally approved for vector data.
4. bge-reranker-v2 as a second-stage reranker after tenant and approval
   filtering.

Required invariants for every upgrade:

- Tenant filter remains mandatory before answer generation.
- `approved=true` source metadata remains mandatory.
- Every answer requires at least one valid citation with source id, title, and
  chunk/label/location.
- No citation means an unavailable answer, not a generated policy answer.
- Ollama may only reformulate cited content and must not create policy facts.
