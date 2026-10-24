import { ClaimStateBadge } from "@/components/status/claim-state-badge";
import type { EvidenceItem } from "@/lib/domain";
import { formatDateTime, humanize } from "@/lib/format";

/** Compact evidence cards. Each opens the source excerpt drawer; no full source record is shown or copied. */
export function EvidenceList({ evidence, onOpen }: { evidence: EvidenceItem[]; onOpen: (id: string) => void }) {
  return (
    <ul className="space-y-2">
      {evidence.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => onOpen(e.id)}
            className="w-full rounded-md border bg-card p-3 text-left hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-primary">{e.id}</span>
              <ClaimStateBadge state={e.verificationStatus} />
            </div>
            <div className="mt-1 text-dense font-medium text-foreground">{e.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {humanize(e.sourceType)} · <span className="font-mono">{e.sourceRecordId}</span>
            </div>
            <div className="mt-0.5 text-xs text-text-tertiary">
              Observed <time dateTime={e.observedAt}>{formatDateTime(e.observedAt)}</time>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
