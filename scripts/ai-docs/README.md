# AI Docs Gates

This directory is the canonical automation scope for the AI 2.5.x docs plan.

- `mise run ai-docs:dev`: fast local developer validation for AI roadmap docs.
- `mise run ai-docs:verify`: release-readiness validation for the same scope.
- Changed-file execution: this scope intentionally uses a safe deterministic fallback over the small AI docs set because the files are tiny and the check is sub-second.
- Caching: no persistent cache is used; the check reads fixed local files only, so the deterministic no-cache fallback is preferred.
- Parallelism: not needed for the current sub-second check; future slow checks must be split into independent tasks before parallelization.
- GitHub parity: `.github/workflows/ai-docs.yml` must call `mise run ai-docs:verify` with read-only contents permission.
- Failure condition: missing required AI roadmap decisions or whitespace errors in the scoped files fail the gate.
