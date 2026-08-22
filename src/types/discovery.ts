import type { SortKey } from "@/lib/discovery/sort-events";

/** Pagination options for repository search — UI pagination deferred to later sprints. */
export interface SearchPaginationOptions {
  limit?: number;
  offset?: number;
}

export interface SearchOptions extends SearchPaginationOptions {
  sort?: SortKey;
}

export type { SortKey };
