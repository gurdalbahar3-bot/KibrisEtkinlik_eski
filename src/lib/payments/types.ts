/**
 * Provider-agnostic payment domain types.
 * Settlement DTOs are server-built only — never accept from the client.
 */

export type PaymentProviderCode = "iyzico" | "stub";

export type PaymentOutcome = "succeeded" | "failed" | "pending";

export type CreatePaymentSessionInput = {
  orderId: string;
  conversationId: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  returnUrl: string;
  callbackUrl: string;
};

export type CreatePaymentSessionResult = {
  provider: PaymentProviderCode;
  providerToken: string;
  conversationId: string;
  /** Hosted checkout URL when applicable; stub may return a local placeholder. */
  paymentPageUrl: string | null;
  /** Base64 CF HTML from iyzico when using embed mode (B2.3+). */
  checkoutFormContent?: string | null;
  expiresAt: string;
  raw?: unknown;
};

export type RetrievePaymentReference = {
  providerToken?: string;
  providerPaymentId?: string;
  conversationId?: string;
};

export type RetrievePaymentResult = {
  provider: PaymentProviderCode;
  providerPaymentId: string;
  conversationId: string;
  amount: number;
  currency: string;
  outcome: PaymentOutcome;
  fraudStatus?: string | null;
  paymentStatus?: string | null;
  raw?: unknown;
};

/**
 * Trusted settlement is server-built only.
 * There is intentionally no `fromClient` / `parseClientSettlement` helper.
 */

export type WebhookVerificationResult =
  | { ok: true; eventId: string; eventType: string; payload: unknown }
  | { ok: false; errorCode: string };

/** Domain settlement — constructed only by PaymentService after provider verify. */
export type VerifiedSettlement = {
  orderId: string;
  provider: PaymentProviderCode;
  providerPaymentId: string;
  amount: number;
  currency: string;
  outcome: PaymentOutcome;
  paymentMethod?: string | null;
};

export type SettleResult = {
  success: boolean;
  orderId?: string;
  paymentId?: string | null;
  noop?: boolean;
  errorCode?: string;
};
