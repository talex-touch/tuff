# Tuff v2.4.9-beta.15 Release Notes

## Highlights

- Fixed `build-and-release` so beta tags and `SNAPSHOT` versions are always published as GitHub pre-releases instead of being mislabeled as stable releases.
- Re-validated and hardened the desktop packaging pipeline locally on macOS snapshot build, including `module-details-from-path`, `require-in-the-middle`, the `langsmith -> uuid / semver / p-queue` runtime dependency chain, and the `compressing -> tar-stream -> readable-stream` dependency closure in the packaged app.
- Added recursive sync and verification for every runtime module that must live in `resources/node_modules`, reducing follow-up startup failures from deeper transitive dependencies.
- Synced the `@vue/compiler-sfc` runtime closure into `resources/node_modules` and verified it during packaging, preventing packaged app startup failures caused by missing compiler dependencies such as `@vue/compiler-core`.
- Fixed packaged `SearchIndexWorker` startup by lazily loading the search logger path, avoiding a static pull-in of Electron-only main-process dependencies that caused `Cannot find module 'electron'`.
- When macOS Automation permission for `System Events` is missing, active-app detection now backs off and degrades quietly instead of repeatedly emitting full-stack error logs.
- Cleaned up duplicate-launch handling by routing `second-instance` through the app event bus and checking window liveness before focus, preventing the macOS `Object has been destroyed` exception from recurring in logs.
- Added runtime UI integrity checks for `webcontent` plugins such as `clipboard-history`: install now validates required entry files, an already-installed plugin can self-heal missing files once from a sibling `.tpex` archive when available, and failed installs clean up broken plugin directories so retries are not blocked by leftovers.
- Re-validated packaged app startup through the real macOS GUI launch path. The previous "main process missing module on startup" failure did not reproduce.

## Impact

- Beta release semantics are now aligned across GitHub Release, Nexus Release, and the client update channel.
- The current beta package can be used as the next pre-release validation baseline.
