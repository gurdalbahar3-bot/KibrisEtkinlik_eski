-- Migration 031 — offline placeholders
-- Scope: offline_scan_queue, offline_event_snapshots
-- D1–D16 locked decision set.

CREATE TABLE public.offline_scan_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    qr_code_id uuid NOT NULL
);

CREATE TABLE public.offline_event_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    snapshot_data jsonb NOT NULL
);
