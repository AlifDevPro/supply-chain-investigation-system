import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmitState } from "@/app/(workspace)/live-activity/submit-state";
import { axeViolations } from "@/test/axe";

const submit = vi.fn<(prev: SubmitState, formData: FormData) => Promise<SubmitState>>();
vi.mock("@/app/(workspace)/live-activity/actions", () => ({
  submitSyntheticSignal: (prev: SubmitState, formData: FormData) => submit(prev, formData),
}));

import { SubmitSignalSheet } from "./submit-signal-sheet";

beforeEach(() => submit.mockReset());

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Submit synthetic signal/ }));
  return user;
}

describe("SubmitSignalSheet", () => {
  it("is disabled and explains why when submission is off", () => {
    render(<SubmitSignalSheet enabled={false} reason="Submitting needs DATA_SOURCE=memory or database." />);
    const button = screen.getByRole("button", { name: /Submit synthetic signal/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Submitting needs DATA_SOURCE=memory or database.");
  });

  it("offers presets that fill an editable payload, with the expected outcome stated", async () => {
    render(<SubmitSignalSheet enabled reason={null} />);
    const user = await open();
    const payload = screen.getByLabelText(/Payload/) as HTMLTextAreaElement;
    expect(payload.value).toContain("MSG-FORM-1");
    await user.selectOptions(screen.getByLabelText("Preset"), "quality-failure");
    expect(payload.value).toContain("inspectionResult");
    expect(screen.getByText(/Expected: high impact/)).toBeInTheDocument();
    await user.clear(payload);
    await user.type(payload, "{{}");
    expect(payload.value).toBe("{}");
  });

  it("sends the payload text to the server action and shows a duplicate result", async () => {
    submit.mockResolvedValue({
      status: "done", kind: "duplicate", signalId: "SIG-9010", correlationId: "corr-9010",
      dedupeStatus: "duplicate", duplicateOf: "SIG-9001", revisionOf: null, triageOutcome: null, reasonCodes: [], requiresReview: false, investigation: "skipped", caseId: null, extraction: "skipped",
    });
    render(<SubmitSignalSheet enabled reason={null} />);
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("duplicate of SIG-9001"));
    const sent = submit.mock.calls[0]![1];
    expect(String(sent.get("payload"))).toContain("MSG-FORM-1");
    expect(screen.getByRole("status")).toHaveTextContent("Duplicate");
  });

  it("shows field paths and codes for a rejected signal, never values", async () => {
    submit.mockResolvedValue({
      status: "done", kind: "rejected", signalId: "SIG-9011", correlationId: "corr-9011",
      issues: [{ path: "label", code: "too_small" }, { path: "dataMode", code: "invalid_value" }],
    });
    render(<SubmitSignalSheet enabled reason={null} />);
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("label: too_small"));
    expect(screen.getByRole("status")).toHaveTextContent("Rejected: invalid input");
    expect(screen.getByRole("status")).toHaveTextContent("dataMode: invalid_value");
  });

  it("shows an accepted held-for-review result with its reasons", async () => {
    submit.mockResolvedValue({
      status: "done", kind: "accepted", signalId: "SIG-9012", correlationId: "corr-9012",
      dedupeStatus: "unique", duplicateOf: null, revisionOf: null, triageOutcome: "uncertain",
      reasonCodes: ["no_rule_matched", "hedged_language"], requiresReview: true, investigation: "held", caseId: null, extraction: "completed",
    });
    render(<SubmitSignalSheet enabled reason={null} />);
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("no_rule_matched, hedged_language"));
    expect(screen.getByRole("status")).toHaveTextContent("Held for review");
    expect(screen.getByRole("status")).toHaveTextContent("Uncertain, kept for review");
    expect(screen.getByRole("status")).toHaveTextContent("Candidate facts extracted (not used in calculations)");
  });

  it("announces a failure to store as an alert", async () => {
    submit.mockResolvedValue({ status: "error", message: "The signal store is unavailable. Nothing was stored." });
    render(<SubmitSignalSheet enabled reason={null} />);
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nothing was stored"));
  });

  it("has no axe violations when open", async () => {
    render(<SubmitSignalSheet enabled reason={null} />);
    await open();
    const dialog = await screen.findByRole("dialog");
    expect(await axeViolations(dialog)).toEqual([]);
  });
});
