import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

/**
 * Parses the real token declarations from globals.css so the test cannot drift
 * from the shipped palette.
 */
function readTokens(selector: ":root" | ".dark"): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Selector ${selector} not found`);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (m[1] && m[2]) out[m[1]] = m[2];
  }
  return out;
}

type Pair = { fg: string; bg: string; min: number; label: string };

const TEXT = 4.5; // WCAG AA normal text
const NON_TEXT = 3; // WCAG AA UI components / control boundaries

function pairs(): Pair[] {
  const t: Pair[] = [
    { fg: "foreground", bg: "background", min: TEXT, label: "text on canvas" },
    { fg: "card-foreground", bg: "card", min: TEXT, label: "text on card" },
    { fg: "muted-foreground", bg: "card", min: TEXT, label: "secondary text on card" },
    { fg: "muted-foreground", bg: "background", min: TEXT, label: "secondary text on canvas" },
    { fg: "text-tertiary", bg: "card", min: TEXT, label: "tertiary text on card" },
    { fg: "text-tertiary", bg: "background", min: TEXT, label: "tertiary text on canvas" },
    { fg: "text-tertiary", bg: "muted", min: TEXT, label: "tertiary text on muted" },
    { fg: "primary-foreground", bg: "primary", min: TEXT, label: "on-primary" },
    { fg: "primary-subtle-foreground", bg: "primary-subtle", min: TEXT, label: "text on moss-subtle" },
    { fg: "primary", bg: "card", min: TEXT, label: "moss text on card" },
    { fg: "destructive-foreground", bg: "destructive", min: TEXT, label: "on-destructive" },
    { fg: "sidebar-foreground", bg: "sidebar", min: TEXT, label: "sidebar text" },
    { fg: "sidebar-accent-foreground", bg: "sidebar-accent", min: TEXT, label: "sidebar active" },
    { fg: "sev-critical-fg", bg: "sev-critical-bg", min: TEXT, label: "critical severity" },
    { fg: "sev-high-fg", bg: "sev-high-bg", min: TEXT, label: "high severity" },
    { fg: "sev-medium-fg", bg: "sev-medium-bg", min: TEXT, label: "medium severity" },
    { fg: "sev-low-fg", bg: "sev-low-bg", min: TEXT, label: "low severity" },
    // non-text
    { fg: "input", bg: "card", min: NON_TEXT, label: "control border on card" },
    { fg: "ring", bg: "background", min: NON_TEXT, label: "focus ring on canvas" },
    { fg: "ring", bg: "card", min: NON_TEXT, label: "focus ring on card" },
  ];
  for (const s of ["verified", "reported", "inferred", "assumed", "unknown", "conflicted", "stale"]) {
    t.push({ fg: `status-${s}-fg`, bg: `status-${s}-bg`, min: TEXT, label: `claim state: ${s}` });
  }
  return t;
}

describe.each([
  [":root", "light"],
  [".dark", "dark"],
] as const)("design token contrast (%s / %s)", (selector, theme) => {
  const tokens = readTokens(selector);

  it("declares every token required by the contrast pairs", () => {
    for (const p of pairs()) {
      expect(tokens[p.fg], `${theme}: missing --${p.fg}`).toBeDefined();
      expect(tokens[p.bg], `${theme}: missing --${p.bg}`).toBeDefined();
    }
  });

  it.each(pairs().map((p) => [p.label, p] as const))("%s meets its minimum ratio", (_label, p) => {
    const fg = tokens[p.fg];
    const bg = tokens[p.bg];
    if (!fg || !bg) throw new Error("token missing");
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${theme}: ${p.label} = ${ratio.toFixed(2)} (min ${p.min})`).toBeGreaterThanOrEqual(p.min);
  });
});
