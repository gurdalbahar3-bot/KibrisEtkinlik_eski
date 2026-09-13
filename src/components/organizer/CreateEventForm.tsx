"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  createEventAction,
  type ActionState,
} from "@/app/[locale]/organizer/actions";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import type { ActiveVenueOption } from "@/lib/organizer/data";

const initialState: ActionState = { ok: false };

export function CreateEventForm({ venues }: { venues: ActiveVenueOption[] }) {
  const t = useTranslations("organizer");
  const tErrors = useTranslations("organizerErrors");
  const tCategories = useTranslations("categories");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(
    createEventAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("fieldTitle")} htmlFor="title">
        <input id="title" name="title" required maxLength={200} className="field-input" />
      </Field>

      <Field label={t("fieldDescription")} htmlFor="description">
        <textarea id="description" name="description" rows={4} className="field-input" />
      </Field>

      <Field label={t("fieldCategory")} htmlFor="category">
        <select id="category" name="category" required className="field-input">
          <option value="">{t("selectCategory")}</option>
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {tCategories(key)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("fieldVenue")} htmlFor="venue_id">
        {venues.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("noActiveVenues")}
          </p>
        ) : (
          <select id="venue_id" name="venue_id" required className="field-input">
            <option value="">{t("selectVenue")}</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fieldStartsAt")} htmlFor="starts_at">
          <input id="starts_at" name="starts_at" type="datetime-local" required className="field-input" />
        </Field>
        <Field label={t("fieldEndsAt")} htmlFor="ends_at">
          <input id="ends_at" name="ends_at" type="datetime-local" required className="field-input" />
        </Field>
      </div>

      <Field label={t("fieldIsFree")} htmlFor="is_free">
        <select id="is_free" name="is_free" className="field-input" defaultValue="false">
          <option value="false">{t("isFreeNo")}</option>
          <option value="true">{t("isFreeYes")}</option>
        </select>
      </Field>

      <Field label={t("fieldCoverUrl")} htmlFor="cover_image_url">
        <input id="cover_image_url" name="cover_image_url" type="url" placeholder="https://" className="field-input" />
      </Field>

      {state.errorCode ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {tErrors.has(state.errorCode)
            ? tErrors(state.errorCode)
            : state.message || tErrors("GENERIC")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || venues.length === 0}
        className="btn-primary w-full disabled:opacity-60"
      >
        {pending ? t("creating") : t("createSubmit")}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
