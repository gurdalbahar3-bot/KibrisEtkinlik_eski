import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { TicketSetupForm } from "@/components/organizer/TicketSetupForm";
import {
  getEventTicketSetup,
  getOrganizerEventById,
} from "@/lib/organizer/data";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function OrganizerEventTicketsPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations("organizer");

  const event = await getOrganizerEventById(id);
  if (!event) notFound();

  const setup = await getEventTicketSetup(id);
  const zone =
    setup.zones.find((z) => z.is_active && z.sale_mode === "ticket_based") ??
    setup.zones[0];
  const ticketType =
    (zone && setup.types.find((ty) => ty.zone_id === zone.id && ty.is_active)) ??
    setup.types[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("ticketsTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("ticketsSubtitle", { title: event.title })}
          </p>
        </div>
        <Link
          href={{
            pathname: "/organizer/events/[id]",
            params: { id: event.id },
          }}
          className="text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {t("backToEvent")}
        </Link>
      </div>

      <TicketSetupForm
        eventId={event.id}
        zoneId={zone?.id}
        ticketTypeId={ticketType?.id}
        defaultZoneName={zone?.name ?? ""}
        defaultCapacity={zone?.capacity}
        defaultTicketName={ticketType?.name ?? ""}
        defaultPrice={
          ticketType?.price != null ? Number(ticketType.price) : undefined
        }
      />
    </div>
  );
}
