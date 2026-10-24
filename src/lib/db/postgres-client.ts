import "server-only";
import postgres, { type Sql } from "postgres";
import type { SqlClient, SqlQueryable, SqlRow } from "./sql";

export interface PostgresClientOptions {
  /** Optional schema for isolated test runs. */
  searchPath?: string;
  max?: number;
}

type Runner = Sql | { unsafe: Sql["unsafe"] };

function wrap(sql: Runner): SqlQueryable {
  return {
    async query(text, params) {
      const rows = await (sql.unsafe as Sql["unsafe"])(text, (params ?? []) as never[]);
      return rows as unknown as SqlRow[];
    },
    async exec(text) {
      await (sql.unsafe as Sql["unsafe"])(text);
    },
  };
}

/**
 * Production SqlClient over the `postgres` driver. `prepare: false` keeps it compatible with Supabase's
 * transaction pooler. Timeouts bound a hung database so a request fails (503) instead of hanging.
 * The connection string is never logged.
 */
export function createPostgresClient(databaseUrl: string, options: PostgresClientOptions = {}): SqlClient {
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
    ...(options.searchPath ? { connection: { search_path: options.searchPath } } : {}),
  });
  return {
    ...wrap(sql),
    transaction: <T>(fn: (tx: SqlQueryable) => Promise<T>): Promise<T> =>
      sql.begin((tx) => fn(wrap(tx as unknown as Runner))) as Promise<T>,
    close: () => sql.end({ timeout: 5 }),
  };
}
