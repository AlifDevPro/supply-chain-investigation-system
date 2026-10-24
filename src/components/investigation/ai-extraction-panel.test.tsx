import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AiExtractionView } from "@/lib/ai/view";
import { axeViolations } from "@/test/axe";
import { AiExtractionPanel } from "./ai-extraction-panel";

const base: AiExtractionView = {
  id: "SIG-1-AI1",
  signalId: "SIG-1",
  provider: "ollama",
  model: "qwen2.5:3b",
  promptVersion: "signal-extraction.v1",
  status: "completed",
  failure: null,
  fields: [
    { field: "delayDays", value: 4, quote: "four days late" },
    { field: "purchaseOrder", value: "PO-77410", quote: "PO-77410" },
  ],
  rejected: [{ field: "shipment", code: "not_in_source" }],
  comparison: [
    { field: "delayDays", ai: 4, rules: 4, result: "agrees" },
    { field: "purchaseOrder", ai: "PO-77410", rules: "PO-77411", result: "differs" },
    { field: "material", ai: null, rules: "NV-4410", result: "rules_only" },
  ],
  latencyMs: 812,
  attempts: 2,
  inputTokens: 310,
  outputTokens: 42,
  createdAt: "2026-10-24T09:00:00.000Z",
};
const ON = { label: "local Ollama (qwen2.5:3b)" };

describe("AiExtractionPanel", () => {
  it("shows candidates with quotes, rule comparison, dropped fields and model accounting", async () => {
    const { container } = render(<AiExtractionPanel signalId="SIG-1" extraction={base} configured={ON} />);
    expect(screen.getByRole("heading", { name: "AI extraction" })).toBeInTheDocument();
    expect(screen.getByText(/Not used in calculations/)).toBeInTheDocument();
    expect(screen.getByText("Agrees with rules")).toBeInTheDocument();
    expect(screen.getByText("Differs from rules")).toBeInTheDocument();
    expect(screen.getByText("Rules only")).toBeInTheDocument();
    expect(screen.getByText("four days late")).toBeInTheDocument();
    expect(screen.getByText("PO-77411")).toBeInTheDocument();
    expect(screen.getByText(/1 field dropped by validation/)).toHaveTextContent("Shipment");
    expect(screen.getByText("local Ollama (qwen2.5:3b)")).toBeInTheDocument();
    expect(screen.getByText(/2 attempts/)).toBeInTheDocument();
    expect(screen.getByText("310 in / 42 out")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("labels the mock provider as not a model", () => {
    render(<AiExtractionPanel signalId="SIG-1" extraction={{ ...base, provider: "mock", model: "mock-extractor-1" }} configured={ON} />);
    expect(screen.getByText(/mock provider \(deterministic, not a model\)/)).toBeInTheDocument();
    expect(screen.getByText(/Suggested by the deterministic mock extractor, not a model/)).toBeInTheDocument();
    expect(screen.queryByText(/Suggested by a model/)).toBeNull();
  });

  it.each([
    ["invalid_output", "unparseable_json", /failed validation; nothing from it was kept/],
    ["unavailable", "unreachable", /Model unavailable/],
    ["timeout", "timeout", /timed out/],
  ] as const)("states a %s result explicitly and shows no candidate values", (status, failure, text) => {
    render(
      <AiExtractionPanel
        signalId="SIG-1"
        extraction={{ ...base, status, failure, fields: [], comparison: [], rejected: [] }}
        configured={ON}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(text);
    expect(screen.getByRole("note")).toHaveTextContent(failure);
    expect(screen.queryByText("Agrees with rules")).toBeNull();
  });

  it("says AI is off when no provider is configured and nothing was recorded", () => {
    render(<AiExtractionPanel signalId="SIG-1" extraction={undefined} configured={null} />);
    expect(screen.getByText(/AI extraction is off/)).toBeInTheDocument();
  });

  it("explains a missing extraction when a provider is configured", () => {
    render(<AiExtractionPanel signalId="SIG-1" extraction={undefined} configured={ON} />);
    expect(screen.getByText(/No extraction is recorded for this signal/)).toBeInTheDocument();
  });
});
