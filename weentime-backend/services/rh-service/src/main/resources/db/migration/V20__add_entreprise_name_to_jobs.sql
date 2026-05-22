DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'job_postings'
          AND column_name = 'entreprise_name'
    ) THEN
        ALTER TABLE job_postings ADD COLUMN entreprise_name VARCHAR(255);
    END IF;
END
$$;
