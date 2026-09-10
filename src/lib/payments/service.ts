import "server-only";

import { getPaymentProvider } from "@/lib/payments/factory";
import {
  buildBasketItemsFromOrderItems,
  formatIyzicoMoney,
  splitFullName,
  toStartPaymentPublicDto,
  type StartPaymentPublicDto,
} from "@/lib/payments/mapping";
import type { PaymentProvider } from "@/lib/payments/provider";
import { resolveIyzicoCallbackUrl } from "@/lib/payments/providers/iyzico-config.ts";
import { IyzicoProviderError } from "@/lib/payments/providers/iyzico-types.ts";
import { buildVerifiedSettlementFromRetrieve } from "@/lib/payments/settlement";
import type {
  PaymentProviderCode,
  SettleResult,
  VerifiedSettlement,
  WebhookHandleResult,
} from "@/lib/payments/types";
import {
  assertStagingSupabaseHostForPayments,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/service-role";
import type { Database, Json } from "@/types/supabase/database";

type OrderLedger = {
  id: string;
  customer_id: string;
  status: string;
  total_amount: number | string;
  currency: string | null;
  expires_at: string;
};

type OrderItemRow = {
  id: string;
  snapshot_label: string | null;
  item_type: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
};

type PaymentSessionInsert =
  Database["public"]["Tables"]["payment_sessions"]["Insert"];
type PaymentSessionUpdate =
  Database["public"]["Tables"]["payment_sessions"]["Update"];

type SupabaseService = ReturnType<typeof createSupabaseServiceRoleClient>;

const ALL_SESSION_STATUSES = [
  "created",
  "redirected",
  "awaiting_provider",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
] as const;

function paymentSessionsWriter(supabase: SupabaseService) {
  return supabase.from("payment_sessions") as unknown as {
    update: (values: PaymentSessionUpdate) => {
      eq: (column: string, value: string) => {
        in: (
          column: string,
          values: string[]
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    insert: (values: PaymentSessionInsert) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

async function updateSessionStatus(
  supabase: SupabaseService,
  sessionId: string,
  status: NonNullable<PaymentSessionUpdate["status"]>
): Promise<void> {
  await paymentSessionsWriter(supabase)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .in("status", [...ALL_SESSION_STATUSES]);
}

function asNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error("INVALID_AMOUNT");
  }
  return n;
}

function assertSettlementMatchesOrder(
  settlement: VerifiedSettlement,
  order: OrderLedger
): { ok: true } | { ok: false; errorCode: string } {
  if (!order.currency || !order.currency.trim()) {
    return { ok: false, errorCode: "ORDER_CURRENCY_MISSING" };
  }
  if (
    settlement.currency.trim().toUpperCase() !==
    order.currency.trim().toUpperCase()
  ) {
    return { ok: false, errorCode: "CURRENCY_MISMATCH" };
  }
  if (Math.abs(settlement.amount - asNumber(order.total_amount)) >= 0.005) {
    return { ok: false, errorCode: "AMOUNT_MISMATCH" };
  }
  if (settlement.orderId !== order.id) {
    return { ok: false, errorCode: "PAYMENT_ORDER_MISMATCH" };
  }
  if (!settlement.providerPaymentId?.trim()) {
    return { ok: false, errorCode: "PROVIDER_PAYMENT_ID_REQUIRED" };
  }
  return { ok: true };
}

function mapProviderError(err: unknown): string {
  if (err instanceof IyzicoProviderError) {
    switch (err.code) {
      case "IYZICO_CONFIG_MISSING":
        return "PAYMENT_CONFIG_MISSING";
      case "IYZICO_PRODUCTION_URL_FORBIDDEN":
      case "IYZICO_INVALID_BASE_URL":
        return "PAYMENT_CONFIG_INVALID";
      case "IYZICO_TIMEOUT":
        return "PAYMENT_PROVIDER_TIMEOUT";
      case "IYZICO_HTTP_ERROR":
      case "IYZICO_API_FAILURE":
        return "PAYMENT_PROVIDER_ERROR";
      case "IYZICO_MALFORMED_RESPONSE":
      case "IYZICO_MISSING_TOKEN":
        return "PAYMENT_PROVIDER_MALFORMED";
      default:
        return "PAYMENT_PROVIDER_ERROR";
    }
  }
  if (err instanceof Error) {
    switch (err.message) {
      case "INVALID_ORDER_TOTAL":
        return "INVALID_ORDER_TOTAL";
      case "ORDER_ITEMS_MISSING":
        return "ORDER_ITEMS_MISSING";
      case "BASKET_TOTAL_MISMATCH":
        return "BASKET_TOTAL_MISMATCH";
      case "INVALID_ORDER_ITEM_PRICE":
        return "INVALID_ORDER_TOTAL";
      default:
        break;
    }
  }
  return "PAYMENT_START_FAILED";
}

/** Sandbox-only buyer fields not on profiles yet (no B2.2 migration). */
function sandboxBuyerDefaults(env: NodeJS.ProcessEnv = process.env): {
  identityNumber: string;
  address: string;
  city: string;
  country: string;
} {
  return {
    identityNumber:
      env.IYZICO_SANDBOX_IDENTITY_NUMBER?.trim() || "11111111111",
    address:
      env.IYZICO_SANDBOX_BUYER_ADDRESS?.trim() || "Staging Address, Lefkosa",
    city: env.IYZICO_SANDBOX_BUYER_CITY?.trim() || "Lefkosa",
    country: env.IYZICO_SANDBOX_BUYER_COUNTRY?.trim() || "Cyprus",
  };
}

export type StartPaymentResult =
  | { ok: true; dto: StartPaymentPublicDto }
  | { ok: false; errorCode: string };

export class PaymentService {
  constructor(
    private readonly provider: PaymentProvider = getPaymentProvider(),
    private readonly deps: {
      createSupabase?: () => SupabaseService;
      resolveCallbackUrl?: () => string;
      env?: NodeJS.ProcessEnv;
    } = {}
  ) {}

  private supabase(): SupabaseService {
    return (this.deps.createSupabase ?? createSupabaseServiceRoleClient)();
  }

  private callbackUrl(): string {
    const fn =
      this.deps.resolveCallbackUrl ??
      (() => resolveIyzicoCallbackUrl(this.deps.env ?? process.env));
    return fn();
  }

  /**
   * Start a Sandbox Checkout Form session for a pending order.
   * Amount/currency/buyer come from DB — never from the client.
   * Does NOT settle payment / call confirm_payment_atomic.
   */
  async startPayment(input: {
    orderId: string;
    customerId: string;
    returnUrl: string;
    locale?: "tr" | "en";
    /** Ignored — never trusted as amount source. */
    clientPrice?: number | null;
  }): Promise<StartPaymentResult> {
    void input.clientPrice;
    assertStagingSupabaseHostForPayments();
    const supabase = this.supabase();

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, customer_id, status, total_amount, currency, expires_at")
      .eq("id", input.orderId)
      .maybeSingle();

    if (error || !order) {
      return { ok: false, errorCode: "ORDER_NOT_FOUND" };
    }

    const row = order as OrderLedger;
    if (row.customer_id !== input.customerId) {
      return { ok: false, errorCode: "FORBIDDEN" };
    }
    if (row.status !== "pending_payment") {
      return { ok: false, errorCode: "ORDER_NOT_PAYABLE" };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false, errorCode: "ORDER_EXPIRED" };
    }
    if (!row.currency?.trim()) {
      return { ok: false, errorCode: "ORDER_CURRENCY_MISSING" };
    }
    if (row.currency.trim().toUpperCase() !== "TRY") {
      return { ok: false, errorCode: "CURRENCY_MISMATCH" };
    }

    let amount: number;
    try {
      amount = asNumber(row.total_amount);
      if (amount <= 0) {
        return { ok: false, errorCode: "INVALID_ORDER_TOTAL" };
      }
      formatIyzicoMoney(amount);
    } catch {
      return { ok: false, errorCode: "INVALID_ORDER_TOTAL" };
    }

    const { data: itemsRaw, error: itemsErr } = await supabase
      .from("order_items")
      .select(
        "id, snapshot_label, item_type, quantity, unit_price, total_price"
      )
      .eq("order_id", row.id);

    if (itemsErr || !itemsRaw?.length) {
      return { ok: false, errorCode: "ORDER_ITEMS_MISSING" };
    }
    const items = itemsRaw as OrderItemRow[];

    let basketItems;
    try {
      basketItems = buildBasketItemsFromOrderItems(items, amount);
    } catch (err) {
      return { ok: false, errorCode: mapProviderError(err) };
    }

    const { data: profileRaw, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone")
      .eq("id", input.customerId)
      .maybeSingle();

    if (profileErr || !profileRaw) {
      return { ok: false, errorCode: "MISSING_CUSTOMER_INFO" };
    }
    const profile = profileRaw as ProfileRow;
    const email = profile.email?.trim() ?? "";
    const fullName = profile.full_name?.trim() ?? "";
    const phone = profile.phone?.trim() ?? "";
    if (!email || !fullName || !phone) {
      return { ok: false, errorCode: "MISSING_CUSTOMER_INFO" };
    }

    const { name, surname } = splitFullName(fullName);
    const defaults = sandboxBuyerDefaults(this.deps.env ?? process.env);
    const contactName = `${name} ${surname}`.trim();

    let callbackUrl: string;
    try {
      callbackUrl = this.callbackUrl();
    } catch (err) {
      return { ok: false, errorCode: mapProviderError(err) };
    }

    const conversationId = row.id;
    const sessions = paymentSessionsWriter(supabase);

    // Idempotency: cancel prior in-flight sessions (no payment_page_url column
    // to resume redirect without re-initialize).
    await sessions
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", row.id)
      .in("status", ["created", "redirected", "awaiting_provider"]);

    let session;
    try {
      session = await this.provider.createPaymentSession({
        orderId: row.id,
        conversationId,
        amount,
        currency: "TRY",
        customerEmail: email,
        returnUrl: input.returnUrl,
        callbackUrl,
        locale: input.locale ?? "tr",
        basketId: row.id,
        buyer: {
          id: profile.id,
          name,
          surname,
          email,
          gsmNumber: phone,
          identityNumber: defaults.identityNumber,
          registrationAddress: defaults.address,
          city: defaults.city,
          country: defaults.country,
        },
        billingAddress: {
          address: defaults.address,
          contactName,
          city: defaults.city,
          country: defaults.country,
        },
        basketItems,
      });
    } catch (err) {
      return { ok: false, errorCode: mapProviderError(err) };
    }

    if (!session.providerToken?.trim()) {
      return { ok: false, errorCode: "PAYMENT_PROVIDER_MALFORMED" };
    }
    if (!session.paymentPageUrl && !session.checkoutFormContent) {
      return { ok: false, errorCode: "PAYMENT_REDIRECT_UNAVAILABLE" };
    }

    const { data: inserted, error: insertError } = await sessions
      .insert({
        order_id: row.id,
        provider: session.provider,
        provider_token: session.providerToken,
        conversation_id: session.conversationId,
        status: "redirected",
        amount,
        currency: "TRY",
        expires_at: session.expiresAt,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { ok: false, errorCode: "SESSION_CREATE_FAILED" };
    }

    return {
      ok: true,
      dto: toStartPaymentPublicDto({
        orderId: row.id,
        sessionId: inserted.id,
        providerToken: session.providerToken,
        paymentPageUrl: session.paymentPageUrl,
        checkoutFormContent: session.checkoutFormContent,
      }),
    };
  }

  /** Settle only after provider retrieve → VerifiedSettlement (never from client). */
  async settleVerifiedPayment(
    settlement: VerifiedSettlement
  ): Promise<SettleResult> {
    assertStagingSupabaseHostForPayments();
    const supabase = this.supabase();

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, customer_id, status, total_amount, currency, expires_at")
      .eq("id", settlement.orderId)
      .maybeSingle();

    if (error || !order) {
      return { success: false, errorCode: "ORDER_NOT_FOUND" };
    }

    const row = order as OrderLedger;
    const gate = assertSettlementMatchesOrder(settlement, row);
    if (!gate.ok) {
      return { success: false, errorCode: gate.errorCode };
    }

    // P0: late provider success after expiry — never mark paid (refund/recon in B3+).
    if (row.status === "expired") {
      return { success: false, errorCode: "PAYMENT_AFTER_EXPIRY" };
    }
    if (
      row.status === "pending_payment" &&
      new Date(row.expires_at).getTime() < Date.now()
    ) {
      return { success: false, errorCode: "PAYMENT_AFTER_EXPIRY" };
    }
    if (row.status !== "pending_payment" && row.status !== "paid") {
      return { success: false, errorCode: "ORDER_NOT_PAYABLE" };
    }

    if (settlement.outcome !== "succeeded") {
      type FailArgs = {
        p_order_id: string;
        p_provider?: string | null;
        p_provider_payment_id?: string | null;
        p_currency?: string | null;
      };
      const failArgs: FailArgs = {
        p_order_id: settlement.orderId,
        p_provider: settlement.provider,
        p_provider_payment_id: settlement.providerPaymentId,
        p_currency: settlement.currency,
      };
      const { data, error: failError } = await (
        supabase.rpc as unknown as (
          fn: "fail_payment_atomic",
          args: FailArgs
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("fail_payment_atomic", failArgs);

      if (failError) {
        return { success: false, errorCode: "FAIL_RPC_ERROR" };
      }
      const parsed = data as { success?: boolean; error_code?: string } | null;
      if (!parsed?.success) {
        return {
          success: false,
          errorCode: parsed?.error_code ?? "FAIL_PAYMENT_FAILED",
        };
      }
      return { success: true, orderId: settlement.orderId };
    }

    type ConfirmArgs = {
      p_order_id: string;
      p_provider: string;
      p_provider_payment_id: string;
      p_amount: number;
      p_currency: string;
      p_payment_method?: string | null;
    };
    const confirmArgs: ConfirmArgs = {
      p_order_id: settlement.orderId,
      p_provider: settlement.provider,
      p_provider_payment_id: settlement.providerPaymentId,
      p_amount: settlement.amount,
      p_currency: settlement.currency,
      p_payment_method: settlement.paymentMethod ?? null,
    };

    const { data, error: confirmError } = await (
      supabase.rpc as unknown as (
        fn: "confirm_payment_atomic",
        args: ConfirmArgs
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("confirm_payment_atomic", confirmArgs);

    if (confirmError) {
      return { success: false, errorCode: "CONFIRM_RPC_ERROR" };
    }

    const parsed = data as {
      success?: boolean;
      order_id?: string;
      payment_id?: string;
      noop?: boolean;
      error_code?: string;
    } | null;

    if (!parsed?.success) {
      const code = parsed?.error_code ?? "CONFIRM_FAILED";
      if (code === "ORDER_NOT_PAYABLE") {
        return { success: false, errorCode: "PAYMENT_AFTER_EXPIRY" };
      }
      return { success: false, errorCode: code };
    }

    return {
      success: true,
      orderId: parsed.order_id ?? settlement.orderId,
      paymentId: parsed.payment_id ?? null,
      noop: Boolean(parsed.noop),
    };
  }

  /**
   * iyzico Checkout Form callback. Trust only provider retrieve/detail —
   * never browser callback params (status, paymentId, amount, etc.).
   */
  async handleProviderCallback(input: {
    token: string;
    /** Redirect locale only — not used for settlement trust. */
    locale?: string;
  }): Promise<SettleResult> {
    void input.locale;
    assertStagingSupabaseHostForPayments();

    const token = input.token?.trim() ?? "";
    if (!token) {
      return { success: false, errorCode: "CALLBACK_TOKEN_REQUIRED" };
    }

    const supabase = this.supabase();

    const { data: sessionRaw, error: sessionError } = await supabase
      .from("payment_sessions")
      .select(
        "id, order_id, provider, status, provider_token, conversation_id, amount, currency, expires_at"
      )
      .eq("provider", "iyzico")
      .eq("provider_token", token)
      .maybeSingle();

    if (sessionError || !sessionRaw) {
      return { success: false, errorCode: "PAYMENT_SESSION_NOT_FOUND" };
    }

    const session = sessionRaw as {
      id: string;
      order_id: string;
      provider: string;
      status: string;
      provider_token: string | null;
      conversation_id: string;
      amount: number | string;
      currency: string;
      expires_at: string;
    };

    const orderId = String(session.order_id);
    const expectedConversationId = String(session.conversation_id);

    const { data: orderRaw, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_id, status, total_amount, currency, expires_at")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !orderRaw) {
      return { success: false, errorCode: "ORDER_NOT_FOUND", orderId };
    }

    const order = orderRaw as OrderLedger;

    // Idempotent: already paid → success noop (no new tickets).
    if (order.status === "paid") {
      await updateSessionStatus(supabase, session.id, "succeeded");
      return {
        success: true,
        orderId,
        paymentId: null,
        noop: true,
      };
    }

    let retrieved;
    try {
      retrieved = await this.provider.retrievePayment({
        providerToken: token,
        conversationId: expectedConversationId,
      });
    } catch (err) {
      await updateSessionStatus(supabase, session.id, "failed");
      return {
        success: false,
        errorCode: mapProviderError(err),
        orderId,
      };
    }

    const built = buildVerifiedSettlementFromRetrieve({
      orderId,
      retrieved,
      expectedConversationId,
    });

    if (!built.ok) {
      await updateSessionStatus(supabase, session.id, "failed");
      return { success: false, errorCode: built.errorCode, orderId };
    }

    try {
      if (
        Math.abs(asNumber(session.amount) - built.settlement.amount) >= 0.005
      ) {
        await updateSessionStatus(supabase, session.id, "failed");
        return { success: false, errorCode: "AMOUNT_MISMATCH", orderId };
      }
    } catch {
      return { success: false, errorCode: "AMOUNT_MISMATCH", orderId };
    }

    const settled = await this.settleVerifiedPayment(built.settlement);

    if (!settled.success) {
      const expiredish =
        settled.errorCode === "PAYMENT_AFTER_EXPIRY" ||
        settled.errorCode === "ORDER_NOT_PAYABLE";
      await updateSessionStatus(
        supabase,
        session.id,
        expiredish ? "expired" : "failed"
      );
      return { ...settled, orderId: settled.orderId ?? orderId };
    }

    await updateSessionStatus(supabase, session.id, "succeeded");
    return settled;
  }

  async handleProviderWebhook(input: {
    headers: Headers | Record<string, string | null | undefined>;
    rawBody: string;
  }): Promise<WebhookHandleResult> {
    assertStagingSupabaseHostForPayments();

    const rawBody = input.rawBody ?? "";
    if (!rawBody.trim()) {
      return {
        ok: false,
        httpStatus: 400,
        errorCode: "WEBHOOK_MALFORMED_BODY",
      };
    }

    let verified;
    try {
      verified = await this.provider.verifyWebhook(input.headers, rawBody);
    } catch {
      return {
        ok: false,
        httpStatus: 400,
        errorCode: "WEBHOOK_VERIFY_FAILED",
      };
    }

    if (!verified.ok) {
      const code = verified.errorCode;
      const httpStatus =
        code === "WEBHOOK_SIGNATURE_INVALID"
          ? 401
          : code === "PAYMENT_CONFIG_MISSING"
            ? 503
            : 400;
      return { ok: false, httpStatus, errorCode: code };
    }

    const supabase = this.supabase();
    const payload = (verified.payload ?? {}) as Record<string, unknown>;
    const conversationId = String(payload.paymentConversationId ?? "").trim();
    const token =
      typeof payload.token === "string" ? payload.token.trim() : "";
    const webhookStatus = String(payload.status ?? "")
      .trim()
      .toUpperCase();

    type WebhookInsert = Database["public"]["Tables"]["payment_webhook_events"]["Insert"];
    type WebhookUpdate = Database["public"]["Tables"]["payment_webhook_events"]["Update"];

    const webhooks = supabase.from("payment_webhook_events") as unknown as {
      insert: (values: WebhookInsert) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
      update: (values: WebhookUpdate) => {
        eq: (
          column: string,
          value: string
        ) => Promise<{ error: { message: string } | null }>;
      };
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                processing_status: string;
                order_id: string | null;
                payment_id: string | null;
              } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };

    // Idempotent insert — unique (provider, provider_event_id)
    const { data: inserted, error: insertError } = await webhooks
      .insert({
        provider: "iyzico",
        provider_event_id: verified.eventId,
        event_type: verified.eventType,
        payload: {
          iyziEventType: verified.eventType,
          paymentConversationId: conversationId || null,
          status: webhookStatus || null,
          hasToken: Boolean(token),
          hasPaymentId: Boolean(
            payload.paymentId != null || payload.iyziPaymentId != null
          ),
          iyziReferenceCode:
            typeof payload.iyziReferenceCode === "string"
              ? payload.iyziReferenceCode
              : null,
        } as Json,
        processing_status: "received",
        order_id: conversationId || null,
      })
      .select("id")
      .single();

    if (insertError) {
      const isUnique =
        insertError.code === "23505" ||
        /duplicate|unique/i.test(insertError.message);
      if (isUnique) {
        const { data: existing } = await webhooks
          .select("id, processing_status, order_id, payment_id")
          .eq("provider", "iyzico")
          .eq("provider_event_id", verified.eventId)
          .maybeSingle();
        return {
          ok: true,
          httpStatus: 200,
          duplicate: true,
          noop: true,
          orderId: existing?.order_id ?? (conversationId || undefined),
          paymentId: existing?.payment_id ?? null,
          errorCode: "WEBHOOK_DUPLICATE",
        };
      }
      return {
        ok: false,
        httpStatus: 500,
        errorCode: "WEBHOOK_PERSIST_FAILED",
      };
    }

    const webhookRowId = inserted?.id;
    if (!webhookRowId) {
      return {
        ok: false,
        httpStatus: 500,
        errorCode: "WEBHOOK_PERSIST_FAILED",
      };
    }

    await webhooks
      .update({ processing_status: "processing" })
      .eq("id", webhookRowId);

    // Non-SUCCESS provider status: record and acknowledge (no settle).
    if (webhookStatus && webhookStatus !== "SUCCESS") {
      await webhooks
        .update({
          processing_status: "ignored",
          processed_at: new Date().toISOString(),
          error_code: "WEBHOOK_STATUS_NOT_SUCCESS",
          order_id: conversationId || null,
        })
        .eq("id", webhookRowId);
      return {
        ok: true,
        httpStatus: 200,
        ignored: true,
        orderId: conversationId || undefined,
        errorCode: "WEBHOOK_STATUS_NOT_SUCCESS",
      };
    }

    // Resolve CF token: payload token, else payment_sessions by conversationId.
    let settleToken = token;
    if (!settleToken && conversationId) {
      const { data: sessionByConv } = await supabase
        .from("payment_sessions")
        .select("provider_token, order_id, status")
        .eq("provider", "iyzico")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = sessionByConv as {
        provider_token: string | null;
        order_id: string;
        status: string;
      } | null;
      settleToken = row?.provider_token?.trim() ?? "";
    }

    if (!settleToken) {
      await webhooks
        .update({
          processing_status: "failed",
          processed_at: new Date().toISOString(),
          error_code: "WEBHOOK_TOKEN_MISSING",
          order_id: conversationId || null,
        })
        .eq("id", webhookRowId);
      return {
        ok: true,
        httpStatus: 200,
        errorCode: "WEBHOOK_TOKEN_MISSING",
        orderId: conversationId || undefined,
      };
    }

    // Reuse callback settlement path (retrieve → VerifiedSettlement → confirm).
    const settled = await this.handleProviderCallback({ token: settleToken });

    if (settled.success) {
      await webhooks
        .update({
          processing_status: "processed",
          processed_at: new Date().toISOString(),
          order_id: settled.orderId ?? (conversationId || null),
          payment_id: settled.paymentId ?? null,
          error_code: settled.noop ? "NOOP_ALREADY_PAID" : null,
        })
        .eq("id", webhookRowId);
      return {
        ok: true,
        httpStatus: 200,
        settled: !settled.noop,
        noop: settled.noop,
        orderId: settled.orderId,
        paymentId: settled.paymentId ?? null,
      };
    }

    // Business failures (expiry, mismatch, fraud): acknowledge so iyzico stops retrying.
    await webhooks
      .update({
        processing_status:
          settled.errorCode === "PAYMENT_AFTER_EXPIRY" ||
          settled.errorCode === "ORDER_NOT_PAYABLE"
            ? "ignored"
            : "failed",
        processed_at: new Date().toISOString(),
        order_id: settled.orderId ?? (conversationId || null),
        error_code: settled.errorCode ?? "WEBHOOK_SETTLE_FAILED",
      })
      .eq("id", webhookRowId);

    return {
      ok: true,
      httpStatus: 200,
      orderId: settled.orderId ?? (conversationId || undefined),
      errorCode: settled.errorCode,
    };
  }
}

export function createPaymentService(
  providerCode: PaymentProviderCode = "iyzico"
): PaymentService {
  return new PaymentService(getPaymentProvider(providerCode));
}

export function buildStubVerifiedSettlement(input: {
  orderId: string;
  amount: number;
  currency: string;
  providerPaymentId: string;
  outcome?: "succeeded" | "failed";
  provider?: PaymentProviderCode;
}): VerifiedSettlement {
  return {
    orderId: input.orderId,
    provider: input.provider ?? "iyzico",
    providerPaymentId: input.providerPaymentId,
    amount: input.amount,
    currency: input.currency,
    outcome: input.outcome ?? "succeeded",
    paymentMethod: "stub",
  };
}
