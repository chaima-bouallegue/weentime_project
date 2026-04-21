-- Migration V3: Add company invitation code
ALTER TABLE public.entreprises ADD COLUMN code_invitation VARCHAR(255) UNIQUE;
