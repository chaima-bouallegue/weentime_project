-- Add validation and signature columns to documents table
ALTER TABLE public.documents 
    ADD COLUMN IF NOT EXISTS validated_by bigint,
    ADD COLUMN IF NOT EXISTS validated_at timestamp without time zone,
    ADD COLUMN IF NOT EXISTS signed_at timestamp without time zone,
    ADD COLUMN IF NOT EXISTS signed_by character varying(255);

-- Update the check constraint on status in demandes table
ALTER TABLE public.demandes DROP CONSTRAINT IF EXISTS demandes_statut_check;

ALTER TABLE public.demandes ADD CONSTRAINT demandes_statut_check 
CHECK (statut IN ('EN_ATTENTE_MANAGER', 'EN_ATTENTE_RH', 'EN_ATTENTE', 'APPROUVEE', 'APPROUVE', 'PRET', 'REFUSEE', 'REFUSE', 'ANNULEE', 'ANNULE', 'DEMANDE_RECUE', 'EN_REVISION', 'VALIDE', 'SIGNE', 'ENVOYE'));
