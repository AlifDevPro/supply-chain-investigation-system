import { describe, expect, it } from "vitest";
import { NAV_GROUPS, breadcrumbsFor, isActivePath } from "./nav-config";

describe("navigation", () => {
  it("lists every README primary route exactly once", () => {
    const labels = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toEqual([
      "Overview",
      "Live Activity",
      "Investigations",
      "Review Queue",
      "Evidence Explorer",
      "Supply Chain Graph",
      "Reports & Analytics",
      "Integrations",
      "Audit & Security",
      "Settings",
    ]);
  });

  it("never links to a page that does not exist: planned items have a phase and no href", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(Boolean(item.href) !== Boolean(item.planned)).toBe(true);
    }
  });

  it("matches active paths by segment, not prefix", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/investigations/INV-2041", "/investigations")).toBe(true);
    expect(isActivePath("/investigations-old", "/investigations")).toBe(false);
    expect(isActivePath("/live-activity", "/")).toBe(false);
  });

  it("builds breadcrumbs", () => {
    expect(breadcrumbsFor("/investigations/INV-2041")).toEqual([
      { label: "Investigations", href: "/investigations" },
      { label: "INV-2041" },
    ]);
    expect(breadcrumbsFor("/review")).toEqual([{ label: "Review Queue" }]);
    expect(breadcrumbsFor("/settings")).toEqual([{ label: "Settings" }]);
    expect(breadcrumbsFor("/nope")).toEqual([{ label: "Not found" }]);
  });
});
