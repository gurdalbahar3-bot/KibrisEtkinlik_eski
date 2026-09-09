import "server-only";

import type { PaymentProvider } from "@/lib/payments/provider";
import { IyzicoApiClient } from "./iyzico-client.ts";
import {
  assertIyzicoSandboxConfigPresent,
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  loadIyzicoSandboxConfig,
  IYZICO_ENV_KEYS,
} from "./iyzico-config.ts";
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

export {
  assertIyzicoSandboxConfigPresent,
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  loadIyzicoSandboxConfig,
  IYZICO_ENV_KEYS,
};

export function createIyzicoApiClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { fetchImpl?: typeof fetch }
): IyzicoApiClient {
  return new IyzicoApiClient(loadIyzicoSandboxConfig(env), opts);
}

/**
 * PaymentProvider adapter.
 * B2.1: createPaymentSession remains stub (no checkout wire / no real charge).
 * Real CF HTTP is available via getApiClient() / initializeCheckoutForm.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly providerCode = "iyzico" as const;
  private client: IyzicoApiClient | null = null;

  constructor(opts?: { client?: IyzicoApiClient | null }) {
    this.client = opts?.client ?? null;
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
    const token = `stub_iyzico_${input.orderId}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    return {
      provider: "iyzico",
      providerToken: token,
      conversationId: input.conversationId,
      paymentPageUrl: null,
      checkoutFormContent: null,
      expiresAt,
      raw: { stub: true, mode: "b2_1_no_checkout_wire" },
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

    const paid = detail.paidPrice ?? detail.price;
    const amount =
      typeof paid === "number" ? paid : Number.parseFloat(String(paid ?? "NaN"));
    if (!Number.isFinite(amount)) {
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
      currency: detail.currency ?? "",
      outcome,
      fraudStatus:
        detail.fraudStatus == null ? null : String(detail.fraudStatus),
      paymentStatus: detail.paymentStatus ?? null,
      raw: detail,
    };
  }

  async verifyWebhook(
    ..._args: [
      Headers | Record<string, string | null | undefined>,
      string,
    ]
  ): Promise<WebhookVerificationResult> {
    void _args;
    return { ok: false, errorCode: "WEBHOOK_NOT_IMPLEMENTED_B3" };
  }
}
