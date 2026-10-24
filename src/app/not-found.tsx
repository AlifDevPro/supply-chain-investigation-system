import Link from "next/link";
import { EmptyState } from "@/components/states/state-views";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="Page or record not found"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/">Back to Overview</Link>
        </Button>
      }
    >
      The address may be wrong, or this record is outside your access scope.
    </EmptyState>
  );
}
