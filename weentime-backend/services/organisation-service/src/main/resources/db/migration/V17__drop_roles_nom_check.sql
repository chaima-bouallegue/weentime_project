-- Drop the roles_nom_check constraint to allow custom role names
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_nom_check;
