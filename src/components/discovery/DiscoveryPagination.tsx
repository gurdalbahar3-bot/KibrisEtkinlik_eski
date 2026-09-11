import {
  buildDiscoveryQueryString,
  type DiscoverySearchParams,
} from "@/lib/discovery/search-params";

type Props = {
  locale: string;
  filters: DiscoverySearchParams;
  page: number;
  pageCount: number;
  prevLabel: string;
  nextLabel: string;
  pageLabel: string;
};

export function DiscoveryPagination({
  locale,
  filters,
  page,
  pageCount,
  prevLabel,
  nextLabel,
  pageLabel,
}: Props) {
  if (pageCount <= 1) return null;

  const basePath = locale === "tr" ? "/tr/etkinlikler" : "/en/events";

  function hrefFor(targetPage: number): string {
    const qs = buildDiscoveryQueryString({
      ...filters,
      page: targetPage > 1 ? targetPage : undefined,
    });
    return `${basePath}${qs}`;
  }

  const label = pageLabel
    .replace("{page}", String(page))
    .replace("{pageCount}", String(pageCount));

  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-3"
      aria-label={label}
      data-testid="discovery-pagination"
    >
      {page > 1 ? (
        <a
          href={hrefFor(page - 1)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {prevLabel}
        </a>
      ) : (
        <span className="rounded-xl border border-transparent px-4 py-2 text-sm text-slate-300">
          {prevLabel}
        </span>
      )}
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {page < pageCount ? (
        <a
          href={hrefFor(page + 1)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {nextLabel}
        </a>
      ) : (
        <span className="rounded-xl border border-transparent px-4 py-2 text-sm text-slate-300">
          {nextLabel}
        </span>
      )}
    </nav>
  );
}
