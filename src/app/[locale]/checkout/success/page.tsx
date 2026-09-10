import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCustomerSession } from "@/lib/customer/auth";
import { evaluatePaidTicketIntegrity } from "@/lib/customer/checkout-safety";
import { Link } from "@/lib/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    orderId?: string;
    noop?: string;
    status?: string;
  }>;
};

/**
 * Success UX — only after server-side settlement + ticket/QR integrity.
 * Never trusts browser `status=success`.
 */
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const { orderId, status: browserStatus } = await searchParams;
  void browserStatus; // never trusted

  const t = await getTranslations("paymentResult");
  const session = await getCustomerSession();
  if (!session) {
    const next =
      locale === "tr"
        ? `/tr/odeme/basarili${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`
        : `/en/checkout/success${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`;
    const loginBase = locale === "tr" ? "/tr/giris" : "/en/login";
    nextRedirect(`${loginBase}?next=${encodeURIComponent(next)}`);
  }

  const verifiedOrderId: string | null = orderId?.trim() || null;
  let integrityError: string | null = "PAYMENT_NOT_VERIFIED";

  if (verifiedOrderId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("orders")
      .select("id, status, customer_id")
      .eq("id", verifiedOrderId)
      .maybeSingle();

    const row = data as {
      id: string;
      status: string;
      customer_id: string;
    } | null;

    if (row && row.customer_id === session.userId) {
      const { data: ticketsRaw } = await supabase
        .from("tickets")
        .select("status, qr_code_id")
        .eq("order_id", verifiedOrderId);

      const tickets = (ticketsRaw ?? []) as Array<{
        status: string;
        qr_code_id: string | null;
      }>;

      const integrity = evaluatePaidTicketIntegrity({
        orderStatus: row.status,
        tickets: tickets.map((t) => ({
          status: t.status,
          qrCodeId: t.qr_code_id,
        })),
      });

      if (integrity.showSuccess) {
        integrityError = null;
      } else {
        integrityError = integrity.errorCode ?? "PAYMENT_NOT_VERIFIED";
      }
    }
  }

  if (integrityError) {
    const failPath =
      locale === "tr"
        ? `/tr/odeme/basarisiz?code=${encodeURIComponent(integrityError)}${
            verifiedOrderId
              ? `&orderId=${encodeURIComponent(verifiedOrderId)}`
              : ""
          }`
        : `/en/checkout/failure?code=${encodeURIComponent(integrityError)}${
            verifiedOrderId
              ? `&orderId=${encodeURIComponent(verifiedOrderId)}`
              : ""
          }`;
    nextRedirect(failPath);
  }

  return (
    <div className="section-container py-10" data-testid="payment-success">
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">{t("successTitle")}</h1>
        <p className="text-slate-600">{t("successBody")}</p>
        {verifiedOrderId ? (
          <p className="text-sm text-slate-500" data-testid="payment-success-order">
            {t("orderLabel")}: {verifiedOrderId}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/account/tickets"
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white"
          >
            {t("viewTickets")}
          </Link>
          <Link
            href={
              verifiedOrderId
                ? {
                    pathname: "/account/orders/[id]",
                    params: { id: verifiedOrderId },
                  }
                : "/account/orders"
            }
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
          >
            {t("viewOrder")}
          </Link>
        </div>
      </div>
    </div>
  );
}
