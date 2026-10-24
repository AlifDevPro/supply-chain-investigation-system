"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/data-table";
import { OperatorAction, type OperatorAvailability } from "@/components/investigation/operator-action";
import { ReviewDecisionButtons } from "./review-decision-buttons";
import type { Role } from "@/lib/auth/roles";
import { SeverityIndicator } from "@/components/status/severity-indicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewQueueItem } from "@/lib/derive";
import { formatDateTime } from "@/lib/format";

const COLUMNS: ColumnDef<ReviewQueueItem, unknown>[] = [
  {
    id: "severity",
    header: "Severity",
    accessorFn: (r) => r.severity ?? "none",
    cell: ({ row }) =>
      row.original.severity ? <SeverityIndicator severity={row.original.severity} /> : <span className="text-xs text-text-tertiary">not assigned</span>,
  },
  {
    id: "item",
    header: "Item",
    accessorFn: (r) => r.id,
    cell: ({ row }) => {
      const href = row.original.kind === "case" ? `/investigations/${row.original.id}` : `/live-activity`;
      return (
        <div className="min-w-48 max-w-sm">
          <Link href={href} className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline">
            {row.original.id}
          </Link>
          <div className="text-dense text-foreground">{row.original.title}</div>
        </div>
      );
    },
  },
  {
    id: "why",
    header: "Why it is here",
    accessorFn: (r) => r.reason,
    cell: ({ row }) => <span className="text-dense text-muted-foreground">{row.original.reason}</span>,
  },
  {
    id: "age",
    header: "Waiting",
    accessorFn: (r) => r.ageHours ?? -1,
    cell: ({ row }) => (
      <div>
        <div className="font-mono text-xs">{row.original.ageHours === null ? "not measured" : `${row.original.ageHours} h`}</div>
        <time dateTime={row.original.at} className="font-mono text-xs text-text-tertiary">
          {formatDateTime(row.original.at)}
        </time>
      </div>
    ),
  },
  {
    id: "next",
    header: "Next",
    accessorFn: (r) => r.nextStep,
    cell: ({ row }) => <span className="text-dense">{row.original.nextStep}</span>,
  },
];

export function ReviewQueueTable({
  items,
  operator,
  role,
  persisted,
}: {
  items: ReviewQueueItem[];
  operator: OperatorAvailability;
  role: Role;
  persisted: boolean;
}) {
  const [kind, setKind] = useState("all");
  const [severity, setSeverity] = useState("all");
  const shown = useMemo(
    () =>
      items.filter((i) => (kind === "all" || i.kind === kind) && (severity === "all" || i.severity === severity)),
    [items, kind, severity],
  );
  const selected = shown[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Kind
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="held_signal">Held signals</SelectItem>
              <SelectItem value="case">Cases</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Severity
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <DataTable data={shown} columns={COLUMNS} caption="Review queue" getRowId={(r) => `${r.kind}-${r.id}`} pageSize={10} />
      {selected?.kind === "held_signal" && selected.signalId ? (
        <div className="rounded-md border bg-card p-3">
          <p className="mb-2 text-dense font-medium">Held signal {selected.signalId}</p>
          <OperatorAction kind="open" id={selected.signalId} availability={operator} />
        </div>
      ) : null}
      {selected ? <ReviewDecisionButtons item={selected} role={role} persisted={persisted} /> : null}
    </div>
  );
}
