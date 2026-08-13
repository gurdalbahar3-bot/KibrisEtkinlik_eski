-- Migration 030 — social
-- Scope: social_links, follows
-- D1–D20 locked decision set.

CREATE TABLE public.social_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL CHECK (entity_type IN (
        'event',
        'organizer',
        'venue',
        'artist'
    )),
    entity_id uuid NOT NULL,
    platform text NOT NULL CHECK (platform IN (
        'instagram',
        'facebook',
        'tiktok',
        'youtube',
        'other'
    )),
    url text NOT NULL
);

CREATE TABLE public.follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id uuid NOT NULL REFERENCES public.profiles (id),
    target_type text NOT NULL CHECK (target_type IN (
        'artist',
        'venue',
        'organizer'
    )),
    target_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (follower_id, target_type, target_id)
);
