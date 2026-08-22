export type DataSource = "mock" | "supabase";

const VALID_SOURCES: DataSource[] = ["mock", "supabase"];

/** Default mock — local/UI lab only. Production discovery uses SUPABASE_DATA_SOURCE=supabase. */
export function getDataSource(): DataSource {
  const raw = process.env.SUPABASE_DATA_SOURCE?.trim().toLowerCase();
  if (raw && VALID_SOURCES.includes(raw as DataSource)) {
    return raw as DataSource;
  }
  return "mock";
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
 * Throws instead of falling back to mock.
 */
export function assertSupabasePublicEnv(): SupabasePublicEnv {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY, or use SUPABASE_DATA_SOURCE=mock."
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
