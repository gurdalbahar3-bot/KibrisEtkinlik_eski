"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { loginAction, type ActionState } from "@/app/[locale]/organizer/actions";

const initialState: ActionState = { ok: false };

export function LoginForm({
  locale,
  nextPath,
}: {
  locale: string;
  nextPath: string;
}) {
  const t = useTranslations("auth");
  const tErrors = useTranslations("organizerErrors");
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form
      action={formAction}
      className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={nextPath} />

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

      {state.errorCode ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {tErrors.has(state.errorCode)
            ? tErrors(state.errorCode)
            : state.message || tErrors("GENERIC")}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? t("signingIn") : t("signIn")}
      </button>
    </form>
  );
}
