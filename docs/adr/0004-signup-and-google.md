# ADR 0004: Password sign-up and Google sign-in

- Status: Accepted (requested after Phase 5: people could not create an account)
- Date: 2026-10-24

## Context

ADR 0003 signs sessions with an httpOnly cookie and stores scrypt password hashes. The only accounts
are three seeded demo users. There is no way to create a user, and no Google sign-in. The project
owner asked for both. The ingest API stays key-based.

A new account must not be able to choose `procurement` or `manager`. Those roles approve consequential
actions.

## Options

1. **Keep seeded users only.** No new code. Rejected: there is no way to create a user.
2. **Auth.js / NextAuth with a Google provider.** Familiar, but it replaces the session ADR 0003 just
   accepted and adds a runtime dependency for two flows.
3. **Keep the signed cookie.** Add a password sign-up action and a Google authorization-code callback
   implemented with `fetch` and `node:crypto` (PKCE + HMAC state cookie). No new package. Google is
   optional: if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are unset, the button is disabled and
   says so.

## Decision

Option 3.

- Sign-up collects display name, email and password. The server always assigns `reviewer` on
  `DEMO_TENANT_ID`. The form cannot set role or tenant.
- Google uses the authorization code flow with PKCE. The callback exchanges the code with the client
  secret, then reads OpenID userinfo. Unverified emails are rejected. A matching email links
  `google_sub` and keeps the existing role. A new Google user is a reviewer with no password.
- `password_hash` may be null only when `google_sub` is set. Password sign-in of a Google-only account
  uses the same generic failure as a wrong password.
- Both secrets are server-only. Settings show Google as set or not set.

## Consequences

- Creating an account does not grant procurement or manager. Those roles stay on seeded users until a
  later, authorized admin path exists.
- Google sign-in does nothing until an OAuth client is configured. Redirect URI:
  `{origin}/api/auth/google/callback` (localhost over http, otherwise https).
- Linking Google to an existing email signs that person in with their current role. It does not upgrade them.
- Password reset and MFA are still absent.

## Revisit criteria

- An admin UI for roles, or more than one tenant: add an authorized role-assignment path.
- Immediate session revocation: ADR 0003 revisit (server-side session table).
