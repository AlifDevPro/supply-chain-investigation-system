"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approveAction, rejectAction } from "@/lib/actions/approve";
import { executeSynthetic } from "@/lib/actions/execute";
import { recordOutcomeObservation } from "@/lib/actions/verify";
import { ActionNotFoundError, AuthorizationDeniedError, StaleApprovalError } from "@/lib/actions/errors";
import { requireSession, SessionError } from "@/lib/auth/session";
import { logEvent } from "@/lib/log";
import { getRuntime } from "@/lib/runtime";
import type { ActionActionState } from "./action-state";

const approveSchema = z.object({
  actionId: z.string().min(1).max(80),
  version: z.coerce.number().int().positive(),
  digest: z.string().length(64),
  caseId: z.string().regex(/^INV-\d{1,12}$/),
});

function fail(error: unknown): ActionActionState {
  if (error instanceof SessionError) return { status: "error", message: "Sign in required." };
  if (error instanceof AuthorizationDeniedError || error instanceof StaleApprovalError || error instanceof ActionNotFoundError) {
    return { status: "error", message: error.message };
  }
  logEvent("error", "action.failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
  return { status: "error", message: "The action could not be completed." };
}

async function gate() {
  const actor = await requireSession();
  const runtime = await getRuntime();
  if (!runtime) throw new SessionError("No store is configured.");
  if (actor.tenantId !== runtime.tenantId) throw new AuthorizationDeniedError("Not found for this tenant.");
  return { actor, runtime };
}

export async function approveProposedAction(_previous: ActionActionState, formData: FormData): Promise<ActionActionState> {
  const parsed = approveSchema.safeParse({
    actionId: formData.get("actionId"),
    version: formData.get("version"),
    digest: formData.get("digest"),
    caseId: formData.get("caseId"),
  });
  if (!parsed.success) return { status: "error", message: "The approval request was not valid." };
  try {
    const { actor, runtime } = await gate();
    await approveAction({
      tenantId: runtime.tenantId,
      input: { actionId: parsed.data.actionId, version: parsed.data.version, digest: parsed.data.digest },
      actor,
      governance: runtime.governance,
      investigations: runtime.investigations,
      now: new Date(),
    });
    await executeSynthetic({
      tenantId: runtime.tenantId,
      actionId: parsed.data.actionId,
      version: parsed.data.version,
      actor,
      governance: runtime.governance,
      investigations: runtime.investigations,
      reader: runtime.reader,
      now: new Date(),
    });
    logEvent("info", "action.approved_executed", { actionId: parsed.data.actionId, userId: actor.userId, sent: false });
    revalidatePath(`/investigations/${parsed.data.caseId}`);
    revalidatePath("/review");
    revalidatePath("/reports");
    return { status: "done", message: "Approved. Synthetic execution recorded as not sent. Outcome is not verified." };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectProposedAction(_previous: ActionActionState, formData: FormData): Promise<ActionActionState> {
  const parsed = approveSchema.extend({ rationale: z.string().trim().min(1).max(600) }).safeParse({
    actionId: formData.get("actionId"),
    version: formData.get("version"),
    digest: formData.get("digest"),
    caseId: formData.get("caseId"),
    rationale: formData.get("rationale") || "Rejected from the case workspace.",
  });
  if (!parsed.success) return { status: "error", message: "The rejection was not valid." };
  try {
    const { actor, runtime } = await gate();
    await rejectAction({
      tenantId: runtime.tenantId,
      actionId: parsed.data.actionId,
      version: parsed.data.version,
      digest: parsed.data.digest,
      rationale: parsed.data.rationale,
      actor,
      governance: runtime.governance,
      investigations: runtime.investigations,
      now: new Date(),
    });
    revalidatePath(`/investigations/${parsed.data.caseId}`);
    revalidatePath("/review");
    return { status: "done", message: "The proposed action was rejected." };
  } catch (error) {
    return fail(error);
  }
}

export async function verifyProposedOutcome(_previous: ActionActionState, formData: FormData): Promise<ActionActionState> {
  const parsed = z.object({
    caseId: z.string().regex(/^INV-\d{1,12}$/),
    actionId: z.string().min(1).max(80).optional(),
  }).safeParse({
    caseId: formData.get("caseId"),
    actionId: formData.get("actionId") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "The verification request was not valid." };
  try {
    const { actor, runtime } = await gate();
    const check = await recordOutcomeObservation({
      tenantId: runtime.tenantId,
      caseId: parsed.data.caseId,
      actionId: parsed.data.actionId ?? null,
      actor,
      markVerified: true,
      governance: runtime.governance,
      investigations: runtime.investigations,
      reader: runtime.reader,
      now: new Date(),
    });
    revalidatePath(`/investigations/${parsed.data.caseId}`);
    revalidatePath("/reports");
    return { status: "done", message: check.matched ? "Outcome verified against source records." : check.summary };
  } catch (error) {
    return fail(error);
  }
}
