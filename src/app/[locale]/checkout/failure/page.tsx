import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    orderId?: string;
    code?: string;
    status?: string;
  }>;
};

export default async function CheckoutFailurePage({
  params,
  searchParams,
}: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const { orderId, code, status: browserStatus } = await searchParams;
  void browserStatus; // never trusted as payment result

  const t = await getTranslations("paymentResult");
  const errorCode = (code ?? "PAYMENT_FAILED").toUpperCase();

  let message = t("failureGeneric");
  switch (errorCode) {
    case "AMOUNT_MISMATCH":
      message = t("failureAmount");
      break;
    case "CURRENCY_MISMATCH":
    case "ORDER_CURRENCY_MISSING":
      message = t("failureCurrency");
      break;
    case "PAYMENT_AFTER_EXPIRY":
    case "ORDER_NOT_PAYABLE":
    case "ORDER_EXPIRED":
      message = t("failureExpired");
      break;
    case "PAYMENT_FRAUD_REVIEW":
    case "PAYMENT_FRAUD_REJECTED":
      message = t("failureFraud");
      break;
    case "PAYMENT_STATUS_FAILED":
    case "PAYMENT_STATUS_NOT_SUCCESS":
      message = t("failureStatus");
      break;
    case "PAYMENT_SESSION_NOT_FOUND":
    case "CALLBACK_TOKEN_REQUIRED":
      message = t("failureSession");
      break;
    case "PAYMENT_NOT_VERIFIED":
      message = t("failureNotVerified");
      break;
    default:
      break;
  }

  return (
    <div className="section-container py-10" data-testid="payment-failure">
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">{t("failureTitle")}</h1>
        <p className="text-slate-600">{message}</p>
        <p className="text-sm text-slate-500" data-testid="payment-failure-code">
          {t("errorCode")}: {errorCode}
        </p>
        {orderId ? (
          <p className="text-sm text-slate-500">
            {t("orderLabel")}: {orderId}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/account/orders"
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white"
          >
            {t("viewOrders")}
          </Link>
          <Link
            href="/account/tickets"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
          >
            {t("viewTickets")}
          </Link>
        </div>
        {errorCode === "PAYMENT_AFTER_EXPIRY" ? (
          <p className="text-sm text-amber-800" data-testid="payment-expiry-note">
            {t("expiryReconciliationNote")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
