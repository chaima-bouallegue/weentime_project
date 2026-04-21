-- Migration to add Two-Factor Authentication support to Utilisateur entity (Fixed for direct execution after V1/V2/V3)
ALTER TABLE public.utilisateurs ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.utilisateurs ADD COLUMN two_factor_secret VARCHAR(255);
ALTER TABLE public.utilisateurs ADD COLUMN two_factor_type VARCHAR(255) DEFAULT 'NONE';
ALTER TABLE public.utilisateurs ADD COLUMN failed2fa_attempts INTEGER DEFAULT 0;
ALTER TABLE public.utilisateurs ADD COLUMN lockout_end TIMESTAMP;

-- Create table for backup codes
CREATE TABLE IF NOT EXISTS public.utilisateur_backup_codes (
    utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id),
    code VARCHAR(255) NOT NULL,
    PRIMARY KEY (utilisateur_id, code)
);
