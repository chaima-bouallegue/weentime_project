-- Drop the old constraint
ALTER TABLE demandes DROP CONSTRAINT demandes_statut_check;

-- Add the new constraint including EN_COURS and PRET
ALTER TABLE demandes ADD CONSTRAINT demandes_statut_check CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'PRET', 'APPROUVEE', 'REFUSEE', 'ANNULEE'));

-- Add new columns to documents
ALTER TABLE documents ADD COLUMN document_url character varying(255);
ALTER TABLE documents ADD COLUMN mois_concerne character varying(255);
