import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { getActivityData } from "@/lib/data";
import type { ActivityData } from "@/lib/data";
import { axeViolations } from "@/test/axe";
import { EventLog } from "./event-log";
import { PipelineStageRail } from "./pipeline-stage-rail";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

let data: ActivityData;
beforeAll(async () => {
  data = await getActivityData();
});

describe("PipelineStageRail", () => {
  it("lists all eleven stages and says 'No events' for a stage nobody reached", () => {
    render(<PipelineStageRail summary={data.stages} />);
    const list = screen.getByRole("list", { name: "Pipeline stages" });
    expect(within(list).getAllByText(/^(0[1-9]|1[01])$/, { selector: "span" })).toHaveLength(11);
    const verified = screen.getByText("Outcome verified").closest("li")!;
    expect(within(verified).getByText("No events")).toBeInTheDocument();
  });

  it("shows failures and waiting states in words, not just colour", () => {
    render(<PipelineStageRail summary={data.stages} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("awaiting review")).toBeInTheDocument();
  });
});

describe("EventLog", () => {
  it("renders recorded events with 'not measured' where no duration exists", () => {
    render(<EventLog events={data.events} signals={data.signals} />);
    expect(screen.getByRole("table", { name: "Recorded events" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
  });

  it("opens a trace that marks unreached stages as 'No event recorded'", async () => {
    const user = userEvent.setup();
    render(<EventLog events={data.events} signals={data.signals} />);
    const traceButtons = screen.getAllByRole("button", { name: /Open trace for .* on SIG-8848/ });
    await user.click(traceButtons[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Signal trace")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/No event recorded/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText("corr-8848")).toBeInTheDocument();
  });

  it("shows the AI extraction state in the trace only when the data layer provides it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EventLog events={data.events} signals={data.signals} ai={{ configured: null, bySignal: {} }} />);
    await user.click(screen.getAllByRole("button", { name: /Open trace for .* on SIG-8848/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/AI extraction is off/)).toBeInTheDocument();
    unmount();

    render(<EventLog events={data.events} signals={data.signals} />);
    await user.click(screen.getAllByRole("button", { name: /Open trace for .* on SIG-8848/ })[0]!);
    expect(within(await screen.findByRole("dialog")).queryByText(/AI-extracted candidates/)).toBeNull();
  });

  it("shows a distinct empty message when there are no events", () => {
    render(<EventLog events={[]} signals={[]} />);
    expect(screen.getByText("No events are recorded.")).toBeInTheDocument();
  });

  it("drops duplicate deliveries of the same event id", () => {
    const first = data.events[0]!;
    render(<EventLog events={[first, first, first]} signals={data.signals} />);
    expect(screen.getByText("1")).toBeInTheDocument(); // "1 row"
  });

  it("holds new events while paused and says how many are waiting", async () => {
    const user = userEvent.setup();
    const initial = data.events.slice(0, 3);
    const { rerender } = render(<EventLog events={initial} signals={data.signals} pauseable />);
    await user.click(screen.getByRole("button", { name: /pause updates/i }));
    rerender(<EventLog events={data.events.slice(0, 5)} signals={data.signals} pauseable />);
    expect(screen.getByRole("status")).toHaveTextContent("2 new events are held");
    await user.click(screen.getByRole("button", { name: /resume updates/i }));
    expect(screen.queryByText(/held while updates are paused/)).toBeNull();
  });

  it("does not render a pause control in replay mode", () => {
    render(<EventLog events={data.events} signals={data.signals} />);
    expect(screen.queryByRole("button", { name: /pause updates/i })).toBeNull();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <>
        <PipelineStageRail summary={data.stages} />
        <EventLog events={data.events} signals={data.signals} />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
