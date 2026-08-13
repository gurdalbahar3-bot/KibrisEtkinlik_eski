-- Migration 029 — notifications
-- Scope: notification_rules, notifications, notification_deliveries
-- D1–D16 locked decision set.

CREATE TABLE public.notification_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type_filter text NULL,
    offsets_minutes integer[] NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles (id),
    event_id uuid NOT NULL,
    reference_type text NOT NULL CHECK (reference_type IN (
        'ticket',
        'table_reservation',
        'seat_reservation',
        'order'
    )),
    reference_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'sent',
        'failed',
        'cancelled'
    )),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid NOT NULL REFERENCES public.notifications (id),
    channel text NOT NULL CHECK (channel IN (
        'email',
        'sms',
        'whatsapp',
        'push'
    )),
    provider text NULL,
    status text NOT NULL,
    sent_at timestamptz NULL,
    error_message text NULL
);
