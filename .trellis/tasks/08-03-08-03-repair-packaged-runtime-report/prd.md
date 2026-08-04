# Repair packaged runtime closure and publish optimization report

## Goal

Repair official plugin seed and search worker packaging, restore shared transport lint, verify packaged search, and publish a detailed per-stage before/after optimization page.

## Confirmed facts

- Raw `electron-builder --dir` packages the current resource projection and therefore fails when official plugin seeds have not been built and synchronized. The canonical `build-target.js --dir` flow already owns prerequisite builds and `syncOfficialPluginBundledRuntimes()`.
- `electron-vite` emits `search-index-worker.js` at `out/main/search-index-worker.js`, while the bundled client currently resolves it relative to a generated `out/main/chunks/*.js` module and requests the nonexistent `out/main/chunks/search-index-worker.js`.
- The lifecycle optimization is committed as `378255ba9`; its parent is the before baseline for final evidence.

## Requirements

- Use the canonical release build pipeline for unpacked/package evidence; do not weaken afterPack seed validation or hand-copy stale plugin output.
- Resolve the search-index worker from explicit verified candidates that cover generated chunk, main output, packaged `app.asar`, and development output layouts. Fail closed with the checked candidates when none exists.
- Restore the scoped shared transport lint gate without broad unrelated restyling.
- Package and launch an isolated CoreApp profile; prove startup health, official seed installation, a live search-index worker, CoreBox search interaction, no eager Pi runtime, and hidden telemetry suspension.
- Collect grounded per-stage before/after evidence for baseline, lazy Pi runtime, hidden-renderer RAF ownership, native visibility handshake, and packaged-runtime closure.
- Publish a self-contained detailed HTML report page under `docs/engineering/reports/corebox-runtime-lifecycle-2026-08-03/` with stage actions, metrics, evidence strength, remaining risks, and a sourced competitor-positioning section for uTools, Raycast, TinyCast, and Rubick.

### Runtime performance remediation

- Settings animation work must have one owner, pause when the kept-alive settings route or document is inactive, and cap visible WebGL plus RAF-jank sampling at 30 Hz rather than display refresh rate.
- CoreBox must be created on first use and reclaimed after 60 seconds hidden; DivisionBox must not prewarm or refill an unused window; MetaOverlay must be created on first show and release its renderer on hide while preserving registered actions.
- The proven libSQL file-transaction retention path must not be invoked once per mdls result or once per reconcile delta. App metadata must reuse bounded chunk transactions, reconcile upserts/deletes must enter the search writer in provider batches, and no dependency monkey-patch or forced GC is allowed.
- macOS recursive roots must use the native FSEvents-backed watcher path rather than opening one `fs.watch` descriptor per discovered file; Windows and Linux watcher behavior remains unchanged.

## Acceptance Criteria

- [x] Canonical macOS arm64 `--dir` packaging passes after building and synchronizing every official plugin seed; afterPack remains strict.
- [x] The packaged app starts without `search-index-worker.runtime` or worker-path unhandled-rejection errors.
- [x] Focused worker resolver tests, scoped lint, node/web typechecks, production build, and isolated Electron search smoke pass.
- [x] Scoped `packages/utils` transport lint passes; any wider unrelated lint debt is reported rather than hidden.
- [x] The report shows every optimization stage, exact before/after values where measured, qualitative contract deltas where a numeric metric is invalid, commands/artifact paths, and explicit caveats.
- [x] The report page is exercised in Chromium at desktop and narrow mobile widths with no clipping, console errors, or broken interactions.

- [x] Visible settings animation owns at most one timer and one RAF per loop, schedules no work while deactivated/hidden, and same-machine CPU drops materially without changing the header appearance.
- [x] A fresh packaged profile starts with no CoreBox, DivisionBox, or MetaOverlay renderer; CoreBox search still opens on demand, MetaOverlay actions still work across repeated show/hide, and hidden CoreBox is destroyed after its idle TTL.
- [x] Fresh-profile mdls reconciliation no longer schedules one transaction per app; after startup, search stress, and the idle window, numeric FDs remain below the existing 256 health threshold without GC.

## Constraints

- Do not enable `TUFF_DB_SEARCH_SPLIT_ENABLED`; the split-write migration remains owned by `07-28-migrate-search-index-split-write-paths`.
- Do not mutate the production user profile or databases; all runtime evidence uses disposable profiles.
- Do not claim competitor resource numbers unless directly measured under comparable conditions. Official/public feature comparisons must link sources and be labeled separately from local measurements.
- Do not convert generated bundled plugin payloads into hand-maintained source.
