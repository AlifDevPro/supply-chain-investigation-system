/** Minimal SQL boundary so the repository SQL runs unchanged on Supabase Postgres and on in-process PGlite in tests. */
export type SqlRow = Record<string, unknown>;

export interface SqlQueryable {
  /** One parameterized statement. Always pass user-influenced values as params, never in the text. */
  query(text: string, params?: readonly unknown[]): Promise<SqlRow[]>;
  /** Trusted, parameterless, possibly multi-statement SQL (migrations only). */
  exec(text: string): Promise<void>;
}

export interface SqlClient extends SqlQueryable {
  transaction<T>(fn: (tx: SqlQueryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
