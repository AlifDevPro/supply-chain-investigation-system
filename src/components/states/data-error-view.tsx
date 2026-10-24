import { AccessDeniedError, DataUnavailableError } from "@/lib/data";
import { ErrorState, PermissionDeniedState } from "./state-views";

/**
 * Maps a typed data error to its explicit state. Unknown errors are not echoed to the user:
 * messages, stack traces and internals stay out of the page.
 */
export function DataErrorView({ error, what = "this view" }: { error: unknown; what?: string }) {
  if (error instanceof AccessDeniedError) return <PermissionDeniedState />;
  if (error instanceof DataUnavailableError) {
    return (
      <ErrorState title={`Could not load ${what}`}>
        {error.hint ?? "The data source did not respond."} Nothing is shown rather than showing stale or partial values as current.
      </ErrorState>
    );
  }
  return (
    <ErrorState title={`Something went wrong loading ${what}`}>
      The error was recorded. Reload the page, or contact an administrator if it persists.
    </ErrorState>
  );
}
