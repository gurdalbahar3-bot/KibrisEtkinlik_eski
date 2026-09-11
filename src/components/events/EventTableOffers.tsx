import { getLocale, getTranslations } from "next-intl/server";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import { Link } from "@/lib/i18n/navigation";
import type { DiscoveryTablePackageOffer } from "@/lib/customer/table-offers";

type Props = {
  offers: DiscoveryTablePackageOffer[];
  eventId: string;
};

export async function EventTableOffers({ offers, eventId }: Props) {
  const t = await getTranslations("eventDetail");
  const locale = (await getLocale()) as "tr" | "en";

  if (offers.length === 0) {
    return null;
  }

  const buyable = offers.filter((o) => !o.isSoldOut);
  const fromDue = buyable.length
    ? Math.min(...buyable.map((o) => o.amountDueNow))
    : undefined;

  return (
    <section
      className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-card"
      aria-labelledby="table-offers-title"
      data-testid="event-table-offers"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="table-offers-title"
            className="text-lg font-bold text-slate-900"
          >
            {t("tablesTitle")}
          </h2>
          {fromDue !== undefined ? (
            <p className="mt-1 text-sm text-slate-500">
              {t("fromPrice", { price: formatTicketPrice(fromDue, locale) })}
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-5 divide-y divide-slate-100">
        {offers.map((offer) => (
          <li
            key={offer.id}
            className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0"
          >
            <div>
              <p className="font-medium text-slate-900">
                {offer.name}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  · #{offer.tableNumber} · {offer.saleCategory}
                </span>
              </p>
              {offer.description ? (
                <p className="text-sm text-slate-500">{offer.description}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-slate-400">
                {offer.isSoldOut
                  ? t("soldOut")
                  : t("remainingSeats", { count: offer.remaining })}
              </p>
            </div>
            <p
              className={`text-sm font-semibold ${
                offer.isSoldOut
                  ? "text-slate-400 line-through"
                  : "text-slate-900"
              }`}
            >
              {formatTicketPrice(offer.amountDueNow, locale)}
            </p>
          </li>
        ))}
      </ul>

      {buyable.length > 0 ? (
        <Link
          href={{
            pathname: "/checkout",
            query: {
              event: eventId,
              package: buyable[0]!.id,
              table: buyable[0]!.tableId,
            },
          }}
          className="btn-primary mt-6 inline-flex w-full sm:w-auto"
          data-testid="reserve-table-cta"
        >
          {t("reserveTable")}
        </Link>
      ) : null}
    </section>
  );
}
