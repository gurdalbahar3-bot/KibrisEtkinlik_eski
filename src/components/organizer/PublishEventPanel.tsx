"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

import {
  publishEventAction,
  type ActionState,
} from "@/app/[locale]/organizer/actions";

const initialState: ActionState = { ok: false };

type Props = {
  eventId: string;
  publicSlug: string;
  canPublish: boolean;
};

export function PublishEventPanel({ eventId, publicSlug, canPublish }: Props) {
  const t = useTranslations("organizer");
  const tErrors = useTranslations("organizerErrors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(
    publishEventAction,
    initialState
  );

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">{t("publishSuccess")}</p>
        <Link
          href={{
            pathname: "/events/[slug]",
            params: { slug: publicSlug },
          }}
          className="mt-3 inline-flex text-sm font-semibold text-emerald-800 underline"
        >
          {t("viewPublicEvent")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">{t("publishHeading")}</h3>
      <p className="text-sm text-slate-600">{t("publishHint")}</p>

      {!canPublish ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("publishBlocked")}
        </p>
      ) : null}

      {state.errorCode ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {tErrors.has(state.errorCode)
            ? tErrors(state.errorCode)
            : state.message || tErrors("GENERIC")}
        </p>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="event_id" value={eventId} />
        <button
          type="submit"
          disabled={pending || !canPublish}
          className="btn-primary disabled:opacity-60"
        >
          {pending ? t("publishing") : t("publishSubmit")}
        </button>
      </form>
    </div>
  );
}
