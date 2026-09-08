"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { checkoutTicketOnlyAction } from "@/lib/customer/checkout-actions";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import type { DiscoveryTicketOffer } from "@/types/event";

type Props = {
  locale: "tr" | "en";
  eventId: string;
  eventTitle: string;
  offers: DiscoveryTicketOffer[];
  initialTicketTypeId?: string;
  errorCode?: string;
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="checkout-submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function CheckoutForm({
  locale,
  eventId,
  eventTitle,
  offers,
  initialTicketTypeId,
  errorCode,
}: Props) {
  const t = useTranslations("checkout");
  const ticketOffers = useMemo(
    () => offers.filter((o) => o.saleMode === "ticket_based" && !o.isSoldOut),
    [offers]
  );
  const soldOutOnly =
    offers.some((o) => o.saleMode === "ticket_based") && ticketOffers.length === 0;

  const defaultTypeId =
    (initialTicketTypeId &&
      ticketOffers.some((o) => o.id === initialTicketTypeId) &&
      initialTicketTypeId) ||
    ticketOffers[0]?.id ||
    "";

  const [ticketTypeId, setTicketTypeId] = useState(defaultTypeId);
  const [quantity, setQuantity] = useState(1);

  const selected = ticketOffers.find((o) => o.id === ticketTypeId) ?? null;
  const maxQty = Math.max(
    1,
    Math.min(
      selected?.maxPerOrder && selected.maxPerOrder > 0
        ? selected.maxPerOrder
        : 10,
      selected?.remaining && selected.remaining > 0 ? selected.remaining : 10
    )
  );

  const lineTotal = selected ? selected.price * quantity : 0;

  function errorMessage(code: string | undefined): string | null {
    if (!code) return null;
    switch (code) {
      case "config":
        return t("errorConfig");
      case "missing":
        return t("errorMissing");
      case "invalid_quantity":
        return t("errorInvalidQuantity");
      case "unauthenticated":
        return t("errorUnauthenticated");
      case "event_not_sellable":
        return t("errorEventNotSellable");
      case "ticket_type_not_found":
        return t("errorTicketType");
      case "max_per_order_exceeded":
        return t("errorMaxPerOrder");
      case "capacity_exceeded":
        return t("errorCapacity");
      case "zone_not_found":
      case "wrong_sale_mode":
        return t("errorZone");
      case "checkout_failed":
      default:
        return t("errorGeneric");
    }
  }

  const alert = errorMessage(errorCode);

  if (ticketOffers.length === 0) {
    return (
      <p
        className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600"
        data-testid={soldOutOnly ? "checkout-sold-out" : "checkout-empty"}
      >
        {soldOutOnly ? t("errorCapacity") : t("emptyOffers")}
      </p>
    );
  }

  return (
    <div data-testid="checkout-form">
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{eventTitle}</p>

      {alert ? (
        <p
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="checkout-error"
        >
          {alert}
        </p>
      ) : null}

      <form className="mt-6 space-y-5" action={checkoutTicketOnlyAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="zone_id" value={selected?.zoneId ?? ""} />

        <div>
          <label htmlFor="ticket_type_id" className="block text-sm font-medium text-slate-700">
            {t("ticketType")}
          </label>
          <select
            id="ticket_type_id"
            name="ticket_type_id"
            data-testid="checkout-ticket-type"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={ticketTypeId}
            onChange={(e) => {
              setTicketTypeId(e.target.value);
              setQuantity(1);
            }}
            required
          >
            {ticketOffers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name} · {offer.zoneName} ·{" "}
                {formatTicketPrice(offer.price, locale)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-slate-700">
            {t("quantity")}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={maxQty}
            data-testid="checkout-quantity"
            className="mt-1 w-full max-w-[8rem] rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={quantity}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n)) {
                setQuantity(1);
                return;
              }
              setQuantity(Math.min(maxQty, Math.max(1, n)));
            }}
            required
          />
          {selected?.maxPerOrder ? (
            <p className="mt-1 text-xs text-slate-500">
              {t("maxPerOrder", { count: selected.maxPerOrder })}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-600">{t("unitPrice")}</p>
          <p className="text-lg font-semibold text-slate-900" data-testid="checkout-unit-price">
            {selected ? formatTicketPrice(selected.price, locale) : "—"}
          </p>
          <p className="mt-3 text-sm text-slate-600">{t("total")}</p>
          <p className="text-xl font-bold text-slate-900" data-testid="checkout-total">
            {formatTicketPrice(lineTotal, locale)}
          </p>
          <p className="mt-2 text-xs text-slate-500">{t("priceNote")}</p>
        </div>

        <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />
      </form>
    </div>
  );
}
