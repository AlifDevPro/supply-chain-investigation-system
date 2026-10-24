import { ClaimStateBadge } from "@/components/status/claim-state-badge";
import type { Claim } from "@/lib/domain";
import { EvidenceRef } from "./evidence-ref";

/**
 * Claims with their verification state, the reason for that state, and the evidence they rest on.
 * The state is a labelled badge (icon + text + border style), never colour alone.
 */
export function ClaimTable({ claims, onOpenEvidence }: { claims: Claim[]; onOpenEvidence: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-dense">
        <caption className="sr-only">Claims and their verification state</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Claim</th>
            <th scope="col" className="px-3 py-2 font-medium">State</th>
            <th scope="col" className="px-3 py-2 font-medium">Why this state</th>
            <th scope="col" className="py-2 pl-3 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {claims.map((c) => (
            <tr key={c.id} className="align-top">
              <td className="py-2.5 pr-3">
                <div className="text-foreground">{c.statement}</div>
                <div className="mt-0.5 font-mono text-xs text-text-tertiary">{c.id}</div>
              </td>
              <td className="px-3 py-2.5">
                <ClaimStateBadge state={c.state} />
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{c.basis}</td>
              <td className="py-2.5 pl-3">
                <div className="flex flex-col items-start gap-0.5">
                  {c.evidenceIds.map((id) => (
                    <EvidenceRef key={id} id={id} onOpen={onOpenEvidence} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
