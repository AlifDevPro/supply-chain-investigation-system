"use server";

import { revalidatePath } from "next/cache";
import { getSubmitAvailability } from "@/lib/data";
import { getEnv } from "@/lib/env";
import { ingestAndInvestigate } from "@/lib/investigation/ingest";
import { getLimiters, getRuntime, investigationDeps } from "@/lib/runtime";
import { logEvent } from "@/lib/log";
import type { SubmitState } from "./submit-state";

/**
 * Submits one SYNTHETIC signal through the same pipeline as POST /api/signals. The server re-checks that
 * submission is enabled and always uses the server-configured tenant; the form cannot choose one.
 * Still gated by configuration. Sign-in is required for the app shell; ingest remains key-based.
 */
export async function submitSyntheticSignal(_previous: SubmitState, formData: FormData): Promise<SubmitState> {
  const availability = getSubmitAvailability();
  if (!availability.enabled) {
    return { status: "error", message: availability.reason ?? "Submission is unavailable." };
  }
  const payload = formData.get("payload");
  if (typeof payload !== "string" || payload.trim() === "") {
    return { status: "error", message: "Enter a JSON payload or choose a preset." };
  }
  if (!getLimiters().limiter.check("synthetic-submit").allowed) {
    return { status: "error", message: "Too many submissions. Wait a minute and try again." };
  }

  try {
    const runtime = await getRuntime();
    if (!runtime) return { status: "error", message: "No signal store is configured." };
    const { outcome, investigation, extraction } = await ingestAndInvestigate(getEnv().DEMO_TENANT_ID, payload, {
      repo: runtime.repo,
      caseIndex: runtime.caseIndex,
      investigation: investigationDeps(runtime),
    });
    revalidatePath("/live-activity");
    revalidatePath("/investigations");
    revalidatePath("/");
    if (outcome.kind === "rejected") {
      return { status: "done", kind: "rejected", signalId: outcome.signalId, correlationId: outcome.correlationId, issues: outcome.issues };
    }
    return {
      status: "done",
      kind: outcome.kind,
      signalId: outcome.signalId,
      correlationId: outcome.correlationId,
      dedupeStatus: outcome.dedupe.status,
      duplicateOf: outcome.dedupe.duplicateOf,
      revisionOf: outcome.dedupe.revisionOf,
      triageOutcome: outcome.kind === "accepted" ? outcome.triage.outcome : null,
      reasonCodes: outcome.kind === "accepted" ? outcome.triage.reasonCodes : [],
      requiresReview: outcome.kind === "accepted" ? outcome.requiresReview : false,
      investigation: investigation?.status ?? "skipped",
      caseId: investigation?.caseId ?? null,
      extraction: extraction?.status ?? "skipped",
    };
  } catch (error) {
    logEvent("error", "submit.failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return { status: "error", message: "The signal store is unavailable. Nothing was stored." };
  }
}
