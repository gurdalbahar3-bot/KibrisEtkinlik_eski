-- FAZ 0 v1.4.1 — Migration 005: roles and role_permissions
-- Seed, RLS, triggers, indexes: later migrations / seed files

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  CONSTRAINT roles_code_unique UNIQUE (code)
);

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  permission_code text NOT NULL,
  CONSTRAINT role_permissions_role_id_permission_code_unique UNIQUE (role_id, permission_code)
);
