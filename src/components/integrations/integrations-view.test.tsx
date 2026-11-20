import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IntegrationsViewData } from "@/components/integrations/types";
import { axeViolations } from "@/test/axe";
import { IntegrationsView } from "./integrations-view";

vi.mock("@/app/(workspace)/integrations/actions", () => ({
  fetchIntegrationActivity: async () => ({ error: "Sign in required." }),
  runConnectorNow: async () => ({ status: "idle" }),
  mcpSmokeCall: async () => ({ status: "idle" }),
}));

const SAMPLE: IntegrationsViewData = {
  ingest: {
    keyConfigured: false,
    lastReceived: "2026-10-24T07:00:00.000Z",
    bySystem: [{ system: "supplier-email", count: 3, lastReceived: "2026-10-24T07:00:00.000Z" }],
  },
  store: { mode: "fixtures", migrations: null },
  ai: { label: null, latestStatus: null, latestAt: null, count: 0 },
  mcp: {
    keyConfigured: false,
    tools: [{ name: "get_purchase_order", description: "Read one purchase order." }],
    recentCalls: [],
  },
  connectors: [
    { id: "mailbox", label: "Supplier email mailbox", version: "mailbox.v1", configured: false, lastRun: null },
    { id: "erp_po", label: "ERP purchase-order connector", version: "erp_po.v1", configured: false, lastRun: null },
    { id: "carrier", label: "Carrier tracking feed", version: "carrier.v1", configured: false, lastRun: null },
  ],
  canOperate: false,
  operateReason: "Sign in to run connectors or an MCP smoke call.",
};

describe("IntegrationsView", () => {
  it("states observed facts and does not claim health", async () => {
    const { container } = render(<IntegrationsView data={SAMPLE} />);
    expect(screen.getByRole("heading", { name: "Ingest API" })).toBeInTheDocument();
    expect(screen.getByText(/does not claim the API is healthy/)).toBeInTheDocument();
    expect(screen.queryByText(/\bconnected\b/i)).toBeNull();
    expect(screen.getAllByText("not configured").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "MCP" })).toBeInTheDocument();
    expect(screen.getByText("get_purchase_order")).toBeInTheDocument();
    expect(screen.getByText("Supplier email mailbox")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});
