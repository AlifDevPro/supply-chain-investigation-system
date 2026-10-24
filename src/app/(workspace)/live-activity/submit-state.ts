import type { TriageOutcome, ValidationIssue } from "@/lib/domain";
import type { ExtractionRunStatus } from "@/lib/investigation/extraction";

/** Serializable result of the synthetic submission form. Never contains submitted values. */
export type SubmitState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; kind: "rejected"; signalId: string; correlationId: string; issues: ValidationIssue[] }
  | {
      status: "done";
      kind: "accepted" | "duplicate";
      signalId: string;
      correlationId: string;
      dedupeStatus: "unique" | "duplicate" | "revision";
      duplicateOf: string | null;
      revisionOf: string | null;
      triageOutcome: TriageOutcome | null;
      reasonCodes: string[];
      requiresReview: boolean;
      investigation: "created" | "updated" | "held" | "skipped" | "failed";
      caseId: string | null;
      extraction: ExtractionRunStatus;
    };

export const IDLE: SubmitState = { status: "idle" };
