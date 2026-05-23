ALTER TABLE public.type_conges
    ADD COLUMN IF NOT EXISTS entreprise_id bigint;

ALTER TABLE public.solde_conges
    ADD COLUMN IF NOT EXISTS entreprise_id bigint;

ALTER TABLE public.type_autorisations
    ADD COLUMN IF NOT EXISTS entreprise_id bigint;

ALTER TABLE public.type_documents
    ADD COLUMN IF NOT EXISTS entreprise_id bigint,
    ADD COLUMN IF NOT EXISTS categorie character varying(50),
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS icone character varying(50),
    ADD COLUMN IF NOT EXISTS ordre integer,
    ADD COLUMN IF NOT EXISTS actif boolean,
    ADD COLUMN IF NOT EXISTS mode_generation character varying(30),
    ADD COLUMN IF NOT EXISTS content_template text,
    ADD COLUMN IF NOT EXISTS ai_prompt_template text,
    ADD COLUMN IF NOT EXISTS ai_model character varying(50),
    ADD COLUMN IF NOT EXISTS ai_temperature real,
    ADD COLUMN IF NOT EXISTS variables_autorisees text,
    ADD COLUMN IF NOT EXISTS langues_disponibles character varying(100),
    ADD COLUMN IF NOT EXISTS workflow_type character varying(30),
    ADD COLUMN IF NOT EXISTS niveau_confidentialite character varying(20),
    ADD COLUMN IF NOT EXISTS delai_traitement_jours integer,
    ADD COLUMN IF NOT EXISTS max_demandes_par_mois integer,
    ADD COLUMN IF NOT EXISTS duree_validite_jours integer,
    ADD COLUMN IF NOT EXISTS versionning boolean,
    ADD COLUMN IF NOT EXISTS retention_mois integer;

UPDATE public.type_documents
SET categorie = COALESCE(categorie, 'ADMINISTRATIF'),
    ordre = COALESCE(ordre, 0),
    actif = COALESCE(actif, true),
    mode_generation = COALESCE(mode_generation, 'TEMPLATE_ONLY'),
    ai_model = COALESCE(ai_model, 'GEMINI_FLASH'),
    ai_temperature = COALESCE(ai_temperature, 0.2),
    langues_disponibles = COALESCE(langues_disponibles, 'fr'),
    workflow_type = COALESCE(workflow_type, 'RH_VALIDATION'),
    niveau_confidentialite = COALESCE(niveau_confidentialite, 'PUBLIC'),
    require_signature = COALESCE(require_signature, false),
    enable_template = COALESCE(enable_template, false),
    delai_traitement_jours = COALESCE(delai_traitement_jours, 3),
    versionning = COALESCE(versionning, false)
WHERE categorie IS NULL
   OR ordre IS NULL
   OR actif IS NULL
   OR mode_generation IS NULL
   OR ai_model IS NULL
   OR ai_temperature IS NULL
   OR langues_disponibles IS NULL
   OR workflow_type IS NULL
   OR niveau_confidentialite IS NULL
   OR require_signature IS NULL
   OR enable_template IS NULL
   OR delai_traitement_jours IS NULL
   OR versionning IS NULL;

ALTER TABLE public.type_documents
    ALTER COLUMN categorie SET DEFAULT 'ADMINISTRATIF',
    ALTER COLUMN ordre SET DEFAULT 0,
    ALTER COLUMN actif SET DEFAULT true,
    ALTER COLUMN mode_generation SET DEFAULT 'TEMPLATE_ONLY',
    ALTER COLUMN ai_model SET DEFAULT 'GEMINI_FLASH',
    ALTER COLUMN ai_temperature SET DEFAULT 0.2,
    ALTER COLUMN langues_disponibles SET DEFAULT 'fr',
    ALTER COLUMN workflow_type SET DEFAULT 'RH_VALIDATION',
    ALTER COLUMN niveau_confidentialite SET DEFAULT 'PUBLIC',
    ALTER COLUMN require_signature SET DEFAULT false,
    ALTER COLUMN enable_template SET DEFAULT false,
    ALTER COLUMN delai_traitement_jours SET DEFAULT 3,
    ALTER COLUMN versionning SET DEFAULT false;

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS ai_model_used character varying(50),
    ADD COLUMN IF NOT EXISTS tokens_used integer;

ALTER TABLE public.jours_feries
    ADD COLUMN IF NOT EXISTS nom character varying(255),
    ADD COLUMN IF NOT EXISTS entreprise_id bigint,
    ADD COLUMN IF NOT EXISTS is_global boolean;

DO $$
DECLARE
    has_libelle boolean;
    has_description boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'jours_feries' AND column_name = 'libelle'
    ) INTO has_libelle;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'jours_feries' AND column_name = 'description'
    ) INTO has_description;

    IF has_libelle AND has_description THEN
        EXECUTE 'UPDATE public.jours_feries SET nom = COALESCE(nom, libelle, description, $inner$Jour ferie$inner$) WHERE nom IS NULL';
    ELSIF has_libelle THEN
        EXECUTE 'UPDATE public.jours_feries SET nom = COALESCE(nom, libelle, $inner$Jour ferie$inner$) WHERE nom IS NULL';
    ELSIF has_description THEN
        EXECUTE 'UPDATE public.jours_feries SET nom = COALESCE(nom, description, $inner$Jour ferie$inner$) WHERE nom IS NULL';
    ELSE
        UPDATE public.jours_feries
        SET nom = COALESCE(nom, 'Jour ferie')
        WHERE nom IS NULL;
    END IF;
END
$$;

UPDATE public.jours_feries
SET is_global = COALESCE(is_global, true)
WHERE is_global IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'jours_feries'
          AND column_name = 'organisation_id'
    ) THEN
        EXECUTE '
            UPDATE public.jours_feries
            SET entreprise_id = organisation_id
            WHERE entreprise_id IS NULL
              AND COALESCE(is_global, false) = false
              AND organisation_id IS NOT NULL
        ';
    END IF;
END
$$;

ALTER TABLE public.jours_feries
    ALTER COLUMN nom SET NOT NULL,
    ALTER COLUMN is_global SET DEFAULT true;
