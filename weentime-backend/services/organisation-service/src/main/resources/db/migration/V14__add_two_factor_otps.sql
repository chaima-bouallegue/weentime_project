CREATE TABLE IF NOT EXISTS public.two_factor_otps (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    method VARCHAR(32) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_two_factor_otps_user_method_purpose
    ON public.two_factor_otps (user_id, method, purpose, consumed_at, created_at DESC);
