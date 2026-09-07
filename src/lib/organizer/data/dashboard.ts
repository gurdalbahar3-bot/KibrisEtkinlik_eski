import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrganizerSession } from "@/types/organizer/session";

export type OrganizerEventListItem = {
  id: string;
  title: string;
  status: string;
  startsAt: string;
};

export type OrganizerOrganizationSummary = {
  id: string;
  name: string;
  status: string;
} | null;

export type OrganizerDashboardData = {
  session: OrganizerSession;
  organization: OrganizerOrganizationSummary;
  venueCount: number;
  eventCount: number;
  statusCounts: {
    draft: number;
    in_review: number;
    approved: number;
    published: number;
  };
  events: OrganizerEventListItem[];
};

function emptyStatusCounts() {
  return { draft: 0, in_review: 0, approved: 0, published: 0 };
}

/** Load organizer dashboard from live tables (anon key + user JWT / RLS). */
export async function loadOrganizerDashboard(
  session: OrganizerSession
): Promise<OrganizerDashboardData> {
  const supabase = await createSupabaseServerClient();
  const statusCounts = emptyStatusCounts();

  const [{ data: orgProfile }, { data: memberships }, { data: venues }, { data: events }] =
    await Promise.all([
      supabase
        .from("organizer_profiles")
        .select("organization_id, organization_name")
        .eq("profile_id", session.userId)
        .maybeSingle(),
      supabase
        .from("organization_memberships")
        .select("organization_id, status, organizations(id, name, status)")
        .eq("profile_id", session.userId)
        .eq("status", "active"),
      supabase.from("venues").select("id").eq("owner_id", session.userId),
      supabase
        .from("events")
        .select("id, title, status, starts_at")
        .eq("owner_id", session.userId)
        .order("starts_at", { ascending: true })
        .limit(50),
    ]);

  let organization: OrganizerOrganizationSummary = null;

  const membershipRows = (memberships ?? []) as Array<{
    organization_id: string;
    organizations:
      | { id: string; name: string; status: string }
      | { id: string; name: string; status: string }[]
      | null;
  }>;

  const firstMembership = membershipRows[0];
  if (firstMembership?.organizations) {
    const org = Array.isArray(firstMembership.organizations)
      ? firstMembership.organizations[0]
      : firstMembership.organizations;
    if (org) {
      organization = { id: org.id, name: org.name, status: org.status };
    }
  }

  if (!organization && orgProfile) {
    const profileRow = orgProfile as {
      organization_id: string | null;
      organization_name: string | null;
    };
    if (profileRow.organization_id) {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("id, name, status")
        .eq("id", profileRow.organization_id)
        .maybeSingle();
      if (orgRow) {
        const row = orgRow as { id: string; name: string; status: string };
        organization = { id: row.id, name: row.name, status: row.status };
      }
    } else if (profileRow.organization_name) {
      organization = {
        id: "",
        name: profileRow.organization_name,
        status: "unlinked",
      };
    }
  }

  const eventRows = (events ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    starts_at: string;
  }>;

  for (const event of eventRows) {
    if (event.status === "draft") statusCounts.draft += 1;
    else if (event.status === "in_review") statusCounts.in_review += 1;
    else if (event.status === "approved") statusCounts.approved += 1;
    else if (event.status === "published") statusCounts.published += 1;
  }

  return {
    session,
    organization,
    venueCount: (venues ?? []).length,
    eventCount: eventRows.length,
    statusCounts,
    events: eventRows.map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      startsAt: event.starts_at,
    })),
  };
}
