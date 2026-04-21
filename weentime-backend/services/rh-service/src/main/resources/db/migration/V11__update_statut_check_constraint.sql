-- V11__update_statut_check_constraint.sql
-- Update the statut column in 'demandes' table to use new values and remove deprecated ones

-- 1. Migrate existing data to new status values
UPDATE demandes SET statut = 'EN_ATTENTE_RH'      WHERE statut = 'EN_ATTENTE' AND type_demande IN ('DOCUMENT', 'ABSENCE');
UPDATE demandes SET statut = 'EN_ATTENTE_MANAGER' WHERE statut = 'EN_ATTENTE' AND type_demande NOT IN ('DOCUMENT', 'ABSENCE');
UPDATE demandes SET statut = 'EN_ATTENTE_RH'      WHERE statut = 'EN_COURS';
UPDATE demandes SET statut = 'APPROUVE'           WHERE statut IN ('PRET', 'APPROUVEE');
UPDATE demandes SET statut = 'REFUSE'            WHERE statut = 'REFUSEE';
UPDATE demandes SET statut = 'ANNULE'            WHERE statut = 'ANNULEE';

-- 2. Drop the old constraint
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_statut_check;

-- 3. Add the new constraint with active values only
ALTER TABLE demandes ADD CONSTRAINT demandes_statut_check 
CHECK (statut IN ('EN_ATTENTE_MANAGER', 'EN_ATTENTE_RH', 'APPROUVE', 'REFUSE', 'ANNULE'));
