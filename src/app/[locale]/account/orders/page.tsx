import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect as nextRedirect } from "next/navigation";

import { getCustomerSession } from "@/lib/customer/auth";
import { listCustomerOrders } from "@/lib/customer/orders";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
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

export default async function AccountOrdersPage({ params }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);
  const t = await getTranslations("accountOrders");

  const session = await getCustomerSession();
  if (!session) {
    const login = locale === "tr" ? "/tr/giris" : "/en/login";
    const next = locale === "tr" ? "/tr/hesap/siparisler" : "/en/account/orders";
    nextRedirect(`${login}?next=${encodeURIComponent(next)}`);
  }

  const orders = await listCustomerOrders(session.userId);

  return (
    <div className="section-container py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
            <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
          </div>
          <Link
            href="/account/tickets"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t("ticketsLink")}
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500" data-testid="orders-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-card" data-testid="orders-list">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={{
                    pathname: "/account/orders/[id]",
                    params: { id: order.id },
                  }}
                  className="block px-5 py-4 transition hover:bg-slate-50"
                  data-testid="order-row"
                  data-order-id={order.id}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {order.eventTitle ?? t("unknownEvent")}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatTicketPrice(order.totalAmount, locale)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.itemLabel
                      ? `${order.itemLabel} · ${t("qty", { count: order.quantity })}`
                      : t("qty", { count: order.quantity })}
                  </p>
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    {statusLabel(order.status, t)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
