import { PGlite } from "@electric-sql/pglite";
import type { SqlClient, SqlQueryable, SqlRow } from "@/lib/db/sql";

/** Test-only SqlClient backed by in-process Postgres (WASM). Runs the real migrations and repository SQL. */
export async function createPgliteClient(): Promise<SqlClient> {
  const db = new PGlite();
  await db.waitReady;
  const wrap = (q: { query: PGlite["query"]; exec: PGlite["exec"] }): SqlQueryable => ({
    async query(text, params) {
      const res = await q.query<SqlRow>(text, params ? [...params] : []);
      return res.rows;
    },
    async exec(text) {
      await q.exec(text);
    },
  });
  return {
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx as unknown as PGlite))),
    close: () => db.close(),
  };
}
