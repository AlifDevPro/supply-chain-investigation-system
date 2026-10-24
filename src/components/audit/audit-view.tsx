"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/data-table";
import { Phase5ExportButton } from "@/components/common/phase-disabled";
import { Panel } from "@/components/common/panel";
import { EventStatus } from "@/components/status/event-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterAudit, type AuditRow } from "@/lib/derive";
import { formatDateTime } from "@/lib/format";

export type InspectionView = {
  migrations: Array<{ name: string; appliedAt: string }>;
  tables: Array<{ table: string; rowLevelSecurity: boolean; mutationGuard: string }>;
};

const COLUMNS: ColumnDef<AuditRow, unknown>[] = [
  {
    id: "at",
    header: "When",
    accessorFn: (r) => r.at,
    cell: ({ row }) => (
      <time dateTime={row.original.at} className="font-mono text-xs">
        {formatDateTime(row.original.at)}
      </time>
    ),
  },
  { id: "actor", header: "Actor", accessorFn: (r) => r.actor, cell: ({ row }) => <span className="text-dense">{row.original.actor}</span> },
  { id: "action", header: "Action", accessorFn: (r) => r.action, cell: ({ row }) => <span className="text-dense">{row.original.action}</span> },
  {
    id: "target",
    header: "Target",
    accessorFn: (r) => r.target,
    cell: ({ row }) =>
      row.original.caseId ? (
        <Link href={`/investigations/${row.original.caseId}`} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
          {row.original.target}
        </Link>
      ) : (
        <span className="font-mono text-xs">{row.original.target}</span>
      ),
  },
  {
    id: "outcome",
    header: "Outcome",
    accessorFn: (r) => r.outcome,
    cell: ({ row }) => <EventStatus status={row.original.outcome} />,
  },
];

export function AuditView({
  rows,
  inspection,
  storeMode,
}: {
  rows: AuditRow[];
  inspection: InspectionView | null;
  storeMode: string;
}) {
  const actors = useMemo(() => [...new Set(rows.map((r) => r.actor))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))].sort(), [rows]);
  const cases = useMemo(() => [...new Set(rows.map((r) => r.caseId).filter((x): x is string => Boolean(x)))].sort(), [rows]);
  const [actor, setActor] = useState("all");
  const [type, setType] = useState("all");
  const [caseId, setCaseId] = useState("all");
  const shown = useMemo(
    () =>
      filterAudit(rows, {
        actor: actor === "all" ? undefined : actor,
        type: type === "all" ? undefined : (type as AuditRow["type"]),
        caseId: caseId === "all" ? undefined : caseId,
      }),
    [rows, actor, type, caseId],
  );

  return (
    <div className="space-y-5">
      <Panel
        title="Security posture"
        description="Facts read from the database when one is configured. This is not a penetration-test result."
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
          <dt className="text-muted-foreground">Store</dt>
          <dd className="font-mono text-xs">{storeMode}</dd>
          <dt className="text-muted-foreground">Authentication</dt>
          <dd>Signed session cookie. Roles are enforced on the server. The ingest API uses a separate key.</dd>
        </dl>
        {inspection ? (
          <ul className="mt-3 space-y-1 text-dense" aria-label="Table security">
            {inspection.tables.map((t) => (
              <li key={t.table} className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs">{t.table}</span>
                <span className="text-xs text-muted-foreground">
                  RLS {t.rowLevelSecurity ? "on" : "off"} · {t.mutationGuard.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-dense text-muted-foreground">
            RLS and append-only triggers are only read from Postgres. This process is not using a database catalog.
          </p>
        )}
      </Panel>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Actor
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Filter by actor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Event type
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Filter by event type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Case
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by case"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {cases.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <Phase5ExportButton />
      </div>
      <DataTable data={shown} columns={COLUMNS} caption="Audit trail from append-only events" getRowId={(r) => r.id} pageSize={12} />
    </div>
  );
}
