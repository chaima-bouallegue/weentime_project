ALTER TABLE public.utilisateurs
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
