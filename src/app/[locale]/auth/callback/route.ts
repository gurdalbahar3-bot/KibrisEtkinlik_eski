import { NextResponse } from "next/server";

import { safeAuthCallbackNext } from "@/lib/auth/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ locale: string }> };

export async function GET(request: Request, { params }: Params) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeAuthCallbackNext(searchParams.get("next"), locale);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback`);
}
