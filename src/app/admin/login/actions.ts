"use server";

function safeAdminNext(raw: FormDataEntryValue | string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/admin";
  }
  if (value === "/admin" || value.startsWith("/admin/")) {
    return value;
  }
  if (/^\/(tr|en)\/admin(\/|$)/.test(value)) {
    return value;
  }
  return "/admin";
}

import { redirect } from "next/navigation";

import { clearDevAdminSession, setDevAdminSession } from "@/lib/admin/auth/dev-admin-auth";
import { shouldUseDevAdminAuth } from "@/lib/admin/auth/should-use-dev-admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export async function loginDevAction(formData?: FormData): Promise<void> {
  await setDevAdminSession();
  redirect(safeAdminNext(formData?.get("next")));
}

export async function loginSupabaseAction(formData: FormData): Promise<void> {
  const next = safeAdminNext(formData.get("next"));

  if (!getSupabasePublicEnv()) {
    redirect(`/admin/login?error=config&next=${encodeURIComponent(next)}`);
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/admin/login?error=missing&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc("is_super_admin");

  if (rpcError || !isSuperAdmin) {
    await supabase.auth.signOut();
    redirect(`/admin/login?error=not_super_admin&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function logoutAdminAction(): Promise<void> {
  if (shouldUseDevAdminAuth()) {
    await clearDevAdminSession();
  }

  if (getSupabasePublicEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect("/admin/login");
}
