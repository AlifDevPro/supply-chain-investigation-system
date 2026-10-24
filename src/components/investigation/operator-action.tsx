"use client";

import { RefreshCw, FolderPlus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { openInvestigation, rerunInvestigation } from "@/app/(workspace)/investigations/actions";
import { OPERATOR_IDLE } from "@/app/(workspace)/investigations/operator-state";
import { Button } from "@/components/ui/button";

export type OperatorAvailability = { enabled: boolean; reason: string | null };

/**
 * "Open investigation" (for a held signal) or "Re-run investigation" (for a case). Offered only when the server
 * enables operator actions; the server action re-checks, rate-limits and records the signed-in user.
 */
export function OperatorAction({
  kind,
  id,
  availability,
}: {
  kind: "open" | "rerun";
  id: string;
  availability: OperatorAvailability;
}) {
  const [state, action, pending] = useActionState(kind === "open" ? openInvestigation : rerunInvestigation, OPERATOR_IDLE);
  if (!availability.enabled) {
    return <p className="text-xs text-text-tertiary">{availability.reason}</p>;
  }
  const label = kind === "open" ? "Open investigation" : "Re-run investigation";
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name={kind === "open" ? "signalId" : "caseId"} value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} aria-describedby={`operator-note-${id}`}>
        {kind === "open" ? <FolderPlus aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        {pending ? "Working…" : label}
      </Button>
      <p id={`operator-note-${id}`} className="text-xs text-text-tertiary">
        Recorded as the signed-in user. No supplier message is sent from this control.
      </p>
      <div aria-live="polite" className="text-xs">
        {state.status === "error" ? <p className="text-status-conflicted">{state.message}</p> : null}
        {state.status === "done" ? (
          <p className="text-muted-foreground">
            {state.message}{" "}
            {state.caseId && kind === "open" ? (
              <Link href={`/investigations/${state.caseId}`} className="font-mono text-primary underline underline-offset-2">
                {state.caseId}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
