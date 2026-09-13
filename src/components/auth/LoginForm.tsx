"use client";

import { useTranslations } from "next-intl";

import { loginCustomerAction } from "@/lib/customer/auth-actions";

export function LoginForm({
  locale,
  nextPath,
}: {
  locale: string;
  nextPath: string;
}) {
  const t = useTranslations("auth");

  return (
    <form
      action={loginCustomerAction}
      className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      data-testid="customer-login-form"
    >
      <input type="hidden" name="locale" value={locale} />
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field-input"
        />
      </div>

      <button type="submit" className="btn-primary w-full">
        {t("signIn")}
      </button>
    </form>
  );
}
