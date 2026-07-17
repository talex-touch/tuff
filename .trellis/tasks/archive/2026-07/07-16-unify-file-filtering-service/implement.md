# Implementation plan

## Sequence

1. Add the pure shared `FileFilterService`, export it from `packages/utils/common/index.ts`, and consolidate high-confidence noise constants.
2. Refactor shared scan traversal/index checks to delegate to the service while preserving `FileScanOptions` behavior.
3. Replace CoreApp incremental/manual blacklist logic with the shared service plus the existing extension metadata whitelist.
4. Add a mandatory filter immediately before file-index worker upserts; preserve filtered-entry accounting and avoid side effects for rejected records.
5. Apply early search filtering to Spotlight, Linux native search, and Everything before local limits, `stat`, icon warmup, and item construction.
6. Apply the service to indexed keyword/type/extension results and semantic recall so stale database rows remain hidden.
7. Add a provider-result publication gate before gather result counts and accumulation; add an outbound guard for recommendation, semantic recall, cache, and enrichment bypasses.
8. Remove duplicate/dead CoreApp `BLACKLISTED_*` constants and the macOS `.app`-only helper after every caller has migrated.
9. Smoke the requested examples end-to-end, then add focused permanent contract tests and run the smallest relevant quality checks.

## Behavioral checks

- Reject `.itdb`, `.tvdb`, `.localized`, metadata names, and bundle interiors.
- Preserve `.zip`, `.png`, `.jpg`, `.jpeg`, `.webp`, normal directories, and extensionless native results.
- Preserve Spotlight root containment and Everything root independence.
- Ensure filtering precedes provider result counts and visible limits.
- Ensure auto full scan and incremental indexing agree.
- Ensure manual-force cannot admit hard system metadata.
- Ensure stale indexed rows and semantic recall cannot bypass publication filtering.

## Validation commands

- Focused package-utils file filter/scan Vitest tests.
- Focused CoreApp native provider, Everything provider, file provider, and gather tests.
- `pnpm -C "apps/core-app" run typecheck:node`.
- Focused lint for touched TypeScript files when the package script supports scoped inputs.
- Scenario smoke using representative paths and item metadata.
- `git diff --check` only during the final quality gate required by project spec.

## Risk and rollback points

- **Result counts:** filter before gather logging/stats; otherwise traces disagree with UI.
- **Visible limits:** filter before `.slice()` or bounded backend limits; otherwise noise starves valid results.
- **Virtual entries:** only classify typed absolute filesystem paths at the generic publication boundary.
- **Worker compatibility:** shared service stays free of Electron and CoreApp imports.
- **Manual intent:** manual-force bypasses unsupported extensions only, never hard metadata/bundle rules.
- **Rollback:** all changes are policy/call-site changes; no schema migration or destructive rewrite.
