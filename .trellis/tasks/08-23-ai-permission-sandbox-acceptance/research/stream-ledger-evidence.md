# Stream Ledger Evidence

## Scope

- Evidence date: 2026-08-24.
- Level: synthetic Provider plus real temporary SQLite migration chain.
- This evidence does not represent a real Provider, user profile, packaged Electron, or production billing run.

## Proven Contracts

- Primary and fallback success each commit at most one request-level success audit from the final Provider trace, provider, model, usage, and latency.
- Recoverable primary failure is not committed separately. Pre-delta terminal failure and post-delta interruption each commit one redacted failure audit.
- Cancellation, consumer early-return, and outer-governed streams do not create an inner failure or duplicate ledger entry.
- Success audit completion precedes publication of the terminal `end` event.
- Audit flush writes audit and day/month usage in one database transaction, then invalidates only the affected caller usage snapshot. Quota configuration and minute admission state remain intact.
- Error, prompt, response, credential, token, and path canaries are absent from serialized audit and warning projections.

## Verification

| Gate | Result |
| --- | --- |
| Focused Vitest | 5 files, 80 tests passed |
| Stream SDK branch | 66 tests passed |
| Real SQLite stream ledger | 1 test passed |
| CoreApp Node typecheck | passed |
| Scoped ESLint | passed with zero warnings |
| Main-process DB scheduler grep | no forbidden scheduled `withSqliteRetry` match |
| `git diff --check` | passed for the reviewed snapshot |

The SQLite case verifies one completed synthetic stream produces one audit row, one day row, one month row, 1,500 total tokens, and an estimated cost of `0.00045`. The same quota-manager singleton reads the updated snapshot after flush without a manual cache clear.

## Negative Controls

- Restoring the old flush ordering makes the concurrent drain regression fail.
- Removing caller-scoped usage cache invalidation leaves the post-flush quota snapshot stale and makes the SQLite integration fail.
- Publishing `end` before the success audit settles makes the strict terminal-order test fail.

All mutations were restored before the passing verification above.
