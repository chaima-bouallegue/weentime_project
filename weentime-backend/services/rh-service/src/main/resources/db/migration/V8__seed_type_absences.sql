-- V8__seed_type_absences.sql
-- Seed initial requirements for Absence types aligning with frontend selection
INSERT INTO public.type_absences (id, libelle, type, decompte_jours, require_justificatif, nombre_jours_max) 
VALUES 
  (1, 'Maladie', 'MALADIE', false, true, null),
  (2, 'Accident de travail', 'ACCIDENT_TRAVAIL', false, true, null),
  (3, 'Raison personnelle', 'EVENEMENT_FAMILIAL', false, false, null),
  (4, 'Force majeure', 'AUTRE', false, false, null),
  (5, 'Absence injustifiée', 'ABSENCE_INJUSTIFIEE', true, false, null)
ON CONFLICT (id) DO NOTHING;

-- Remettre la séquence d'ID à jour pour éviter tout déséquilibre futur
SELECT setval(pg_get_serial_sequence('public.type_absences', 'id'), (SELECT COALESCE(MAX(id), 1) FROM public.type_absences));
