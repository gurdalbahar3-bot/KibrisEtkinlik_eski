import "server-only";

import { getPaymentProvider } from "@/lib/payments/factory";
import type { PaymentProvider } from "@/lib/payments/provider";
import type {
  CreatePaymentSessionResult,
  PaymentProviderCode,
  SettleResult,
  VerifiedSettlement,
} from "@/lib/payments/types";
import {
  assertStagingSupabaseHostForPayments,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/service-role";
import type { Database } from "@/types/supabase/database";

type OrderLedger = {
  id: string;
  customer_id: string;
  status: string;
  total_amount: number | string;
  currency: string | null;
  expires_at: string;
};

type PaymentSessionInsert =
  Database["public"]["Tables"]["payment_sessions"]["Insert"];
type PaymentSessionUpdate =
  Database["public"]["Tables"]["payment_sessions"]["Update"];

/**
 * Hand-maintained Database Row interfaces do not satisfy supabase-js GenericTable
 * (Schema collapses to never). Cast write builders the same way other app code does.
 */
function paymentSessionsWriter(supabase: ReturnType<typeof createSupabaseServiceRoleClient>) {
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
  if (settlement.currency.trim().toUpperCase() !== order.currency.trim().toUpperCase()) {
    return { ok: false, errorCode: "CURRENCY_MISMATCH" };
  }
  if (settlement.amount !== asNumber(order.total_amount)) {
    return { ok: false, errorCode: "AMOUNT_MISMATCH" };
  }
  if (settlement.orderId !== order.id) {
    return { ok: false, errorCode: "ORDER_MISMATCH" };
  }
  if (!settlement.providerPaymentId?.trim()) {
    return { ok: false, errorCode: "PROVIDER_PAYMENT_ID_REQUIRED" };
  }
  return { ok: true };
}

export class PaymentService {
  constructor(private readonly provider: PaymentProvider = getPaymentProvider()) {}

  /**
   * Start a payment session for a pending order.
   * Amount/currency are read from DB — never from the client.
   */
  async startPayment(input: {
    orderId: string;
    customerId: string;
    returnUrl: string;
    callbackUrl: string;
    customerEmail?: string | null;
  }): Promise<
    | { ok: true; sessionId: string; session: CreatePaymentSessionResult }
    | { ok: false; errorCode: string }
  > {
    assertStagingSupabaseHostForPayments();
    const supabase = createSupabaseServiceRoleClient();

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

    const amount = asNumber(row.total_amount);
    const conversationId = row.id;

    // Expire prior in-flight sessions for this order (unique active index).
    const sessions = paymentSessionsWriter(supabase);
    await sessions
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", row.id)
      .in("status", ["created", "redirected", "awaiting_provider"]);

    const session = await this.provider.createPaymentSession({
      orderId: row.id,
      conversationId,
      amount,
      currency: row.currency,
      customerEmail: input.customerEmail,
      returnUrl: input.returnUrl,
      callbackUrl: input.callbackUrl,
    });

    const { data: inserted, error: insertError } = await sessions
      .insert({
        order_id: row.id,
        provider: session.provider,
        provider_token: session.providerToken,
        conversation_id: session.conversationId,
        status: "created",
        amount,
        currency: row.currency,
        expires_at: session.expiresAt,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { ok: false, errorCode: "SESSION_CREATE_FAILED" };
    }

    return {
      ok: true,
      sessionId: inserted.id,
      session,
    };
  }

  /**
   * Settle a VerifiedSettlement built by server code after provider verification.
   * Never call with client-supplied amount/currency as trust source — those must
   * already be verified against the provider retrieve + order ledger.
   */
  async settleVerifiedPayment(
    settlement: VerifiedSettlement
  ): Promise<SettleResult> {
    assertStagingSupabaseHostForPayments();
    const supabase = createSupabaseServiceRoleClient();

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

    if (row.status === "expired") {
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
      return {
        success: false,
        errorCode: parsed?.error_code ?? "CONFIRM_FAILED",
      };
    }

    return {
      success: true,
      orderId: parsed.order_id ?? settlement.orderId,
      paymentId: parsed.payment_id ?? null,
      noop: Boolean(parsed.noop),
    };
  }

  /** B2+: callback path — not wired in B1. */
  async handleProviderCallback(): Promise<SettleResult> {
    return { success: false, errorCode: "CALLBACK_NOT_IMPLEMENTED_B1" };
  }

  /** B3+: webhook path — not wired in B1. */
  async handleProviderWebhook(): Promise<SettleResult> {
    return { success: false, errorCode: "WEBHOOK_NOT_IMPLEMENTED_B1" };
  }
}

export function createPaymentService(
  providerCode: PaymentProviderCode = "iyzico"
): PaymentService {
  return new PaymentService(getPaymentProvider(providerCode));
}

/**
 * Build a VerifiedSettlement for B1 stub tests only.
 * Production paths must obtain amount/currency from provider retrieve + DB.
 */
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
