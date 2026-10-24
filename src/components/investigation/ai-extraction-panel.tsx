import { CircleAlert, CircleCheck, CircleDashed, CircleDot, type LucideIcon } from "lucide-react";
import type { ComparisonResult } from "@/lib/ai/extract";
import { COMPARISON_TEXT, EXTRACTION_STATUS_TEXT, FIELD_LABELS, REJECTION_TEXT } from "@/lib/ai/labels";
import { providerLabel, type AiExtractionView } from "@/lib/ai/view";
import { formatDateTime, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const COMPARISON_STYLE: Record<ComparisonResult, { Icon: LucideIcon; text: string }> = {
  agrees: { Icon: CircleCheck, text: "text-status-verified" },
  differs: { Icon: CircleAlert, text: "text-status-conflicted" },
  ai_only: { Icon: CircleDot, text: "text-status-reported" },
  rules_only: { Icon: CircleDashed, text: "text-text-tertiary" },
};

function ComparisonBadge({ result }: { result: ComparisonResult }) {
  const { Icon, text } = COMPARISON_STYLE[result];
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap" data-comparison={result}>
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", text)} />
      {COMPARISON_TEXT[result]}
    </span>
  );
}

const show = (v: string | number | null) => (v === null ? "none" : typeof v === "number" ? v.toLocaleString("en-US") : v);

function Meta({ x }: { x: AiExtractionView }) {
  const tokens = x.inputTokens !== null || x.outputTokens !== null ? `${x.inputTokens ?? "n/a"} in / ${x.outputTokens ?? "n/a"} out` : "not reported";
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <dt>Provider</dt>
      <dd>{providerLabel(x.provider, x.model)}</dd>
      <dt>Prompt</dt>
      <dd className="font-mono">{x.promptVersion}</dd>
      <dt>Latency</dt>
      <dd className="font-mono">
        {formatDuration(x.latencyMs)} · {x.attempts} attempt{x.attempts === 1 ? "" : "s"}
      </dd>
      <dt>Tokens</dt>
      <dd className="font-mono">{tokens}</dd>
      <dt>Recorded</dt>
      <dd className="font-mono">
        <time dateTime={x.createdAt}>{formatDateTime(x.createdAt)}</time>
      </dd>
    </dl>
  );
}

/**
 * AI-extracted candidate facts for one signal (signal-extraction.v1). Every value shown passed schema and
 * grounding checks against the signal text; none of it feeds triage, calculations or case rules.
 */
export function AiExtractionPanel({
  signalId,
  extraction,
  configured,
}: {
  signalId: string;
  extraction: AiExtractionView | undefined;
  /** Provider configured now, or null when AI is off. */
  configured: { label: string } | null;
}) {
  const heading = (
    <div className="space-y-0.5">
      <h3 className="text-dense font-medium text-foreground">AI extraction</h3>
      <p className="font-mono text-xs text-muted-foreground">Signal {signalId}</p>
    </div>
  );

  if (!extraction) {
    return (
      <section aria-label={`AI extraction for ${signalId}`} className="space-y-1.5 rounded-md border bg-surface-sunken p-3">
        {heading}
        <p className="text-dense text-muted-foreground">
          {configured
            ? "No extraction is recorded for this signal. It may not be eligible (duplicate, irrelevant or rejected), or it was stored before extraction was configured."
            : "AI extraction is off (AI_PROVIDER=none). No model was called for this signal."}
        </p>
      </section>
    );
  }

  const completed = extraction.status === "completed";
  const rows = extraction.comparison;
  return (
    <section aria-label={`AI extraction for ${signalId}`} className="space-y-2 rounded-md border bg-surface-sunken p-3">
      {heading}
      <p className="text-xs text-muted-foreground">
        {extraction.provider === "mock" ? "Suggested by the deterministic mock extractor, not a model." : "Suggested by a model."} Not used in
        calculations. Verify against the source.
      </p>
      {completed ? (
        rows.length === 0 ? (
          <p className="text-dense text-muted-foreground">No facts were extracted, and the signal has no structured values to compare.</p>
        ) : (
          <ul className="divide-y rounded-sm border bg-card">
            {rows.map((c) => {
              const fact = extraction.fields.find((f) => f.field === c.field);
              return (
                <li key={c.field} className="space-y-0.5 px-2.5 py-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="font-medium text-foreground">{FIELD_LABELS[c.field]}</span>
                    <ComparisonBadge result={c.result} />
                  </div>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-muted-foreground">
                    <span>AI</span>
                    <span className="font-mono text-foreground">{show(c.ai)}</span>
                    <span>Rules</span>
                    <span className="font-mono">{show(c.rules)}</span>
                  </div>
                  {fact ? (
                    <p className="text-text-tertiary">
                      Quote: <q className="font-mono break-words">{fact.quote}</q>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <p role="note" className="rounded-sm border border-status-conflicted/40 bg-card px-2.5 py-1.5 text-dense text-foreground">
          {EXTRACTION_STATUS_TEXT[extraction.status]}
          {extraction.failure ? <span className="ml-1 font-mono text-xs text-muted-foreground">({extraction.failure})</span> : null}
        </p>
      )}
      {extraction.rejected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {extraction.rejected.length} field{extraction.rejected.length === 1 ? "" : "s"} dropped by validation:{" "}
          {extraction.rejected.map((r) => `${FIELD_LABELS[r.field]} (${REJECTION_TEXT[r.code]})`).join(", ")}.
        </p>
      ) : null}
      <Meta x={extraction} />
    </section>
  );
}
