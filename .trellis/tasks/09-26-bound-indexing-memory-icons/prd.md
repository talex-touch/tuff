# Bound Tuff indexing memory and icon storage

## Goal

Close the residual Issue 1964 work after `v2.4.14-beta.54`: re-baseline the isolated acceptance campaigns on
the shipped pipeline (bundled `fd` enumeration, bounded writer admission, content indexing default-off,
path-backed icons, resumable legacy conversion) and re-confirm native crash delivery on the current Electron.
Steps 1 and 2 of the original order are already shipped — see
`research/2026-09-29-master-reconciliation.md`. No real-profile writes, commits, pushes, or releases.

## Requirements

Status legend: **Done** = landed on `master` with file/symbol evidence; **Invalidated** = assumption no longer holds;
**Open** = remaining work owned by this task.

1. Execute sequentially: diagnostics and bounded content indexing; on-demand path-backed icons; resumable legacy
   icon conversion; native crash reporting evidence; large-scale and long-running isolated acceptance.
   - **Done (1–3) / Invalidated (ordering) / Open (4–5).** Bounded diagnostics, admission, byte budgets and the icon
     cutover landed in `b3edffef1`; beta54 (`728d251a0`, `bd86b0af1`) then replaced the scan backend, writer admission
     and content policy. The original order must not be replayed — rename/re-scope per `implement.md`.
2. Keep filesystem coverage, search visibility, durable enrichment recovery, mutation leases, single-writer database
   ownership, and shutdown safety intact.
   - **Done and still binding.** Coverage is preserved by the fd backend's explicit `--hidden --no-ignore` plus the
     shared filter (`file-scan-fd-backend.ts:69-82`, `file-scan-worker.ts:130-163`); leases and cancellation live in
     `file-index-worker-client.ts:42-68,181`; single-writer routing is unchanged.
3. Bound total admitted content work and retained result bytes, not only each batch. Excess work stays durably
   recoverable without an unbounded promise/timer queue.
   - **Done.** `search-index-writer.ts:53-55,492` (1 active / 2 admitted waiters / 1 background waiter),
     `packages/utils/search/indexing-worker-scheduler.ts:78-79,107` (returned as `deferred`, durable in
     `file_index_progress`), `index-worker-payload-budget.ts:14,17` (1 MiB per result, 32 MiB per batch),
     `file-index-worker-client.ts:92,107,280` (admission credit held until persisted).
4. Stop scan-driven file-icon production and Base64 writes. Preserve lazy result icons, custom file icons,
   platform-specific native safety, and exact tfile allowlists.
   - **Done.** Post-scan pass is thumbnails-only (`file-provider-asset-service.ts:254`); icons render from cached PNG
     paths (`icon-service.ts:121`, `file-icon-artifact.ts:230,279`); protocol adds only
     `getFileIconCacheDirectory()` (`file-protocol/index.ts:37`). Only remaining check is O1 in `implement.md`.
5. Convert only reconstructable file-icon values in bounded pages: write and verify the file before replacing its
   database value; preserve the old value on failure; resume after interruption. No database deletion or automatic
   VACUUM.
   - **Code done, evidence open.** `file-provider-icon-migration-service.ts:59-111` with `db/utils.ts:246,266,283`
     implements keyset pages, compare-and-update and value preservation. **Open: O2** — no observed pass has reached
     completion or survived a mid-pass kill at legacy scale.
6. Reuse Sentry Electron native minidump delivery; report truthful discovery/parse/transport states without
   uploading extra private memory snapshots or bypassing disabled reporting.
   - **Done, needs re-confirmation.** `modules/sentry/sentry-service.ts` (`:63,265,921-971,1001,1028,1325`) with
     `core/precore.ts:181`. **Open: O3** — the only observed receipt predates the Electron upgrade.
7. Include the already-present startup IPC fix in validation; do not mix a transport-wide error-semantics rewrite
   into this task.
   - **Invalidated for this task.** That work is tracked separately in `.trellis/tasks/09-26-channel-error-reply-contract/`.

## Acceptance Criteria

- [x] A deliberately stalled consumer cannot exceed configured content admission and result-byte bounds; later
      completion drains the workload. — `index-worker-payload-budget.ts`, `file-provider-index-flush-service.ts:77,81`,
      `indexing-worker-scheduler.test.ts`; recorded in `research/verification-2026-09-26.md`.
- [x] Cancellation, database failure, interrupted enrichment, file changes, and app shutdown preserve recoverability
      without deadlock or stale publication. — `file-index-worker-client.ts:181`, writer cancellation-first close,
      20s external lock A/B (2026-09-27 section of the verification log).
- [ ] Cold scans do not produce one icon per file. Lazy icons render through controlled paths and repeated results
      reuse caches. — **Was verified pre-fd; re-probe required on beta54 (O1).**
- [ ] Legacy conversion is bounded, interruptible, idempotent and preserves original values when filesystem or
      database updates fail. — Bounded/interruptible/idempotent are covered by tests; **completion and memory-safe
      resume at legacy scale are unproven (O2).**
- [ ] Native crash delivery is exercised in an isolated process through restart and independently observed receipt,
      or the exact external access blocker is recorded. — Observed once at `2.4.14-beta.41@release` (Sentry event
      `a66f76b63f954801b5134c9dbf249d61`); **re-confirmation on the current build is O3.**
- [ ] An isolated 100k-file campaign covers slow writes and concurrent search/change; at least three hours of isolated
      residency records bounded queues and per-isolate memory. — Prior campaign predates fd/admission/default-off
      content; **re-baseline is O4.**
- [x] Focused tests, affected package typechecks, runtime smoke and resource delivery evidence cover the shipped local
      changes. — 2026-09-27 follow-up section of the verification log (CoreApp 57/57, side-effect 6/6, node typecheck,
      scoped ESLint, electron-vite build, real Electron runs).

## Evidence and scope

- Issue: https://github.com/talex-touch/tuff/issues/1964. Fatal OOM is supported; the original worker/heap owner
  remains unproven; cumulative scheduler counters must never be presented as current backlog (live values come from
  `getBufferSnapshot`/`pendingBytes`/`inflightBytes`).
- Landed commits: `b3edffef1` (this task), `728d251a0` + `bd86b0af1` (`.trellis/tasks/09-29-bounded-fd-fzf-file-indexing/`).
- Superseded baseline: the beta.41 `11d76262a` admission probe and every "targeted pipeline files are identical"
  claim — invalidated by beta54 (`research/2026-09-29-master-reconciliation.md` §2).
- Scope discipline: artifacts/research only in this slice; production indexing code is edited only when an O1–O4
  probe fails. Large scratch artifacts and isolated profiles belong under `/tmp`. Real runtime crash/heap evidence is
  not replaced by passing unit tests. User-approved ordered implementation on 2026-09-26; unrelated `precore.ts` and
  Sentry hunks stay preserved.
