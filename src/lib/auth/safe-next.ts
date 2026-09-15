/**
 * Safe internal redirect helpers for customer auth (login / signup / callback).
 * Rejects open redirects and keeps organizer defaults out of customer flows.
 */

export function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  return true;
}

/** True for Organizer OS / admin surfaces — not customer destinations. */
export function isOrganizerOrAdminPath(path: string): boolean {
  return (
    path === "/organizer" ||
    path.startsWith("/organizer/") ||
    /\/organizer(\/|$)/.test(path) ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    /\/admin(\/|$)/.test(path)
  );
}

/**
 * Customer-safe next path. Allows locale home, checkout, account, discovery, etc.
 * Rejects external URLs and organizer/admin destinations.
 */
export function safeCustomerNextPath(
  next: string | null | undefined,
  locale: string
): string | null {
  if (!next) return null;
  const path = next.trim();
  if (!isSafeInternalPath(path)) return null;
  if (isOrganizerOrAdminPath(path)) return null;

  const home = `/${locale}`;
  if (path === home || path === `${home}/`) return home;
  if (path.startsWith(`${home}/`)) return path;

  // Absolute localized customer aliases without forcing a second redirect.
  // e.g. rare unprefixed internal paths are rejected for consistency.
  return null;
}

export function customerHomePath(locale: string): string {
  return locale === "en" ? "/en" : "/tr";
}

/** Callback-safe next: keep explicit organizer next; otherwise customer-safe or locale home. */
export function safeAuthCallbackNext(
  next: string | null | undefined,
  locale: string
): string {
  if (!next) return customerHomePath(locale);
  const path = next.trim();
  if (!isSafeInternalPath(path)) return customerHomePath(locale);
  if (isOrganizerOrAdminPath(path)) return path;
  return safeCustomerNextPath(path, locale) ?? customerHomePath(locale);
}
