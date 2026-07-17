# Implementation Plan

1. Add an internal idempotent policy settlement contract to `NetworkService.executeWithPolicies()` while preserving eager settlement by default.
2. Attach the deferred settlement to `requestStream()` body `end` / `error` / early `close` lifecycle without wrapping or buffering chunks.
3. Add focused NetworkService regressions for open-without-reset, mid-stream failure/cooldown, full-consumption reset, and cancellation neutrality.
4. Keep LocalProvider stream regressions green to prove consumer behavior and errors are unchanged.
5. Update NetworkService/AI docs, TODO/CHANGES, and quality guidance.
6. Run focused tests, targeted lint, CoreApp node type-check, AI docs verifier, and diff check.

Rollback: remove the optional result lifecycle hook and stream listeners together; ordinary request policy logic is unchanged either way.
