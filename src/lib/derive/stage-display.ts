import type { EventStatus } from "@/lib/domain";

/** Order in which statuses are listed inside a stage cell: problems first. */
export const EVENT_STATUSES_DISPLAY: readonly EventStatus[] = ["failed", "retrying", "waiting", "completed", "skipped"];
