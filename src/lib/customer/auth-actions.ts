"use server";

import { redirect } from "next/navigation";

import {
  customerHomePath,
  safeCustomerNextPath,
} from "@/lib/auth/safe-next";
import { assertCustomerProfile } from "@/lib/customer/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

function localeLoginPath(locale: string): string {
  return locale === "en" ? "/en/login" : "/tr/giris";
}

function localeSignupPath(locale: string): string {
  return locale === "en" ? "/en/signup" : "/tr/kayit";
}

function resolveLocale(raw: string): "tr" | "en" {
  return raw === "en" ? "en" : "tr";
}

export async function loginCustomerAction(formData: FormData): Promise<void> {
  const locale = resolveLocale(String(formData.get("locale") ?? "tr").trim());
  const nextRaw = String(formData.get("next") ?? "").trim();
  const loginPath = localeLoginPath(locale);
  const safeNext = safeCustomerNextPath(nextRaw, locale);

  if (!getSupabasePublicEnv()) {
    redirect(`${loginPath}?error=config`);
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    const q = safeNext
      ? `?error=missing&next=${encodeURIComponent(safeNext)}`
      : "?error=missing";
    redirect(`${loginPath}${q}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    const q = safeNext
      ? `?error=invalid&next=${encodeURIComponent(safeNext)}`
      : "?error=invalid";
    redirect(`${loginPath}${q}`);
  }

  // Same Supabase account may be organizer/venue_owner and still shop on the storefront.
  // Organizer OS keeps its own approved organizer|venue_owner guard.
  const gate = await assertCustomerProfile(signInData.user.id);
  if (!gate.ok) {
    await supabase.auth.signOut();
    const q = safeNext
      ? `?error=invalid&next=${encodeURIComponent(safeNext)}`
      : "?error=invalid";
    redirect(`${loginPath}${q}`);
  }

  redirect(safeNext ?? customerHomePath(locale));
}

export async function signupCustomerAction(formData: FormData): Promise<void> {
  const locale = resolveLocale(String(formData.get("locale") ?? "tr").trim());
  const nextRaw = String(formData.get("next") ?? "").trim();
  const signupPath = localeSignupPath(locale);
  const loginPath = localeLoginPath(locale);
  const safeNext = safeCustomerNextPath(nextRaw, locale);

  if (!getSupabasePublicEnv()) {
    redirect(`${signupPath}?error=config`);
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!email || !password) {
    const q = safeNext
      ? `?error=missing&next=${encodeURIComponent(safeNext)}`
      : "?error=missing";
    redirect(`${signupPath}${q}`);
  }

  if (password.length < 8) {
    const q = safeNext
      ? `?error=weak_password&next=${encodeURIComponent(safeNext)}`
      : "?error=weak_password";
    redirect(`${signupPath}${q}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        account_type: "customer",
        full_name: fullName || null,
      },
    },
  });

  if (signUpError || !signUpData.user) {
    const q = safeNext
      ? `?error=signup_failed&next=${encodeURIComponent(safeNext)}`
      : "?error=signup_failed";
    redirect(`${signupPath}${q}`);
  }

  if (signUpData.session && (fullName || phone)) {
    const patch: { full_name?: string; phone?: string } = {
      ...(fullName ? { full_name: fullName } : {}),
      ...(phone ? { phone } : {}),
    };
    await (
      supabase.from("profiles") as unknown as {
        update: (values: {
          full_name?: string | null;
          phone?: string | null;
        }) => { eq: (column: string, value: string) => Promise<unknown> };
      }
    )
      .update(patch)
      .eq("id", signUpData.user.id);
  }

  if (!signUpData.session) {
    const q = safeNext
      ? `?error=confirm&next=${encodeURIComponent(safeNext)}`
      : "?error=confirm";
    redirect(`${loginPath}${q}`);
  }

  const gate = await assertCustomerProfile(signUpData.user.id);
  if (!gate.ok) {
    await supabase.auth.signOut();
    const q = safeNext
      ? `?error=not_customer&next=${encodeURIComponent(safeNext)}`
      : "?error=not_customer";
    redirect(`${loginPath}${q}`);
  }

  redirect(safeNext ?? customerHomePath(locale));
}

export async function logoutCustomerAction(formData: FormData): Promise<void> {
  const locale = resolveLocale(String(formData.get("locale") ?? "tr").trim());
  if (getSupabasePublicEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect(localeLoginPath(locale));
}
