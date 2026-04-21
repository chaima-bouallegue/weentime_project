-- Migration V1: Initial database schema for presence-service

CREATE TABLE presences (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT NOT NULL,
    date_presence DATE NOT NULL,
    heure_entree TIMESTAMP,
    heure_sortie TIMESTAMP,
    total_heures_travaillees DECIMAL(6, 2) DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    source VARCHAR(16) NOT NULL,
    localisation VARCHAR(128),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT DEFAULT 0,
    CONSTRAINT uk_presence_user_date UNIQUE (utilisateur_id, date_presence)
);

CREATE TABLE work_schedules (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT NOT NULL UNIQUE,
    heure_debut TIME NOT NULL,
    heure_fin TIME NOT NULL,
    tolerance_retard_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT DEFAULT 0
);

CREATE TABLE work_schedule_days (
    work_schedule_id BIGINT NOT NULL REFERENCES work_schedules(id),
    jour_travail VARCHAR(16) NOT NULL
);

CREATE TABLE overtimes (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT NOT NULL,
    date_presence DATE NOT NULL,
    heures_supplementaires DECIMAL(6, 2) NOT NULL,
    approuvee BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT DEFAULT 0
);

CREATE INDEX idx_presence_user_date ON presences(utilisateur_id, date_presence);
CREATE INDEX idx_presence_status_date ON presences(status, date_presence);
