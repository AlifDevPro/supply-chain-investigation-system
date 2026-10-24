import { CLAIM_STATES, type ClaimState } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { CLAIM_STATE_CONFIG } from "./claim-state-badge";

/**
 * Compact verification posture for a case: one icon + count per claim state that is present.
 * Each count has a text alternative ("2 verified"). Zero counts are omitted, not hidden as zeros.
 */
export function ClaimSummary({ counts, className }: { counts: Record<ClaimState, number>; className?: string }) {
  const present = CLAIM_STATES.filter((s) => counts[s] > 0);
  if (present.length === 0) return <span className="text-xs text-text-tertiary">No claims recorded</span>;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)} aria-label="Claims by verification state">
      {present.map((s) => {
        const { Icon, label, className: tone } = CLAIM_STATE_CONFIG[s];
        return (
          <li key={s} className={cn("inline-flex items-center gap-1 rounded-sm border px-1 text-xs", tone)} title={label}>
            <Icon aria-hidden="true" className="size-3" />
            <span className="font-mono tabular-nums">{counts[s]}</span>
            <span className="sr-only">{label.toLowerCase()}</span>
          </li>
        );
      })}
    </ul>
  );
}
