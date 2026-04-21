UPDATE demandes
SET statut = 'EN_ATTENTE_RH'
WHERE statut = 'EN_ATTENTE' AND type_demande IN ('DOCUMENT', 'ABSENCE');

UPDATE demandes
SET statut = 'EN_ATTENTE_MANAGER'
WHERE statut = 'EN_ATTENTE' AND type_demande NOT IN ('DOCUMENT', 'ABSENCE');

UPDATE demandes
SET statut = 'EN_ATTENTE_RH'
WHERE statut = 'EN_COURS';

UPDATE demandes
SET statut = 'APPROUVEE'
WHERE statut IN ('APPROUVE', 'PRET');

UPDATE demandes
SET statut = 'REFUSEE'
WHERE statut = 'REFUSE';

UPDATE demandes
SET statut = 'ANNULEE'
WHERE statut = 'ANNULE';

ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_statut_check;

ALTER TABLE demandes ADD CONSTRAINT demandes_statut_check
CHECK (statut IN ('EN_ATTENTE_MANAGER', 'EN_ATTENTE_RH', 'APPROUVEE', 'REFUSEE', 'ANNULEE'));
