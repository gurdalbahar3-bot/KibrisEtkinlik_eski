import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect as nextRedirect } from "next/navigation";

import { getCustomerSession } from "@/lib/customer/auth";
import { listCustomerTickets } from "@/lib/customer/orders";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

function ticketStatusLabel(
  status: string,
  t: Awaited<ReturnType<typeof getTranslations>>
): string {
  switch (status) {
    case "pending_payment":
      return t("statusPendingPayment");
    case "active":
      return t("statusActive");
    case "used":
      return t("statusUsed");
    case "transferred":
      return t("statusTransferred");
    case "cancelled_by_organizer":
      return t("statusCancelled");
    default:
      return status;
  }
}

export default async function AccountTicketsPage({ params }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);
  const t = await getTranslations("accountTickets");

  const session = await getCustomerSession();
  if (!session) {
    const login = locale === "tr" ? "/tr/giris" : "/en/login";
    const next = locale === "tr" ? "/tr/hesap/biletler" : "/en/account/tickets";
    nextRedirect(`${login}?next=${encodeURIComponent(next)}`);
  }

  const tickets = await listCustomerTickets(session.userId);

  return (
    <div className="section-container py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
            <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
          </div>
          <Link
            href="/account/orders"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t("ordersLink")}
          </Link>
        </div>

        {tickets.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500" data-testid="tickets-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-card" data-testid="tickets-list">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="px-5 py-4" data-testid="ticket-row">
                <p className="font-medium text-slate-900">
                  {ticket.eventTitle ?? t("unknownEvent")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {ticketStatusLabel(ticket.status, t)}
                </p>
                {ticket.status === "pending_payment" ? (
                  <p className="mt-1 text-xs text-amber-800">{t("pendingNote")}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link
                    href={{
                      pathname: "/account/tickets/[id]",
                      params: { id: ticket.id },
                    }}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {t("viewTicket")}
                  </Link>
                  <Link
                    href={{
                      pathname: "/account/orders/[id]",
                      params: { id: ticket.orderId },
                    }}
                    className="text-sm font-medium text-slate-600 hover:underline"
                  >
                    {t("viewOrder")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
