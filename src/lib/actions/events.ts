import type { EventType, Stage } from "@/lib/domain/events";
import type { EventDraft } from "@/lib/store/types";

export function actionEvent(params: {
  type: EventType;
  stage: Stage;
  caseId: string;
  occurredAt: string;
  durationMs?: number | null;
  methodName: string;
  metadata: Record<string, string | number | boolean>;
}): EventDraft {
  return {
    signalId: null,
    caseId: params.caseId,
    correlationId: `corr-${params.caseId}`,
    type: params.type,
    stage: params.stage,
    status: "completed",
    occurredAt: params.occurredAt,
    durationMs: params.durationMs ?? null,
    method: { kind: "rule", name: params.methodName },
    retryCount: 0,
    errorClass: null,
    metadata: params.metadata,
    dataMode: "synthetic",
  };
}
