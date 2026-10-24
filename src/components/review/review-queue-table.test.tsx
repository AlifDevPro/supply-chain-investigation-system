import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { cases, signals, SNAPSHOT_AT } from "@/fixtures/dataset";
import { signalToRecord } from "@/lib/data/records";
import { buildReviewQueue } from "@/lib/derive";
import { axeViolations } from "@/test/axe";
import { ReviewQueueTable } from "./review-queue-table";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

describe("ReviewQueueTable", () => {
  it("lists queue items and keeps approve disabled", async () => {
    const items = buildReviewQueue(signals.map(signalToRecord), cases, SNAPSHOT_AT);
    const { container } = render(
      <ReviewQueueTable items={items} operator={{ enabled: false, reason: "Operator actions are turned off." }} role="reviewer" persisted={false} />,
    );
    expect(screen.getByRole("table", { name: "Review queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request more evidence" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(screen.getByText(/Fixture records cannot receive a review decision/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});
