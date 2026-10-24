import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { getInvestigationDetail } from "@/lib/data";
import type { InvestigationDetail } from "@/lib/domain";
import { axeViolations } from "@/test/axe";
import { CaseWorkspace } from "./case-workspace";

// Radix portals and layout observers expect these browser APIs.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

let detail2041: InvestigationDetail;
let detail2043: InvestigationDetail;
beforeAll(async () => {
  detail2041 = (await getInvestigationDetail("INV-2041")).detail;
  detail2043 = (await getInvestigationDetail("INV-2043")).detail;
});

describe("investigation workspace: INV-2041 (README example)", () => {
  it("shows the shortage as provisional, never as a confirmed figure", () => {
    render(<CaseWorkspace detail={detail2041} />);
    expect(screen.getByTestId("impact-result")).toHaveTextContent("5,500 m");
    // Header tile and calculation card both carry the status in words.
    expect(screen.getAllByText("Provisional").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Verified", { selector: "[data-impact-status]" })).toBeNull();
    expect(screen.getByText(/not a confirmed shortage/i)).toBeInTheDocument();
  });

  it("renders every claim state with a text label and keeps conflicted and stale claims visible", () => {
    render(<CaseWorkspace detail={detail2041} />);
    const table = screen.getByRole("table", { name: /claims and their verification state/i });
    for (const label of ["Reported", "Verified", "Stale", "Inferred", "Assumed", "Conflicted"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("exposes assumptions and what would change the result", () => {
    render(<CaseWorkspace detail={detail2041} />);
    expect(screen.getByText(/Reservations were not retrieved/)).toBeInTheDocument();
    expect(screen.getByText(/Quality status is unknown/)).toBeInTheDocument();
    expect(screen.getByText("What would change this result")).toBeInTheDocument();
    expect(screen.getByText("Reservation records not retrieved")).toBeInTheDocument();
  });

  it("shows both sides of the conflicting arrival dates", () => {
    render(<CaseWorkspace detail={detail2041} />);
    expect(screen.getByText(/about 30 Oct/)).toBeInTheDocument();
    expect(screen.getByText(/Estimated arrival 27 Oct/)).toBeInTheDocument();
  });

  it("labels inferred relationships as inferred, in words", () => {
    render(<CaseWorkspace detail={detail2041} />);
    expect(screen.getByText("Inferred link")).toBeInTheDocument();
    expect(screen.getAllByText("Verified link").length).toBeGreaterThan(0);
  });

  it("presents proposed actions as unapproved with disabled approval controls and a stated reason", () => {
    render(<CaseWorkspace detail={detail2041} />);
    expect(screen.getByText("AI-suggested, not approved")).toBeInTheDocument();
    const approve = screen.getAllByRole("button", { name: "Approve" });
    const reject = screen.getAllByRole("button", { name: "Reject" });
    expect(approve).toHaveLength(2);
    for (const b of [...approve, ...reject]) {
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(/cannot be approved/i);
    }
  });

  it("opens a source excerpt drawer with provenance when evidence is selected", async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace detail={detail2041} />);
    await user.click(screen.getAllByRole("button", { name: "Open evidence EV-2041-04" })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Inventory balance, Plant 2 warehouse W2")).toBeInTheDocument();
    expect(within(dialog).getByText("BAL-9012")).toBeInTheDocument();
    expect(within(dialog).getByText("Record version")).toBeInTheDocument();
    expect(within(dialog).getByText(/Excerpt \(minimal, not the full record\)/)).toBeInTheDocument();
  });

  it("switches the right rail between evidence, timeline and audit", async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace detail={detail2041} />);
    await user.click(screen.getByRole("tab", { name: "Audit" }));
    expect(await screen.findByRole("list", { name: "Audit history" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(await screen.findByRole("list", { name: "Recorded events" })).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<CaseWorkspace detail={detail2041} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("investigation workspace: case without evidence-level detail", () => {
  it("says the detail is absent from the dataset instead of inventing evidence or claiming none exists", () => {
    render(<CaseWorkspace detail={detail2043} />);
    expect(screen.getByText("No evidence-level detail in this demo")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is inferred from its absence/)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /claims/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText(/No evidence items are recorded/)).toBeInTheDocument();
  });

  it("does not point to 'below' for unverified inputs that this demo does not contain", () => {
    render(<CaseWorkspace detail={detail2043} />);
    expect(screen.getByText(/Its inputs are not included in this demo/)).toBeInTheDocument();
    expect(screen.queryByText(/still unverified below/)).toBeNull();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<CaseWorkspace detail={detail2043} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
