---
name: implement-phase
description: Implement one approved roadmap phase as a tested runnable vertical slice.
---
1. Read AGENTS.md, roadmap and relevant security/domain docs.
2. Inspect repository, tests and git diff.
3. Confirm the single approved phase.
4. State intended changes, assumptions and acceptance criteria.
5. Implement the smallest end-to-end slice; do not scaffold future phases.
6. Add tests for normal, invalid, permission and failure paths.
7. Run focused tests and relevant lint/typecheck/build.
8. Inspect diff for secrets, bypasses, fake integrations and unnecessary dependencies.
9. Update docs.
10. Report changed files, exact commands/results, limitations and next decision. Never claim tests passed unless run.
