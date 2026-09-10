import "server-only";

import type { PaymentProvider } from "@/lib/payments/provider";
import { IyzicoApiClient } from "./iyzico-client.ts";
import {
  assertIyzicoSandboxConfigPresent,
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  loadIyzicoSandboxConfig,
  resolveIyzicoCallbackUrl,
  isIyzicoCheckoutConfigured,
  IYZICO_ENV_KEYS,
} from "./iyzico-config.ts";
import {
  buildIyzicoWebhookEventId,
  extractIyzicoWebhookSignatureHeader,
  verifyIyzicoWebhookSignatureV3,
} from "./iyzico-auth.ts";
import {
  IyzicoProviderError,
  type IyzicoCheckoutFormInitializeRequest,
  type IyzicoCheckoutFormInitializeResponse,
  type IyzicoCheckoutFormRetrieveRequest,
  type IyzicoCheckoutFormRetrieveResponse,
} from "./iyzico-types.ts";
import type {
  CreatePaymentSessionInput,
  CreatePaymentSessionResult,
  RetrievePaymentReference,
  RetrievePaymentResult,
  WebhookVerificationResult,
} from "@/lib/payments/types";
import { formatIyzicoMoney } from "@/lib/payments/mapping";

export {
  assertIyzicoSandboxConfigPresent,
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  loadIyzicoSandboxConfig,
  resolveIyzicoCallbackUrl,
  isIyzicoCheckoutConfigured,
  IYZICO_ENV_KEYS,
};

export function createIyzicoApiClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { fetchImpl?: typeof fetch }
): IyzicoApiClient {
  return new IyzicoApiClient(loadIyzicoSandboxConfig(env), opts);
}

function toInitializeRequest(
  input: CreatePaymentSessionInput
): IyzicoCheckoutFormInitializeRequest {
  const price = formatIyzicoMoney(input.amount);
  return {
    locale: input.locale ?? "tr",
    conversationId: input.conversationId,
    price,
    paidPrice: price,
    currency: "TRY",
    basketId: input.basketId,
    paymentGroup: "PRODUCT",
    callbackUrl: input.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: input.buyer.id,
      name: input.buyer.name,
      surname: input.buyer.surname,
      identityNumber: input.buyer.identityNumber,
      email: input.buyer.email,
      gsmNumber: input.buyer.gsmNumber,
      registrationAddress: input.buyer.registrationAddress,
      city: input.buyer.city,
      country: input.buyer.country,
      ip: input.buyer.ip,
    },
    billingAddress: {
      address: input.billingAddress.address,
      contactName: input.billingAddress.contactName,
      city: input.billingAddress.city,
      country: input.billingAddress.country,
      zipCode: input.billingAddress.zipCode,
    },
    shippingAddress: input.shippingAddress
      ? {
          address: input.shippingAddress.address,
          contactName: input.shippingAddress.contactName,
          city: input.shippingAddress.city,
          country: input.shippingAddress.country,
          zipCode: input.shippingAddress.zipCode,
        }
      : undefined,
    basketItems: input.basketItems.map((item) => ({
      id: item.id,
      name: item.name,
      category1: item.category1,
      itemType: item.itemType,
      price: item.price,
    })),
  };
}

/**
 * PaymentProvider adapter — B2.2 createPaymentSession calls Sandbox CF initialize.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly providerCode = "iyzico" as const;
  private client: IyzicoApiClient | null = null;
  private readonly stubMode: boolean;

  constructor(opts?: { client?: IyzicoApiClient | null; stubMode?: boolean }) {
    this.client = opts?.client ?? null;
    this.stubMode = opts?.stubMode === true;
  }

  getApiClient(): IyzicoApiClient {
    if (!this.client) {
      this.client = createIyzicoApiClientFromEnv();
    }
    return this.client;
  }

  async initializeCheckoutForm(
    request: IyzicoCheckoutFormInitializeRequest
  ): Promise<IyzicoCheckoutFormInitializeResponse> {
    return this.getApiClient().initializeCheckoutForm(request);
  }

  async retrieveCheckoutFormDetail(
    request: IyzicoCheckoutFormRetrieveRequest
  ): Promise<IyzicoCheckoutFormRetrieveResponse> {
    return this.getApiClient().retrieveCheckoutFormDetail(request);
  }

  async createPaymentSession(
    input: CreatePaymentSessionInput
  ): Promise<CreatePaymentSessionResult> {
    if (this.stubMode) {
      const token = `stub_iyzico_${input.orderId}_${Date.now()}`;
      return {
        provider: "iyzico",
        providerToken: token,
        conversationId: input.conversationId,
        paymentPageUrl: null,
        checkoutFormContent: null,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        raw: { stub: true, mode: "stub_provider" },
      };
    }

    if (input.currency.trim().toUpperCase() !== "TRY") {
      throw new IyzicoProviderError(
        "IYZICO_API_FAILURE",
        "Only TRY is supported in Phase B"
      );
    }

    const init = await this.initializeCheckoutForm(toInitializeRequest(input));
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

    return {
      provider: "iyzico",
      providerToken: init.token!,
      conversationId: init.conversationId ?? input.conversationId,
      paymentPageUrl: init.paymentPageUrl ?? null,
      checkoutFormContent: init.checkoutFormContent ?? null,
      expiresAt,
      raw: {
        status: init.status,
        hasCheckoutFormContent: Boolean(init.checkoutFormContent),
        hasPaymentPageUrl: Boolean(init.paymentPageUrl),
      },
    };
  }

  async retrievePayment(
    reference: RetrievePaymentReference
  ): Promise<RetrievePaymentResult> {
    if (!reference.providerToken?.trim()) {
      throw new IyzicoProviderError(
        "IYZICO_MISSING_TOKEN",
        "retrievePayment requires providerToken (CF token)"
      );
    }
    const detail = await this.retrieveCheckoutFormDetail({
      token: reference.providerToken,
      conversationId: reference.conversationId,
    });

    const parseMoney = (value: unknown): number | null => {
      if (value == null || value === "") return null;
      const n =
        typeof value === "number" ? value : Number.parseFloat(String(value));
      return Number.isFinite(n) ? n : null;
    };

    const paidAmount = parseMoney(detail.paidPrice);
    const listPrice = parseMoney(detail.price);
    const amount = paidAmount ?? listPrice;
    if (amount == null) {
      throw new IyzicoProviderError(
        "IYZICO_MALFORMED_RESPONSE",
        "retrievePayment missing paidPrice/price"
      );
    }

    const paymentStatus = (detail.paymentStatus ?? "").toUpperCase();
    let outcome: RetrievePaymentResult["outcome"] = "pending";
    if (paymentStatus === "SUCCESS" && detail.fraudStatus === 1) {
      outcome = "succeeded";
    } else if (
      paymentStatus === "FAILURE" ||
      detail.fraudStatus === -1 ||
      detail.status === "failure"
    ) {
      outcome = "failed";
    }

    return {
      provider: "iyzico",
      providerPaymentId: detail.paymentId ?? "",
      conversationId: detail.conversationId ?? reference.conversationId ?? "",
      amount,
      price: listPrice,
      currency: detail.currency ?? "",
      outcome,
      fraudStatus:
        detail.fraudStatus == null ? null : String(detail.fraudStatus),
      paymentStatus: detail.paymentStatus ?? null,
      raw: {
        status: detail.status,
        paymentStatus: detail.paymentStatus,
        fraudStatus: detail.fraudStatus,
        currency: detail.currency,
        hasPaymentId: Boolean(detail.paymentId),
        // Never echo secrets; omit signature from persisted/debug shape.
      },
    };
  }

  async verifyWebhook(
    headers: Headers | Record<string, string | null | undefined>,
    rawBody: string
  ): Promise<WebhookVerificationResult> {
    if (this.stubMode) {
      return { ok: false, errorCode: "WEBHOOK_STUB_MODE" };
    }

    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(rawBody) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, errorCode: "WEBHOOK_MALFORMED_BODY" };
      }
      parsed = value as Record<string, unknown>;
    } catch {
      return { ok: false, errorCode: "WEBHOOK_MALFORMED_BODY" };
    }

    const iyziEventType = String(parsed.iyziEventType ?? "").trim();
    const paymentConversationId = String(
      parsed.paymentConversationId ?? ""
    ).trim();
    const status = String(parsed.status ?? "").trim();
    const token =
      typeof parsed.token === "string" ? parsed.token.trim() : null;
    const iyziPaymentId =
      parsed.iyziPaymentId != null ? String(parsed.iyziPaymentId).trim() : null;
    const paymentId =
      parsed.paymentId != null ? String(parsed.paymentId).trim() : null;

    if (!iyziEventType || !paymentConversationId || !status) {
      return { ok: false, errorCode: "WEBHOOK_MALFORMED_BODY" };
    }

    let secretKey: string;
    try {
      secretKey = loadIyzicoSandboxConfig().secretKey;
    } catch {
      return { ok: false, errorCode: "PAYMENT_CONFIG_MISSING" };
    }

    const signatureHeader = extractIyzicoWebhookSignatureHeader(headers);
    const verified = verifyIyzicoWebhookSignatureV3({
      secretKey,
      signatureHeader,
      iyziEventType,
      paymentConversationId,
      status,
      token,
      iyziPaymentId,
      paymentId,
    });

    if (!verified.ok) {
      return { ok: false, errorCode: "WEBHOOK_SIGNATURE_INVALID" };
    }

    const eventId = buildIyzicoWebhookEventId({
      iyziReferenceCode:
        typeof parsed.iyziReferenceCode === "string"
          ? parsed.iyziReferenceCode
          : null,
      iyziEventType,
      paymentId,
      iyziPaymentId,
      paymentConversationId,
      status,
      token,
    });

    if (!eventId.trim()) {
      return { ok: false, errorCode: "WEBHOOK_EVENT_ID_MISSING" };
    }

    return {
      ok: true,
      eventId,
      eventType: iyziEventType,
      payload: {
        ...parsed,
        _signatureVariant: verified.variant,
        // Never include secret material; parsed body only.
      },
    };
  }
}
