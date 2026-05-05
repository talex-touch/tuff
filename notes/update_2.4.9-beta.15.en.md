# Tuff v2.4.9-beta.15 Release Notes

## Highlights

- Fixed `build-and-release` so beta tags and `SNAPSHOT` versions are always published as GitHub pre-releases instead of being mislabeled as stable releases.
- Re-validated and hardened the desktop packaging pipeline locally on macOS snapshot build, including `module-details-from-path`, `require-in-the-middle`, the `langsmith -> uuid / semver / p-queue` runtime dependency chain, and the `compressing -> tar-stream -> readable-stream` dependency closure in the packaged app.
- Added recursive sync and verification for every runtime module that must live in `resources/node_modules`, reducing follow-up startup failures from deeper transitive dependencies.
- Synced the `@vue/compiler-sfc` runtime closure into `resources/node_modules` and verified it during packaging, preventing packaged app startup failures caused by missing compiler dependencies such as `@vue/compiler-core`.
- Fixed packaged `SearchIndexWorker` startup by lazily loading the search logger path, avoiding a static pull-in of Electron-only main-process dependencies that caused `Cannot find module 'electron'`.
- When macOS Automation permission for `System Events` is missing, active-app detection now backs off and degrades quietly instead of repeatedly emitting full-stack error logs.
- Cleaned up duplicate-launch handling by routing `second-instance` through the app event bus and checking window liveness before focus, preventing the macOS `Object has been destroyed` exception from recurring in logs.
- Fixed the beta update detection chain: main-process version resolution no longer depends on `polyfills` timing or packaged `SNAPSHOT` metadata, so `2.4.9-beta.15` no longer opens the stale `beta.12` update prompt; update version comparison now treats `beta / alpha / snapshot` as the same preview sequence.
- Fixed duplicate and low-layer update dialogs: quick checks and `UpdateEvents.available` now share one session gate, so the same version is shown only once per session, and `blowMention` now sets an explicit z-index to avoid hidden dialogs after choosing "Remind me later".
- Added runtime UI integrity checks for `webcontent` plugins such as `clipboard-history`: install now validates required entry files, an already-installed plugin can self-heal missing files once from a sibling `.tpex` archive when available, and failed installs clean up broken plugin directories so retries are not blocked by leftovers.
- Reduced remaining main-process log noise: `CoreBoxManager.exitUIMode()` no longer emits an extra warning when the app is already outside UI mode, and optional `app:file-index:progress:stream:cancel` requests no longer produce noisy `No handler registered` logs when they arrive after stream teardown.
- Normalized upstream `403 / 429 / Cloudflare challenge` failures across update checks, startup analytics, and Sentry telemetry: update checks now emit a short deferred warning with cooldown context, startup analytics uses the same remote-failure downgrade path, and Sentry telemetry stores only a compact challenge summary instead of dumping full HTML pages into logs.
- `AnalyticsStore` queue-pressure summaries now distinguish real failures from normal throttling: throttle / skip-only situations are logged at info level, while dropped or failed persistence still stays at warn.
- Re-validated packaged app startup through the real macOS GUI launch path. The previous "main process missing module on startup" failure did not reproduce.

## Impact

- Beta release semantics are now aligned across GitHub Release, Nexus Release, and the client update channel.
- The current beta package can be used as the next pre-release validation baseline.
