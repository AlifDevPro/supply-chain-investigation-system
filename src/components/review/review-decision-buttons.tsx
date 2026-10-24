"use client";

import { useActionState } from "react";
import { submitReviewDecision } from "@/app/(workspace)/review/actions";
import { REVIEW_IDLE } from "@/app/(workspace)/review/state";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/roles";
import { canReview } from "@/lib/auth/roles";
import type { ReviewQueueItem } from "@/lib/derive";

export function ReviewDecisionButtons({
  item,
  role,
  persisted,
}: {
  item: ReviewQueueItem;
  role: Role;
  persisted: boolean;
}) {
  const [state, action, pending] = useActionState(submitReviewDecision, REVIEW_IDLE);
  const allowed = persisted && canReview(role);
  const reasonId = `review-${item.kind}-${item.id}`;
  const reason = !persisted
    ? "Fixture records cannot receive a review decision."
    : allowed
      ? "Acknowledge, request more evidence, or dismiss. The server checks your role."
      : "Your role cannot record a review decision.";
  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <p className="text-dense font-medium">
        {item.kind === "case" ? "Case" : "Held signal"} {item.id}
      </p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        {item.kind === "case" ? <input type="hidden" name="caseId" value={item.id} /> : null}
        {item.signalId ? <input type="hidden" name="signalId" value={item.signalId} /> : null}
        <input type="hidden" name="rationale" value="Recorded from the review queue." />
        <Button size="sm" name="decision" value="acknowledge" type="submit" disabled={!allowed || pending} aria-describedby={reasonId}>
          Acknowledge
        </Button>
        <Button size="sm" variant="outline" name="decision" value="request_evidence" type="submit" disabled={!allowed || pending} aria-describedby={reasonId}>
          Request more evidence
        </Button>
        <Button size="sm" variant="outline" name="decision" value="dismiss" type="submit" disabled={!allowed || pending} aria-describedby={reasonId}>
          Dismiss
        </Button>
        <p id={reasonId} className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground">
          {reason}
        </p>
      </form>
      <div aria-live="polite" className="text-xs">
        {state.status === "error" ? <p className="text-status-conflicted">{state.message}</p> : null}
        {state.status === "done" ? <p className="text-muted-foreground">{state.message}</p> : null}
      </div>
    </div>
  );
}
