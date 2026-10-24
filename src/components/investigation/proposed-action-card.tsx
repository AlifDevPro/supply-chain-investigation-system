"use client";

import { useActionState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { approveProposedAction, rejectProposedAction, verifyProposedOutcome } from "@/app/(workspace)/investigations/action-actions";
import { ACTION_IDLE } from "@/app/(workspace)/investigations/action-state";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/status/chip";
import type { ProposedAction } from "@/lib/domain";
import type { Role } from "@/lib/auth/roles";
import { canApprove, canVerifyOutcome } from "@/lib/auth/roles";
import { isRole } from "@/lib/auth/roles";
import { humanize } from "@/lib/format";

const ORIGIN_LABEL: Record<ProposedAction["origin"], string> = {
  ai_suggested: "AI-suggested, not approved",
  rule_suggested: "Rule-suggested, not approved",
};

export type ActionControls = {
  persisted: boolean;
  role: Role;
  digest: string | null;
};

function approveReason(action: ProposedAction, controls: ActionControls | undefined): string {
  if (!controls?.persisted || !controls.digest) {
    return "Fixture or display-only records cannot be approved.";
  }
  if (action.origin !== "rule_suggested") return "AI-suggested actions cannot be approved.";
  if (action.status !== "proposed" && action.status !== "awaiting_approval") {
    return `This action is ${humanize(action.status)}.`;
  }
  const required = isRole(action.requiredRole) ? action.requiredRole : null;
  if (!required || !canApprove(controls.role, required)) {
    return `This action requires the ${action.requiredRole} role. Your role cannot approve it.`;
  }
  return "";
}

/**
 * A recommendation is not an authorization. Approve checks role, version and digest on the server.
 * Synthetic execution never sends a message or writes business records.
 */
export function ProposedActionCard({ action, controls }: { action: ProposedAction; controls?: ActionControls }) {
  const [approveState, approve, approving] = useActionState(approveProposedAction, ACTION_IDLE);
  const [rejectState, reject, rejecting] = useActionState(rejectProposedAction, ACTION_IDLE);
  const [verifyState, verify, verifying] = useActionState(verifyProposedOutcome, ACTION_IDLE);
  const reason = approveReason(action, controls);
  const reasonId = `${action.id}-disabled-reason`;
  const canAct = reason === "";
  const required = isRole(action.requiredRole) ? action.requiredRole : "manager";
  const showVerify = action.status === "executed" && controls?.persisted;
  const verifyBlocked = !controls || !canVerifyOutcome(controls.role);
  const state = [approveState, rejectState, verifyState].find((s) => s.status !== "idle");

  return (
    <article aria-labelledby={`${action.id}-title`} className="rounded-md border bg-card">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip className="border-dashed border-border-strong bg-surface-sunken text-foreground">{ORIGIN_LABEL[action.origin]}</Chip>
          <Chip className="border-border-strong bg-card text-foreground">{humanize(action.status)}</Chip>
          <span className="font-mono text-xs text-text-tertiary">
            {action.id} · v{action.version}
          </span>
        </div>
        <h3 id={`${action.id}-title`} className="text-sm font-semibold text-foreground">
          {action.title}
        </h3>
        <p className="text-dense text-muted-foreground">{action.rationale}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-sm border bg-surface-sunken px-3 py-2 text-dense">
          {action.parameters.map((p) => (
            <div key={p.label} className="contents">
              <dt className="text-muted-foreground">{p.label}</dt>
              <dd>{p.value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Required role</dt>
          <dd>{action.requiredRole}</dd>
          {controls?.digest ? (
            <>
              <dt className="text-muted-foreground">Parameter digest</dt>
              <dd className="truncate font-mono text-xs" title={controls.digest}>
                {controls.digest.slice(0, 16)}…
              </dd>
            </>
          ) : null}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-surface-sunken/60 px-4 py-2.5">
        <form action={approve} className="contents">
          <input type="hidden" name="actionId" value={action.id} />
          <input type="hidden" name="version" value={action.version} />
          <input type="hidden" name="digest" value={controls?.digest ?? ""} />
          <input type="hidden" name="caseId" value={action.caseId} />
          <Button size="sm" type="submit" disabled={!canAct || approving} aria-describedby={reasonId}>
            <Check aria-hidden="true" />
            {approving ? "Working…" : "Approve"}
          </Button>
        </form>
        <form action={reject} className="contents">
          <input type="hidden" name="actionId" value={action.id} />
          <input type="hidden" name="version" value={action.version} />
          <input type="hidden" name="digest" value={controls?.digest ?? ""} />
          <input type="hidden" name="caseId" value={action.caseId} />
          <input type="hidden" name="rationale" value="Rejected from the case workspace." />
          <Button size="sm" variant="outline" type="submit" disabled={!canAct || rejecting} aria-describedby={reasonId}>
            <X aria-hidden="true" />
            Reject
          </Button>
        </form>
        {showVerify ? (
          <form action={verify} className="contents">
            <input type="hidden" name="caseId" value={action.caseId} />
            <input type="hidden" name="actionId" value={action.id} />
            <Button size="sm" variant="outline" type="submit" disabled={verifyBlocked || verifying} aria-describedby={reasonId}>
              <ShieldCheck aria-hidden="true" />
              Record verified outcome
            </Button>
          </form>
        ) : null}
        <p id={reasonId} className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground">
          {reason ||
            (showVerify && verifyBlocked
              ? "Only a manager can record a verified outcome."
              : `Approval applies to version ${action.version} and requires the ${required} role.`)}
        </p>
        <div aria-live="polite" className="basis-full text-xs">
          {state?.status === "error" ? <p className="text-status-conflicted">{state.message}</p> : null}
          {state?.status === "done" ? <p className="text-muted-foreground">{state.message}</p> : null}
        </div>
      </div>
    </article>
  );
}
