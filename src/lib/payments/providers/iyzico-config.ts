/**
 * iyzico sandbox env loading (no secrets logged).
 * Kept free of `server-only` so unit tests can import; only server modules
 * should call this in production paths.
 */

import {
  IyzicoProviderError,
  type IyzicoSandboxConfig,
} from "./iyzico-types.ts";

export const IYZICO_ENV_KEYS = [
  "IYZICO_API_KEY",
  "IYZICO_SECRET_KEY",
  "IYZICO_BASE_URL",
] as const;

const DEFAULT_TIMEOUT_MS = 15_000;

export function assertIyzicoSandboxConfigPresent(
  env: NodeJS.ProcessEnv = process.env
): {
  configured: boolean;
  missing: string[];
} {
  const missing = IYZICO_ENV_KEYS.filter((key) => !env[key]?.trim());
  return { configured: missing.length === 0, missing: [...missing] };
}

/** Refuse production iyzico host if misconfigured. */
export function isForbiddenIyzicoProductionBaseUrl(baseUrl: string): boolean {
  if (!baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "api.iyzipay.com") return true;
    if (host.includes("sandbox")) return false;
    return host.endsWith("iyzipay.com") && !host.includes("sandbox");
  } catch {
    return true;
  }
}

export function isAllowedIyzicoSandboxBaseUrl(baseUrl: string): boolean {
  if (!baseUrl?.trim()) return false;
  if (isForbiddenIyzicoProductionBaseUrl(baseUrl)) return false;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host.includes("sandbox") && host.endsWith("iyzipay.com");
  } catch {
    return false;
  }
}

export function loadIyzicoSandboxConfig(
  env: NodeJS.ProcessEnv = process.env
): IyzicoSandboxConfig {
  const apiKey = env.IYZICO_API_KEY?.trim() ?? "";
  const secretKey = env.IYZICO_SECRET_KEY?.trim() ?? "";
  const baseUrl = env.IYZICO_BASE_URL?.trim() ?? "";
  const missing = IYZICO_ENV_KEYS.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new IyzicoProviderError(
      "IYZICO_CONFIG_MISSING",
      `Missing iyzico env: ${missing.join(", ")}`
    );
  }

  if (isForbiddenIyzicoProductionBaseUrl(baseUrl)) {
    throw new IyzicoProviderError(
      "IYZICO_PRODUCTION_URL_FORBIDDEN",
      "IYZICO_BASE_URL must not point at production api.iyzipay.com during Phase B"
    );
  }

  if (!isAllowedIyzicoSandboxBaseUrl(baseUrl)) {
    throw new IyzicoProviderError(
      "IYZICO_INVALID_BASE_URL",
      "IYZICO_BASE_URL must be an https sandbox iyzipay host"
    );
  }

  const timeoutRaw = env.IYZICO_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw
    ? Number.parseInt(timeoutRaw, 10)
    : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new IyzicoProviderError(
      "IYZICO_CONFIG_MISSING",
      "IYZICO_TIMEOUT_MS must be a positive integer >= 1000 when set"
    );
  }

  return { apiKey, secretKey, baseUrl, timeoutMs };
}

/**
 * Absolute HTTPS callback URL for CF initialize.
 * Route itself is implemented in a later B2 step — URL must still be configured.
 */
export function resolveIyzicoCallbackUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const raw = env.IYZICO_CALLBACK_URL?.trim() ?? "";
  if (!raw) {
    throw new IyzicoProviderError(
      "IYZICO_CONFIG_MISSING",
      "Missing IYZICO_CALLBACK_URL"
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IyzicoProviderError(
      "IYZICO_INVALID_BASE_URL",
      "IYZICO_CALLBACK_URL is not a valid URL"
    );
  }
  if (url.protocol !== "https:") {
    throw new IyzicoProviderError(
      "IYZICO_INVALID_BASE_URL",
      "IYZICO_CALLBACK_URL must use https"
    );
  }
  // Never point callback at iyzico production hosts by mistake.
  if (url.hostname.toLowerCase() === "api.iyzipay.com") {
    throw new IyzicoProviderError(
      "IYZICO_PRODUCTION_URL_FORBIDDEN",
      "IYZICO_CALLBACK_URL must not use production iyzico host"
    );
  }
  return raw;
}

/** True when sandbox payment credentials + callback URL are configured. */
export function isIyzicoCheckoutConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  try {
    loadIyzicoSandboxConfig(env);
    resolveIyzicoCallbackUrl(env);
    return true;
  } catch {
    return false;
  }
}
