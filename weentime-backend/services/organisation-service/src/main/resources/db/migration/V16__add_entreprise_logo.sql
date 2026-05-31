-- Add logo column to entreprises table
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS logo TEXT;
