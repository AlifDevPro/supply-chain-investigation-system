import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => path.relative(ROOT, f);

describe("secrets and server-only boundaries", () => {
  it("no NEXT_PUBLIC_ variable is used for credentials or connection strings", () => {
    const offenders = files.filter((f) => /NEXT_PUBLIC_\w*(DATABASE|INGEST|KEY|SECRET|TOKEN|PASSWORD)/i.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
    const assignments = read(path.join(ROOT, ".env.example")).split("\n").filter((l) => /^[A-Z_]+=/.test(l));
    expect(assignments.filter((l) => l.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });

  it(".env.example holds no real values", () => {
    const text = read(path.join(ROOT, ".env.example"));
    expect(text).toMatch(/^DATABASE_URL=$/m);
    expect(text).toMatch(/^INGEST_API_KEY=$/m);
    expect(text).toMatch(/^SESSION_SECRET=$/m);
    expect(text).toMatch(/^DEMO_REVIEWER_PASSWORD=$/m);
    expect(text).toMatch(/^DEMO_PROCUREMENT_PASSWORD=$/m);
    expect(text).toMatch(/^DEMO_MANAGER_PASSWORD=$/m);
    expect(text).toMatch(/^GOOGLE_CLIENT_ID=$/m);
    expect(text).toMatch(/^GOOGLE_CLIENT_SECRET=$/m);
    expect(text).toMatch(/^MCP_API_KEY=$/m);
    expect(text).toMatch(/^MAILBOX_BASE_URL=$/m);
    expect(text).toMatch(/^MAILBOX_API_KEY=$/m);
    expect(text).toMatch(/^ERP_BASE_URL=$/m);
    expect(text).toMatch(/^ERP_API_KEY=$/m);
    expect(text).toMatch(/^CARRIER_BASE_URL=$/m);
    expect(text).toMatch(/^CARRIER_API_KEY=$/m);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("server-only modules import 'server-only'", () => {
    for (const f of ["lib/env.ts", "lib/runtime.ts", "lib/db/postgres-client.ts", "lib/auth/session.ts", "lib/mcp/http.ts"]) {
      expect(read(path.join(SRC, f)), f).toMatch(/^import "server-only";/m);
    }
  });

  it("client components never import server-only modules", () => {
    const forbidden = /from "@\/lib\/(runtime|env|db\/|store\/|data"|data\/)/;
    const clients = files.filter((f) => /^\s*["']use client["']/.test(read(f).trimStart()));
    expect(clients.length).toBeGreaterThan(0);
    const offenders = clients.filter((f) => forbidden.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no source file embeds a connection string or bearer secret", () => {
    const offenders = files.filter((f) => /postgres(ql)?:\/\/[^\s"'`$]+:[^\s"'`$@]+@/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("SQL text only interpolates fixed constants, never request data", () => {
    const text = read(path.join(SRC, "lib/store/postgres.ts"));
    const sqlTemplates = [...text.matchAll(/`([^`]*)`/g)].map((m) => m[1]!).filter((t) => /\b(select|insert|update|delete|from|where)\b/i.test(t));
    expect(sqlTemplates.length).toBeGreaterThan(3);
    const interpolations = sqlTemplates.flatMap((t) => [...t.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]!.trim()));
    const allowed = /^(RECORD_COLUMNS|REF_COLUMNS|CANONICAL|WITH_CASE|REFERENCE_PATHS\[key\]|params\.length|conditions\.join\(" or "\)|where)$/;
    expect(interpolations.filter((i) => !allowed.test(i))).toEqual([]);
  });

  it("investigation and business-record SQL only interpolates fixed constants and table specs", () => {
    const allowed: Record<string, RegExp> = {
      "lib/store/postgres-investigations.ts": /^(RUN_COLUMNS)$/,
      "lib/store/postgres-extractions.ts": /^(COLUMNS)$/,
      "lib/store/postgres-catalog.ts": /^(LIMIT)$/,
      "lib/store/postgres-governance.ts": /^(?!)$/,
      "lib/store/postgres-integrations.ts": /^(?!)$/,
      // `where` is one of two hard-coded column names; table specs are literals in the same file.
      "lib/store/postgres-records.ts":
        /^(LIMIT|where|spec\.table|names\.join\(", "\)|spec\.keys\.join\(", "\)|conflict|names\.map\(\(n\) => `x\.|spec\.columns\.map\(\(\[n, t\]\) => `|values\.map\(\(n\) => `|n|t|String\(.*\))$/,
    };
    for (const [file, pattern] of Object.entries(allowed)) {
      const text = read(path.join(SRC, file));
      const templates = [...text.matchAll(/`([^`]*)`/g)].map((m) => m[1]!).filter((t) => /\b(select|insert|update|delete|from|where)\b/i.test(t));
      expect(templates.length).toBeGreaterThan(2);
      const interpolations = templates.flatMap((t) => [...t.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]!.trim()));
      expect(interpolations.filter((i) => !pattern.test(i)), file).toEqual([]);
    }
    // Callers of the generic helpers pass only literal column names.
    const records = read(path.join(SRC, "lib/store/postgres-records.ts"));
    expect([...records.matchAll(/this\.(?:balances|shipments)\(tenantId, ("[^"]*")/g)].map((m) => m[1])).toEqual([
      '"b.material_id"', '"b.lot"', '"purchase_order_id"', '"id"',
    ]);
  });
});
