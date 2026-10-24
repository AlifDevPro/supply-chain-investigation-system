import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { evidence2041 } from "@/fixtures/investigation-2041";
import { axeViolations } from "@/test/axe";
import { EvidenceExplorer } from "./evidence-explorer";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.hasPointerCapture ??= () => false;
});

describe("EvidenceExplorer", () => {
  it("opens provenance for a row", async () => {
    const { container } = render(<EvidenceExplorer evidence={evidence2041} />);
    expect(screen.getByRole("table", { name: /Evidence from the latest run/ })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: `Open evidence ${evidence2041[0]!.id}` })[0]!);
    expect(await screen.findByRole("dialog")).toHaveTextContent(evidence2041[0]!.sourceSystem);
    expect(await axeViolations(container)).toEqual([]);
  });
});
