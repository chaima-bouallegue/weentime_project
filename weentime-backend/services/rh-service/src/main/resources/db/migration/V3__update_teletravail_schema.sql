-- Drop the old constraint
ALTER TABLE demandes DROP CONSTRAINT demandes_statut_check;

-- Add the new constraint including new teletravail statuses
ALTER TABLE demandes ADD CONSTRAINT demandes_statut_check CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'PRET', 'APPROUVEE', 'REFUSEE', 'ANNULEE', 'EN_ATTENTE_MANAGER', 'EN_ATTENTE_RH', 'APPROUVE', 'REFUSE', 'ANNULE'));

-- Add new columns to teletravails
ALTER TABLE teletravails ADD COLUMN type_teletravail character varying(255) NOT NULL DEFAULT 'JOURNEE_COMPLETE';
ALTER TABLE teletravails ADD COLUMN periode character varying(255);
ALTER TABLE teletravails ADD COLUMN etape_actuelle character varying(255) NOT NULL DEFAULT 'MANAGER';
ALTER TABLE teletravails ADD COLUMN commentaire_manager character varying(2000);
ALTER TABLE teletravails ADD COLUMN commentaire_rh character varying(2000);

-- Make adresse nullable
ALTER TABLE teletravails ALTER COLUMN adresse DROP NOT NULL;

-- Change nombre_jours to double precision
ALTER TABLE teletravails ALTER COLUMN nombre_jours TYPE double precision;
