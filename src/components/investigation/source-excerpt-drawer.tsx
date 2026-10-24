"use client";

import { ClaimStateBadge } from "@/components/status/claim-state-badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { EvidenceItem } from "@/lib/domain";
import { formatDateTime, humanize } from "@/lib/format";

const METHOD_LABEL: Record<EvidenceItem["extractionMethod"], string> = {
  system_record: "Read from a system record",
  deterministic_rule: "Extracted by a deterministic rule",
  ai_extraction: "Extracted by a model (untrusted until verified)",
  manual_entry: "Entered manually",
};

/**
 * Provenance for one evidence item: where it came from, when it was observed and reported, its record
 * version, how it was extracted and its verification status, with a minimal excerpt only.
 */
export function SourceExcerptDrawer({ evidence, onClose }: { evidence: EvidenceItem | null; onClose: () => void }) {
  return (
    <Sheet open={evidence !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="font-serif text-xl">{evidence?.title ?? "Evidence"}</SheetTitle>
          <SheetDescription>
            <span className="font-mono">{evidence?.id}</span> · source evidence, not an independent confirmation of what it reports
          </SheetDescription>
        </SheetHeader>
        {evidence ? (
          <div className="space-y-4 p-4">
            <div>
              <ClaimStateBadge state={evidence.verificationStatus} />
            </div>
            <figure className="space-y-1.5">
              <figcaption className="text-xs font-medium text-muted-foreground">Excerpt (minimal, not the full record)</figcaption>
              <blockquote className="rounded-sm border-l-2 border-primary bg-surface-sunken px-3 py-2 text-dense text-foreground">
                {evidence.excerpt}
              </blockquote>
            </figure>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-dense">
              <dt className="text-muted-foreground">Source system</dt>
              <dd>{evidence.sourceSystem}</dd>
              {evidence.sourceTable ? (
                <>
                  <dt className="text-muted-foreground">Source table</dt>
                  <dd className="font-mono text-xs">{evidence.sourceTable}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Source record</dt>
              <dd className="font-mono text-xs">{evidence.sourceRecordId}</dd>
              <dt className="text-muted-foreground">Source type</dt>
              <dd>{humanize(evidence.sourceType)}</dd>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{evidence.fieldLocation}</dd>
              <dt className="text-muted-foreground">Observed</dt>
              <dd className="font-mono text-xs">{formatDateTime(evidence.observedAt)}</dd>
              <dt className="text-muted-foreground">Source reported</dt>
              <dd className="font-mono text-xs">
                {evidence.sourceReportedAt ? formatDateTime(evidence.sourceReportedAt) : <span className="font-sans text-text-tertiary">not provided</span>}
              </dd>
              <dt className="text-muted-foreground">Record version</dt>
              <dd className="font-mono text-xs">{evidence.recordVersion}</dd>
              <dt className="text-muted-foreground">Extraction</dt>
              <dd>{METHOD_LABEL[evidence.extractionMethod]}</dd>
            </dl>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
