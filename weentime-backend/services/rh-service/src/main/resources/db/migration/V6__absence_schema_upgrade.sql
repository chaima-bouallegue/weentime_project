-- ============================================================
-- V6 — Absence schema upgrade
-- ============================================================

-- 1. Supprimer l'ancienne constraint statut obsolète de demandes
ALTER TABLE public.demandes DROP CONSTRAINT IF EXISTS demandes_statut_check;

-- 2. Migration des données existantes vers le nouveau standard masculin
-- Cela évite les violations de contrainte lors du passage au nouveau schéma
UPDATE public.demandes SET statut = 'APPROUVE' WHERE statut = 'APPROUVEE';
UPDATE public.demandes SET statut = 'REFUSE' WHERE statut = 'REFUSEE';
UPDATE public.demandes SET statut = 'ANNULE' WHERE statut = 'ANNULEE';

-- 3. Recréer avec les valeurs correctes (incluant EN_COURS et PRET pour les documents)
ALTER TABLE public.demandes
    ADD CONSTRAINT demandes_statut_check
    CHECK (statut IN (
        'EN_ATTENTE',
        'EN_ATTENTE_MANAGER',
        'EN_ATTENTE_RH',
        'EN_COURS',
        'PRET',
        'APPROUVE',
        'REFUSE',
        'ANNULE'
    ));

-- 4. Supprimer l'ancienne constraint absences (valeurs obsolètes JUSTIFIEE/INJUSTIFIEE)
ALTER TABLE public.absences DROP CONSTRAINT IF EXISTS absences_statut_check;

-- 5. Ajouter colonne duree_jours si absente
ALTER TABLE public.absences ADD COLUMN IF NOT EXISTS duree_jours integer;

-- 6. Ajouter colonne motif_refus (motif du rejet RH)
ALTER TABLE public.absences ADD COLUMN IF NOT EXISTS motif_refus varchar(1000);

-- 7. Ajouter colonne minio_path (chemin MinIO du justificatif)
ALTER TABLE public.absences ADD COLUMN IF NOT EXISTS minio_path varchar(500);

-- 8. Table audit des absences
CREATE TABLE IF NOT EXISTS public.absence_audit (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    absence_id  bigint       NOT NULL,
    action      varchar(50)  NOT NULL,
    acteur_id   bigint       NOT NULL,
    timestamp   timestamp    NOT NULL DEFAULT now(),
    commentaire varchar(1000),
    CONSTRAINT fk_audit_absence FOREIGN KEY (absence_id) REFERENCES public.demandes(id)
);

CREATE INDEX IF NOT EXISTS idx_absence_audit_absence_id ON public.absence_audit(absence_id);
CREATE INDEX IF NOT EXISTS idx_absences_demande_id     ON public.absences(demande_id);
