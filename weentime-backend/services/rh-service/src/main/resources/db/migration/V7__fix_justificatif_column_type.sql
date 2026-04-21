-- V7__fix_justificatif_column_type.sql
ALTER TABLE public.absences 
  ALTER COLUMN justificatif TYPE TEXT;
