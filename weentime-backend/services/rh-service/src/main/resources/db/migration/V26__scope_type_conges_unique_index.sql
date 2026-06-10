DO $$
DECLARE
    constraint_record record;
BEGIN
    FOR constraint_record IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'type_conges'
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname ORDER BY a.attnum)
              FROM unnest(c.conkey) AS column_number(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = column_number.attnum
          ) = ARRAY['libelle']::name[]
    LOOP
        EXECUTE format('ALTER TABLE public.type_conges DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;
END
$$;

DO $$
DECLARE
    index_record record;
BEGIN
    FOR index_record IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'type_conges'
          AND indexname NOT IN (
              'uk_type_conges_entreprise_libelle_norm',
              'uk_type_conges_global_libelle_norm'
          )
          AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
          AND indexdef ILIKE '%libelle%'
          AND indexdef NOT ILIKE '%entreprise_id%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', index_record.indexname);
    END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_type_conges_entreprise_libelle_norm
    ON public.type_conges (entreprise_id, lower(btrim(libelle)))
    WHERE entreprise_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_type_conges_global_libelle_norm
    ON public.type_conges (lower(btrim(libelle)))
    WHERE entreprise_id IS NULL;
