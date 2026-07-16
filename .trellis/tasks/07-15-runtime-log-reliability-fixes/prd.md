# Fix runtime logs and reliability defects

## Goal

Eliminate every actionable defect found in the 2026-07-15 CoreApp runtime-log audit so configuration changes persist, main-process work remains responsive, download and process lifecycles are deterministic, and runtime logs retain one high-signal record per event.

## Background

The audited development run produced 31,477 general-log lines and 26,581 error-log lines. One invalid namespaced storage key generated 2,819 failed persist attempts and 98.57% of top-level error events. Clipboard polling blocked the Electron main event loop up to 16.058 seconds. The same run also exposed repeated Intelligence provider rebuilds, retryable 404 downloads, worker-capacity races, plugin-host restart-on-shutdown, orphaned development processes, duplicate terminal logging, and several expected/transient states logged as warnings or errors.

## Requirements

- R1: Preserve safe namespaced renderer storage keys while preventing traversal and rejecting invalid keys before cache mutation.
- R2: Prevent permanent storage failures from remaining in an unbounded five-second dirty retry loop.
- R3: Avoid expensive clipboard payload reads unless the native clipboard sequence changed; heavy payload work must not monopolize the main event loop.
- R4: Make Intelligence prompt-schema synchronization idempotent and preserve `updatedAt` when semantic prompt content is unchanged.
- R5: Classify HTTP status failures structurally; 404/410 are terminal file-not-found failures and are logged once.
- R6: Enforce one global configured download concurrency budget with atomic reservation.
- R7: Stop plugin-host processes intentionally without restart and make the restart budget effective for crash loops.
- R8: Keep the CoreBox index-commit stream registered, reconnectable, and immune to stale-controller races.
- R9: Do not invoke `text.translate` when the governed capability is unavailable.
- R10: Ensure development command termination cleans the Electron process tree.
- R11: Emit each runtime log once to the terminal while retaining general and error files.
- R12: Treat macOS no-frontmost-application (`-1719`) as a transient state with bounded logging.
- R13: Treat offline telemetry timeouts and `net::ERR_FAILED` as deferred delivery, with aligned cancellation-aware timeouts.
- R14: Classify expected development renderer termination before emitting an error.
- R15: Rate-limit unavailable desktop-wallpaper diagnostics.
- R16: Stop INFO logging for unchanged clipboard file reads.
- R17: Create plugin log sessions only for real active plugin sessions; no empty duplicate session directories.
- R18: Preserve existing security boundaries, typed transports, storage sync identities, and production diagnostics.
- R19: Migrate every affected caller without compatibility shims or deprecated paths.

## Child Tasks

- `07-15-storage-persistence-integrity`
- `07-15-clipboard-main-loop-stalls`
- `07-15-intelligence-config-idempotency`
- `07-15-download-scheduling-reliability`
- `07-15-runtime-process-lifecycles`
- `07-15-runtime-log-signal-quality`

## Acceptance Criteria

- [x] Prompt Library and DivisionBox namespaced keys hydrate, save, restart, and reload from disk without traversal exposure or polling errors.
- [x] A rejected storage key is rejected synchronously and does not enter the dirty queue.
- [x] Repeated unchanged clipboard polls do not call image/file/text payload readers; large-image and file captures no longer produce multi-second main-loop stalls in the exercised scenario.
- [x] Two consecutive Intelligence config loads with unchanged input perform no second save and no second provider rebuild.
- [x] HTTP 404 performs one attempt, reports file-not-found, and writes one terminal failure record.
- [x] Active downloads never exceed the configured global concurrency under a burst submission.
- [x] Planned plugin-host shutdown spawns no replacement; repeated early crashes eventually exhaust the restart budget.
- [x] Index-commit stream start, failure, retry, and disposal each leave exactly one live controller/timer.
- [x] Unavailable translation capability renders/returns the unavailable state without invoking translation.
- [x] Stopping the development command leaves no Electron child process owned by that run.
- [x] One application log call produces one terminal line; expected/transient states use the agreed lower severity and rate limits.
- [x] Plugin runs create no zero-byte duplicate log session.
- [x] Relevant existing checks and an end-to-end clean development smoke run pass without the audited signatures.

## Out of Scope

- Making remote telemetry endpoints available.
- Replacing Electron's clipboard implementation or adding unrelated product features.
- Broad logging-format redesign beyond deduplication, severity, and rate control required by this audit.
