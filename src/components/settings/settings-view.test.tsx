import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SettingsData } from "@/lib/data/pages";
import { axeViolations } from "@/test/axe";
import { SettingsView } from "./settings-view";

const SAMPLE: SettingsData = {
  freshness: { asOf: "2026-10-24T08:00:00.000Z", source: "server configuration (no secret values)", stale: false, note: null },
  dataSource: "fixtures",
  tenantId: "tenant-demo",
  ingestKey: "not set",
  databaseUrl: "not set",
  sessionSecret: "not set",
  googleSignIn: "not set",
  authMode: "signed session cookie; email sign-up (reviewer) and optional Google",
  enableSyntheticSubmit: false,
  enableOperatorActions: false,
  aiProvider: "none",
  ollamaModel: "not set",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  aiTimeoutMs: 15000,
  aiMaxRetries: 1,
  ruleVersions: { triage: "triage.v1", extraction: "signal-extraction.v1" },
};

describe("SettingsView", () => {
  it("shows set/not set for secrets and disables editing", async () => {
    const data = SAMPLE;
    const { container } = render(<SettingsView data={data} />);
    expect(screen.getByText("DATABASE_URL")).toBeInTheDocument();
    expect(screen.queryByText(/postgres(ql)?:\/\//i)).toBeNull();
    expect(screen.getByRole("button", { name: "Edit settings" })).toBeDisabled();
    expect(await axeViolations(container)).toEqual([]);
  });
});
