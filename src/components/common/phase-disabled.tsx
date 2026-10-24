import { Button } from "@/components/ui/button";

const REASON = "Disabled: this placeholder does not record a decision. Review actions live on the queue and on the case.";

/** Visible, non-functional Approve / Reject. The reason is always next to the controls. */
export function Phase5DecisionButtons({ id }: { id: string }) {
  const reasonId = `${id}-phase5`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled aria-describedby={reasonId}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled aria-describedby={reasonId}>
        Reject
      </Button>
      <p id={reasonId} className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground">
        {REASON}
      </p>
    </div>
  );
}

export function Phase5ExportButton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled aria-describedby="export-disabled">
        Export
      </Button>
      <p id="export-disabled" className="text-xs text-muted-foreground">
        Disabled: authorised exports are not available in this phase. This page is read-only.
      </p>
    </div>
  );
}
