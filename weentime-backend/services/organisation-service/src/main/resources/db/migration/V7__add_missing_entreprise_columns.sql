-- Add missing columns to entreprises table
ALTER TABLE public.entreprises ADD COLUMN secteur VARCHAR(255);
ALTER TABLE public.entreprises ADD COLUMN updated_at TIMESTAMP(6) WITHOUT TIME ZONE;

-- Backfill updated_at with created_at value for existing rows
UPDATE public.entreprises
SET updated_at = created_at 
WHERE updated_at IS NULL;
