"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "./actions";
import { LOGIN_IDLE } from "./state";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, LOGIN_IDLE);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Email</span>
        <Input name="email" type="email" autoComplete="username" required maxLength={120} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Password</span>
        <Input name="password" type="password" autoComplete="current-password" required maxLength={200} />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div aria-live="polite" className="min-h-5 text-sm text-status-conflicted">
        {state.status === "error" ? state.message : null}
      </div>
    </form>
  );
}
