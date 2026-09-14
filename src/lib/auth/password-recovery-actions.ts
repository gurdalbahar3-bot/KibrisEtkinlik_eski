"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  forgotPasswordPath,
  passwordRecoveryCallbackPath,
  passwordResetPath,
} from "@/lib/auth/password-recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

function resolveLocale(raw: string): "tr" | "en" {
  return raw === "en" ? "en" : "tr";
}

function localeLoginPath(locale: string): string {
  return locale === "en" ? "/en/login" : "/tr/giris";
}

/**
 * Resolve the current request origin for recovery redirectTo.
 * Never accepts a user-supplied URL (open-redirect safe).
 */
async function getRequestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  if (host) {
    return `${proto}://${host}`;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }
  return "https://kibrisetkinlik.com";
}

/**
 * Customer forgot-password: send Supabase recovery email.
 * redirectTo is always `{origin}/{locale}/auth/callback` (plus safe reset next).
 */
export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const locale = resolveLocale(String(formData.get("locale") ?? "tr").trim());
  const forgotPath = forgotPasswordPath(locale);

  if (!getSupabasePublicEnv()) {
    redirect(`${forgotPath}?error=config`);
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(`${forgotPath}?error=missing`);
  }

  const origin = await getRequestOrigin();
  const callbackPath = passwordRecoveryCallbackPath(locale);
  const resetPath = passwordResetPath(locale);
  // Callback URL only — next is constrained by passwordRecoveryDestination / safeAuthCallbackNext.
  const redirectTo = `${origin}${callbackPath}?next=${encodeURIComponent(resetPath)}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Always show a generic success to avoid email enumeration; log-worthy failures still surface as sent.
  if (error) {
    redirect(`${forgotPath}?error=send`);
  }

  redirect(`${forgotPath}?sent=1`);
}

/**
 * Establish a recovery session from implicit/hash tokens (access + refresh).
 * Used when Supabase redirects to Site URL with `#…&type=recovery`.
 */
export async function establishRecoverySessionAction(input: {
  locale: string;
  accessToken: string;
  refreshToken: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!getSupabasePublicEnv()) {
    return { ok: false, error: "config" };
  }

  const accessToken = input.accessToken.trim();
  const refreshToken = input.refreshToken.trim();
  if (!accessToken || !refreshToken) {
    return { ok: false, error: "missing_tokens" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return { ok: false, error: "session" };
  }

  return { ok: true };
}

export async function updatePasswordFromRecoveryAction(
  formData: FormData
): Promise<void> {
  const locale = resolveLocale(String(formData.get("locale") ?? "tr").trim());
  const resetPath = passwordResetPath(locale);
  const loginPath = localeLoginPath(locale);

  if (!getSupabasePublicEnv()) {
    redirect(`${resetPath}?error=config`);
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) {
    redirect(`${resetPath}?error=missing`);
  }

  if (password.length < 8) {
    redirect(`${resetPath}?error=weak`);
  }

  if (password !== confirm) {
    redirect(`${resetPath}?error=mismatch`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${resetPath}?error=session`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`${resetPath}?error=update`);
  }

  // End recovery session so the user signs in deliberately (customer or organizer).
  await supabase.auth.signOut();
  redirect(`${loginPath}?reset=1`);
}
