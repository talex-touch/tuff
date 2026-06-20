# Tuff v2.4.12-beta.8 Release Notes

## Highlights

- Hardened Release Integrity gates across local and remote checks: GitHub Release metadata, manifest/core artifact/signature sidecar inventory, Nexus asset matrix, canonical signature URLs, signed download URLs, and latest-channel resolution are checked more strictly.
- The local release gate now validates both source and packed npm manifests, preventing packed publish manifests from reintroducing `catalog:`, `workspace:`, `file:`, or `link:` dependency specs.
- Tightened the AI 2.5.0 Stable evidence contract: CoreBox AI Ask success evidence must show a non-empty answer plus provider/model/latency/trace/input-kind metadata, and the same screenshot or recording cannot close multiple fixed `AI-STABLE-*` evidence items.
- Improved Search / Indexing Runtime hygiene around shared snapshot cloning, progress evidence, scan eligibility, watch delta queues, worker status, flush snapshots, and task-state boundaries, with stronger handling for empty values, duplicates, negative timestamps, and nested snapshot mutation.
- Continued moving FileProvider scan progress, reset, strategy, and watch services toward the unified Indexed Source runtime/store/task boundary, reducing Settings diagnostics drift from historical roots, empty paths, or stale async results.

## Validation

- `pnpm quality:pr`
- `pnpm publish:check`
- `pnpm publish:check:pack`
- Release gate focused tests: `scripts/check-release-gates/local-checks.test.mjs` and `remote-checks.test.mjs`, 42 tests passed.
- AI evidence focused tests: `coreapp-packaged-ai-ask-probe.test.ts` and `coreapp-visible-experience-evidence.test.ts`, 26 tests passed.
- Search / Indexing focused tests: 104 `packages/utils` search tests passed, plus 58 CoreApp FileProvider / task-state tests passed.
- `git diff --check`

## Known Limitations

- This is still a beta build and does not mean Gate E real GitHub Release ↔ Nexus asset, download, signature, and latest endpoint evidence is closed.
- AI Stable real packaged Electron evidence still only partially covers `AI-STABLE-06` / `AI-STABLE-07`; `AI-STABLE-01` through `AI-STABLE-05` and `AI-STABLE-08` still require screenshots/recordings and trace evidence.
- The full FileProvider SQLite/FTS write migration, source-scoped `scan_progress` schema migration, durable scheduler/retry/debounce work, and real platform evidence remain follow-up work.
