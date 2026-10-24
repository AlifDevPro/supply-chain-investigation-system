"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaseStateBadge, CASE_STATE_CONFIG } from "@/components/status/case-state-badge";
import { ClaimSummary } from "@/components/status/claim-summary";
import { ImpactStatusBadge } from "@/components/status/impact-status-badge";
import { SeverityIndicator } from "@/components/status/severity-indicator";
import { SEVERITY_RANK } from "@/lib/derive";
import { caseStateSchema, type CaseState, type InvestigationCase, type Severity } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";

function buildColumns(compact: boolean): ColumnDef<InvestigationCase, unknown>[] {
  const cols: ColumnDef<InvestigationCase, unknown>[] = [
    {
      id: "severity",
      header: "Severity",
      accessorFn: (c) => SEVERITY_RANK[c.severity],
      cell: ({ row }) => <SeverityIndicator severity={row.original.severity} />,
      sortingFn: "basic",
    },
    {
      id: "case",
      header: "Case",
      accessorFn: (c) => c.id,
      cell: ({ row }) => (
        <div className="min-w-48 max-w-sm">
          <Link
            href={`/investigations/${row.original.id}`}
            className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {row.original.id}
          </Link>
          <div className="text-dense text-foreground">{row.original.title}</div>
        </div>
      ),
    },
    {
      id: "state",
      header: "State",
      accessorFn: (c) => c.state,
      cell: ({ row }) => <CaseStateBadge state={row.original.state} />,
    },
    {
      id: "impact",
      header: "Impact",
      accessorFn: (c) => c.shortage?.quantity ?? -1,
      cell: ({ row }) =>
        row.original.impactStatus === "none" ? (
          <span className="text-xs text-text-tertiary">{row.original.impactLabel}</span>
        ) : (
          <div className="space-y-1">
            <div className="text-dense">{row.original.impactLabel}</div>
            <ImpactStatusBadge status={row.original.impactStatus} />
          </div>
        ),
    },
  ];
  if (!compact) {
    cols.push(
      {
        id: "claims",
        header: "Claims",
        enableSorting: false,
        cell: ({ row }) => <ClaimSummary counts={row.original.claimSummary} />,
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (c) => c.ownerName,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-dense">{row.original.ownerName}</div>
            <div className="text-xs text-muted-foreground">{row.original.ownerRole}</div>
          </div>
        ),
      },
    );
  }
  cols.push({
    id: "updated",
    header: "Updated",
    accessorFn: (c) => Date.parse(c.updatedAt),
    cell: ({ row }) => (
      <time dateTime={row.original.updatedAt} className="font-mono text-xs whitespace-nowrap text-muted-foreground">
        {formatDateTime(row.original.updatedAt)}
      </time>
    ),
    sortingFn: "basic",
  });
  return cols;
}

/** Investigations table with search, state and severity filters. Filtering is client-side over the loaded set. */
export function InvestigationsTable({
  cases,
  compact = false,
  pageSize = 10,
  showFilters = true,
}: {
  cases: InvestigationCase[];
  compact?: boolean;
  pageSize?: number;
  showFilters?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<CaseState | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (state === "all" || c.state === state) &&
        (severity === "all" || c.severity === severity) &&
        (q === "" || c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.ownerName.toLowerCase().includes(q)),
    );
  }, [cases, query, state, severity]);

  const columns = useMemo(() => buildColumns(compact), [compact]);
  const presentStates = useMemo(
    () => caseStateSchema.options.filter((s) => cases.some((c) => c.state === s)),
    [cases],
  );
  const filtering = query !== "" || state !== "all" || severity !== "all";

  return (
    <div className="space-y-3">
      {showFilters ? (
        <div role="search" aria-label="Filter investigations" className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search case, title or owner"
            aria-label="Search investigations"
            className="h-8 w-full max-w-64 text-dense"
          />
          <Select value={state} onValueChange={(v) => setState(v as CaseState | "all")}>
            <SelectTrigger size="sm" aria-label="Filter by state" className="w-44 text-dense">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {presentStates.map((s) => (
                <SelectItem key={s} value={s}>
                  {CASE_STATE_CONFIG[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => setSeverity(v as Severity | "all")}>
            <SelectTrigger size="sm" aria-label="Filter by severity" className="w-40 text-dense">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          {filtering ? (
            <button
              type="button"
              className="rounded-sm px-2 py-1 text-dense text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setQuery("");
                setState("all");
                setSeverity("all");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
      <DataTable
        data={filtered}
        columns={columns}
        caption="Investigations"
        pageSize={pageSize}
        getRowId={(c) => c.id}
        showDensityToggle={!compact}
        initialSorting={[{ id: "updated", desc: true }]}
        emptyMessage={filtering ? "No investigations match these filters." : "No investigations."}
      />
    </div>
  );
}
