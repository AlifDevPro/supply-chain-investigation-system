"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/data-table";
import { SourceExcerptDrawer } from "@/components/investigation/source-excerpt-drawer";
import { ClaimStateBadge } from "@/components/status/claim-state-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EvidenceItem, EvidenceSourceType } from "@/lib/domain";
import { formatDateTime, humanize } from "@/lib/format";

export function EvidenceExplorer({ evidence }: { evidence: EvidenceItem[] }) {
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [caseId, setCaseId] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const statuses = useMemo(() => [...new Set(evidence.map((e) => e.verificationStatus))], [evidence]);
  const sources = useMemo(() => [...new Set(evidence.map((e) => e.sourceType))], [evidence]);
  const cases = useMemo(() => [...new Set(evidence.map((e) => e.caseId))].sort(), [evidence]);
  const shown = useMemo(
    () =>
      evidence.filter(
        (e) =>
          (status === "all" || e.verificationStatus === status) &&
          (source === "all" || e.sourceType === source) &&
          (caseId === "all" || e.caseId === caseId),
      ),
    [evidence, status, source, caseId],
  );
  const open = evidence.find((e) => e.id === openId) ?? null;

  const columns = useMemo<ColumnDef<EvidenceItem, unknown>[]>(
    () => [
      {
        id: "id",
        header: "Evidence",
        accessorFn: (e) => e.id,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setOpenId(row.original.id)}
            className="font-mono text-xs text-primary underline-offset-2 hover:underline"
            aria-label={`Open evidence ${row.original.id}`}
          >
            {row.original.id}
          </button>
        ),
      },
      {
        id: "title",
        header: "Title",
        accessorFn: (e) => e.title,
        cell: ({ row }) => <span className="text-dense">{row.original.title}</span>,
      },
      {
        id: "status",
        header: "Verification",
        accessorFn: (e) => e.verificationStatus,
        cell: ({ row }) => <ClaimStateBadge state={row.original.verificationStatus} />,
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (e) => e.sourceType,
        cell: ({ row }) => (
          <div>
            <div className="text-dense">{humanize(row.original.sourceType)}</div>
            <div className="font-mono text-xs text-text-tertiary">{row.original.sourceRecordId}</div>
          </div>
        ),
      },
      {
        id: "case",
        header: "Case",
        accessorFn: (e) => e.caseId,
        cell: ({ row }) => (
          <Link href={`/investigations/${row.original.caseId}`} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
            {row.original.caseId}
          </Link>
        ),
      },
      {
        id: "observed",
        header: "Observed",
        accessorFn: (e) => e.observedAt,
        cell: ({ row }) => (
          <time dateTime={row.original.observedAt} className="font-mono text-xs">
            {formatDateTime(row.original.observedAt)}
          </time>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Verification
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by verification status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Source type
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Filter by source type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s as EvidenceSourceType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1 text-xs text-muted-foreground sm:flex-none">
          Case
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by case">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {cases.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <DataTable data={shown} columns={columns} caption="Evidence from the latest run of each case" getRowId={(e) => e.id} />
      <SourceExcerptDrawer evidence={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
