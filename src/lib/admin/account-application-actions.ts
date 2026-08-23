"use server";

import { revalidatePath } from "next/cache";

import { getAdminAuth } from "@/lib/admin/auth";
import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, DbApproveAccountApplicationResult } from "@/types/supabase/database";

type ApproveAccountApplicationArgs =
  Database["public"]["Functions"]["approve_account_application"]["Args"];

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
  const rpcArgs: ApproveAccountApplicationArgs = {
    p_application_id: trimmedId,
    p_decision: decision,
    p_rejection_reason: options?.rejectionReason?.trim() || null,
    p_organization_id: organizationId,
  };
  // Hand-maintained Database types do not satisfy supabase-js RPC generic inference
  // (Args collapses to never). The payload is still checked via ApproveAccountApplicationArgs.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "approve_account_application",
      args: ApproveAccountApplicationArgs
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("approve_account_application", rpcArgs);

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
