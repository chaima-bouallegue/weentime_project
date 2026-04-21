ALTER TABLE public.demandes ADD COLUMN entreprise_id bigint NOT NULL DEFAULT 1;
ALTER TABLE public.demandes ALTER COLUMN entreprise_id DROP DEFAULT;
