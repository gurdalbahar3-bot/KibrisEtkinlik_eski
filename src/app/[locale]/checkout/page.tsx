import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CheckoutForm } from "@/components/customer/CheckoutForm";
import { TableReservationCheckout } from "@/components/customer/TableReservationCheckout";
import { getCustomerSession } from "@/lib/customer/auth";
import { listActiveTablePackagesForEvent } from "@/lib/customer/table-offers";
import { discoveryEventsRepository } from "@/lib/data/discovery-repository";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    event?: string;
    type?: string;
    package?: string;
    table?: string;
    guests?: string;
    error?: string;
  }>;
};

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const {
    event: eventId,
    type: ticketTypeId,
    package: packageId,
    table: tableId,
    guests: guestsRaw,
    error,
  } = await searchParams;
  const t = await getTranslations("checkout");

  if (!eventId) {
    notFound();
  }

  const guests = guestsRaw ? Number.parseInt(guestsRaw, 10) : undefined;

  const session = await getCustomerSession();
  if (!session) {
    const qs = new URLSearchParams();
    qs.set("event", eventId);
    if (ticketTypeId) qs.set("type", ticketTypeId);
    if (packageId) qs.set("package", packageId);
    if (tableId) qs.set("table", tableId);
    if (guests != null && Number.isFinite(guests)) {
      qs.set("guests", String(guests));
    }
    const next =
      locale === "tr"
        ? `/tr/odeme?${qs.toString()}`
        : `/en/checkout?${qs.toString()}`;
    const loginBase = locale === "tr" ? "/tr/giris" : "/en/login";
    nextRedirect(`${loginBase}?next=${encodeURIComponent(next)}`);
  }

  const event = await discoveryEventsRepository.getById(eventId);
  if (!event) {
    notFound();
  }

  const [offers, tableOffers] = await Promise.all([
    discoveryEventsRepository.getTicketOffers(eventId),
    listActiveTablePackagesForEvent(eventId),
  ]);

  const preferTable = Boolean(packageId || tableId);

  return (
    <div className="section-container py-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={{ pathname: "/events/[slug]", params: { slug: event.slug } }}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← {t("backToEvent")}
        </Link>
        <div className="mt-4">
          {!preferTable ? (
            <CheckoutForm
              locale={locale}
              eventId={event.id}
              eventTitle={event.title}
              offers={offers}
              initialTicketTypeId={ticketTypeId}
              errorCode={error}
            />
          ) : null}
          {preferTable || tableOffers.length > 0 ? (
            <TableReservationCheckout
              locale={locale}
              eventId={event.id}
              eventTitle={event.title}
              offers={tableOffers}
              initialPackageId={packageId}
              initialTableId={tableId}
              initialGuests={
                guests != null && Number.isFinite(guests) ? guests : undefined
              }
              errorCode={preferTable ? error : undefined}
            />
          ) : null}
          {preferTable && offers.some((o) => o.saleMode === "ticket_based") ? (
            <div className="mt-8 border-t border-slate-100 pt-8">
              <CheckoutForm
                locale={locale}
                eventId={event.id}
                eventTitle={event.title}
                offers={offers}
                initialTicketTypeId={ticketTypeId}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
