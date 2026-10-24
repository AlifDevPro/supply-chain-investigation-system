"use client";

/** Evidence id rendered as a button that opens the source excerpt drawer. */
export function EvidenceRef({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      aria-label={`Open evidence ${id}`}
      className="rounded-sm font-mono whitespace-nowrap text-xs text-primary underline underline-offset-2 hover:bg-primary-subtle"
    >
      {id}
    </button>
  );
}
