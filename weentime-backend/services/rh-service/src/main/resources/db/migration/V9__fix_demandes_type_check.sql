-- V9__fix_demandes_type_check.sql
-- Update the demandes_type_demande_check constraint to include 'ABSENCE'
ALTER TABLE public.demandes 
  DROP CONSTRAINT IF EXISTS demandes_type_demande_check;

ALTER TABLE public.demandes 
  ADD CONSTRAINT demandes_type_demande_check 
  CHECK (type_demande IN (
    'DOCUMENT',
    'TELETRAVAIL',
    'AUTORISATION',
    'ABSENCE',
    'CONGE'
  ));
