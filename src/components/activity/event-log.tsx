"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { GitBranch, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/data-table";
import { SignalTraceSheet } from "@/components/activity/signal-trace";
import type { OperatorAvailability } from "@/components/investigation/operator-action";
import type { AiPanelData } from "@/lib/ai/view";
import { EVENT_STATUS_CONFIG, EventStatus } from "@/components/status/event-status";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dedupeEvents } from "@/lib/derive";
import { NO_FILTERS, filterEvents, holdEvents, isFiltering, type EventFilters } from "@/lib/derive/trace";
import {
  STAGES,
  STAGE_LABELS,
  eventStatusSchema,
  eventTypeSchema,
  type EventStatus as Status,
  type EventType,
  type InvestigationEvent,
  type SignalRecord,
  type Stage,
} from "@/lib/domain";
import { formatDuration, formatTime, formatDay } from "@/lib/format";

function buildColumns(onTrace: (correlationId: string) => void): ColumnDef<InvestigationEvent, unknown>[] {
  return [
    {
      id: "time",
      header: "Server time (UTC)",
      accessorFn: (e) => Date.parse(e.occurredAt),
      sortingFn: "basic",
      cell: ({ row }) => (
        <time dateTime={row.original.occurredAt} className="font-mono text-xs whitespace-nowrap">
          <span className="text-text-tertiary">{formatDay(row.original.occurredAt)} </span>
          {formatTime(row.original.occurredAt)}
        </time>
      ),
    },
    {
      id: "type",
      header: "Event",
      accessorFn: (e) => e.type,
      cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap">{row.original.type}</span>,
    },
    {
      id: "stage",
      header: "Stage",
      accessorFn: (e) => STAGES.indexOf(e.stage),
      sortingFn: "basic",
      cell: ({ row }) => <span className="whitespace-nowrap">{STAGE_LABELS[row.original.stage]}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (e) => e.status,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <EventStatus status={row.original.status} className="whitespace-nowrap" />
          {row.original.errorClass ? <div className="font-mono text-xs text-status-conflicted">{row.original.errorClass}</div> : null}
          {row.original.retryCount > 0 ? (
            <div className="text-xs text-muted-foreground">
              {row.original.retryCount} {row.original.retryCount === 1 ? "retry" : "retries"}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "duration",
      header: "Duration",
      accessorFn: (e) => e.durationMs ?? -1,
      sortingFn: "basic",
      cell: ({ row }) => {
        const d = row.original.durationMs;
        return (
          <span className={d === null ? "text-xs whitespace-nowrap text-text-tertiary" : "font-mono text-xs whitespace-nowrap"}>
            {formatDuration(d)}
          </span>
        );
      },
    },
    {
      id: "reference",
      header: "Reference",
      accessorFn: (e) => e.caseId ?? e.signalId ?? "",
      cell: ({ row }) => {
        const { caseId, signalId } = row.original;
        return (
          <div className="flex flex-col gap-0.5 font-mono text-xs">
            {caseId ? (
              <Link href={`/investigations/${caseId}`} className="text-primary underline-offset-2 hover:underline">
                {caseId}
              </Link>
            ) : null}
            {signalId ? <span className="text-muted-foreground">{signalId}</span> : null}
            {!caseId && !signalId ? <span className="text-text-tertiary">none</span> : null}
          </div>
        );
      },
    },
    {
      id: "method",
      header: "Method",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.method ? (
          <div className="font-mono text-xs">
            <div className="text-muted-foreground">{row.original.method.kind}</div>
            <div className="whitespace-nowrap">{row.original.method.name}</div>
          </div>
        ) : (
          <span className="text-xs text-text-tertiary">not recorded</span>
        ),
    },
    {
      id: "trace",
      header: () => <span className="sr-only">Trace</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onTrace(row.original.correlationId)}
          aria-label={`Open trace for ${row.original.type} on ${row.original.signalId ?? row.original.caseId ?? row.original.correlationId}`}
        >
          <GitBranch aria-hidden="true" />
          Trace
        </Button>
      ),
    },
  ];
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  width,
}: {
  label: string;
  value: T | "all";
  onChange: (v: T | "all") => void;
  options: Array<{ value: T; label: string }>;
  width: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T | "all")}>
      <SelectTrigger size="sm" aria-label={`Filter by ${label.toLowerCase()}`} className={`min-w-0 max-w-full ${width} text-dense`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}s</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Event table over recorded events. Duplicate deliveries are dropped by id. `pauseable` adds a
 * pause control that freezes the view while counting events that arrive; the Phase 1 replay has no
 * incoming events, so the page leaves it off rather than showing a control that does nothing.
 */
export function EventLog({
  events,
  signals,
  pauseable = false,
  operator,
  ai = null,
}: {
  events: InvestigationEvent[];
  signals: SignalRecord[];
  pauseable?: boolean;
  operator?: OperatorAvailability;
  /** Persisted modes only. */
  ai?: AiPanelData | null;
}) {
  const [filters, setFilters] = useState<EventFilters>(NO_FILTERS);
  const [traceFor, setTraceFor] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<InvestigationEvent[] | null>(null);

  const incoming = useMemo(() => dedupeEvents(events), [events]);
  const shown = frozen ?? incoming;
  const pending = frozen ? holdEvents(frozen, incoming).pending : 0;

  const rows = useMemo(() => filterEvents(shown, filters), [shown, filters]);
  const columns = useMemo(() => buildColumns(setTraceFor), []);
  const filtering = isFiltering(filters);

  const caseIds = useMemo(() => [...new Set(shown.map((e) => e.caseId).filter((c): c is string => c !== null))].sort(), [shown]);
  const types = useMemo(() => eventTypeSchema.options.filter((t) => shown.some((e) => e.type === t)), [shown]);
  const stages = useMemo(() => STAGES.filter((s) => shown.some((e) => e.stage === s)), [shown]);
  const statuses = useMemo(() => eventStatusSchema.options.filter((s) => shown.some((e) => e.status === s)), [shown]);

  const set = <K extends keyof EventFilters>(key: K) => (v: EventFilters[K]) => setFilters((f) => ({ ...f, [key]: v }));

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter events" className="flex flex-wrap items-center gap-2">
        <FilterSelect<Status>
          label="Status"
          value={filters.status}
          onChange={set("status")}
          width="w-40"
          options={statuses.map((s) => ({ value: s, label: EVENT_STATUS_CONFIG[s].label }))}
        />
        <FilterSelect<Stage>
          label="Stage"
          value={filters.stage}
          onChange={set("stage")}
          width="w-44"
          options={stages.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
        />
        <FilterSelect<EventType>
          label="Type"
          value={filters.type}
          onChange={set("type")}
          width="w-52"
          options={types.map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect<string>
          label="Case"
          value={filters.caseId}
          onChange={set("caseId")}
          width="w-36"
          options={caseIds.map((c) => ({ value: c, label: c }))}
        />
        {filtering ? (
          <button
            type="button"
            className="rounded-sm px-2 py-1 text-dense text-primary underline-offset-2 hover:underline"
            onClick={() => setFilters(NO_FILTERS)}
          >
            Clear filters
          </button>
        ) : null}
        {pauseable ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-pressed={frozen !== null}
            onClick={() => setFrozen(frozen ? null : incoming)}
          >
            {frozen ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {frozen ? "Resume updates" : "Pause updates"}
          </Button>
        ) : null}
      </div>

      {pending > 0 ? (
        <p role="status" className="rounded-md border border-dashed border-border-strong bg-surface-sunken px-3 py-2 text-dense">
          {pending} new {pending === 1 ? "event is" : "events are"} held while updates are paused.
        </p>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        caption="Recorded events"
        pageSize={15}
        getRowId={(e) => e.id}
        showDensityToggle={false}
        emptyMessage={filtering ? "No recorded events match these filters." : "No events are recorded."}
      />

      <SignalTraceSheet correlationId={traceFor} events={shown} signals={signals} onClose={() => setTraceFor(null)} operator={operator} ai={ai} />
    </div>
  );
}
