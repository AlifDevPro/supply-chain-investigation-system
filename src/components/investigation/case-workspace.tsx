"use client";

import { useState } from "react";
import { Panel } from "@/components/common/panel";
import { EmptyState } from "@/components/states/state-views";
import { TriageOutcomeBadge } from "@/components/status/triage-outcome-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AiPanelData } from "@/lib/ai/view";
import type { InvestigationDetail } from "@/lib/domain";
import { formatDateTime, humanize } from "@/lib/format";
import { AiExtractionPanel } from "./ai-extraction-panel";
import { AuditHistory } from "./audit-history";
import { CaseHeader, type SectionLink } from "./case-header";
import { CaseTimeline } from "./case-timeline";
import { DeliveryRiskCard } from "./delivery-risk-card";
import { OperatorAction, type OperatorAvailability } from "./operator-action";
import { RunHistory } from "./run-history";
import { ClaimTable } from "./claim-table";
import { EntityChain } from "./entity-chain";
import { EvidenceList } from "./evidence-list";
import { ImpactCalculationCard } from "./impact-calculation-card";
import { ProposedActionCard, type ActionControls } from "./proposed-action-card";
import { SourceExcerptDrawer } from "./source-excerpt-drawer";
import { UncertaintyPanel } from "./uncertainty-panel";

const NO_DETAIL_NOTE =
  "Evidence-level detail for this case is not part of the synthetic dataset. Nothing is inferred from its absence: the case may have evidence that this demo does not include.";

/**
 * The investigation workspace. Left column answers what happened, which claims are verified, what the
 * calculation says, what is uncertain and what is proposed. The right rail holds evidence, the event
 * timeline and the audit history. Below 1024px the rail follows the main column.
 */
export function CaseWorkspace({
  detail,
  operator,
  ai,
  actionControls,
}: {
  detail: InvestigationDetail;
  operator?: OperatorAvailability;
  actionControls?: Omit<ActionControls, "digest"> & { digests?: Record<string, string> };
  /** Persisted cases only: AI-extracted candidates for the linked signals. */
  ai?: AiPanelData;
}) {
  const [openEvidenceId, setOpenEvidenceId] = useState<string | null>(null);
  const { case: c, sourceSignal: signal, detailAvailable } = detail;
  const openEvidence = detail.evidence.find((e) => e.id === openEvidenceId) ?? null;
  // Persisted cases carry their run history; fixture cases do not.
  const persisted = detail.runs !== undefined;
  const scope = persisted ? "for this case" : "for this case in the synthetic dataset";

  const sections: SectionLink[] = detailAvailable
    ? [
        { id: "claims", label: "Claims" },
        ...(detail.impact ? [{ id: "impact", label: "Shortage" }] : []),
        ...(detail.deliveryRisk ? [{ id: "delivery", label: "Delivery risk" }] : []),
        { id: "uncertainty", label: "Uncertainty" },
        { id: "entities", label: "Affected entities" },
        ...(ai ? [{ id: "ai", label: "AI extraction" }] : []),
        { id: "actions", label: "Proposed actions" },
        ...(persisted ? [{ id: "runs", label: "Runs" }] : []),
      ]
    : [];

  return (
    <div className="space-y-4">
      <CaseHeader c={c} sections={sections} detailAvailable={detailAvailable} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          <Panel
            id="what-happened"
            title="What happened"
            description={
              persisted && (detail.linkedSignalIds?.length ?? 0) > 1
                ? `The signal that opened this case. ${detail.linkedSignalIds!.length} signals are linked in total.`
                : "The signal that opened this case."
            }
          >
            {signal ? (
              <div className="space-y-2 text-dense">
                <p className="text-foreground">{signal.label}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{humanize(signal.sourceType)}</span>
                  <span>{signal.sourceSystem}</span>
                  <span className="font-mono">{signal.id}</span>
                  <time dateTime={signal.receivedAt} className="font-mono">
                    received {formatDateTime(signal.receivedAt)}
                  </time>
                  <TriageOutcomeBadge outcome={signal.triageOutcome} />
                </div>
                <p className="text-xs text-text-tertiary">
                  A source message shows what the source reported. It does not prove the reported event happened.
                </p>
              </div>
            ) : (
              <p className="text-dense text-muted-foreground">No source signal is linked {scope}.</p>
            )}
          </Panel>

          {detailAvailable ? (
            <>
              <Panel id="claims" title="Claims" description="Each claim shows its verification state and the evidence behind it.">
                <ClaimTable claims={detail.claims} onOpenEvidence={setOpenEvidenceId} />
              </Panel>
              {detail.impact ? (
                <Panel id="impact" title={persisted ? "Shortage calculation" : "Impact calculation"} description="Deterministic, versioned, with its inputs and assumptions.">
                  <ImpactCalculationCard impact={detail.impact} onOpenEvidence={setOpenEvidenceId} />
                </Panel>
              ) : null}
              {detail.deliveryRisk ? (
                <Panel id="delivery" title="Delivery risk" description="Expected arrival against the promised date and the open production requirements.">
                  <DeliveryRiskCard risk={detail.deliveryRisk} onOpenEvidence={setOpenEvidenceId} />
                </Panel>
              ) : null}
              {persisted && !detail.impact && !detail.deliveryRisk ? (
                <Panel id="impact" title="Impact" description="Deterministic calculations for this case.">
                  <p className="text-dense text-muted-foreground">
                    No shortage or delivery-risk calculation was possible: the purchase order, shipment or material named by the linked
                    signals was not found in the records searched. See the unknowns below.
                  </p>
                </Panel>
              ) : null}
              <Panel id="uncertainty" title="Conflicts and unknowns" description="What disagrees, and what has not been established.">
                <UncertaintyPanel conflicts={detail.conflicts} unknowns={detail.unknowns} onOpenEvidence={setOpenEvidenceId} />
              </Panel>
              <Panel id="entities" title="Affected entities" description="Verified links are solid; inferred links are dashed and labelled.">
                <EntityChain nodes={detail.entities.nodes} edges={detail.entities.edges} onOpenEvidence={setOpenEvidenceId} />
              </Panel>
              {ai ? (
                <Panel
                  id="ai"
                  title="AI-extracted candidates"
                  description="Candidate facts the configured AI provider suggested from each linked signal's text, checked against that text. Not used in any calculation, claim or case rule."
                >
                  <div className="space-y-3">
                    {(detail.linkedSignalIds ?? []).map((id) => (
                      <AiExtractionPanel key={id} signalId={id} extraction={ai.bySignal[id]} configured={ai.configured} />
                    ))}
                  </div>
                </Panel>
              ) : null}
              <Panel id="actions" title="Proposed actions" description="Recommendations only. None is approved or executed.">
                <div className="space-y-3">
                  {detail.actions.length === 0 ? (
                    <p className="text-dense text-muted-foreground">
                      {persisted
                        ? "No rule-suggested actions from the latest run."
                        : "No actions are proposed for this case."}
                    </p>
                  ) : (
                    detail.actions.map((a) => (
                      <ProposedActionCard
                        key={a.id}
                        action={a}
                        controls={
                          actionControls
                            ? { persisted: actionControls.persisted, role: actionControls.role, digest: actionControls.digests?.[a.id] ?? null }
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>
              </Panel>
            </>
          ) : (
            <EmptyState title={persisted ? "No completed investigation run" : "No evidence-level detail in this demo"}>
              {persisted ? "This case has no completed run yet. Failed attempts are listed in the timeline." : NO_DETAIL_NOTE}
            </EmptyState>
          )}
          {persisted ? (
            <Panel
              id="runs"
              title="Investigation runs"
              description="Each run is an immutable record of what was retrieved and calculated. Newer runs never rewrite older ones."
            >
              <div className="space-y-4">
                {operator ? <OperatorAction kind="rerun" id={c.id} availability={operator} /> : null}
                <RunHistory runs={detail.runs ?? []} linkedSignalIds={detail.linkedSignalIds ?? []} />
              </div>
            </Panel>
          ) : null}
        </div>

        <aside aria-label="Evidence, timeline and audit" className="min-w-0 lg:sticky lg:top-[68px]">
          <Tabs defaultValue="evidence" className="rounded-md border bg-card">
            <TabsList className="m-2 grid w-[calc(100%-1rem)] grid-cols-3">
              <TabsTrigger value="evidence">Evidence{detail.evidence.length > 0 ? ` (${detail.evidence.length})` : ""}</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
            <div className="max-h-[calc(100svh-9rem)] overflow-y-auto p-3 pt-1">
              <TabsContent value="evidence">
                {detail.evidence.length === 0 ? (
                  <p className="text-dense text-muted-foreground">No evidence items are recorded {scope}.</p>
                ) : (
                  <EvidenceList evidence={detail.evidence} onOpen={setOpenEvidenceId} />
                )}
              </TabsContent>
              <TabsContent value="timeline">
                <CaseTimeline events={detail.events} />
              </TabsContent>
              <TabsContent value="audit">
                <AuditHistory entries={detail.audit} />
              </TabsContent>
            </div>
          </Tabs>
        </aside>
      </div>

      <SourceExcerptDrawer evidence={openEvidence} onClose={() => setOpenEvidenceId(null)} />
    </div>
  );
}
