CREATE TABLE solde_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(255) NOT NULL,
    utilisateur_id BIGINT NOT NULL,
    type_conge_id BIGINT NOT NULL,
    ancien_solde DOUBLE PRECISION,
    nouveau_solde DOUBLE PRECISION,
    motif TEXT,
    perform_by VARCHAR(255) NOT NULL,
    annee INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL
);
