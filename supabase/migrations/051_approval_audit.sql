-- Migration 051 — Super Admin account-application approval + admin_audit_log
-- Scope: approve_account_application RPC, admin_audit_log, RLS (no client UPDATE).
-- Reuses: account_applications (007/034), profiles + role profiles (003/004),
--         is_super_admin() (034), organization_memberships (048).
-- Depends on: 001–050 applied.
-- Does NOT modify: migrations 001–050, events INSERT policies, publish_event /
--                  postpone_event / reschedule_event, or any org-create path.
-- Does NOT add: create_event_atomic, create_venue_atomic, official_ticket_url.

BEGIN;

-- ============================================================
-- §1 admin_audit_log (new; clients cannot INSERT)
-- ============================================================

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL REFERENCES public.profiles (id),
  actor_role text NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  old_state jsonb NULL,
  new_state jsonb NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_action_check CHECK (char_length(action) > 0),
  CONSTRAINT admin_audit_log_target_type_check CHECK (char_length(target_type) > 0)
);

CREATE INDEX admin_audit_log_actor_id_created_at_idx
  ON public.admin_audit_log (actor_id, created_at DESC);

CREATE INDEX admin_audit_log_target_idx
  ON public.admin_audit_log (target_type, target_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLE public.admin_audit_log
  FROM anon, authenticated;

GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;

CREATE POLICY admin_audit_log_select_super_admin ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- No INSERT / UPDATE / DELETE policies. SECURITY DEFINER owner writes only.

-- ============================================================
-- §2 account_applications — keep client INSERT/SELECT; no client UPDATE
-- ============================================================

-- Public (anon) must not read approval data. Applicant + Super Admin SELECT
-- already exists as account_applications_select_self (034). Do not add UPDATE.
REVOKE SELECT, UPDATE, DELETE ON TABLE public.account_applications FROM anon;

CREATE INDEX IF NOT EXISTS account_applications_status_submitted_at_idx
  ON public.account_applications (status, submitted_at);

-- ============================================================
-- §3 approve_account_application — Super Admin only, single transaction
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_account_application(
  p_application_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_app public.account_applications%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_role_id uuid;
  v_old_state jsonb;
  v_new_account_type text;
  v_new_verification text;
  v_membership_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'APPLICATION_NOT_FOUND');
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_DECISION');
  END IF;

  SELECT * INTO v_app
  FROM public.account_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'APPLICATION_NOT_FOUND');
  END IF;

  -- Pending-only: approved / rejected / under_review cannot be decided again.
  IF v_app.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'APPLICATION_NOT_PENDING');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_app.applicant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROFILE_NOT_FOUND');
  END IF;

  IF p_decision = 'approve' AND p_organization_id IS NOT NULL THEN
    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORGANIZATION_NOT_FOUND');
    END IF;

    IF v_org.status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORGANIZATION_INACTIVE');
    END IF;

    SELECT id INTO v_role_id
    FROM public.roles
    WHERE code = 'org_member';

    IF v_role_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORG_MEMBER_ROLE_MISSING');
    END IF;
  END IF;

  v_old_state := jsonb_build_object(
    'application', jsonb_build_object(
      'id', v_app.id,
      'status', v_app.status,
      'type', v_app.type,
      'reviewed_by', v_app.reviewed_by,
      'reviewed_at', v_app.reviewed_at,
      'rejection_reason', v_app.rejection_reason
    ),
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'account_type', v_profile.account_type,
      'verification_status', v_profile.verification_status
    )
  );

  IF p_decision = 'approve' THEN
    v_new_account_type := v_app.type;
    v_new_verification := 'approved';

    UPDATE public.profiles
    SET
      account_type = v_new_account_type,
      verification_status = v_new_verification,
      updated_at = now()
    WHERE id = v_app.applicant_id;

    IF v_app.type = 'organizer' THEN
      INSERT INTO public.organizer_profiles (profile_id, organization_id)
      VALUES (v_app.applicant_id, p_organization_id)
      ON CONFLICT (profile_id) DO UPDATE
        SET organization_id = COALESCE(
          EXCLUDED.organization_id,
          public.organizer_profiles.organization_id
        );
    ELSIF v_app.type = 'venue_owner' THEN
      INSERT INTO public.venue_owner_profiles (profile_id)
      VALUES (v_app.applicant_id)
      ON CONFLICT (profile_id) DO NOTHING;
    END IF;

    IF p_organization_id IS NOT NULL THEN
      INSERT INTO public.organization_memberships (
        organization_id,
        profile_id,
        role_id,
        status,
        invited_by,
        joined_at
      )
      VALUES (
        p_organization_id,
        v_app.applicant_id,
        v_role_id,
        'active',
        v_actor_id,
        now()
      )
      ON CONFLICT (organization_id, profile_id) DO UPDATE
        SET
          status = 'active',
          role_id = EXCLUDED.role_id,
          invited_by = COALESCE(
            public.organization_memberships.invited_by,
            EXCLUDED.invited_by
          ),
          joined_at = COALESCE(
            public.organization_memberships.joined_at,
            now()
          )
      RETURNING id INTO v_membership_id;
    END IF;
  ELSE
    v_new_account_type := v_profile.account_type;
    v_new_verification := v_profile.verification_status;

    -- Do not demote an already-approved account on a later rejected application.
    IF v_profile.verification_status IN ('pending', 'not_required') THEN
      v_new_verification := 'rejected';
      UPDATE public.profiles
      SET
        verification_status = v_new_verification,
        updated_at = now()
      WHERE id = v_app.applicant_id;
    END IF;
  END IF;

  UPDATE public.account_applications
  SET
    status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    reviewed_by = v_actor_id,
    reviewed_at = now(),
    rejection_reason = CASE
      WHEN p_decision = 'reject' THEN NULLIF(trim(p_rejection_reason), '')
      ELSE NULL
    END
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  INSERT INTO public.admin_audit_log (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    old_state,
    new_state,
    metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    CASE
      WHEN p_decision = 'approve' THEN 'approve_account_application'
      ELSE 'reject_account_application'
    END,
    'account_application',
    p_application_id,
    v_old_state,
    jsonb_build_object(
      'application', jsonb_build_object(
        'id', v_app.id,
        'status', v_app.status,
        'type', v_app.type,
        'reviewed_by', v_app.reviewed_by,
        'reviewed_at', v_app.reviewed_at,
        'rejection_reason', v_app.rejection_reason
      ),
      'profile', jsonb_build_object(
        'account_type', v_new_account_type,
        'verification_status', v_new_verification
      )
    ),
    jsonb_build_object(
      'decision', p_decision,
      'application_type', v_app.type,
      'organization_id', p_organization_id,
      'membership_id', v_membership_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'decision', p_decision,
    'account_type', v_new_account_type,
    'verification_status', v_new_verification,
    'organization_id', p_organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_account_application(uuid, text, text, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_account_application(uuid, text, text, uuid)
  FROM anon;

GRANT EXECUTE ON FUNCTION public.approve_account_application(uuid, text, text, uuid)
  TO authenticated;

COMMIT;
