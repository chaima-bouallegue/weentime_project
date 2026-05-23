-- Offres d'emploi
CREATE TABLE IF NOT EXISTS job_postings (
    id BIGSERIAL PRIMARY KEY,
    entreprise_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    department VARCHAR(100),
    employment_type VARCHAR(50), -- FULL_TIME, PART_TIME, etc.
    experience_level VARCHAR(50), -- JUNIOR, MID, SENIOR
    min_experience_years INTEGER,
    required_skills TEXT,
    soft_skills TEXT,
    description TEXT NOT NULL,
    responsibilities TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    salary_currency VARCHAR(3) DEFAULT 'EUR',
    work_mode VARCHAR(20), -- ONSITE, HYBRID, REMOTE
    location VARCHAR(200),
    deadline DATE,
    openings_count INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'DRAFT',
    published_at TIMESTAMP,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Candidatures
CREATE TABLE IF NOT EXISTS applications (
    id BIGSERIAL PRIMARY KEY,
    entreprise_id BIGINT NOT NULL,
    job_posting_id BIGINT NOT NULL REFERENCES job_postings(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    linkedin_url VARCHAR(500),
    cv_storage_path VARCHAR(500),
    cv_original_filename VARCHAR(255),
    gdpr_consent BOOLEAN NOT NULL DEFAULT FALSE,
    gdpr_consent_at TIMESTAMP,
    gdpr_retention_until DATE,
    status VARCHAR(30) DEFAULT 'APPLIED',
    rejection_reason VARCHAR(100),
    source VARCHAR(50) DEFAULT 'DIRECT',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- IA Matching (Phase 2)
    ai_overall_score DECIMAL(5,2),
    ai_technical_score DECIMAL(5,2),
    ai_recommendation VARCHAR(50),
    ai_recommendation_summary TEXT,
    ai_analysis_json TEXT, -- JSON complet retourné par Gemini
    ai_status VARCHAR(20) DEFAULT 'PENDING'
);

-- Notes sur les candidats
CREATE TABLE IF NOT EXISTS candidate_notes (
    id BIGSERIAL PRIMARY KEY,
    entreprise_id BIGINT NOT NULL,
    application_id BIGINT NOT NULL REFERENCES applications(id),
    author_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_job_postings_entreprise ON job_postings(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_applications_entreprise ON applications(entreprise_id);
