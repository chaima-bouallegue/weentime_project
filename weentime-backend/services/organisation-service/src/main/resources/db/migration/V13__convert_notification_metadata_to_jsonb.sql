DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'metadata'
          AND udt_name <> 'jsonb'
    ) THEN
        ALTER TABLE notifications
            ALTER COLUMN metadata TYPE jsonb
            USING CASE
                WHEN metadata IS NULL OR btrim(metadata) = '' THEN NULL
                ELSE metadata::jsonb
            END;
    END IF;
END $$;
