-- Migration 028 — staff
-- Scope: staff_invitations, staff_assignments, event_staff_permissions, staff_devices
-- D1–D15 + D13-token=A locked decision set.

CREATE TABLE public.staff_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invited_by uuid NOT NULL REFERENCES public.profiles (id),
    venue_id uuid NULL REFERENCES public.venues (id),
    organizer_id uuid NULL REFERENCES public.organizer_profiles (profile_id),
    email text NOT NULL,
    phone text NULL,
    role_id uuid NOT NULL REFERENCES public.roles (id),
    token text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'accepted',
        'expired',
        'revoked'
    )),
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_invitations_venue_xor_organizer_check CHECK (
        (venue_id IS NOT NULL AND organizer_id IS NULL)
        OR (venue_id IS NULL AND organizer_id IS NOT NULL)
    )
);

CREATE TABLE public.staff_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles (id),
    venue_id uuid NULL REFERENCES public.venues (id),
    organizer_id uuid NULL REFERENCES public.organizer_profiles (profile_id),
    role_id uuid NOT NULL REFERENCES public.roles (id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN (
        'active',
        'inactive'
    )),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    assigned_by uuid NOT NULL REFERENCES public.profiles (id),
    CONSTRAINT staff_assignments_venue_xor_organizer_check CHECK (
        (venue_id IS NOT NULL AND organizer_id IS NULL)
        OR (venue_id IS NULL AND organizer_id IS NOT NULL)
    )
);

CREATE TABLE public.event_staff_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
    staff_assignment_id uuid NOT NULL REFERENCES public.staff_assignments (id),
    role_id uuid NOT NULL REFERENCES public.roles (id),
    granted_by uuid NOT NULL REFERENCES public.profiles (id),
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NULL,
    CONSTRAINT event_staff_permissions_event_assignment_unique UNIQUE (
        event_id,
        staff_assignment_id
    )
);

CREATE TABLE public.staff_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_assignment_id uuid NOT NULL REFERENCES public.staff_assignments (id),
    device_id text NOT NULL,
    device_name text NULL,
    paired_at timestamptz NOT NULL DEFAULT now(),
    last_active_at timestamptz NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX staff_assignments_profile_venue_role_active_unique
    ON public.staff_assignments (profile_id, venue_id, role_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX staff_assignments_profile_organizer_role_active_unique
    ON public.staff_assignments (profile_id, organizer_id, role_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX staff_devices_assignment_device_active_unique
    ON public.staff_devices (staff_assignment_id, device_id)
    WHERE is_active = true;

CREATE INDEX staff_invitations_email_idx
    ON public.staff_invitations (email);

CREATE INDEX staff_invitations_status_idx
    ON public.staff_invitations (status);

CREATE INDEX staff_invitations_venue_id_idx
    ON public.staff_invitations (venue_id);

CREATE INDEX staff_invitations_organizer_id_idx
    ON public.staff_invitations (organizer_id);

CREATE INDEX staff_assignments_profile_id_idx
    ON public.staff_assignments (profile_id);

CREATE INDEX staff_assignments_venue_id_idx
    ON public.staff_assignments (venue_id);

CREATE INDEX staff_assignments_organizer_id_idx
    ON public.staff_assignments (organizer_id);

CREATE INDEX event_staff_permissions_event_id_idx
    ON public.event_staff_permissions (event_id);

CREATE INDEX event_staff_permissions_staff_assignment_id_idx
    ON public.event_staff_permissions (staff_assignment_id);

CREATE INDEX staff_devices_staff_assignment_id_idx
    ON public.staff_devices (staff_assignment_id);
