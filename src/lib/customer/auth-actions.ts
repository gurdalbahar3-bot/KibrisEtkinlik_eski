"use server";

import { redirect } from "next/navigation";

import { assertCustomerProfile } from "@/lib/customer/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

function localeLoginPath(locale: string): string {
  return locale === "tr" ? "/tr/giris" : "/en/login";
}

function localeHomePath(locale: string): string {
  return locale === "tr" ? "/tr" : "/en";
}

export async function loginCustomerAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  const next = String(formData.get("next") ?? "").trim();
  const loginPath = localeLoginPath(locale);

  if (!getSupabasePublicEnv()) {
    redirect(`${loginPath}?error=config`);
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`${loginPath}?error=missing`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    redirect(`${loginPath}?error=invalid`);
  }

  const gate = await assertCustomerProfile(signInData.user.id);
  if (!gate.ok) {
    await supabase.auth.signOut();
    redirect(`${loginPath}?error=not_customer`);
  }

  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(next);
  }

  redirect(localeHomePath(locale));
}

export async function signupCustomerAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  const signupPath = locale === "tr" ? "/tr/kayit" : "/en/signup";
  const loginPath = localeLoginPath(locale);

  if (!getSupabasePublicEnv()) {
    redirect(`${signupPath}?error=config`);
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!email || !password) {
    redirect(`${signupPath}?error=missing`);
  }

  if (password.length < 8) {
    redirect(`${signupPath}?error=weak_password`);
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
    redirect(`${signupPath}?error=signup_failed`);
  }

  if (signUpData.session && (fullName || phone)) {
    const patch: { full_name?: string; phone?: string } = {
      ...(fullName ? { full_name: fullName } : {}),
      ...(phone ? { phone } : {}),
    };
    // profiles Update is column-granted; supabase-js Update generic is still Record-never for inserts.
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
    redirect(`${loginPath}?error=confirm`);
  }

  const gate = await assertCustomerProfile(signUpData.user.id);
  if (!gate.ok) {
    await supabase.auth.signOut();
    redirect(`${loginPath}?error=not_customer`);
  }

  redirect(localeHomePath(locale));
}

export async function logoutCustomerAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  if (getSupabasePublicEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect(localeLoginPath(locale));
}
