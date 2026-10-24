import type { RunSummary } from "@/lib/domain";
import { formatDateTime, formatDuration, humanize } from "@/lib/format";

/** Immutable run records of a persisted case, newest first, with retrieval accounting and rule versions. */
export function RunHistory({ runs, linkedSignalIds }: { runs: RunSummary[]; linkedSignalIds: string[] }) {
  return (
    <div className="space-y-3">
      <p className="text-dense text-muted-foreground">
        Linked signals:{" "}
        {linkedSignalIds.length === 0 ? (
          <span className="text-text-tertiary">none</span>
        ) : (
          <span className="font-mono text-xs">{linkedSignalIds.join(", ")}</span>
        )}
      </p>
      {runs.length === 0 ? (
        <p className="text-dense text-text-tertiary">No completed runs.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[36rem] text-dense">
            <caption className="sr-only">Investigation runs, newest first</caption>
            <thead className="bg-surface-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Run</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Trigger</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Finished</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Retrieval</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Findings</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">#{r.runNumber}</div>
                    <div className="font-mono text-xs text-text-tertiary" title={Object.entries(r.ruleVersions).map(([k, v]) => `${k}: ${v}`).join("\n")}>
                      {r.ruleVersions.investigation ?? "rules"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {humanize(r.trigger)}
                    {r.triggerSignalId ? <div className="font-mono text-xs text-muted-foreground">{r.triggerSignalId}</div> : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {formatDateTime(r.finishedAt)}
                    <div className="text-text-tertiary">{formatDuration(Date.parse(r.finishedAt) - Date.parse(r.startedAt))}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.retrieval.calls} reads, {r.retrieval.rows} rows
                    {r.retrieval.truncated ? <div className="text-status-stale">Some results truncated</div> : null}
                    {r.retrieval.budgetExhausted ? <div className="text-status-stale">Read budget exhausted; evidence is partial</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.counts.evidence} evidence, {r.counts.claims} claims, {r.counts.conflicts} conflicts, {r.counts.unknowns} unknowns
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
