import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SignalRecord } from "@/lib/domain";
import { axeViolations } from "@/test/axe";
import { RecentSignals } from "./recent-signals";

const base: SignalRecord = {
  id: "SIG-9001",
  correlationId: "corr-9001",
  receivedAt: "2026-10-24T09:00:00.000Z",
  sourceType: "supplier_email",
  sourceSystem: "Mailbox (synthetic)",
  label: "Supplier notice: PO-77210 delayed",
  processingStatus: "triaged",
  dedupeStatus: "unique",
  duplicateOf: null,
  revisionOf: null,
  triageOutcome: "relevant",
  reasonCodes: ["delay_language_with_po"],
  requiresReview: false,
  ruleVersion: "triage.v1",
  caseId: null,
  dataMode: "synthetic",
};

const signals: SignalRecord[] = [
  base,
  { ...base, id: "SIG-9002", label: "Possible schedule change", triageOutcome: "uncertain", processingStatus: "held_for_review", requiresReview: true },
  { ...base, id: "SIG-9003", processingStatus: "duplicate", dedupeStatus: "duplicate", duplicateOf: "SIG-9001", triageOutcome: null },
  { ...base, id: "SIG-9004", dedupeStatus: "revision", revisionOf: "SIG-9001", processingStatus: "held_for_review", requiresReview: true },
  { ...base, id: "SIG-9005", sourceType: null, sourceSystem: null, label: null, processingStatus: "rejected", dedupeStatus: null, triageOutcome: null },
];

describe("RecentSignals (Phase 2 handling)", () => {
  it("shows how each signal was handled as text: triaged, held, duplicate, revision and rejected", () => {
    render(<RecentSignals signals={signals} />);
    expect(screen.getByText("Held for review (2)")).toBeInTheDocument();
    expect(screen.getAllByText("Held for review").length).toBe(2);
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("of SIG-9001")).toBeInTheDocument();
    expect(screen.getByText("Revision")).toBeInTheDocument();
    expect(screen.getByText("revises SIG-9001")).toBeInTheDocument();
    expect(screen.getByText("Rejected: invalid input")).toBeInTheDocument();
  });

  it("labels a rejected signal without inventing a label or source", () => {
    render(<RecentSignals signals={signals} />);
    expect(screen.getByText("Rejected submission (no content stored)")).toBeInTheDocument();
    expect(screen.getByText("Source unknown")).toBeInTheDocument();
  });

  it("filters to held-for-review signals with an accessible pressed state, and can return to all", async () => {
    const user = userEvent.setup();
    render(<RecentSignals signals={signals} />);
    const held = screen.getByRole("button", { name: "Held for review (2)" });
    expect(held).toHaveAttribute("aria-pressed", "false");
    await user.click(held);
    expect(held).toHaveAttribute("aria-pressed", "true");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("SIG-9002")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All (5)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("says so when nothing is held for review", async () => {
    const user = userEvent.setup();
    render(<RecentSignals signals={[base]} />);
    await user.click(screen.getByRole("button", { name: "Held for review (0)" }));
    expect(screen.getByText("No recent signals are held for review.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<RecentSignals signals={signals} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
