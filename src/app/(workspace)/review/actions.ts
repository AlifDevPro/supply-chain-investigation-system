"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, SessionError } from "@/lib/auth/session";
import { recordReviewDecision } from "@/lib/review/decide";
import { logEvent } from "@/lib/log";
import { getRuntime } from "@/lib/runtime";
import { AuthorizationDeniedError } from "@/lib/actions/errors";
import type { ReviewActionState } from "./state";

const inputSchema = z.object({
  decision: z.enum(["acknowledge", "request_evidence", "dismiss", "reject"]),
  rationale: z.string().trim().min(1).max(600),
  caseId: z.string().regex(/^INV-\d{1,12}$/).optional(),
  signalId: z.string().regex(/^SIG-\d{1,12}$/).optional(),
});

export async function submitReviewDecision(_previous: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const parsed = inputSchema.safeParse({
    decision: formData.get("decision"),
    rationale: formData.get("rationale") || "Recorded from the review queue.",
    caseId: formData.get("caseId") || undefined,
    signalId: formData.get("signalId") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "The review decision was not valid." };
  try {
    const actor = await requireSession();
    const runtime = await getRuntime();
    if (!runtime) return { status: "error", message: "No store is configured." };
    if (actor.tenantId !== runtime.tenantId) return { status: "error", message: "Not found for this tenant." };
    await recordReviewDecision({
      tenantId: runtime.tenantId,
      caseId: parsed.data.caseId,
      signalId: parsed.data.signalId,
      decision: parsed.data.decision,
      rationale: parsed.data.rationale,
      actor,
      governance: runtime.governance,
      investigations: runtime.investigations,
      now: new Date(),
    });
    logEvent("info", "review.decision", { decision: parsed.data.decision, userId: actor.userId, caseId: parsed.data.caseId ?? null });
    revalidatePath("/review");
    revalidatePath("/investigations");
    if (parsed.data.caseId) revalidatePath(`/investigations/${parsed.data.caseId}`);
    return { status: "done", message: "Review decision recorded." };
  } catch (error) {
    if (error instanceof SessionError) return { status: "error", message: "Sign in required." };
    if (error instanceof AuthorizationDeniedError) return { status: "error", message: error.message };
    logEvent("error", "review.decision.failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return { status: "error", message: "The decision could not be recorded." };
  }
}
