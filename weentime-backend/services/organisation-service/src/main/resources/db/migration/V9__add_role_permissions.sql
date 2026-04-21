CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id bigint NOT NULL,
    permission character varying(255) NOT NULL,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE
);
