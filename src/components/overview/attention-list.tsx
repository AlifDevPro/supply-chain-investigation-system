import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/states/state-views";
import { CaseStateBadge } from "@/components/status/case-state-badge";
import { SeverityIndicator } from "@/components/status/severity-indicator";
import type { AttentionItem, AttentionReason } from "@/lib/derive";

const REASON_LABEL: Record<AttentionReason, string> = {
  awaiting_review: "Awaiting review",
  conflicting_evidence: "Conflicting evidence",
  stale_evidence: "Stale evidence",
  blocked: "Blocked",
};

/** Highest-priority cases first. Answers "what do I do now" before any statistics. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing needs attention">
        No active case is awaiting review, blocked, or carrying conflicting or stale evidence.
      </EmptyState>
    );
  }
  return (
    <ol className="divide-y rounded-md border bg-card">
      {items.map(({ case: c, reasons }) => (
        <li key={c.id} className="grid gap-x-4 gap-y-2 p-3 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-center">
          <SeverityIndicator severity={c.severity} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/investigations/${c.id}`}
                className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {c.id}
              </Link>
              <span className="text-sm font-medium text-foreground">{c.title}</span>
            </div>
            <p className="text-dense text-muted-foreground">
              <span className="font-medium text-foreground">Why: </span>
              {reasons.map((r) => REASON_LABEL[r]).join(" · ")}
              {c.reviewReason ? ` (${c.reviewReason})` : ""}
            </p>
            <p className="text-dense text-muted-foreground">
              <span className="font-medium text-foreground">Next: </span>
              {c.nextAction}
              <span className="text-text-tertiary"> · Owner: {c.ownerName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <CaseStateBadge state={c.state} />
            <Link
              href={`/investigations/${c.id}`}
              className="inline-flex items-center gap-1 rounded-sm text-dense font-medium text-primary underline-offset-2 hover:underline"
              aria-label={`Open ${c.id}`}
            >
              Open <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
