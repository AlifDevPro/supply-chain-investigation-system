import type { CaseState } from "@/lib/domain";
import type { StoredCase } from "@/lib/store/investigation-types";

export const TRANSITION_VERSION = "transitions.v1";

const EDGES: Partial<Record<CaseState, readonly CaseState[]>> = {
  needs_review: ["awaiting_approval", "resolved", "dismissed", "blocked", "rejected"],
  awaiting_approval: ["approved", "needs_review", "rejected"],
  approved: ["executing"],
  executing: ["awaiting_verification", "failed"],
  awaiting_verification: ["resolved", "blocked"],
};

export class InvalidTransitionError extends Error {
  constructor(from: CaseState, to: CaseState) {
    super(`${from} → ${to} is not allowed by ${TRANSITION_VERSION}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: CaseState, to: CaseState): void {
  if (!(EDGES[from] ?? []).includes(to)) throw new InvalidTransitionError(from, to);
}

export function applyTransition(c: StoredCase, to: CaseState, nextAction: string, now: string): StoredCase {
  assertTransition(c.state, to);
  return {
    ...c,
    state: to,
    nextAction,
    updatedAt: now,
    requiresReview: to === "needs_review" || to === "awaiting_approval" || to === "awaiting_verification",
    reviewReason: to === "resolved" || to === "dismissed" || to === "rejected" ? null : c.reviewReason,
  };
}
