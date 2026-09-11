export const DISCOVERY_DEFAULT_PAGE_SIZE = 24;
export const DISCOVERY_MAX_PAGE_SIZE = 48;

export function parseDiscoveryPage(
  raw: string | string[] | undefined
): number {
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, 10_000);
}

export function clampDiscoveryPageSize(size?: number): number {
  if (size == null || !Number.isFinite(size) || size <= 0) {
    return DISCOVERY_DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(size), DISCOVERY_MAX_PAGE_SIZE);
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; total: number; page: number; pageSize: number; pageCount: number } {
  const safePage = Math.max(1, page);
  const safeSize = clampDiscoveryPageSize(pageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / safeSize));
  const current = Math.min(safePage, pageCount);
  const offset = (current - 1) * safeSize;
  return {
    items: items.slice(offset, offset + safeSize),
    total,
    page: current,
    pageSize: safeSize,
    pageCount,
  };
}
