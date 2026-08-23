"use server";

import { revalidatePath } from "next/cache";

import { getAdminAuth } from "@/lib/admin/auth";
import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbApproveAccountApplicationResult } from "@/types/supabase/database";

export type AccountApplicationActionResult =
  | { ok: true }
  | { ok: false; message: string };

function readDecisionResult(data: unknown): AccountApplicationActionResult {
  const payload = data as DbApproveAccountApplicationResult | null;
  if (!payload || payload.success !== true) {
    return {
      ok: false,
      message: `approve_account_application failed: ${payload?.error_code ?? "UNKNOWN"}`,
    };
  }
  return { ok: true };
}

export async function decideAccountApplicationAction(
  applicationId: string,
  decision: "approve" | "reject",
  options?: { rejectionReason?: string; organizationId?: string }
): Promise<AccountApplicationActionResult> {
  await getAdminAuth().requireSuperAdmin();

  if (!isSupabaseDataSource()) {
    return {
      ok: false,
      message: "Account application decisions require SUPABASE_DATA_SOURCE=supabase.",
    };
  }

  const trimmedId = applicationId.trim();
  if (!trimmedId) {
    return { ok: false, message: "approve_account_application failed: APPLICATION_NOT_FOUND" };
  }

  const organizationId = options?.organizationId?.trim() || null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("approve_account_application", {
    p_application_id: trimmedId,
    p_decision: decision,
    p_rejection_reason: options?.rejectionReason?.trim() || null,
    p_organization_id: organizationId,
  });

  if (error) {
    return { ok: false, message: `approve_account_application failed: ${error.message}` };
  }

  return readDecisionResult(data);
}

async function runDecisionFormAction(
  formData: FormData,
  decision: "approve" | "reject"
): Promise<void> {
  const applicationId = String(formData.get("applicationId") ?? "");
  const rejectionReason = String(formData.get("rejectionReason") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await decideAccountApplicationAction(applicationId, decision, {
    rejectionReason,
    organizationId,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  revalidatePath("/admin/review/approval");
}

export async function approveAccountApplicationFormAction(formData: FormData): Promise<void> {
  await runDecisionFormAction(formData, "approve");
}

export async function rejectAccountApplicationFormAction(formData: FormData): Promise<void> {
  await runDecisionFormAction(formData, "reject");
}
