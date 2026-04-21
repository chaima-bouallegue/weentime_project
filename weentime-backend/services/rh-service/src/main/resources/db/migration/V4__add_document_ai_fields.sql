-- Migration V4: Add AI fields to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS generated_by_ai BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contenu_ia TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS commentaire_rh VARCHAR(1000);
