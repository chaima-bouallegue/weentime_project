ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#1a73e8';
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#34a853';
