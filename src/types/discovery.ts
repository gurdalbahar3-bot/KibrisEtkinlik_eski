import type { SortKey } from "@/lib/discovery/sort-events";
import type { DiscoveryEvent } from "@/types/event";

/** Pagination options for repository search. */
export interface SearchPaginationOptions {
  limit?: number;
  offset?: number;
  /** 1-based page — preferred over raw offset for listing UI. */
  page?: number;
}

export interface SearchOptions extends SearchPaginationOptions {
  sort?: SortKey;
}

export interface DiscoverySearchResult {
  items: DiscoveryEvent[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type { SortKey };
