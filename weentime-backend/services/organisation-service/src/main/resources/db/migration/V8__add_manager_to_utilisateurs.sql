-- Add missing self-referencing manager relation for Utilisateur.
-- Hibernate expects the column because of @JoinColumn(name = "manager_id") in Utilisateur.

ALTER TABLE public.utilisateurs
    ADD COLUMN IF NOT EXISTS manager_id BIGINT;

-- Flyway guarantees this migration runs only once per schema, so a simple FK add is sufficient.
ALTER TABLE public.utilisateurs
    ADD CONSTRAINT fk_utilisateurs_manager
        FOREIGN KEY (manager_id)
            REFERENCES public.utilisateurs (id)
            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_manager_id
    ON public.utilisateurs (manager_id);

