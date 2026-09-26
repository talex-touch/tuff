# Bound Tuff indexing memory and icon storage

## Goal

Execute the approved Issue 1964 remediation in order: bounded indexing and diagnostics, on-demand path icons, resumable legacy icon migration, native crash delivery evidence, isolated 100k and three-hour acceptance. No real-profile writes, commits, pushes, or releases.

## Requirements

- Execute sequentially: diagnostics and bounded content indexing; on-demand path-backed icons; resumable legacy icon conversion; native crash reporting evidence; large-scale and long-running isolated acceptance.
- Keep filesystem coverage, search visibility, durable enrichment recovery, mutation leases, single-writer database ownership, and shutdown safety intact.
- Bound total admitted content work and retained result bytes, not only each batch. Excess work stays durably recoverable without an unbounded promise/timer queue.
- Stop scan-driven file-icon production and Base64 writes. Preserve lazy result icons, custom file icons, platform-specific native safety, and exact tfile allowlists.
- Convert only reconstructable file-icon values in bounded pages: write and verify the file before replacing its database value; preserve the old value on failure; resume after interruption. No database deletion or automatic VACUUM.
- Reuse Sentry Electron native minidump delivery; report truthful discovery/parse/transport states without uploading extra private memory snapshots or bypassing disabled reporting.
- Include the already-present startup IPC fix in validation; do not mix a transport-wide error-semantics rewrite into this task.
- Preserve concurrent work. Do not change the running user app or real profile, commit, push, publish, shrink search scope, or raise V8 heap limits.
## Acceptance Criteria

- [ ] A deliberately stalled consumer cannot exceed configured content admission and result-byte bounds; later completion drains the workload.
- [ ] Cancellation, database failure, interrupted enrichment, file changes, and app shutdown preserve recoverability without deadlock or stale publication.
- [ ] Cold scans do not produce one icon per file. Lazy icons render through controlled paths and repeated results reuse caches.
- [ ] Legacy conversion is bounded, interruptible, idempotent and preserves original values when filesystem or database updates fail.
- [ ] Native crash delivery is exercised in an isolated process through restart and independently observed receipt, or the exact external access blocker is recorded.
- [ ] An isolated 100k-file campaign covers slow writes and concurrent search/change; at least three hours of isolated residency records bounded queues and per-isolate memory.
- [ ] Focused tests, affected package typechecks, runtime smoke and resource delivery evidence cover the shipped local changes.
## Evidence and scope

- Issue: https://github.com/talex-touch/tuff/issues/1964. Fatal OOM is supported, but the original worker/heap owner remains unproven; cumulative scheduler q must not be presented as current backlog.
- Beta.41 source 11d76262a: the real scheduler admitted 100 batches of 20 while zero batches completed in a no-database in-memory probe. Current targeted pipeline files are identical.
- User approved this ordered implementation on 2026-09-26. Existing unrelated changes include precore.ts and Sentry service/tests; preserve their hunks.
- Large scratch artifacts and isolated profiles belong under /tmp. Real runtime crash/heap evidence is not replaced by passing unit tests.
