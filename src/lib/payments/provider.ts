import type {
  CreatePaymentSessionInput,
  CreatePaymentSessionResult,
  PaymentProviderCode,
  RetrievePaymentReference,
  RetrievePaymentResult,
  WebhookVerificationResult,
} from "@/lib/payments/types";

/**
 * Provider adapter — iyzico/Stripe/etc implement this.
 * Checkout/business code must never import SDK details directly.
 */
export interface PaymentProvider {
  readonly providerCode: PaymentProviderCode;

  createPaymentSession(
    input: CreatePaymentSessionInput
  ): Promise<CreatePaymentSessionResult>;

  retrievePayment(
    reference: RetrievePaymentReference
  ): Promise<RetrievePaymentResult>;

  verifyWebhook(
    headers: Headers | Record<string, string | null | undefined>,
    rawBody: string
  ): Promise<WebhookVerificationResult>;
}
