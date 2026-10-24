"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signup } from "./actions";
import { SIGNUP_IDLE } from "./state";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signup, SIGNUP_IDLE);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input name="displayName" type="text" autoComplete="name" required maxLength={80} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Email</span>
        <Input name="email" type="email" autoComplete="email" required maxLength={120} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Password</span>
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Confirm password</span>
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={200} />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <div aria-live="polite" className="min-h-5 text-sm text-status-conflicted">
        {state.status === "error" ? state.message : null}
      </div>
    </form>
  );
}
