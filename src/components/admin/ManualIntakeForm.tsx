import { createManualIntakeAction } from "@/lib/admin/intake-actions";
import { formatDistrictLabel } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import { MOCK_VENUES } from "@/lib/data/mock-events";

interface ManualIntakeFormProps {
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function ManualIntakeForm({ locale, t }: ManualIntakeFormProps) {
  return (
    <form action={createManualIntakeAction} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("manualIntakeBasics")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">
              {t("fieldRawTitle")} <span className="text-red-600">*</span>
            </span>
            <input
              name="rawTitle"
              required
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">{t("fieldRawDescription")}</span>
            <textarea
              name="rawDescription"
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              {t("colDistrict")} <span className="text-red-600">*</span>
            </span>
            <select
              name="suggestedDistrictId"
              required
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                {t("selectDistrict")}
              </option>
              {DISTRICT_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {formatDistrictLabel(slug, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              {t("colDate")} <span className="text-red-600">*</span>
            </span>
            <input
              name="suggestedStartsAt"
              type="datetime-local"
              required
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("colVenue")}</span>
            <select
              name="suggestedVenueId"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              defaultValue=""
            >
              <option value="">{t("selectVenue")}</option>
              {MOCK_VENUES.map((venue) => (
                <option key={venue.slug} value={venue.slug}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("fieldCategory")}</span>
            <select
              name="suggestedCategory"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              defaultValue=""
            >
              <option value="">{t("selectCategory")}</option>
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("fieldArtist")}</span>
            <input
              name="artist"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">{t("sourceUrl")}</span>
            <input
              name="sourceUrl"
              type="url"
              placeholder="https://"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">{t("sourceUrlHint")}</p>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("manualIntakeMediaNotes")}</h2>
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("fieldOfficialPoster")}</span>
            <input
              name="officialPosterUrl"
              type="url"
              placeholder="https://"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("fieldManualNote")}</span>
            <textarea
              name="manualNote"
              rows={3}
              placeholder={t("fieldManualNotePlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">{t("manualNoteEvidenceHint")}</p>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          {t("saveManualIntake")}
        </button>
      </div>
    </form>
  );
}
