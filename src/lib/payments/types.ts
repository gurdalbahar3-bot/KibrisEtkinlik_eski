/**
 * Provider-agnostic payment domain types.
 * Settlement DTOs are server-built only — never accept from the client.
 */

export type PaymentProviderCode = "iyzico" | "stub";

export type PaymentOutcome = "succeeded" | "failed" | "pending";

/** Server-built buyer for hosted checkout (never from client form). */
export type PaymentBuyerInput = {
  id: string;
  name: string;
  surname: string;
  email: string;
  gsmNumber: string;
  identityNumber: string;
  registrationAddress: string;
  city: string;
  country: string;
  ip?: string;
};

export type PaymentAddressInput = {
  address: string;
  contactName: string;
  city: string;
  country: string;
  zipCode?: string;
};

export type PaymentBasketItemInput = {
  id: string;
  name: string;
  category1: string;
  itemType: "PHYSICAL" | "VIRTUAL";
  price: string;
};

export type CreatePaymentSessionInput = {
  orderId: string;
  conversationId: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  returnUrl: string;
  callbackUrl: string;
  locale?: "tr" | "en";
  basketId: string;
  buyer: PaymentBuyerInput;
  billingAddress: PaymentAddressInput;
  shippingAddress?: PaymentAddressInput;
  basketItems: PaymentBasketItemInput[];
};

export type CreatePaymentSessionResult = {
  provider: PaymentProviderCode;
  providerToken: string;
  conversationId: string;
  /** Hosted checkout URL when applicable. */
  paymentPageUrl: string | null;
  /** Base64 CF HTML from iyzico when using embed mode. */
  checkoutFormContent?: string | null;
  expiresAt: string;
  /** Provider debug blob — never send to the browser. */
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
