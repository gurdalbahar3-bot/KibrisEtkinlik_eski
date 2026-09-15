import type { CrawlFetchFn, CrawlFetchResult } from "@/lib/orumcek/types";

export const ORUMCEK_USER_AGENT =
  "KibrisEtkinlik-Orumcek/0.2 (+https://kibrisetkinlik.com; controlled admin crawl; never publishes)";

export const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_BODY_CHARS = 750_000;
export const DEFAULT_DETAIL_DELAY_MS = 1_200;
export const DEFAULT_MAX_EVENTS = 5;

export function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function politeFetchPage(
  url: string,
  options?: { timeoutMs?: number; maxBodyChars?: number }
): Promise<CrawlFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBodyChars = options?.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.8",
        "User-Agent": ORUMCEK_USER_AGENT,
      },
    });
    const text = await response.text();
    return {
      url: response.url || url,
      status: response.status,
      body: text.length > maxBodyChars ? text.slice(0, maxBodyChars) : text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    return {
      url,
      status: 0,
      body: `<!-- orumcek-fetch-error: ${message} -->`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const defaultCrawlFetch: CrawlFetchFn = (url) => politeFetchPage(url);
