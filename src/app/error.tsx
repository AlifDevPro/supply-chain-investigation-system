"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states/state-views";
import { Button } from "@/components/ui/button";

/** Last-resort boundary. The message is generic: no stack, SQL or internals are shown to the user. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log server-safe metadata only (digest links to the server log); never the message body.
    console.error("Unhandled UI error", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      actions={
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      }
    >
      This page failed to render. {error.digest ? <span className="font-mono text-xs">Reference {error.digest}.</span> : null}
    </ErrorState>
  );
}
