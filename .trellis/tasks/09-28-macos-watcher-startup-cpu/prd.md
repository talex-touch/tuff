# Fix macOS file watcher startup CPU saturation

## Goal

Reduce sustained macOS startup CPU use and multi-second main-thread stalls without losing file search freshness. Deliver a reproducible local validation record, an upstream bug report, and a focused pull request.

## Background

- The user approved creating this Trellis task on 2026-09-28. Implementation still requires review of the planning artifacts.
- Installed release: Tuff 2.4.14-beta.50, macOS 15.7.5, Apple Silicon, 14 logical CPUs. Upstream checkout baseline: `13903cb9b56fbb0acd30323616164c62150a0559`.
- Read-only observations found main-process CPU at 196.6–260.8% in five samples, still 163.3% after eight minutes; a restarted process later reached 278.5% after nine minutes.
- Application logs recorded event-loop delays of 4435–5648 ms. Two native samples contained substantial filesystem metadata and directory traversal work on the main thread.
- The installed watcher defaults to the home directory at depth 24 on macOS. Its initial traversal is separate from the automatic full-indexing schedule (`file-system-watcher.ts:103`, `file-provider-watch-service.ts:468`; full paths are in `research/local-evidence.md`).
- A repeated isolated probe confirmed 20,450 stat/lstat/readdir calls and 410–493 ms process CPU when registering the pinned watcher over 20,000 admitted files. Raw FSEvents registered without those JavaScript filesystem calls and still delivered new-file events. This lower-bound comparison does not establish complete event parity or attribute every real-app stall to that watcher.
- During observation the application restarted and its index database changed independently of this investigation. Those observations are not a controlled A/B test.
- Detailed local evidence is retained outside the repository; only redacted, task-relevant summaries may be published.

## Requirements

- **R1 — Causal evidence:** reproduce the startup workload with a controlled, repeatable comparison before choosing the final fix. Distinguish watcher enumeration from indexing, rendering, and unrelated host processes.
- **R2 — Resource use:** prevent unnecessary startup filesystem work from continuously saturating the main process. Preserve the existing user-visible file-search scope rather than silently narrowing it as the production fix.
- **R3 — Event compatibility:** preserve supported file/directory add, change, rename and removal behavior, ignore rules, depth limits, permission recovery, and shutdown cleanup for the affected watcher consumers.
- **R4 — Local safety:** do not delete/rebuild the user's database, change permanent app settings, replace the signed installed app, read secrets, or include personal paths/content in public artifacts. Any app experiment must have an isolated data directory or an explicitly verified non-destructive path and a documented rollback.
- **R5 — Platform boundary:** focus real-host validation on this Apple Silicon macOS host. Preserve Windows/Linux behavior and report untested platforms honestly.
- **R6 — Upstream delivery:** follow the issue/PR templates, disclose related existing reports rather than claiming no similar issue exists, add regression coverage, and publish the authorized issue and matching PR only after implementation review and local validation.

## Acceptance Criteria

- [ ] **AC1 / R1:** a reproducible probe captures the problematic path and fails before the fix; repeated comparable runs distinguish the selected cause from unrelated CPU load.
- [ ] **AC2 / R2:** on 20,000 admitted existing files, registration uses at most 64 instrumented stat/lstat/readdir calls per root and median watcher-process CPU at most 10% of the matched baseline; actual warm-index app validation satisfies the separate idle-window budgets in `design.md`. Report partial improvement if the real application's original symptom remains.
- [ ] **AC3 / R3:** tests cover real filesystem event delivery plus lifecycle/error cases relevant to the changed backend, including changes made during startup and new directory subtrees.
- [ ] **AC4 / R4:** experiments leave the user's installed application, existing configuration and databases untouched; temporary watchers/processes are closed and rollback is verified.
- [ ] **AC5 / R5:** focused tests, applicable lint/type checks and a real macOS integration probe pass; unsupported or unexecuted checks are listed without extrapolating cross-platform success.
- [ ] **AC6 / R6:** the issue and PR contain redacted reproduction steps, linked regression evidence, scope/risks and exact local test commands, and link to each other.

## Out Of Scope

- Database cleanup/migration, clipboard/OCR optimization, generic memory-leak fixes, UI redesign, broad indexing architecture changes, auto-update/release, merge or deployment.
- Promising that all host fans stop: other applications also consumed CPU during the original observation.
