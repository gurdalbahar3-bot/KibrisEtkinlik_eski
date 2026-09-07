"use server";

import { redirect } from "next/navigation";

import { assertOrganizerProfile } from "@/lib/organizer/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export async function loginOrganizerAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/organizer/login?error=missing");
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    redirect("/organizer/login?error=invalid");
  }

  const gate = await assertOrganizerProfile(signInData.user.id);
  if (!gate.ok) {
    await supabase.auth.signOut();
    redirect("/organizer/login?error=not_organizer");
  }

  redirect("/organizer");
}

export async function logoutOrganizerAction(): Promise<void> {
  if (getSupabasePublicEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect("/organizer/login");
}
