# Packaged Cold Startup Long-Tail Notes

> Date: 2026-05-17
> Baseline: CoreApp `2.4.10-beta.25`

## Current Evidence

- Packaged artifact: `apps/core-app/dist/mac-arm64/tuff.app`
- `apps/core-app/package.json` version: `2.4.10-beta.25`
- Bundle version: `2.4.10-beta.25`
- Signing check: `codesign --verify --deep --strict "apps/core-app/dist/mac-arm64/tuff.app"` completed without output.
- Cold benchmark summary: `../startup-packaged-cold-runs-2026-05-17/汇总报告.md`
- Cold benchmark per-run long-tail sample: `../startup-packaged-cold-runs-2026-05-17/第01次运行报告.md`

## Long-Tail Observation

The cold benchmark passes 10/10 runs with 0 WARN and 0 ERROR. The current P95 is
`3400ms`, which is still within the benchmark budget but close enough to keep UI
first-screen evidence open.

Run 01 is the long-tail sample:

- Startup health check passed: `3400ms`
- Renderer ready: `3200ms`
- All modules loaded: `809ms`
- `StartupAnalytics.totalStartupTime`: `1856ms`
- `userDataDir`: `docs/engineering/reports/startup-packaged-cold-runs-2026-05-17/user-data/run-01`

## Completion Boundary

This note closes the cold-start benchmark artifact requirement only. It does not
prove first-screen usability, perceived loading quality, CoreBox rendering, or
failure-state readability. Those still require real Electron or packaged UI
screenshots or recordings.
