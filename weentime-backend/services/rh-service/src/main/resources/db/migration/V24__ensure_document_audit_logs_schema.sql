-- Repare un schema incomplet si Hibernate a cree la table avant Flyway V23
CREATE TABLE IF NOT EXISTS document_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    entreprise_id   BIGINT       NOT NULL,
    document_id     BIGINT,
    action          VARCHAR(50)  NOT NULL,
    performed_by    BIGINT       NOT NULL,
    performed_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    details         TEXT
);

ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS entreprise_id BIGINT;
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS document_id BIGINT;
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS performed_by BIGINT;
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS performed_at TIMESTAMP DEFAULT NOW();
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS details TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_entreprise ON document_audit_logs (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_audit_document ON document_audit_logs (document_id);
