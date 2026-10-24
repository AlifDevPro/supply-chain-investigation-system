"use server";

import { revalidatePath } from "next/cache";
import { requireSession, SessionError } from "@/lib/auth/session";
import { getOperatorAvailability } from "@/lib/data";
import { investigateSignal, InvestigationNotFoundError, reinvestigateCase, type InvestigationOutcome } from "@/lib/investigation/run";
import { logEvent } from "@/lib/log";
import { getOperatorLimiter, getRuntime, investigationDeps } from "@/lib/runtime";
import type { OperatorState } from "./operator-state";

const SIGNAL_ID = /^SIG-\d{1,12}$/;
const CASE_ID = /^INV-\d{1,12}$/;

const MESSAGES: Record<InvestigationOutcome["status"], string> = {
  created: "Investigation opened.",
  updated: "Investigation re-run; a new run was recorded.",
  held: "The signal is still held.",
  skipped: "Nothing to do: the signal is already linked to a case or is not eligible.",
  failed: "The investigation failed. The signal is still stored; the failure is recorded in Live Activity.",
};

/**
 * Common gate for operator actions. Requires a signed-in session, the configuration flag, a rate limit,
 * and the server-configured tenant. The actor is the signed-in display name.
 */
async function run(kind: "open" | "rerun", id: unknown, pattern: RegExp, fn: (tenantId: string, id: string, actor: string) => Promise<InvestigationOutcome>): Promise<OperatorState> {
  try {
    const actor = await requireSession();
    const availability = getOperatorAvailability();
    if (!availability.enabled) return { status: "error", message: availability.reason ?? "Operator actions are unavailable." };
    if (typeof id !== "string" || !pattern.test(id)) return { status: "error", message: "Invalid identifier." };
    if (!getOperatorLimiter().check(`operator-${kind}`).allowed) {
      return { status: "error", message: "Too many operator actions. Wait a minute and try again." };
    }
    const runtime = await getRuntime();
    if (!runtime) return { status: "error", message: "No store is configured." };
    if (actor.tenantId !== runtime.tenantId) return { status: "error", message: "Not found for this tenant." };
    const outcome = await fn(runtime.tenantId, id, actor.displayName);
    logEvent("info", `operator.${kind}`, { id, actor: actor.displayName, userId: actor.userId, outcome: outcome.status, caseId: outcome.caseId });
    revalidatePath("/investigations");
    revalidatePath("/live-activity");
    revalidatePath("/review");
    revalidatePath("/");
    if (outcome.caseId) revalidatePath(`/investigations/${outcome.caseId}`);
    return { status: "done", outcome: outcome.status, caseId: outcome.caseId, message: MESSAGES[outcome.status] };
  } catch (error) {
    if (error instanceof SessionError) return { status: "error", message: "Sign in required." };
    if (error instanceof InvestigationNotFoundError) return { status: "error", message: "Not found for this tenant." };
    logEvent("error", `operator.${kind}.failed`, { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return { status: "error", message: "The store is unavailable. Nothing was changed." };
  }
}

export async function openInvestigation(_previous: OperatorState, formData: FormData): Promise<OperatorState> {
  return run("open", formData.get("signalId"), SIGNAL_ID, async (tenantId, id, actor) => {
    const runtime = (await getRuntime())!;
    return investigateSignal(tenantId, id, investigationDeps(runtime), { operator: true, actor });
  });
}

export async function rerunInvestigation(_previous: OperatorState, formData: FormData): Promise<OperatorState> {
  return run("rerun", formData.get("caseId"), CASE_ID, async (tenantId, id, actor) => {
    const runtime = (await getRuntime())!;
    return reinvestigateCase(tenantId, id, investigationDeps(runtime), { trigger: "operator_rerun", actor });
  });
}
