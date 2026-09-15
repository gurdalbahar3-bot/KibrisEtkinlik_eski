"use server";

import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/customer/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

function localeLoginPath(locale: string, next?: string): string {
  const base = locale === "tr" ? "/tr/giris" : "/en/login";
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return `${base}?next=${encodeURIComponent(next)}`;
  }
  return base;
}

function localeOrdersPath(locale: string, orderId?: string): string {
  if (orderId) {
    return locale === "tr"
      ? `/tr/hesap/siparisler/${orderId}`
      : `/en/account/orders/${orderId}`;
  }
  return locale === "tr" ? "/tr/hesap/siparisler" : "/en/account/orders";
}

function localeCheckoutPath(locale: string, eventId: string, ticketTypeId: string): string {
  const base = locale === "tr" ? "/tr/odeme" : "/en/checkout";
  const qs = new URLSearchParams();
  if (eventId) qs.set("event", eventId);
  if (ticketTypeId) qs.set("type", ticketTypeId);
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

function withError(path: string, code: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}error=${encodeURIComponent(code)}`;
}

type CheckoutRpcResult = {
  success?: boolean;
  order_id?: string;
  resumed?: boolean;
  error_code?: string;
};

/**
 * Ticket-only checkout. Never trusts client price — RPC uses DB catalog price.
 * Double-submit: checkout_ticket_only_atomic resumes active pending for same event.
 */
export async function checkoutTicketOnlyAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  const eventId = String(formData.get("event_id") ?? "").trim();
  const zoneId = String(formData.get("zone_id") ?? "").trim();
  const ticketTypeId = String(formData.get("ticket_type_id") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = Number.parseInt(quantityRaw, 10);

  const checkoutPath = localeCheckoutPath(locale, eventId, ticketTypeId);
  const loginPath = localeLoginPath(locale, checkoutPath);

  if (!getSupabasePublicEnv()) {
    redirect(withError(checkoutPath, "config"));
  }

  await requireCustomer(loginPath);

  if (!eventId || !zoneId || !ticketTypeId) {
    redirect(withError(checkoutPath, "missing"));
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect(withError(checkoutPath, "invalid_quantity"));
  }

  const supabase = await createSupabaseServerClient();

  await supabase.rpc("expire_due_pending_orders_atomic");

  type CheckoutArgs = {
    p_event_id: string;
    p_zone_id: string;
    p_ticket_type_id: string;
    p_quantity: number;
  };
  const rpcArgs: CheckoutArgs = {
    p_event_id: eventId,
    p_zone_id: zoneId,
    p_ticket_type_id: ticketTypeId,
    p_quantity: quantity,
  };
  // Hand-maintained Database RPC generics collapse Args to never (same as publish_event).
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "checkout_ticket_only_atomic",
      args: CheckoutArgs
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("checkout_ticket_only_atomic", rpcArgs);

  if (error) {
    redirect(withError(checkoutPath, "checkout_failed"));
  }

  const result = data as CheckoutRpcResult | null;
  if (!result?.success || !result.order_id) {
    const code = (result?.error_code ?? "checkout_failed").toLowerCase();
    redirect(withError(checkoutPath, code));
  }

  redirect(localeOrdersPath(locale, result.order_id));
}
