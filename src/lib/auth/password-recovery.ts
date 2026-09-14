/**
 * Password recovery helpers — isolated from customer/organizer login flows.
 */

export function passwordResetPath(locale: string): string {
  return locale === "en" ? "/en/reset-password" : "/tr/reset-password";
}

export function isPasswordRecoveryType(type: string | null | undefined): boolean {
  return (type ?? "").trim().toLowerCase() === "recovery";
}

/**
 * Only allow the fixed reset-password path as a recovery destination.
 * Ignores arbitrary `next` values to avoid open redirects in recovery emails.
 */
export function passwordRecoveryDestination(
  locale: string,
  next: string | null | undefined
): string {
  const resetPath = passwordResetPath(locale);
  if (!next) return resetPath;
  const path = next.trim();
  if (path === resetPath || path === `${resetPath}/`) return resetPath;
  return resetPath;
}
