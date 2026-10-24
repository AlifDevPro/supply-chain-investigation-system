# ADR 0001: Frontend stack for Phase 1

- Status: Accepted (Phase 1 UI plan approved by the project owner)
- Date: 2026-10-24

## Context

The repository was empty apart from `AGENTS.md`, `README.md`, rules and skills. Phase 1 needs a runnable
application shell with Overview, Live Activity and Investigation pages on clearly labeled synthetic data.
`AGENTS.md` section 13 proposes Next.js, React, strict TypeScript, Tailwind CSS and shadcn/ui when the
repository does not dictate another stack. No backend, database, authentication or AI provider exists yet.

## Options

1. Keep the repository docs-only and prototype in static HTML. Lowest dependency cost, but cannot
   become the production frontend and would be thrown away.
2. Next.js (App Router) + React + strict TypeScript + Tailwind v4 + shadcn/ui. Matches the documented
   proposal; shadcn components are copied into the repo (no runtime UI-kit dependency); server
   components allow a later swap of fixtures for API calls without redesign.
3. Vite + React SPA. Smaller, but no server component boundary for a future backend-for-frontend,
   and diverges from `AGENTS.md`.

## Decision

Option 2.

Dependencies added in Phase 1 and why:

- `next`, `react`, `react-dom`, `typescript` (strict, `noUncheckedIndexedAccess`): application, type safety.
- `tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`, `class-variance-authority`, `clsx`,
  `tailwind-merge`: styling layer required by shadcn/ui.
- `radix-ui`, `lucide-react`: accessible primitives and the single icon family.
- `next-themes`: light/dark/system theme with no flash on load.
- `@fontsource-variable/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `@fontsource-variable/source-serif-4`:
  self-hosted fonts loaded through `next/font/local`, so the app makes no request to a third-party font
  host (relevant for an enterprise tool). Plex Sans is the UI face, Plex Mono is for identifiers and
  timestamps, Source Serif is used only for page titles.
- `@tanstack/react-table` pinned to major 8: sorting, filtering and pagination for dense tables.
  v8 is the API shadcn/ui's data-table guidance targets; v9 was not adopted to avoid an unverified API change.
- `zod`: runtime validation of fixture data and, later, API boundaries.
- `vitest`, `@vitejs/plugin-react`, `jsdom`, Testing Library, `axe-core`: unit and component tests,
  including automated accessibility assertions.

Explicitly not added: a chart library, a graph library, an animation library, a state-management library,
any backend or database client.

Toolchain note: Node was not installed on the development machine. A project-local Node 24 is kept in
`.tools/` (git-ignored, checksum verified against nodejs.org `SHASUMS256.txt`). Any Node >= 22 works.

Supply-chain note: the shadcn CLI generated `import { cn } from "cn"`, which points to an unrelated
third-party npm package. These imports were rewritten to the local `@/lib/utils` and the `cn` package
was removed. Review CLI-generated imports after every `shadcn add`.

Configuration note: `next.config.ts` sets `agentRules: false`. Without it, `next dev` appends a generated
"nextjs-agent-rules" block to `AGENTS.md`, which this repository treats as a human-owned contract.

## Consequences

- One framework for UI and (later) API routes; fixtures sit behind a data-access boundary so Phase 2+ can
  replace them without touching components.
- shadcn components live in `src/components/ui` and are ours to maintain.
- Tailwind v4 is CSS-first; tokens live in `src/app/globals.css`.

## Revisit criteria

- If a separately deployed backend becomes the only data source and SSR gives no benefit, reconsider an SPA.
- Adopt a chart or graph library only when Reports (Phase 7) or the Supply Chain Graph have defined requirements.
- Revisit `@tanstack/react-table` v9 after its API is verified against our table needs.
