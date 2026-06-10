ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS ai_experience_score DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS ai_competence_score DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS ai_points_forts TEXT,
    ADD COLUMN IF NOT EXISTS ai_points_faibles TEXT,
    ADD COLUMN IF NOT EXISTS ai_competences_trouvees TEXT,
    ADD COLUMN IF NOT EXISTS ai_competences_manquantes TEXT,
    ADD COLUMN IF NOT EXISTS ai_experience_detectee INTEGER,
    ADD COLUMN IF NOT EXISTS ai_niveau_confiance INTEGER;
