/**
 * Password recovery helpers — isolated from customer/organizer login flows.
 * Open-redirect safe: next and returnTo are allowlisted.
 */

const CUSTOMER_LOGIN_RETURN_PATHS = ["/tr/giris", "/en/login"] as const;
const ORGANIZER_LOGIN_RETURN_PATH = "/organizer/login";

/** Post-reset login destinations (strict allowlist). */
export const PASSWORD_RESET_RETURN_PATHS = [
  ...CUSTOMER_LOGIN_RETURN_PATHS,
  ORGANIZER_LOGIN_RETURN_PATH,
] as const;

export type PasswordResetReturnPath = (typeof PASSWORD_RESET_RETURN_PATHS)[number];

export function passwordResetPath(locale: string): string {
  return locale === "en" ? "/en/reset-password" : "/tr/reset-password";
}

export function forgotPasswordPath(locale: string): string {
  return locale === "en" ? "/en/forgot-password" : "/tr/forgot-password";
}

export function organizerForgotPasswordPath(): string {
  return "/organizer/forgot-password";
}

/** Auth callback path used as Supabase recovery redirectTo (no open redirects). */
export function passwordRecoveryCallbackPath(locale: string): string {
  return `/${locale === "en" ? "en" : "tr"}/auth/callback`;
}

export function isPasswordRecoveryType(type: string | null | undefined): boolean {
  return (type ?? "").trim().toLowerCase() === "recovery";
}

export function customerPasswordResetReturnTo(locale: string): PasswordResetReturnPath {
  return locale === "en" ? "/en/login" : "/tr/giris";
}

export function organizerPasswordResetReturnTo(): PasswordResetReturnPath {
  return ORGANIZER_LOGIN_RETURN_PATH;
}

export function isSafePasswordResetReturnTo(
  path: string | null | undefined
): path is PasswordResetReturnPath {
  if (!path) return false;
  const trimmed = path.trim();
  return (PASSWORD_RESET_RETURN_PATHS as readonly string[]).includes(trimmed);
}

export function safePasswordResetReturnTo(
  path: string | null | undefined,
  locale: string
): PasswordResetReturnPath {
  if (isSafePasswordResetReturnTo(path)) {
    return path;
  }
  return customerPasswordResetReturnTo(locale);
}

/**
 * Only allow the fixed reset-password path as a recovery destination.
 * Optional safe returnTo may ride as a query on that path.
 * Ignores arbitrary `next` values to avoid open redirects in recovery emails.
 */
export function passwordRecoveryDestination(
  locale: string,
  next: string | null | undefined,
  returnToRaw?: string | null
): string {
  const resetPath = passwordResetPath(locale);
  const returnTo = isSafePasswordResetReturnTo(returnToRaw)
    ? returnToRaw
    : parseReturnToFromNext(next) ?? null;

  let pathOnly = resetPath;
  if (next) {
    const trimmed = next.trim();
    try {
      const parsed = new URL(trimmed, "https://kibrisetkinlik.local");
      if (parsed.pathname === resetPath || parsed.pathname === `${resetPath}/`) {
        pathOnly = resetPath;
      }
    } catch {
      if (trimmed === resetPath || trimmed === `${resetPath}/`) {
        pathOnly = resetPath;
      }
    }
  }

  if (returnTo) {
    return `${pathOnly}?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return pathOnly;
}

function parseReturnToFromNext(next: string | null | undefined): PasswordResetReturnPath | null {
  if (!next) return null;
  try {
    const parsed = new URL(next.trim(), "https://kibrisetkinlik.local");
    const fromQuery = parsed.searchParams.get("returnTo");
    return isSafePasswordResetReturnTo(fromQuery) ? fromQuery : null;
  } catch {
    return null;
  }
}

/** Login path after a successful password update (customer gets ?reset=1). */
export function passwordResetCompletedPath(returnTo: PasswordResetReturnPath): string {
  if (returnTo === ORGANIZER_LOGIN_RETURN_PATH) {
    return ORGANIZER_LOGIN_RETURN_PATH;
  }
  return `${returnTo}?reset=1`;
}
