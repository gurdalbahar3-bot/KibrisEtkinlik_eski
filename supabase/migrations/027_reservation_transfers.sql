-- Migration 027 — reservation_transfers
-- Scope: reservation_transfers
-- D1–D11 locked decision set.

CREATE TABLE public.reservation_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL CHECK (entity_type IN (
        'ticket',
        'table_reservation',
        'seat_reservation'
    )),
    entity_id uuid NOT NULL,
    from_user_id uuid NOT NULL REFERENCES public.profiles (id),
    to_user_id uuid NOT NULL REFERENCES public.profiles (id),
    initiated_by uuid NOT NULL REFERENCES public.profiles (id),
    old_qr_code_id uuid NOT NULL REFERENCES public.qr_codes (id),
    new_qr_code_id uuid NOT NULL REFERENCES public.qr_codes (id),
    transferred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reservation_transfers_entity_idx
    ON public.reservation_transfers (entity_type, entity_id);

CREATE INDEX reservation_transfers_from_user_id_idx
    ON public.reservation_transfers (from_user_id);

CREATE INDEX reservation_transfers_to_user_id_idx
    ON public.reservation_transfers (to_user_id);
