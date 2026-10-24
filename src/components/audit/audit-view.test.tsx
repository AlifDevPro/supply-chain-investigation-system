import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { events } from "@/fixtures/dataset";
import { auditTrail } from "@/lib/derive";
import { axeViolations } from "@/test/axe";
import { AuditView } from "./audit-view";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

describe("AuditView", () => {
  it("shows the trail, the posture panel, and a disabled export", async () => {
    const { container } = render(<AuditView rows={auditTrail(events)} inspection={null} storeMode="fixtures" />);
    expect(screen.getByRole("heading", { name: "Security posture" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Audit trail from append-only events" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText(/Signed session cookie/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});
