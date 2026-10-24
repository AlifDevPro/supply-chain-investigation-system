# ADR 0003: Signed session cookie and scrypt passwords

- Status: Accepted (Phase 5 plan approved by the project owner, who chose real sign-in)
- Date: 2026-10-24

## Context

Phase 5 requires human review, versioned approvals and outcome verification. Consequential writes must
be authorized on the server (`AGENTS.md` sections 10 and 16). The project owner chose real sign-in with
roles rather than a named unauthenticated demo operator. The ingest API stays key-based and is out of
this decision.

No authentication library is installed. The existing operator actions record the actor as
"unauthenticated demo operator" behind `ENABLE_OPERATOR_ACTIONS`.

## Options

1. **Keep no login.** A server-configured demo identity plus the existing flag. Lowest cost, but the
   owner rejected it: review is not a prerequisite-free demo gesture.
2. **NextAuth / Auth.js.** Familiar session helpers and providers, but it is a new runtime dependency,
   a database adapter or JWT strategy, and more surface than three seeded demo users need. An ADR
   would still be required for that package.
3. **Signed httpOnly session cookie + `node:crypto.scrypt`.** HMAC-SHA256 over `{userId, tenantId,
   role, exp}` using `SESSION_SECRET`. Passwords stored as scrypt hashes only. No new package. Roles
   are read from the session the server minted, never from the request body.

## Decision

Option 3.

- Cookie: httpOnly, `SameSite=Lax`, `Secure` in production, path `/`.
- Payload is signed, not encrypted. It contains no password and no secret. Expiry is short enough that
  a leaked cookie is time-bounded (8 hours).
- `SESSION_SECRET` is a server-only env var, at least 32 characters. Settings show it as set or not set.
- Roles enforced in server actions and store writes:
  - `reviewer` — acknowledge, request more evidence, dismiss. Cannot approve consequential actions.
  - `procurement` — reviewer rights plus approve actions whose `requiredRole` is procurement.
  - `manager` — reviewer rights, approve any proposed action, record outcome verification.
- Demo users are seeded for the synthetic tenant. Passwords come from `DEMO_REVIEWER_PASSWORD`,
  `DEMO_PROCUREMENT_PASSWORD` and `DEMO_MANAGER_PASSWORD`. `.env.example` leaves them blank. The
  database stores hashes only.
- `/api/signals` does not use this session. Ingest remains the existing API key.

No runtime dependency is added.

## Consequences

- The app shell requires a session. Unauthenticated visitors see `/login`.
- A bug that trusts `role` or `tenantId` from the form would be an authorization bypass. Mitigations:
  session helper is the only source of identity; contract and security tests cover anonymous, wrong-role
  and forged-cookie writes.
- Password reset and MFA are not provided. Self-service sign-up and optional Google sign-in are ADR 0004.
  New accounts are reviewers.
- Because the application database role still bypasses RLS, tenant isolation for users remains a
  repository-layer rule, same as ADR 0002.

## Revisit criteria

- More than a handful of human users, or a requirement for SSO / MFA: reconsider Auth.js or an IdP.
- Multiple application instances that must revoke sessions immediately: add a server-side session
  table instead of a purely signed cookie.
- End-user database access: add RLS policies keyed on JWT claims (ADR 0002 revisit).
