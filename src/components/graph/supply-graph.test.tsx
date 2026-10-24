import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { SNAPSHOT_AT } from "@/fixtures/dataset";
import { catalogGraph, expandableNodeIds, focusGraph, graphFocusOptions } from "@/lib/derive";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { emptyCatalog } from "@/lib/store/catalog-types";
import { axeViolations } from "@/test/axe";
import { SupplyGraphView } from "./supply-graph";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

describe("SupplyGraphView", () => {
  it("shows columns and a relationship table", async () => {
    const catalog = { ...emptyCatalog(), ...syntheticBusinessDataset(new Date(SNAPSHOT_AT)), updatedAt: SNAPSHOT_AT, truncated: false };
    const full = catalogGraph(catalog);
    const { container } = render(
      <SupplyGraphView graph={focusGraph(full, { kind: "all", id: "all" })} options={graphFocusOptions(catalog)} focus={{ kind: "all", id: "all" }} truncated={false} />,
    );
    expect(screen.getByRole("navigation", { name: "Graph focus" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Relationships in this view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Navy cotton twill/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Expand one hop" })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("offers expand on a focused view with hidden neighbours", async () => {
    const catalog = { ...emptyCatalog(), ...syntheticBusinessDataset(new Date(SNAPSHOT_AT)), updatedAt: SNAPSHOT_AT, truncated: false };
    const full = catalogGraph(catalog);
    const focused = focusGraph(full, { kind: "material", id: "NV-4410" });
    render(
      <SupplyGraphView
        graph={focused}
        options={graphFocusOptions(catalog)}
        focus={{ kind: "material", id: "NV-4410" }}
        expanded={[]}
        expandable={expandableNodeIds(full, focused)}
        truncated={false}
      />,
    );
    expect(screen.getAllByRole("link", { name: "Expand one hop" }).length).toBeGreaterThan(0);
  });
});
