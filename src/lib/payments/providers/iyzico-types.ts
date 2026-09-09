/**
 * iyzico Checkout Form provider DTOs (not domain settlement).
 * Amounts here are provider-wire values — never treat client-supplied
 * copies as VerifiedSettlement without server retrieve + ledger checks.
 */

export const IYZICO_CF_INITIALIZE_PATH =
  "/payment/iyzipos/checkoutform/initialize/auth/ecom" as const;

export const IYZICO_CF_RETRIEVE_PATH =
  "/payment/iyzipos/checkoutform/auth/ecom/detail" as const;

export type IyzicoLocale = "tr" | "en";

export type IyzicoCurrencyCode =
  | "TRY"
  | "USD"
  | "EUR"
  | "GBP"
  | "NOK"
  | "CHF";

export type IyzicoBuyer = {
  id: string;
  name: string;
  surname: string;
  identityNumber: string;
  email: string;
  gsmNumber: string;
  registrationAddress: string;
  city: string;
  country: string;
  ip?: string;
  zipCode?: string;
  registrationDate?: string;
  lastLoginDate?: string;
};

export type IyzicoAddress = {
  address: string;
  contactName: string;
  city: string;
  country: string;
  zipCode?: string;
};

export type IyzicoBasketItem = {
  id: string;
  price: string;
  name: string;
  category1: string;
  itemType: "PHYSICAL" | "VIRTUAL";
  category2?: string;
};

/** CF initialize request (provider wire). */
export type IyzicoCheckoutFormInitializeRequest = {
  locale?: IyzicoLocale;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: IyzicoCurrencyCode;
  basketId: string;
  paymentGroup?: "PRODUCT" | "LISTING" | "SUBSCRIPTION";
  callbackUrl: string;
  enabledInstallments?: number[];
  buyer: IyzicoBuyer;
  shippingAddress?: IyzicoAddress;
  billingAddress: IyzicoAddress;
  basketItems: IyzicoBasketItem[];
};

/** CF initialize response (provider wire). */
export type IyzicoCheckoutFormInitializeResponse = {
  status: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  token?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  signature?: string;
  errorCode?: string;
  errorMessage?: string;
};

/** CF retrieve request. */
export type IyzicoCheckoutFormRetrieveRequest = {
  locale?: IyzicoLocale;
  conversationId?: string;
  token: string;
};

/** CF retrieve response (subset used for settlement mapping later). */
export type IyzicoCheckoutFormRetrieveResponse = {
  status: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  price?: string | number;
  paidPrice?: string | number;
  paymentId?: string;
  fraudStatus?: number;
  basketId?: string;
  currency?: string;
  paymentStatus?: string;
  token?: string;
  signature?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type IyzicoSandboxConfig = {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  /** Request timeout in ms (default 15s). */
  timeoutMs: number;
};

export type IyzicoProviderErrorCode =
  | "IYZICO_CONFIG_MISSING"
  | "IYZICO_PRODUCTION_URL_FORBIDDEN"
  | "IYZICO_INVALID_BASE_URL"
  | "IYZICO_HTTP_ERROR"
  | "IYZICO_TIMEOUT"
  | "IYZICO_MALFORMED_RESPONSE"
  | "IYZICO_API_FAILURE"
  | "IYZICO_MISSING_TOKEN";

export class IyzicoProviderError extends Error {
  readonly code: IyzicoProviderErrorCode;
  readonly httpStatus?: number;
  readonly iyzicoErrorCode?: string;

  constructor(
    code: IyzicoProviderErrorCode,
    message: string,
    opts?: { httpStatus?: number; iyzicoErrorCode?: string; cause?: unknown }
  ) {
    super(message);
    this.name = "IyzicoProviderError";
    this.code = code;
    this.httpStatus = opts?.httpStatus;
    this.iyzicoErrorCode = opts?.iyzicoErrorCode;
    if (opts?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}
