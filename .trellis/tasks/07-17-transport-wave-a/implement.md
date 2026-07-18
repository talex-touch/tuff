# Transport Wave A — Implementation Plan

## Gate 0 — Current-state inventory

- [x] Freeze the Wave A alias/event inventory from CoreBox, Auth/Account, Sync, Terminal, and Opener definitions.
- [x] Record every production producer/listener/export separately from tests and fixtures.
- [x] Confirm the active MessagePort lanes and the request-scoped search cutover.

## Gate 1 — MessagePort lanes

### Clipboard lane
- [x] Verify `ClipboardEvents.change` uses port-first stream delivery.
- [x] Verify unavailable/open-failed and mid-stream-close fallback.
- [x] Verify cancel/destroy closes port, channel listeners, timers, and controller state.

### File-index lane
- [x] Verify `AppEvents.fileIndex.progress` preserves ordered/throttled updates and terminal state on port and fallback.
- [x] Verify cancel and sender destruction release `StreamContext` and port state.

### Search lane
- [x] Keep `CoreBoxEvents.search.session` and `indexCommitted` in the port allowlist.
- [x] Remove `search.update/end/noResults` from the allowlist after confirming no active producer/consumer.
- [x] Verify sender/session isolation, exact cancellation, one terminal, fallback, and no duplicate delivery.

### Port lifecycle
- [x] Make renderer and plugin subscription close conditions equivalent.
- [x] Cover last-handler release, close-before-open-completes, messageerror, sender destroy, transport destroy, and mid-stream fallback.
- [x] Keep `CoreBoxEvents.layout.update` on 16ms latest channel batching and document the response-semantic carve-out in code/tests.

## Gate 2 — `sendSync` hard cut

- [x] Remove `sendSync` from plugin channel interfaces and implementations.
- [x] Remove Prelude injection and removed-error helpers.
- [x] Remove renderer/global declarations, tests, and docs that expose a callable tombstone.
- [x] Run a production-source audit proving zero callable `sendSync` surfaces.

## Gate 3 — CoreBox typed event ownership

Migrate one family at a time and verify before continuing:

- [x] Search (`query/cancel/update/end/noResults/indexingDiagnostics`).
- [x] Input and clipboard (`input.change`, `clipboard.change`).
- [x] Item (`execute/clear/togglePin`).
- [x] UI/layout/provider/recommendation/preview/MetaOverlay definitions currently re-exported through `CoreBoxRetainedEvents`.
- [x] Delete `core-box-retained.ts` after every canonical import points to `CoreBoxEvents`.

## Gate 4 — Legacy alias families

For each family, migrate internal producers and consumers, run focused verification, then remove definitions/listeners:

- [x] CoreBox.
- [x] Auth + Account.
- [x] Sync.
- [x] Terminal.
- [x] Opener.

No family advances when producer/listener inventory is incomplete.

## Gate 5 — Evidence and hard-cut verifier

- [x] Add the data-only removed-alias tombstone registry.
- [x] Add source inventory/evidence builder with production vs test/fixture classification.
- [x] Add strict `legacy-alias-evidence/v1` verifier.
- [x] Generate current evidence with `decision: explicit-hard-cut`; mark runtime telemetry `not-collected` unless a real export is supplied.
- [x] Prove the verifier fails for production hits, missing mappings, duplicate mappings, payload fields, missing decision, and partial inventory.

## Gate 6 — Verification

Focused commands (adjust only to existing package scripts):

```bash
corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/renderer-transport-stream.test.ts" \
  "__tests__/plugin-transport-stream.test.ts" \
  "__tests__/transport/port-policy.test.ts" \
  "__tests__/plugin-sdk-lifecycle.test.ts" \
  "__tests__/transport-domain-sdks.test.ts"

corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/box-tool/core-box/ipc.test.ts" \
  "src/main/modules/box-tool/core-box/meta-overlay.test.ts" \
  "src/main/modules/auth/index.test.ts" \
  "src/main/modules/terminal/terminal.manager.test.ts"

corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
```

- [x] Run the evidence builder and strict verifier against the generated artifact.
- [x] Start CoreApp, exercise CoreBox search + resize + clipboard/history, and observe clean shutdown without port warnings/leaks.
- [x] Run scoped lint for touched production files.

## Gate 7 — Integration closeout

- [x] Update the Transport Wave A backlog entries only after every acceptance criterion has direct evidence.
- [x] Record any unobserved production telemetry as an explicit limitation, not zero-hit evidence.
- [x] Perform final parent integration review across all channel/family slices.

## Rollback points

- After Gate 1: disable port allowlist via env if runtime port behavior regresses.
- After each Gate 3/4 family: revert that complete family slice; never restore one alias listener in isolation.
- After Gate 5: verifier/evidence format may be reverted independently only if no hard-cut claim depends on it.

## Integration Verification Result

- MessagePort lanes, `sendSync` hard-cut, CoreBox typed ownership, and the 71-alias clean cutover are complete; detailed legacy proof is recorded in `../07-17-transport-legacy-cutover-evidence/implement.md`.
- Generated evidence: `evidence/legacy-alias-evidence.json` (`legacy-alias-evidence/v1`), with production/test classification, repository metadata, explicit hard-cut decision, and runtime observation marked `not-collected`.
- Focused tests, scoped lint, CoreApp web typecheck, plugin preload smoke, isolated startup health check, CoreBox search stream cleanup, and graceful module unload passed.
- CoreApp node typecheck has no Wave A diagnostic; four unrelated file-index/search baseline errors remain.
