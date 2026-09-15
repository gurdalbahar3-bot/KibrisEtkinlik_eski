import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CheckoutForm } from "@/components/customer/CheckoutForm";
import { getCustomerSession } from "@/lib/customer/auth";
import { discoveryEventsRepository } from "@/lib/data/discovery-repository";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    event?: string;
    type?: string;
    error?: string;
  }>;
};

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const { event: eventId, type: ticketTypeId, error } = await searchParams;
  const t = await getTranslations("checkout");

  if (!eventId) {
    notFound();
  }

  const session = await getCustomerSession();
  if (!session) {
    const next =
      locale === "tr"
        ? `/tr/odeme?event=${encodeURIComponent(eventId)}${
            ticketTypeId ? `&type=${encodeURIComponent(ticketTypeId)}` : ""
          }`
        : `/en/checkout?event=${encodeURIComponent(eventId)}${
            ticketTypeId ? `&type=${encodeURIComponent(ticketTypeId)}` : ""
          }`;
    const loginBase = locale === "tr" ? "/tr/giris" : "/en/login";
    nextRedirect(`${loginBase}?next=${encodeURIComponent(next)}`);
  }

  const event = await discoveryEventsRepository.getById(eventId);
  if (!event) {
    notFound();
  }

  const offers = await discoveryEventsRepository.getTicketOffers(eventId);

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
          <CheckoutForm
            locale={locale}
            eventId={event.id}
            eventTitle={event.title}
            offers={offers}
            initialTicketTypeId={ticketTypeId}
            errorCode={error}
          />
        </div>
      </div>
    </div>
  );
}
