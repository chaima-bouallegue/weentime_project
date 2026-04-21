-- ============================================================
-- V17: Table notifications pour persistance des alertes
-- ============================================================

CREATE TABLE notifications (
    id              BIGSERIAL       PRIMARY KEY,
    destinataire_id BIGINT,
    destinataire_role VARCHAR(50),
    type            VARCHAR(100)    NOT NULL,
    titre           VARCHAR(255)    NOT NULL,
    message         TEXT,
    icone           VARCHAR(50),
    couleur         VARCHAR(20),
    route           VARCHAR(255),
    entity_id       BIGINT,
    entity_type     VARCHAR(50),
    lu              BOOLEAN         DEFAULT FALSE,
    date_creation   TIMESTAMP       NOT NULL,
    entreprise_id   BIGINT          NOT NULL
);

-- Index pour requêtes "mes notifications non lues"
CREATE INDEX idx_notif_destinataire ON notifications(destinataire_id, entreprise_id, lu);

-- Index pour requêtes "notifications par rôle"
CREATE INDEX idx_notif_role ON notifications(destinataire_role, entreprise_id);

-- Index pour tri chronologique
CREATE INDEX idx_notif_date ON notifications(date_creation DESC);
