-- 1. Ajouter les colonnes en nullable avec valeur par défaut
ALTER TABLE type_conges
    ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS version     BIGINT    DEFAULT 0;

-- 2. Backfill des lignes existantes
UPDATE type_conges
SET    created_at = NOW(),
       updated_at = NOW(),
       version    = 0
WHERE  created_at IS NULL
   OR  updated_at IS NULL
   OR  version    IS NULL;

-- 3. Poser la contrainte NOT NULL une fois les données propres
ALTER TABLE type_conges
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;
