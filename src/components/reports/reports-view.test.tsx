import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cases, events, SNAPSHOT_AT, signals } from "@/fixtures/dataset";
import { signalToRecord } from "@/lib/data/records";
import { computeReportMetrics } from "@/lib/derive";
import { axeViolations } from "@/test/axe";
import { ReportsView } from "./reports-view";

describe("ReportsView", () => {
  it("states formulas and the empty verified-outcomes section", async () => {
    const metrics = computeReportMetrics({
      window: "all",
      now: new Date(SNAPSHOT_AT),
      signals: signals.map(signalToRecord),
      events,
      cases,
      findings: [{ unknowns: 2, conflicts: 1 }],
      extractions: [],
    });
    const { container } = render(<ReportsView metrics={metrics} asOf={SNAPSHOT_AT} />);
    expect(screen.getByRole("heading", { name: "Verified outcomes" })).toBeInTheDocument();
    expect(screen.getByText(/None are recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /How "Signals in window" is calculated/ })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});
