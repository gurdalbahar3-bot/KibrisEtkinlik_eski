-- Migration 025 — QR
-- Scope: qr_codes, qr_scan_logs, C1 QR foreign keys
-- D1–D19 locked decision set.

CREATE TABLE public.qr_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text UNIQUE,
    entity_type text CHECK (entity_type IN (
        'ticket',
        'table_reservation',
        'seat_reservation',
        'hotel_internal'
    )),
    entity_id uuid,
    event_id uuid REFERENCES public.events(id),
    holder_id uuid REFERENCES public.profiles(id),
    status text NOT NULL CHECK (status IN (
        'active',
        'used',
        'revoked'
    )),
    issued_at timestamptz,
    used_at timestamptz,
    revoked_at timestamptz
);

CREATE UNIQUE INDEX qr_codes_entity_active_unique
    ON public.qr_codes (entity_type, entity_id)
    WHERE status = 'active';

CREATE TABLE public.qr_scan_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id uuid REFERENCES public.qr_codes(id),
    event_id uuid REFERENCES public.events(id),
    scanned_by uuid REFERENCES public.profiles(id),
    device_id text,
    scan_result text CHECK (scan_result IN (
        'valid',
        'invalid',
        'already_used',
        'revoked'
    )),
    scanned_at timestamptz,
    is_offline boolean,
    synced_at timestamptz
);

ALTER TABLE public.tickets
    ADD CONSTRAINT tickets_qr_code_id_fkey
    FOREIGN KEY (qr_code_id)
    REFERENCES public.qr_codes(id);

ALTER TABLE public.table_reservations
    ADD CONSTRAINT table_reservations_qr_code_id_fkey
    FOREIGN KEY (qr_code_id)
    REFERENCES public.qr_codes(id);

ALTER TABLE public.seat_reservations
    ADD CONSTRAINT seat_reservations_qr_code_id_fkey
    FOREIGN KEY (qr_code_id)
    REFERENCES public.qr_codes(id);
