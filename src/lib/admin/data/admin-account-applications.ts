import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbAccountApplicationRow,
  DbApplicationType,
  DbProfileRow,
} from "@/types/supabase/database";

export interface AdminAccountApplicationItem {
  id: string;
  applicantId: string;
  applicantEmail: string | null;
  applicantLabel: string;
  type: DbApplicationType;
  submittedAt: string;
}

function mapApplication(
  row: DbAccountApplicationRow,
  profileById: Map<string, DbProfileRow>
): AdminAccountApplicationItem {
  const profile = profileById.get(row.applicant_id);
  return {
    id: row.id,
    applicantId: row.applicant_id,
    applicantEmail: profile?.email ?? null,
    applicantLabel: profile?.email ?? profile?.full_name ?? row.applicant_id.slice(0, 8),
    type: row.type,
    submittedAt: row.submitted_at,
  };
}

async function fetchApplicantProfiles(applicantIds: string[]): Promise<Map<string, DbProfileRow>> {
  if (applicantIds.length === 0) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, account_type")
    .in("id", applicantIds);

  if (error) {
    throw new Error(`Admin applicant profiles read failed: ${error.message}`);
  }

  return new Map(((data ?? []) as DbProfileRow[]).map((profile) => [profile.id, profile]));
}

/**
 * Super Admin pending applications from Supabase.
 * Returns null in mock mode. Throws if a Super Admin session cannot read.
 */
export async function listPendingAccountApplicationsForAdmin(): Promise<
  AdminAccountApplicationItem[] | null
> {
  if (!isSupabaseDataSource()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc("is_super_admin");

  if (rpcError) {
    throw new Error(`Super Admin session cannot call is_super_admin: ${rpcError.message}`);
  }

  if (!isSuperAdmin) {
    throw new Error("Super Admin session cannot list account applications.");
  }

  const { data, error } = await supabase
    .from("account_applications")
    .select("id, applicant_id, type, status, reviewed_by, reviewed_at, rejection_reason, submitted_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  if (error) {
    throw new Error(`Account applications list failed: ${error.message}`);
  }

  const rows = (data ?? []) as DbAccountApplicationRow[];
  const applicantIds = [...new Set(rows.map((row) => row.applicant_id))];
  const profileById = await fetchApplicantProfiles(applicantIds);

  return rows.map((row) => mapApplication(row, profileById));
}
