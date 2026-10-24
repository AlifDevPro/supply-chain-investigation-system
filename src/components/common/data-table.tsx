"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type Density = "compact" | "comfortable";

/**
 * Dense, sortable, paginated table on TanStack Table v8. Sorting is announced with aria-sort.
 * Filtering is the caller's job (pass already-filtered data); this component only sorts and pages.
 */
export function DataTable<T>({
  data,
  columns,
  caption,
  initialSorting = [],
  pageSize = 10,
  getRowId,
  showDensityToggle = true,
  emptyMessage = "No rows match.",
  className,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Accessible name for the table. */
  caption: string;
  initialSorting?: SortingState;
  pageSize?: number;
  getRowId?: (row: T) => string;
  showDensityToggle?: boolean;
  emptyMessage?: string;
  className?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [density, setDensity] = useState<Density>("compact");

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const total = data.length;
  const { pageIndex } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const rowHeight = density === "compact" ? "h-9" : "h-11";

  return (
    <div className={cn("space-y-2", className)}>
      {showDensityToggle ? (
        <div className="flex justify-end">
          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(v) => v && setDensity(v as Density)}
            variant="outline"
            size="sm"
            aria-label="Row density"
          >
            <ToggleGroupItem value="compact" aria-label="Compact rows" className="px-2 text-xs">
              Compact
            </ToggleGroupItem>
            <ToggleGroupItem value="comfortable" aria-label="Comfortable rows" className="px-2 text-xs">
              Comfortable
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table aria-label={caption}>
          <TableHeader className="bg-surface-sunken">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined}
                      className="h-9 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-accent hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp aria-hidden="true" className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown aria-hidden="true" className="size-3" />
                          ) : (
                            <ArrowUpDown aria-hidden="true" className="size-3 opacity-50" />
                          )}
                          <span className="sr-only">
                            {sorted === "asc" ? "sorted ascending" : sorted === "desc" ? "sorted descending" : "sortable"}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-20 text-center text-dense text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={cn(rowHeight, "text-dense")}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-3 py-1.5 align-middle whitespace-normal">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > pageSize ? (
        <nav aria-label={`${caption} pagination`} className="flex flex-wrap items-center justify-between gap-2 text-dense text-muted-foreground">
          <p aria-live="polite">
            Showing <span className="font-mono">{from}</span>–<span className="font-mono">{to}</span> of{" "}
            <span className="font-mono">{total}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : (
        <p className="text-dense text-muted-foreground" aria-live="polite">
          <span className="font-mono">{total}</span> {total === 1 ? "row" : "rows"}
        </p>
      )}
    </div>
  );
}
