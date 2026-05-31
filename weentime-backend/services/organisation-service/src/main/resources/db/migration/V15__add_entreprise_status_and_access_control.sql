-- 1. Add status column if not exists
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
UPDATE public.entreprises SET status = CASE WHEN est_active = TRUE THEN 'ACTIVE' ELSE 'CLOSED' END WHERE status IS NULL;
ALTER TABLE public.entreprises ALTER COLUMN status SET NOT NULL;

-- 2. Backfill null code_invitation values and make NOT NULL
UPDATE public.entreprises
    SET code_invitation = CONCAT('WEEN-', UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 12)))
    WHERE code_invitation IS NULL;
ALTER TABLE public.entreprises ALTER COLUMN code_invitation SET NOT NULL;

-- 3. Create Access Control table
CREATE TABLE IF NOT EXISTS public.entreprise_access_control (
    id BIGSERIAL PRIMARY KEY,
    entreprise_id BIGINT NOT NULL,
    role VARCHAR(50) NOT NULL,
    module_key VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    updated_by VARCHAR(255),
    CONSTRAINT fk_entreprise_access_control_entreprise FOREIGN KEY (entreprise_id) REFERENCES public.entreprises(id) ON DELETE CASCADE,
    CONSTRAINT uq_entreprise_role_module UNIQUE (entreprise_id, role, module_key)
);

-- 4. Create Access Control Audit/History table
CREATE TABLE IF NOT EXISTS public.entreprise_access_control_history (
    id BIGSERIAL PRIMARY KEY,
    entreprise_id BIGINT NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    role VARCHAR(50) NOT NULL,
    module_key VARCHAR(50) NOT NULL,
    previous_value BOOLEAN NOT NULL,
    new_value BOOLEAN NOT NULL,
    CONSTRAINT fk_entreprise_access_history_entreprise FOREIGN KEY (entreprise_id) REFERENCES public.entreprises(id) ON DELETE CASCADE
);
