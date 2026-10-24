import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IntegrationsData } from "@/lib/data/pages";
import { axeViolations } from "@/test/axe";
import { IntegrationsView } from "./integrations-view";

const SAMPLE: IntegrationsData = {
  freshness: { asOf: "2026-10-24T08:00:00.000Z", source: "stored records", stale: false, note: null },
  ingest: {
    keyConfigured: false,
    lastReceived: "2026-10-24T07:00:00.000Z",
    bySystem: [{ system: "supplier-email", count: 3, lastReceived: "2026-10-24T07:00:00.000Z" }],
  },
  store: { mode: "fixtures", migrations: null },
  ai: { label: null, latestStatus: null, latestAt: null, count: 0 },
};

describe("IntegrationsView", () => {
  it("states observed facts and does not claim health", async () => {
    const { container } = render(<IntegrationsView data={SAMPLE} />);
    expect(screen.getByRole("heading", { name: "Ingest API" })).toBeInTheDocument();
    expect(screen.getByText(/does not claim the API is healthy/)).toBeInTheDocument();
    expect(screen.queryByText(/\bconnected\b/i)).toBeNull();
    expect(screen.getByText("not configured")).toBeInTheDocument();
    expect(screen.getAllByText("Phase 6").length).toBeGreaterThan(0);
    expect(await axeViolations(container)).toEqual([]);
  });
});
