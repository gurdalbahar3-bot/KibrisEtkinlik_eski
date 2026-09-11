import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect as nextRedirect } from "next/navigation";

import { getCustomerSession } from "@/lib/customer/auth";
import { getCustomerTicketDetail } from "@/lib/customer/orders";
import { Link } from "@/lib/i18n/navigation";
import { renderTicketQrDataUrl } from "@/lib/tickets/qr-render";

type Props = {
  params: Promise<{ locale: string; id: string }>;
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
    case "cancelled":
      return t("statusCancelled");
    default:
      return status;
  }
}

export default async function AccountTicketDetailPage({ params }: Props) {
  const { locale: localeRaw, id } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);
  const t = await getTranslations("accountTickets");

  const session = await getCustomerSession();
  if (!session) {
    const login = locale === "tr" ? "/tr/giris" : "/en/login";
    const next =
      locale === "tr"
        ? `/tr/hesap/biletler/${id}`
        : `/en/account/tickets/${id}`;
    nextRedirect(`${login}?next=${encodeURIComponent(next)}`);
  }

  const ticket = await getCustomerTicketDetail(session.userId, id);
  if (!ticket) {
    notFound();
  }

  const showQr =
    ticket.status === "active" &&
    ticket.qrToken &&
    ticket.qrStatus === "active";
  const qrDataUrl = showQr
    ? await renderTicketQrDataUrl(ticket.qrToken!)
    : null;

  const dt = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    <div className="section-container py-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/account/tickets"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← {t("backToList")}
        </Link>

        <article
          className="mt-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card"
          data-testid="ticket-detail"
        >
          <h1 className="text-2xl font-bold text-slate-900">
            {ticket.eventTitle ?? t("unknownEvent")}
          </h1>
          <p
            className="mt-2 text-sm font-semibold text-amber-900"
            data-testid="ticket-status"
          >
            {ticketStatusLabel(ticket.status, t)}
          </p>

          <dl className="mt-6 space-y-3 text-sm">
            {ticket.venueName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("venue")}</dt>
                <dd className="text-right text-slate-900">{ticket.venueName}</dd>
              </div>
            ) : null}
            {ticket.startsAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("startsAt")}</dt>
                <dd className="text-right text-slate-900">
                  {dt.format(new Date(ticket.startsAt))}
                </dd>
              </div>
            ) : null}
            {ticket.ticketTypeName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("ticketType")}</dt>
                <dd className="text-right text-slate-900">
                  {ticket.ticketTypeName}
                </dd>
              </div>
            ) : null}
            {ticket.zoneName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("zone")}</dt>
                <dd className="text-right text-slate-900">{ticket.zoneName}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("quantityUnit")}</dt>
              <dd className="text-right text-slate-900">1</dd>
            </div>
          </dl>

          {showQr && qrDataUrl ? (
            <div className="mt-8 flex flex-col items-center" data-testid="ticket-qr">
              <p className="mb-3 text-sm font-medium text-slate-700">
                {t("qrTitle")}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={t("qrAlt")}
                width={280}
                height={280}
                className="rounded-xl border border-slate-100 bg-white"
              />
              <p className="mt-3 max-w-xs text-center text-xs text-slate-500">
                {t("qrHint")}
              </p>
            </div>
          ) : ticket.status === "used" ? (
            <p className="mt-8 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {t("qrUsed")}
            </p>
          ) : ticket.status === "pending_payment" ? (
            <p className="mt-8 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("pendingNote")}
            </p>
          ) : ticket.status === "cancelled_by_organizer" ||
            ticket.status === "cancelled" ? (
            <p className="mt-8 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {t("qrCancelled")}
            </p>
          ) : null}

          <Link
            href={{
              pathname: "/account/orders/[id]",
              params: { id: ticket.orderId },
            }}
            className="mt-8 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            {t("viewOrder")}
          </Link>
        </article>
      </div>
    </div>
  );
}
