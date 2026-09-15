import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect as nextRedirect } from "next/navigation";

import { getCustomerSession } from "@/lib/customer/auth";
import { getCustomerOrder } from "@/lib/customer/orders";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

function statusLabel(
  status: string,
  t: Awaited<ReturnType<typeof getTranslations>>
): string {
  switch (status) {
    case "pending_payment":
      return t("statusPendingPayment");
    case "paid":
      return t("statusPaid");
    case "expired":
      return t("statusExpired");
    case "failed":
      return t("statusFailed");
    case "cancelled_by_organizer":
      return t("statusCancelled");
    default:
      return status;
  }
}

export default async function AccountOrderDetailPage({ params }: Props) {
  const { locale: localeRaw, id } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);
  const t = await getTranslations("accountOrders");

  const session = await getCustomerSession();
  if (!session) {
    const login = locale === "tr" ? "/tr/giris" : "/en/login";
    const next =
      locale === "tr"
        ? `/tr/hesap/siparisler/${id}`
        : `/en/account/orders/${id}`;
    nextRedirect(`${login}?next=${encodeURIComponent(next)}`);
  }

  const order = await getCustomerOrder(session.userId, id);
  if (!order) {
    notFound();
  }

  const expiresLabel = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(order.expiresAt));

  return (
    <div className="section-container py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/account/orders"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← {t("backToList")}
        </Link>

        <article className="mt-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card" data-testid="order-detail">
          <h1 className="text-2xl font-bold text-slate-900">{t("detailTitle")}</h1>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("orderId")}</dt>
              <dd className="font-mono text-slate-900" data-testid="order-id">
                {order.id}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("event")}</dt>
              <dd className="text-right font-medium text-slate-900">
                {order.eventTitle ?? t("unknownEvent")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("status")}</dt>
              <dd
                className="font-semibold text-amber-800"
                data-testid="order-status"
              >
                {statusLabel(order.status, t)}
              </dd>
            </div>
            {order.status === "pending_payment" ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900" data-testid="payment-pending-note">
                {t("paymentPendingNote")}
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("expiresAt")}</dt>
              <dd className="text-slate-900" data-testid="order-expires">
                {expiresLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("total")}</dt>
              <dd className="text-lg font-bold text-slate-900" data-testid="order-total">
                {formatTicketPrice(order.totalAmount, locale)}
              </dd>
            </div>
          </dl>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("items")}
          </h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.snapshotLabel ?? item.itemType}
                  </p>
                  <p className="text-slate-500">
                    {t("qty", { count: item.quantity })} ·{" "}
                    {formatTicketPrice(item.unitPrice, locale)}
                  </p>
                </div>
                <p className="font-semibold text-slate-900">
                  {formatTicketPrice(item.totalPrice, locale)}
                </p>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
