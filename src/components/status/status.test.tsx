import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CLAIM_STATES, STAGES, type CaseState } from "@/lib/domain";
import { caseStateSchema } from "@/lib/domain";
import { axeViolations } from "@/test/axe";
import { ClaimStateBadge, CLAIM_STATE_LABEL } from "./claim-state-badge";
import { CaseStateBadge } from "./case-state-badge";
import { EventStatus } from "./event-status";
import { SeverityIndicator } from "./severity-indicator";
import { ConnectionStatus } from "../provenance/connection-status";
import { FreshnessIndicator } from "../provenance/freshness-indicator";
import { DataModeBadge } from "../provenance/data-mode-badge";
import { StaleDataBanner } from "../states/state-views";

describe("status components never rely on color alone", () => {
  it.each(CLAIM_STATES)("claim state %s renders a visible text label and an icon", (state) => {
    const { container } = render(<ClaimStateBadge state={state} />);
    expect(screen.getByText(CLAIM_STATE_LABEL[state])).toBeVisible();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("every claim state has a distinct label", () => {
    const labels = new Set(CLAIM_STATES.map((s) => CLAIM_STATE_LABEL[s]));
    expect(labels.size).toBe(CLAIM_STATES.length);
  });

  it.each(caseStateSchema.options as readonly CaseState[])("case state %s renders text", (state) => {
    const { container } = render(<CaseStateBadge state={state} />);
    expect(container.textContent?.length).toBeGreaterThan(2);
  });

  it.each(["critical", "high", "medium", "low"] as const)("severity %s exposes its label", (sev) => {
    const { container } = render(<SeverityIndicator severity={sev} />);
    expect(container.textContent?.toLowerCase()).toContain(sev);
  });

  it("severity glyph is hidden from assistive tech and label-only mode keeps an accessible name", () => {
    render(<SeverityIndicator severity="high" showLabel={false} />);
    expect(screen.getByText("High severity")).toHaveClass("sr-only");
  });

  it.each(["completed", "failed", "retrying", "waiting", "skipped"] as const)("event status %s has text", (s) => {
    const { container } = render(<EventStatus status={s} />);
    expect(container.textContent?.length).toBeGreaterThan(3);
  });

  it("covers every stage name used by Live Activity", () => {
    expect(STAGES.length).toBe(11);
  });
});

describe("provenance components", () => {
  it("labels synthetic data", () => {
    render(<DataModeBadge />);
    expect(screen.getByText(/synthetic/i)).toBeVisible();
  });

  it("states staleness in text, not only color", () => {
    render(<FreshnessIndicator asOf="2026-10-24T04:10:00Z" source="synthetic fixture" stale />);
    expect(screen.getByText(/Stale/)).toBeVisible();
  });

  it("formats timestamps in UTC deterministically", () => {
    render(<FreshnessIndicator asOf="2026-10-24T04:10:00Z" source="synthetic fixture" />);
    expect(screen.getByText("24 Oct 2026 04:10 UTC")).toBeInTheDocument();
  });

  it.each(["replay", "snapshot", "connected", "reconnecting", "stale", "disconnected"] as const)("connection state %s is labelled", (state) => {
    render(<ConnectionStatus state={state} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", state);
  });

  it("has no axe violations across the status family", async () => {
    const { container } = render(
      <div>
        {CLAIM_STATES.map((s) => (
          <ClaimStateBadge key={s} state={s} />
        ))}
        <SeverityIndicator severity="critical" />
        <EventStatus status="failed" />
        <ConnectionStatus state="reconnecting" />
        <StaleDataBanner />
        <DataModeBadge />
      </div>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
