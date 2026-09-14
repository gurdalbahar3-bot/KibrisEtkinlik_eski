import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  isPasswordRecoveryType,
  passwordRecoveryDestination,
  passwordResetPath,
} from "@/lib/auth/password-recovery";
import { safeAuthCallbackNext } from "@/lib/auth/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ locale: string }> };

/**
 * Auth callback for PKCE `code` and email `token_hash` flows.
 * Recovery is routed to /{locale}/reset-password — never mixed into login defaults.
 */
export async function GET(request: Request, { params }: Params) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typeRaw = searchParams.get("type");
  const recovery = isPasswordRecoveryType(typeRaw);

  const next = recovery
    ? passwordRecoveryDestination(locale, searchParams.get("next"))
    : safeAuthCallbackNext(searchParams.get("next"), locale);

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (tokenHash && typeRaw) {
    const { error } = await supabase.auth.verifyOtp({
      type: typeRaw as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (recovery) {
    return NextResponse.redirect(
      `${origin}${passwordResetPath(locale)}?error=recovery`
    );
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback`);
}
