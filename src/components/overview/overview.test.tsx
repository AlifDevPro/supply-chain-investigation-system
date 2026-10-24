import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { MetricCard } from "@/components/common/metric-card";
import { DataErrorView } from "@/components/states/data-error-view";
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState, StaleDataBanner } from "@/components/states/state-views";
import { AccessDeniedError, DataUnavailableError, getOverviewData } from "@/lib/data";
import type { OverviewData } from "@/lib/data";
import { axeViolations } from "@/test/axe";
import { AttentionList } from "./attention-list";
import { RecentEvents } from "./recent-events";
import { RecentSignals } from "./recent-signals";
import { StageDistribution } from "./stage-distribution";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

let data: OverviewData;
beforeAll(async () => {
  data = await getOverviewData();
});

describe("Overview building blocks", () => {
  it("lists cases that need attention with the reason and the next step, most severe first", () => {
    render(<AttentionList items={data.attention} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Critical");
    expect(items[0]).toHaveTextContent("Why:");
    expect(items[0]).toHaveTextContent("Next:");
    expect(screen.getAllByRole("link", { name: /^Open INV-/ }).length).toBe(data.attention.length);
  });

  it("splits orders at risk and shortages into verified and provisional counts", () => {
    expect(data.metrics.ordersAtRisk.total).toBe(data.metrics.ordersAtRisk.verified + data.metrics.ordersAtRisk.provisional);
    expect(data.metrics.shortages.total).toBe(data.metrics.shortages.verified + data.metrics.shortages.provisional);
    // The README example is the only quantified shortage here that is not verified; none is verified in the fixture.
    expect(data.metrics.shortages.verified).toBe(0);
  });

  it("states how a metric is calculated, from where, and as of when", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MetricCard
        label="Awaiting review"
        value={3}
        qualifier="Need a human decision"
        definition={{ formula: "Count of active cases in review states.", source: "Synthetic fixture", window: "Snapshot" }}
        asOf="2026-10-24T04:10:00Z"
      />,
    );
    expect(container).toHaveTextContent("As of 24 Oct 2026 04:10 UTC");
    expect(container).toHaveTextContent(/synthetic/i);
    expect(screen.queryByText(/Count of active cases in review states/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /How "Awaiting review" is calculated/ }));
    expect(await screen.findByText(/Count of active cases in review states/)).toBeInTheDocument();
  });

  it("shows stage distribution as counts with text, not only bar length", () => {
    render(<StageDistribution rows={data.distribution} />);
    const list = screen.getByRole("list");
    expect(within(list).getByText("Needs review")).toBeInTheDocument();
    expect(list).toHaveTextContent("3");
  });

  it("shows recent signals with their triage outcome as text, including uncertain signals kept for review", () => {
    render(<RecentSignals signals={data.recentSignals} />);
    expect(screen.getAllByText("Uncertain, kept for review").length).toBeGreaterThan(0);
  });

  it("shows failed events with the word 'Failed'", () => {
    render(<RecentEvents events={data.recentEvents} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders explicit empty copy for each list", () => {
    render(
      <>
        <AttentionList items={[]} />
        <RecentSignals signals={[]} />
        <RecentEvents events={[]} />
      </>,
    );
    expect(screen.getByText("No signals received")).toBeInTheDocument();
    expect(screen.getByText("No important events")).toBeInTheDocument();
  });
});

describe("non-happy states", () => {
  it("maps typed data errors to distinct states and never echoes the raw message", () => {
    const secret = "SELECT * FROM suppliers; password=hunter2";
    const { rerender } = render(<DataErrorView error={new DataUnavailableError(secret)} what="the overview" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the overview");
    expect(document.body).not.toHaveTextContent("hunter2");

    rerender(<DataErrorView error={new AccessDeniedError()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("You do not have access to this data");

    rerender(<DataErrorView error={new Error(secret)} what="this view" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong loading this view");
    expect(document.body).not.toHaveTextContent("hunter2");
  });

  it("announces loading as busy and stale data as a status", () => {
    render(
      <>
        <LoadingState label="Loading investigations" />
        <StaleDataBanner />
      </>,
    );
    expect(screen.getByRole("status", { busy: true })).toHaveTextContent("Loading investigations");
    expect(screen.getByText("Stale data.")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations across the state views", async () => {
    const { container } = render(
      <div>
        <EmptyState title="Nothing here">Explanation</EmptyState>
        <ErrorState />
        <PermissionDeniedState />
        <StaleDataBanner />
      </div>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
