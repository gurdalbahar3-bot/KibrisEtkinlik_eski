/**
 * iyzico Sandbox HTTP client (Checkout Form initialize / retrieve).
 * No env reads here — inject config. Safe for unit tests with mock fetch.
 */

import {
  buildIyzicoAuthHeaders,
  createIyzicoRandomKey,
  redactIyzicoSecrets,
} from "./iyzico-auth.ts";
import {
  IYZICO_CF_INITIALIZE_PATH,
  IYZICO_CF_RETRIEVE_PATH,
  IyzicoProviderError,
  type IyzicoCheckoutFormInitializeRequest,
  type IyzicoCheckoutFormInitializeResponse,
  type IyzicoCheckoutFormRetrieveRequest,
  type IyzicoCheckoutFormRetrieveResponse,
  type IyzicoSandboxConfig,
} from "./iyzico-types.ts";

export type IyzicoFetch = typeof fetch;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class IyzicoApiClient {
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: IyzicoFetch;

  constructor(
    config: IyzicoSandboxConfig,
    opts?: { fetchImpl?: IyzicoFetch }
  ) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  /**
   * Authenticated JSON POST. `body` is stringified once — that exact string
   * is used for both the wire body and the IYZWSv2 signature input.
   */
  async postJson<T>(
    uriPath: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const requestBodyJson = JSON.stringify(body);
    const randomKey = createIyzicoRandomKey();
    const headers = buildIyzicoAuthHeaders({
      apiKey: this.apiKey,
      secretKey: this.secretKey,
      randomKey,
      uriPath,
      requestBodyJson,
    });

    const url = `${this.baseUrl}${uriPath}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: requestBodyJson,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new IyzicoProviderError(
          "IYZICO_TIMEOUT",
          "iyzico request timed out",
          { cause: err }
        );
      }
      throw new IyzicoProviderError(
        "IYZICO_HTTP_ERROR",
        "iyzico request failed before response",
        { cause: err }
      );
    }

    const rawText = await response.text();
    let parsed: unknown;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch (err) {
      throw new IyzicoProviderError(
        "IYZICO_MALFORMED_RESPONSE",
        redactIyzicoSecrets(
          `iyzico returned non-JSON body (HTTP ${response.status})`,
          [this.apiKey, this.secretKey]
        ),
        { httpStatus: response.status, cause: err }
      );
    }

    if (!response.ok) {
      const errObj = isPlainObject(parsed) ? parsed : {};
      throw new IyzicoProviderError(
        "IYZICO_HTTP_ERROR",
        redactIyzicoSecrets(
          `iyzico HTTP ${response.status}`,
          [this.apiKey, this.secretKey]
        ),
        {
          httpStatus: response.status,
          iyzicoErrorCode:
            typeof errObj.errorCode === "string" ? errObj.errorCode : undefined,
        }
      );
    }

    if (!isPlainObject(parsed)) {
      throw new IyzicoProviderError(
        "IYZICO_MALFORMED_RESPONSE",
        "iyzico response is not a JSON object"
      );
    }

    return parsed as T;
  }

  async initializeCheckoutForm(
    request: IyzicoCheckoutFormInitializeRequest
  ): Promise<IyzicoCheckoutFormInitializeResponse> {
    const raw = await this.postJson<IyzicoCheckoutFormInitializeResponse>(
      IYZICO_CF_INITIALIZE_PATH,
      request as unknown as Record<string, unknown>
    );

    if (!raw || typeof raw.status !== "string") {
      throw new IyzicoProviderError(
        "IYZICO_MALFORMED_RESPONSE",
        "initialize response missing status"
      );
    }

    if (raw.status !== "success") {
      throw new IyzicoProviderError(
        "IYZICO_API_FAILURE",
        redactIyzicoSecrets(
          `initialize failed: ${raw.errorCode ?? "unknown"}`,
          [this.apiKey, this.secretKey, raw.errorMessage]
        ),
        { iyzicoErrorCode: raw.errorCode }
      );
    }

    if (!raw.token?.trim()) {
      throw new IyzicoProviderError(
        "IYZICO_MISSING_TOKEN",
        "initialize success response missing token"
      );
    }

    return {
      status: raw.status,
      locale: raw.locale,
      systemTime: raw.systemTime,
      conversationId: raw.conversationId,
      token: raw.token,
      checkoutFormContent: raw.checkoutFormContent,
      paymentPageUrl: raw.paymentPageUrl,
      signature: raw.signature,
    };
  }

  async retrieveCheckoutFormDetail(
    request: IyzicoCheckoutFormRetrieveRequest
  ): Promise<IyzicoCheckoutFormRetrieveResponse> {
    if (!request.token?.trim()) {
      throw new IyzicoProviderError(
        "IYZICO_MISSING_TOKEN",
        "retrieve requires token"
      );
    }

    const raw = await this.postJson<IyzicoCheckoutFormRetrieveResponse>(
      IYZICO_CF_RETRIEVE_PATH,
      request as unknown as Record<string, unknown>
    );

    if (!raw || typeof raw.status !== "string") {
      throw new IyzicoProviderError(
        "IYZICO_MALFORMED_RESPONSE",
        "retrieve response missing status"
      );
    }

    return {
      status: raw.status,
      locale: raw.locale,
      systemTime: raw.systemTime,
      conversationId: raw.conversationId,
      price: raw.price,
      paidPrice: raw.paidPrice,
      paymentId: raw.paymentId,
      fraudStatus: raw.fraudStatus,
      basketId: raw.basketId,
      currency: raw.currency,
      paymentStatus: raw.paymentStatus,
      token: raw.token,
      signature: raw.signature,
      errorCode: raw.errorCode,
      errorMessage: raw.errorMessage,
    };
  }
}
