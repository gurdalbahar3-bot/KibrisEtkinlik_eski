import "server-only";

import type { PaymentProvider } from "@/lib/payments/provider";
import type {
  CreatePaymentSessionInput,
  CreatePaymentSessionResult,
  RetrievePaymentReference,
  RetrievePaymentResult,
  WebhookVerificationResult,
} from "@/lib/payments/types";

/**
 * B1 stub — no network calls.
 * Real iyzico HTTP lives in B2; this only satisfies the adapter contract.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly providerCode = "iyzico" as const;

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
      expiresAt,
      raw: { stub: true, mode: "b1_no_api" },
    };
  }

  async retrievePayment(
    reference: RetrievePaymentReference
  ): Promise<RetrievePaymentResult> {
    throw new Error(
      `IyzicoPaymentProvider.retrievePayment is not available in B1 stub (ref=${JSON.stringify(reference)}). Use PaymentService stub settlement path.`
    );
  }

  async verifyWebhook(
    ..._args: [
      Headers | Record<string, string | null | undefined>,
      string,
    ]
  ): Promise<WebhookVerificationResult> {
    void _args;
    return { ok: false, errorCode: "WEBHOOK_NOT_IMPLEMENTED_B1" };
  }
}

/** Config contract names only — never hardcode secrets. */
export const IYZICO_ENV_KEYS = [
  "IYZICO_API_KEY",
  "IYZICO_SECRET_KEY",
  "IYZICO_BASE_URL",
] as const;

export function assertIyzicoSandboxConfigPresent(): {
  configured: boolean;
  missing: string[];
} {
  const missing = IYZICO_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  return { configured: missing.length === 0, missing: [...missing] };
}

/** Refuse production iyzico host if misconfigured. */
export function isForbiddenIyzicoProductionBaseUrl(
  baseUrl = process.env.IYZICO_BASE_URL?.trim() ?? ""
): boolean {
  if (!baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    // Sandbox hosts typically include sandbox; bare api.iyzipay.com is live.
    if (host === "api.iyzipay.com") return true;
    if (host.includes("sandbox")) return false;
    return host.endsWith("iyzipay.com") && !host.includes("sandbox");
  } catch {
    return true;
  }
}
