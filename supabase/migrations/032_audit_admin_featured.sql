-- Migration 032 — audit / admin / featured
-- Scope: audit_logs, super_admin_actions, featured_listings
-- Decision lock: D1–D14 completed.
-- RLS/RPC → 034; trigger → 033; index plan → 034; seed none.

CREATE TABLE public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid NOT NULL REFERENCES public.profiles (id),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    old_values jsonb,
    new_values jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.super_admin_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.featured_listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
