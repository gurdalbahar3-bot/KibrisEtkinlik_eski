"use server";

import { redirect } from "next/navigation";

import { clearDevAdminSession, setDevAdminSession } from "@/lib/admin/auth/dev-admin-auth";
import { shouldUseDevAdminAuth } from "@/lib/admin/auth/should-use-dev-admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export async function loginDevAction(): Promise<void> {
  await setDevAdminSession();
  redirect("/admin");
}

export async function loginSupabaseAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/admin/login?error=config");
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/admin/login?error=missing");
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    redirect("/admin/login?error=invalid");
  }

  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc("is_super_admin");

  if (rpcError || !isSuperAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_super_admin");
  }

  redirect("/admin");
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
