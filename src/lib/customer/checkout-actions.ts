"use server";

import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/customer/auth";
import { evaluateCheckoutOrderGate } from "@/lib/customer/checkout-safety";
import { isIyzicoCheckoutConfigured } from "@/lib/payments/providers/iyzico-config.ts";
import { createPaymentService } from "@/lib/payments/service";
import { buildMixedCartTableItem } from "@/lib/reservation/capacity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import type { Json } from "@/types/supabase/database";

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

function localeCheckoutPath(
  locale: string,
  eventId: string,
  opts?: {
    ticketTypeId?: string;
    packageId?: string;
    tableId?: string;
    guests?: number;
  }
): string {
  const base = locale === "tr" ? "/tr/odeme" : "/en/checkout";
  const qs = new URLSearchParams();
  if (eventId) qs.set("event", eventId);
  if (opts?.ticketTypeId) qs.set("type", opts.ticketTypeId);
  if (opts?.packageId) qs.set("package", opts.packageId);
  if (opts?.tableId) qs.set("table", opts.tableId);
  if (opts?.guests != null && opts.guests > 0) {
    qs.set("guests", String(opts.guests));
  }
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

function extractCartErrorCode(message: string | undefined): string {
  if (!message) return "checkout_failed";
  const cart = message.match(/CART_ITEM_FAILED:\s*([A-Z0-9_]+)/i);
  if (cart?.[1]) return cart[1].toLowerCase();
  const known = message.match(
    /\b(TABLE_LOCKED|CAPACITY_EXCEEDED|GUEST_COUNT_REQUIRED|PACKAGE_NOT_FOUND|TABLE_NOT_SELLABLE|TABLE_BLOCKED|EVENT_NOT_SELLABLE|UNAUTHENTICATED|EMPTY_CART)\b/i
  );
  if (known?.[1]) return known[1].toLowerCase();
  return "checkout_failed";
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

function mapPaymentError(code: string): string {
  return code.toLowerCase();
}

/**
 * After pending order exists, start Sandbox CF session and redirect.
 * Falls back to order page when iyzico env is not configured (Sprint3-safe).
 */
async function redirectToPaymentOrOrder(input: {
  locale: string;
  orderId: string;
  customerId: string;
  errorPath: string;
  clientPrice?: number | null;
}): Promise<never> {
  const returnUrl = localeOrdersPath(input.locale, input.orderId);

  if (!isIyzicoCheckoutConfigured()) {
    redirect(returnUrl);
  }

  const service = createPaymentService("iyzico");
  const started = await service.startPayment({
    orderId: input.orderId,
    customerId: input.customerId,
    returnUrl,
    locale: input.locale === "en" ? "en" : "tr",
    clientPrice: input.clientPrice,
  });

  if (!started.ok) {
    redirect(
      withError(
        localeOrdersPath(input.locale, input.orderId),
        mapPaymentError(started.errorCode)
      )
    );
  }

  if (started.dto.paymentPageUrl) {
    redirect(started.dto.paymentPageUrl);
  }

  // Embed path reserved for a later UI; content alone is not enough without a page.
  redirect(
    withError(
      localeOrdersPath(input.locale, input.orderId),
      "payment_redirect_unavailable"
    )
  );
}

/**
 * Ticket-only checkout. Never trusts client price — RPC uses DB catalog price.
 * When Sandbox iyzico is configured, continues into PaymentService.startPayment.
 */
export async function checkoutTicketOnlyAction(
  formData: FormData
): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  const eventId = String(formData.get("event_id") ?? "").trim();
  const zoneId = String(formData.get("zone_id") ?? "").trim();
  const ticketTypeId = String(formData.get("ticket_type_id") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = Number.parseInt(quantityRaw, 10);
  // Deliberately ignored if present — never trusted.
  const clientPriceRaw = formData.get("price");
  const clientPrice =
    clientPriceRaw != null && String(clientPriceRaw).trim() !== ""
      ? Number(clientPriceRaw)
      : null;

  const checkoutPath = localeCheckoutPath(locale, eventId, {
    ticketTypeId,
  });
  const loginPath = localeLoginPath(locale, checkoutPath);

  if (!getSupabasePublicEnv()) {
    redirect(withError(checkoutPath, "config"));
  }

  const customer = await requireCustomer(loginPath);

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

  await redirectToPaymentOrOrder({
    locale,
    orderId: result.order_id,
    customerId: customer.userId,
    errorPath: checkoutPath,
    clientPrice,
  });
}

/**
 * Table reservation checkout via create_mixed_cart_atomic.
 * Never trusts client price — catalog price/deposit come from DB via RPC.
 */
export async function checkoutTableReservationAction(
  formData: FormData
): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  const eventId = String(formData.get("event_id") ?? "").trim();
  const tableId = String(formData.get("table_id") ?? "").trim();
  const packageId = String(formData.get("package_id") ?? "").trim();
  const guestsRaw = String(formData.get("guest_count") ?? "").trim();
  const guestCount = Number.parseInt(guestsRaw, 10);
  // Deliberately ignored if present — never trusted.
  const clientPriceRaw = formData.get("price");
  const clientPrice =
    clientPriceRaw != null && String(clientPriceRaw).trim() !== ""
      ? Number(clientPriceRaw)
      : null;

  const checkoutPath = localeCheckoutPath(locale, eventId, {
    packageId,
    tableId,
    guests: Number.isFinite(guestCount) ? guestCount : undefined,
  });
  const loginPath = localeLoginPath(locale, checkoutPath);

  if (!getSupabasePublicEnv()) {
    redirect(withError(checkoutPath, "config"));
  }

  const customer = await requireCustomer(loginPath);

  if (!eventId || !tableId || !packageId) {
    redirect(withError(checkoutPath, "missing"));
  }

  let cartItem: ReturnType<typeof buildMixedCartTableItem>;
  try {
    cartItem = buildMixedCartTableItem({
      tableId,
      packageId,
      guestCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    redirect(
      withError(
        checkoutPath,
        msg === "GUEST_COUNT_REQUIRED"
          ? "invalid_guests"
          : msg === "MISSING_TABLE_OR_PACKAGE"
            ? "missing"
            : "invalid_guests"
      )
    );
  }

  const supabase = await createSupabaseServerClient();

  await supabase.rpc("expire_due_pending_orders_atomic");

  type MixedCartArgs = {
    p_event_id: string;
    p_items: Json;
  };
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "create_mixed_cart_atomic",
      args: MixedCartArgs
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("create_mixed_cart_atomic", {
    p_event_id: eventId,
    p_items: [cartItem] as unknown as Json,
  });

  if (error) {
    redirect(withError(checkoutPath, extractCartErrorCode(error.message)));
  }

  const result = data as CheckoutRpcResult | null;
  if (!result?.success || !result.order_id) {
    const code = (result?.error_code ?? "checkout_failed").toLowerCase();
    redirect(withError(checkoutPath, code));
  }

  await redirectToPaymentOrOrder({
    locale,
    orderId: result.order_id,
    customerId: customer.userId,
    errorPath: checkoutPath,
    clientPrice,
  });
}

/**
 * Resume payment for an existing pending_payment order (order detail CTA).
 */
export async function startOrderPaymentAction(
  formData: FormData
): Promise<void> {
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";
  const orderId = String(formData.get("order_id") ?? "").trim();
  const orderPath = localeOrdersPath(locale, orderId || undefined);
  const loginPath = localeLoginPath(locale, orderPath);

  if (!orderId) {
    redirect(withError(localeOrdersPath(locale), "order_not_found"));
  }

  if (!getSupabasePublicEnv()) {
    redirect(withError(orderPath, "config"));
  }

  const customer = await requireCustomer(loginPath);

  if (!isIyzicoCheckoutConfigured()) {
    redirect(withError(orderPath, "payment_config_missing"));
  }

  // B5: ignore any client amount/currency; re-validate ownership + payable from DB.
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("expire_due_pending_orders_atomic");

  const { data: orderRaw, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_id, status, expires_at, currency, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !orderRaw) {
    redirect(withError(orderPath, "order_not_found"));
  }

  const order = orderRaw as {
    id: string;
    customer_id: string;
    status: string;
    expires_at: string;
    currency: string | null;
    total_amount: number | string;
  };

  const clientPriceRaw = formData.get("price");
  const clientCurrencyRaw = formData.get("currency");
  const gate = evaluateCheckoutOrderGate({
    orderId: order.id,
    customerId: customer.userId,
    orderCustomerId: order.customer_id,
    status: order.status,
    expiresAt: order.expires_at,
    currency: order.currency,
    totalAmount: order.total_amount,
    clientPrice:
      clientPriceRaw != null && String(clientPriceRaw).trim() !== ""
        ? Number(clientPriceRaw)
        : null,
    clientCurrency:
      clientCurrencyRaw != null ? String(clientCurrencyRaw) : null,
  });

  if (!gate.ok) {
    redirect(withError(orderPath, mapPaymentError(gate.errorCode)));
  }

  await redirectToPaymentOrOrder({
    locale,
    orderId,
    customerId: customer.userId,
    errorPath: orderPath,
  });
}
