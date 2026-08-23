export type DataSource = "mock" | "supabase";

const VALID_SOURCES: DataSource[] = ["mock", "supabase"];

export interface DataSourceEnv {
  SUPABASE_DATA_SOURCE?: string;
  NODE_ENV?: string;
}

/**
 * Resolve the public discovery data source.
 * `mock` is allowed only when EXPLICIT (`SUPABASE_DATA_SOURCE=mock`) and NODE_ENV=development.
 * Unset, invalid, staging, and production always resolve to `supabase` — never a silent mock default.
 */
export function resolveDataSource(env: DataSourceEnv): DataSource {
  const raw = env.SUPABASE_DATA_SOURCE?.trim().toLowerCase();
  const isDevelopment = env.NODE_ENV === "development";

  if (raw === "mock") {
    if (!isDevelopment) {
      throw new Error(
        "SUPABASE_DATA_SOURCE=mock is only allowed when NODE_ENV=development. Staging and production must use real Supabase."
      );
    }
    return "mock";
  }

  if (raw && !VALID_SOURCES.includes(raw as DataSource)) {
    throw new Error(
      `Invalid SUPABASE_DATA_SOURCE="${env.SUPABASE_DATA_SOURCE}". Use "supabase" or, in development only, "mock".`
    );
  }

  return "supabase";
}

/** Public discovery data source. Never defaults to mock. */
export function getDataSource(): DataSource {
  return resolveDataSource({
    SUPABASE_DATA_SOURCE: process.env.SUPABASE_DATA_SOURCE,
    NODE_ENV: process.env.NODE_ENV,
  });
}

export function isSupabaseDataSource(): boolean {
  return getDataSource() === "supabase";
}

export function isExplicitMockDataSource(): boolean {
  return getDataSource() === "mock";
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
 * Required when the data source is supabase.
 * Throws instead of falling back to mock.
 */
export function assertSupabasePublicEnv(): SupabasePublicEnv {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY. SUPABASE_DATA_SOURCE=mock is only allowed in development."
    );
  }
  return env;
}

/** Call at the start of any supabase-mode repository path. */
export function assertSupabaseDataSourceReady(): SupabasePublicEnv {
  if (!isSupabaseDataSource()) {
    throw new Error(
      "assertSupabaseDataSourceReady called while SUPABASE_DATA_SOURCE is not supabase."
    );
  }
  return assertSupabasePublicEnv();
}
