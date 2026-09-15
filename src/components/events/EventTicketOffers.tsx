import { getLocale, getTranslations } from "next-intl/server";
import { lowestOfferPrice } from "@/lib/data/adapters/ticket-offer-mapper";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import { Link } from "@/lib/i18n/navigation";
import type { DiscoveryTicketOffer } from "@/types/event";

interface EventTicketOffersProps {
  offers: DiscoveryTicketOffer[];
  isFree: boolean;
  officialTicketUrl?: string;
  eventId: string;
}

export async function EventTicketOffers({
  offers,
  isFree,
  officialTicketUrl,
  eventId,
}: EventTicketOffersProps) {
  const t = await getTranslations("eventDetail");
  const locale = (await getLocale()) as "tr" | "en";
  const fromPrice = lowestOfferPrice(offers);
  const buyable = offers.filter((o) => o.saleMode === "ticket_based" && !o.isSoldOut);

  return (
    <section className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-card" aria-labelledby="ticket-offers-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ticket-offers-title" className="text-lg font-bold text-slate-900">
            {t("ticketsTitle")}
          </h2>
          {fromPrice !== undefined && (
            <p className="mt-1 text-sm text-slate-500">
              {t("fromPrice", { price: formatTicketPrice(fromPrice, locale) })}
            </p>
          )}
        </div>
      </div>

      {offers.length > 0 ? (
        <ul className="mt-5 divide-y divide-slate-100">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium text-slate-900">{offer.name}</p>
                <p className="text-sm text-slate-500">
                  {offer.zoneName}
                  {offer.description ? ` · ${offer.description}` : ""}
                </p>
                {offer.remaining !== undefined && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {offer.isSoldOut
                      ? t("soldOut")
                      : t("remaining", { count: offer.remaining })}
                  </p>
                )}
              </div>
              <p
                className={`text-sm font-semibold ${
                  offer.isSoldOut ? "text-slate-400 line-through" : "text-slate-900"
                }`}
              >
                {formatTicketPrice(offer.price, locale)}
              </p>
            </li>
          ))}
        </ul>
      ) : isFree ? (
        <p className="mt-4 text-sm font-medium text-emerald-700">{t("freeEntry")}</p>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{t("catalogEmpty")}</p>
      )}

      {officialTicketUrl ? (
        <a
          href={officialTicketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-6 w-full sm:w-auto"
        >
          {t("officialTickets")} →
        </a>
      ) : buyable.length > 0 ? (
        <Link
          href={{
            pathname: "/checkout",
            query: {
              event: eventId,
              type: buyable[0]!.id,
            },
          }}
          className="btn-primary mt-6 inline-flex w-full sm:w-auto"
          data-testid="buy-tickets-cta"
        >
          {t("buyTickets")}
        </Link>
      ) : null}
    </section>
  );
}
