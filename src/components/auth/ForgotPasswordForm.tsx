"use client";

import { useTranslations } from "next-intl";

import { requestPasswordResetAction } from "@/lib/auth/password-recovery-actions";

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("forgotPassword");

  return (
    <form
      action={requestPasswordResetAction}
      className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      data-testid="forgot-password-form"
    >
      <input type="hidden" name="locale" value={locale} />

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
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
        />
      </div>

      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
      >
        {t("submit")}
      </button>
    </form>
  );
}
