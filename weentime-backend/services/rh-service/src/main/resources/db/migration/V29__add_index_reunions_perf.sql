CREATE INDEX IF NOT EXISTS idx_participants_utilisateur_id
ON participants_reunion(utilisateur_id);

CREATE INDEX IF NOT EXISTS idx_reunions_date_heure_desc
ON reunions(date_reunion DESC, heure_debut DESC);
