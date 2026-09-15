import { getTranslations } from "next-intl/server";
import { listActiveVenues } from "@/lib/organizer/data";
import { CreateEventForm } from "@/components/organizer/CreateEventForm";

export default async function NewOrganizerEventPage() {
  const t = await getTranslations("organizer");
  const venues = await listActiveVenues();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("createTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("createSubtitle")}</p>
      </div>
      <CreateEventForm venues={venues} />
    </div>
  );
}
