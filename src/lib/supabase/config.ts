export type DataSource = "mock" | "supabase";

const VALID_SOURCES: DataSource[] = ["mock", "supabase"];

export const PRODUCTION_DATA_SOURCE_ERROR =
  "Production requires SUPABASE_DATA_SOURCE=supabase with SUPABASE_URL and SUPABASE_ANON_KEY. Unset, mock, and invalid values fail loud — no silent mock fallback.";

export interface ResolveDataSourceInput {
  nodeEnv?: string | undefined;
  dataSource?: string | undefined;
}

/** Production is NODE_ENV=production only. Test/development keep the mock lab. */
export function isProductionNodeEnv(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}

/**
 * Resolve the public/admin data source.
 * Development/test: unset or mock → mock; supabase → supabase; invalid → fail loud.
 * Production: only supabase; unset/mock/invalid → fail loud. Never returns mock.
 */
export function resolveDataSource(input: ResolveDataSourceInput = {}): DataSource {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const raw = (input.dataSource ?? process.env.SUPABASE_DATA_SOURCE)?.trim().toLowerCase();
  const production = isProductionNodeEnv(nodeEnv);

  if (production) {
    if (raw !== "supabase") {
      throw new Error(PRODUCTION_DATA_SOURCE_ERROR);
    }
    return "supabase";
  }

  if (!raw) {
    return "mock";
  }

  if (!VALID_SOURCES.includes(raw as DataSource)) {
    throw new Error(
      `Invalid SUPABASE_DATA_SOURCE "${raw}". Use mock or supabase.`
    );
  }

  return raw as DataSource;
}

/** Development/test default mock. Production never defaults to mock. */
export function getDataSource(): DataSource {
  return resolveDataSource({
    nodeEnv: process.env.NODE_ENV,
    dataSource: process.env.SUPABASE_DATA_SOURCE,
  });
}

export function isSupabaseDataSource(): boolean {
  return getDataSource() === "supabase";
}

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

/** Returns env when configured; null when missing. Never silently switches data source. */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

/**
 * Required when SUPABASE_DATA_SOURCE=supabase.
 * Throws instead of falling back to mock. Does not tell production to use mock.
 */
export function assertSupabasePublicEnv(): SupabasePublicEnv {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY."
    );
  }
  return env;
}

/** Call at the start of any supabase-mode repository path. */
export function assertSupabaseDataSourceReady(): SupabasePublicEnv {
  if (!isSupabaseDataSource()) {
    throw new Error("assertSupabaseDataSourceReady called while SUPABASE_DATA_SOURCE is not supabase.");
  }
  return assertSupabasePublicEnv();
}

/**
 * Public discovery/sitemap entry guard.
 * Production: supabase + required env, or throw. Development: mock allowed.
 */
export function assertDiscoverySourceAllowed(): DataSource {
  const source = getDataSource();
  if (source === "supabase") {
    assertSupabaseDataSourceReady();
  }
  return source;
}
