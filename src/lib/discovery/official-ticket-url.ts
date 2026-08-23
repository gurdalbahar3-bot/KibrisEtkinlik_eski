const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

export function isHttpUrl(value: string | undefined | null): value is string {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isPlaceholderTicketHost(value: string): boolean {
  try {
    return PLACEHOLDER_HOSTS.has(hostnameOf(new URL(value.trim())));
  } catch {
    return true;
  }
}

/** Real official ticket URL for public "Bilet al". Rejects empty, non-http(s), and lab placeholders. */
export function sanitizePublicOfficialTicketUrl(
  value: string | undefined | null
): string | undefined {
  if (!isHttpUrl(value)) return undefined;
  if (isPlaceholderTicketHost(value)) return undefined;
  return value.trim();
}
