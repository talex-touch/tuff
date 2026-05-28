# Tuff v2.4.11-beta.5 Release Notes

## Highlights

- Added the CoreApp performance baseline and optimization plan, covering startup, CoreBox search, resident CPU/memory usage, build speed, and package size analysis, with low-risk `build:vite` and `perf:bundle:size` analysis entry points.
- Improved CoreApp theme resolution and safer preload debug log rendering to reduce runtime debug-surface risk and console noise.
- Expanded TuffEx component capabilities and docs examples, including BaseAnchor, ContextMenu, Checkbox, Rating, Dialog, and related interaction/visual/test coverage.
- Improved the Nexus docs experience with component composition demos, Dashboard chart wrappers, docs loading/outline/navigation fixes, and the bilingual release notes generation flow.
- Restored the TuffEx publish gate with lockfile/workspace catalog workflow triggers and publish-safe manifest validation.

## Validation

- `pnpm -C "apps/core-app" run perf:bundle:size -- --json --top 3` passed locally and can read existing `out` / `dist` artifacts to emit a JSON report.
- GitHub Actions creates this beta release only after the Build and Release matrix succeeds.
- Nexus release sync consumes the same bilingual notes payload.

## Known Limitations

- The new performance baseline only adds observability and analysis entry points; it does not change `build`, `quality:pr`, or `quality:release` gate semantics.
- `quality:release` still needs the existing full-repo lint/build debt follow-up tracked in TODO; this beta does not claim the release gate is fully green.
- Platform validation, signing status, and release evidence remain governed by the release evidence and asset checklist for this version.
