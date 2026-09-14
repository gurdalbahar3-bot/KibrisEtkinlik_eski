"use client";

import { useTranslations } from "next-intl";

import { updatePasswordFromRecoveryAction } from "@/lib/auth/password-recovery-actions";

export function ResetPasswordForm({
  locale,
  returnTo,
}: {
  locale: string;
  returnTo: string;
}) {
  const t = useTranslations("passwordReset");

  return (
    <form
      action={updatePasswordFromRecoveryAction}
      className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      data-testid="reset-password-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
        />
        <p className="mt-1 text-xs text-slate-500">{t("passwordHint")}</p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-slate-700">
          {t("confirm")}
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
