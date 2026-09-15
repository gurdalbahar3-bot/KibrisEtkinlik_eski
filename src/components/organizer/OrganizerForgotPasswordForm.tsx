"use client";

import { requestPasswordResetAction } from "@/lib/auth/password-recovery-actions";

type Labels = {
  email: string;
  submit: string;
};

export function OrganizerForgotPasswordForm({
  locale,
  labels,
}: {
  locale: string;
  labels: Labels;
}) {
  return (
    <form
      action={requestPasswordResetAction}
      className="space-y-4"
      data-testid="organizer-forgot-password-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="entry" value="organizer" />

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          {labels.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
      >
        {labels.submit}
      </button>
    </form>
  );
}
