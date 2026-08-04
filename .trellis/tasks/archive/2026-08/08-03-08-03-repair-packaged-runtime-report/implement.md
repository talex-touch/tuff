# Implementation Plan

1. Prove the official seed failure is an orchestration-entry issue by running the canonical plugin build/sync tests and macOS arm64 `build-target.js --dir` flow; change release code only if that canonical flow still fails.
2. Add a fail-closed search-index worker path resolver that supports chunked development/build and packaged layouts without changing the worker protocol or database ownership.
3. Add focused resolver regressions and run the search-index worker client tests.
4. Run scoped shared transport lint and fix only failures that remain after the lifecycle commit's staged formatter.
5. Build/package through the canonical flow, launch a disposable profile, and prove startup health, seed installation, worker readiness, CoreBox search interaction, lazy Pi runtime, and hidden telemetry suspension.
6. Collect comparable baseline/final runtime samples plus per-stage contract evidence; preserve raw JSON/log evidence outside tracked source unless the report links a curated small artifact.
7. Research current official/public competitor capabilities from primary sources. Keep feature positioning separate from locally measured resource values.
8. Build and browser-validate the detailed responsive HTML comparison page.
9. Run the full focused quality gate, update task/spec artifacts, and commit the remediation and report in coherent batches.

## Risk points

- Direct `electron-builder --dir` must not become an accepted substitute for official seed synchronization.
- `__dirname` differs when Rollup moves the client into `out/main/chunks`; tests must model both sibling and parent layouts.
- Packaged `app.asar` paths are ordinary paths for Node Worker entry resolution; do not copy the worker into ad-hoc temp storage.
- An input value in CoreBox is not proof that the search-index worker produced results.
- Baseline and final memory/CPU samples must use identical profile type, settling window, sampling cadence, architecture, and build mode.
- The HTML report must label observed facts, public-source facts, and inference separately.

10. Gate and cap SettingHeader WebGL plus renderer RAF telemetry with one timer/RAF owner; verify kept-alive route deactivation and document hiding suspend both.
11. Remove eager CoreBox, DivisionBox pool, and MetaOverlay renderer creation; add explicit on-demand creation and idle/hide teardown while preserving shortcuts, search, plugin-view transfer, and overlay actions.
12. Replace per-app mdls persistence with bounded chunk transactions, batch reconcile deltas through provider-level search-writer calls, and restore the macOS FSEvents watcher backend; then repeat isolated startup/search/mdls/idle sampling and require the process to remain below the 256 FD health threshold.
