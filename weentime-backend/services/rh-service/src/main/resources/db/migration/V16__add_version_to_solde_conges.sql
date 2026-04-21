-- Migration V16: Add version column to solde_conges for optimistic locking
ALTER TABLE public.solde_conges ADD COLUMN version bigint DEFAULT 0;
