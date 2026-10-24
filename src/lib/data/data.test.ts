import { describe, expect, it } from "vitest";
import {
  AccessDeniedError,
  DataUnavailableError,
  NotFoundError,
  getActivityData,
  getInvestigationDetail,
  getOverviewData,
  listInvestigations,
  parseScenario,
} from "./index";

describe("fixture data source", () => {
  it("validates all fixtures against the domain schemas", async () => {
    const o = await getOverviewData();
    expect(o.cases.length).toBeGreaterThan(5);
    expect(o.cases.every((c) => c.dataMode === "synthetic")).toBe(true);
    const a = await getActivityData();
    expect(a.events.every((e) => e.dataMode === "synthetic")).toBe(true);
  });

  it("derives INV-2041's headline deficit from the deterministic calculation", async () => {
    const { detail } = await getInvestigationDetail("INV-2041");
    expect(detail.impact?.deficit).toBe(5500);
    expect(detail.impact?.status).toBe("provisional");
    expect(detail.case.impactLabel).toBe("5,500 m deficit");
    expect(detail.claims.some((c) => c.state === "conflicted")).toBe(true);
  });

  it("returns no-detail cases honestly instead of inventing evidence", async () => {
    const { detail } = await getInvestigationDetail("INV-2043");
    expect(detail.detailAvailable).toBe(false);
    expect(detail.evidence).toEqual([]);
  });

  it("throws typed errors for unknown records and failure scenarios", async () => {
    await expect(getInvestigationDetail("INV-0000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(listInvestigations("error")).rejects.toBeInstanceOf(DataUnavailableError);
    await expect(listInvestigations("denied")).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("supports empty and stale scenarios", async () => {
    expect((await listInvestigations("empty")).cases).toEqual([]);
    expect((await getOverviewData("stale")).freshness.stale).toBe(true);
    // With no investigations in view, a case id must resolve to not-found rather than a stray record.
    await expect(getInvestigationDetail("INV-2041", "empty")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ignores unknown scenario values", () => {
    expect(parseScenario("nope")).toBe("ok");
    expect(parseScenario(["stale"])).toBe("stale");
    expect(parseScenario(undefined)).toBe("ok");
  });

  it("keeps the review queue honest: waiting events exist only for cases awaiting review", async () => {
    const a = await getActivityData();
    const waiting = a.events.filter((e) => e.status === "waiting");
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.every((e) => e.stage === "review")).toBe(true);
  });
});
