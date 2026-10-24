import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { toInvestigationDetail } from "@/lib/data/cases";
import { MockProvider } from "@/lib/ai/mock";
import type { AiPanelData } from "@/lib/ai/view";
import type { InvestigationDetail } from "@/lib/domain";
import { seedSyntheticSignals } from "@/lib/ingestion/seed";
import { axeViolations } from "@/test/axe";
import { depsOf, memoryRuntime } from "@/test/memory-runtime";
import { CaseWorkspace } from "./case-workspace";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

let navy: InvestigationDetail;
let ai: AiPanelData;
beforeAll(async () => {
  const rt = await memoryRuntime("tenant-demo");
  await seedSyntheticSignals("tenant-demo", { repo: rt.repo, caseIndex: rt.caseIndex, investigation: depsOf(rt) });
  const item = (await rt.investigations.listCases("tenant-demo", { limit: 20 })).find((c) => c.case.title.includes("NV-4410"))!;
  const record = (await rt.investigations.getCase("tenant-demo", item.case.id))!;
  const signals = (await Promise.all(record.links.map((l) => rt.repo.getSignal("tenant-demo", l.signalId)))).filter((s) => s !== null);
  const events = await rt.repo.listEvents("tenant-demo", { limit: 200, correlationId: signals[0]!.correlationId });
  navy = toInvestigationDetail(record, signals, events);
  const latest = await rt.extractions.latestForSignals("tenant-demo", signals.map((x) => x.id));
  ai = { configured: { label: new MockProvider().label }, bySignal: latest };
});

describe("investigation workspace: persisted case", () => {
  it("shows the provisional shortage, the delivery risk and the run history", () => {
    render(<CaseWorkspace detail={navy} operator={{ enabled: false, reason: "Operator actions are turned off." }} />);
    expect(screen.getByTestId("impact-result")).toHaveTextContent("5,700 m");
    expect(screen.getByText(/not a confirmed shortage/i)).toBeInTheDocument();
    expect(screen.getByTestId("delivery-risk-result")).toHaveTextContent("1 day short");
    expect(screen.getAllByText("PRD-5106").length).toBeGreaterThan(0);
    const runs = screen.getByRole("table", { name: /investigation runs/i });
    expect(within(runs).getByText("#1")).toBeInTheDocument();
    expect(screen.getByText(/No rule-suggested actions/)).toBeInTheDocument();
    expect(screen.getByText("Operator actions are turned off.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-run investigation/i })).toBeNull();
  });

  it("offers Re-run only when the server enables operator actions", () => {
    render(<CaseWorkspace detail={navy} operator={{ enabled: true, reason: null }} />);
    expect(screen.getByRole("button", { name: /re-run investigation/i })).toBeInTheDocument();
    expect(screen.getByText(/Recorded as the signed-in user/i)).toBeInTheDocument();
  });

  it("opens evidence provenance including the source table", async () => {
    render(<CaseWorkspace detail={navy} />);
    const lineEvidence = navy.evidence.find((e) => e.sourceTable === "purchase_order_lines")!;
    await userEvent.click(screen.getAllByRole("button", { name: `Open evidence ${lineEvidence.id}` })[0]!);
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("purchase_order_lines")).toBeInTheDocument();
    expect(within(drawer).getByText("PO-77410/1")).toBeInTheDocument();
  });

  it("shows AI-extracted candidates per linked signal, separate from the calculations", () => {
    render(<CaseWorkspace detail={navy} ai={ai} />);
    expect(screen.getByRole("link", { name: "AI extraction" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: `AI extraction for ${navy.linkedSignalIds![0]}` });
    expect(within(panel).getByText(/Not used in calculations/)).toBeInTheDocument();
    expect(within(panel).getAllByText("Agrees with rules").length).toBeGreaterThan(0);
    expect(screen.getByTestId("impact-result")).toHaveTextContent("5,700 m");
  });

  it("has no AI section when the data layer provides none", () => {
    render(<CaseWorkspace detail={navy} />);
    expect(screen.queryByRole("link", { name: "AI extraction" })).toBeNull();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<CaseWorkspace detail={navy} operator={{ enabled: true, reason: null }} ai={ai} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
