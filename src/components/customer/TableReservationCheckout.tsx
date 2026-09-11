"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { checkoutTableReservationAction } from "@/lib/customer/checkout-actions";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import type { DiscoveryTablePackageOffer } from "@/lib/customer/table-offers";

type Props = {
  locale: "tr" | "en";
  eventId: string;
  eventTitle: string;
  offers: DiscoveryTablePackageOffer[];
  initialPackageId?: string;
  initialTableId?: string;
  initialGuests?: number;
  errorCode?: string;
};

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="table-checkout-submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function TableReservationCheckout({
  locale,
  eventId,
  eventTitle,
  offers,
  initialPackageId,
  initialTableId,
  initialGuests,
  errorCode,
}: Props) {
  const t = useTranslations("checkout");
  const available = useMemo(
    () => offers.filter((o) => !o.isSoldOut && o.remaining > 0),
    [offers]
  );

  const defaultPkg =
    (initialPackageId &&
      available.some((o) => o.id === initialPackageId) &&
      initialPackageId) ||
    (initialTableId &&
      available.find((o) => o.tableId === initialTableId)?.id) ||
    available[0]?.id ||
    "";

  const [packageId, setPackageId] = useState(defaultPkg);
  const selected = available.find((o) => o.id === packageId) ?? null;
  const maxGuests = Math.max(1, selected?.remaining ?? 1);
  const [guests, setGuests] = useState(() => {
    const g = initialGuests && initialGuests > 0 ? initialGuests : 1;
    return Math.min(maxGuests, g);
  });

  function errorMessage(code: string | undefined): string | null {
    if (!code) return null;
    switch (code) {
      case "config":
        return t("errorConfig");
      case "missing":
      case "missing_table_or_package":
        return t("errorMissingTable");
      case "invalid_guests":
      case "guest_count_required":
      case "invalid_pass_count":
        return t("errorInvalidGuests");
      case "unauthenticated":
        return t("errorUnauthenticated");
      case "event_not_sellable":
      case "wedding_not_sellable":
        return t("errorEventNotSellable");
      case "table_locked":
        return t("errorTableLocked");
      case "table_not_sellable":
      case "table_blocked":
        return t("errorTableUnavailable");
      case "package_not_found":
        return t("errorPackage");
      case "capacity_exceeded":
      case "table_capacity_exceeded":
        return t("errorCapacity");
      case "payment_config_missing":
      case "payment_config_invalid":
        return t("errorPaymentConfig");
      case "payment_provider_error":
      case "payment_provider_timeout":
      case "payment_provider_malformed":
      case "payment_start_failed":
        return t("errorPaymentProvider");
      case "missing_customer_info":
        return t("errorMissingCustomer");
      case "order_expired":
        return t("errorOrderExpired");
      case "order_not_payable":
        return t("errorOrderNotPayable");
      case "payment_redirect_unavailable":
        return t("errorPaymentRedirect");
      case "checkout_failed":
      default:
        return t("errorGeneric");
    }
  }

  const alert = errorMessage(errorCode);

  if (available.length === 0) {
    return (
      <p
        className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600"
        data-testid="table-checkout-empty"
      >
        {offers.some((o) => o.isSoldOut)
          ? t("errorCapacity")
          : t("emptyTableOffers")}
      </p>
    );
  }

  return (
    <div data-testid="table-checkout-form" className="mt-8 border-t border-slate-100 pt-8">
      <h2 className="text-xl font-bold text-slate-900">{t("tableTitle")}</h2>
      <p className="mt-1 text-sm text-slate-600">{eventTitle}</p>

      {alert ? (
        <p
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="table-checkout-error"
        >
          {alert}
        </p>
      ) : null}

      <form className="mt-6 space-y-5" action={checkoutTableReservationAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="table_id" value={selected?.tableId ?? ""} />

        <div>
          <label
            htmlFor="package_id"
            className="block text-sm font-medium text-slate-700"
          >
            {t("tablePackage")}
          </label>
          <select
            id="package_id"
            name="package_id"
            data-testid="table-checkout-package"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={packageId}
            onChange={(e) => {
              setPackageId(e.target.value);
              setGuests(1);
            }}
            required
          >
            {available.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name} · #{offer.tableNumber} ·{" "}
                {formatTicketPrice(offer.amountDueNow, locale)}
                {offer.depositAmount != null && offer.depositAmount > 0
                  ? ` (${t("depositDue")})`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="guest_count"
            className="block text-sm font-medium text-slate-700"
          >
            {t("guestCount")}
          </label>
          <input
            id="guest_count"
            name="guest_count"
            type="number"
            min={1}
            max={maxGuests}
            data-testid="table-checkout-guests"
            className="mt-1 w-full max-w-[8rem] rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={guests}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n)) {
                setGuests(1);
                return;
              }
              setGuests(Math.min(maxGuests, Math.max(1, n)));
            }}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            {t("remainingSeats", { count: maxGuests })}
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-600">{t("amountDueNow")}</p>
          <p
            className="text-xl font-bold text-slate-900"
            data-testid="table-checkout-due"
          >
            {selected
              ? formatTicketPrice(selected.amountDueNow, locale)
              : "—"}
          </p>
          {selected &&
          selected.depositAmount != null &&
          selected.depositAmount > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {t("basePriceNote", {
                price: formatTicketPrice(selected.basePrice, locale),
              })}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">{t("priceNote")}</p>
        </div>

        <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />
      </form>
    </div>
  );
}
