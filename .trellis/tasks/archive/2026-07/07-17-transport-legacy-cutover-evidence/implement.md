# Transport Legacy Cutover Evidence — Implementation

## Inventory and registry

- [x] Freeze 71 alias mappings from current definitions and canonical registrations.
- [x] Add data-only tombstone registry with validation helpers.
- [x] Add evidence builder/verifier CLI and package command.

## CoreBox

- [x] Replace every legacy producer with the canonical event or delete duplicate send.
- [x] Remove every renderer/main/plugin SDK legacy listener and duplicate-delivery de-dupe.
- [x] Remove `CoreBoxRetainedEvents`, aggregate export, imports, and legacy-specific tests.

## Auth / Account

- [x] Simplify handler registration to canonical-only.
- [x] Remove legacy state broadcast and fingerprint listener.
- [x] Remove legacy event definitions and telemetry wrapping.

## Sync

- [x] Remove three legacy lifecycle listeners and telemetry wrapping.
- [x] Remove legacy definitions.

## Terminal

- [x] Remove three legacy request listeners and telemetry wrapping.
- [x] Remove legacy data/exit sends; canonical event is the only outbound delivery.
- [x] Remove legacy definitions.

## Opener

- [x] Remove duplicate plugin-open send.
- [x] Remove install/dev/drop/app-resolve legacy listeners.
- [x] Remove legacy definitions.

## Integration

- [x] Delete unused legacy telemetry utility/tests and telemetry sanitizer fixtures owned only by this alias path.
- [x] Remove legacy family aggregates/imports.
- [x] Update canonical event documentation and source assertions.
- [x] Generate current evidence and run strict verifier.

## Verification

```bash
corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/transport-domain-sdks.test.ts" \
  "__tests__/transport-event-boundary.test.ts" \
  "__tests__/plugin-sdk-lifecycle.test.ts" \
  "__tests__/plugin-bridge-hook-sdk.test.ts"

corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/auth/index.test.ts" \
  "src/main/modules/box-tool/core-box/ipc.test.ts" \
  "src/main/modules/box-tool/core-box/meta-overlay.test.ts" \
  "src/main/modules/terminal/terminal.manager.test.ts" \
  "src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts"

corepack pnpm exec tsx "scripts/transport-legacy-alias-evidence.ts" \
  --output ".trellis/tasks/07-17-transport-wave-a/evidence/legacy-alias-evidence.json" \
  --decision explicit-hard-cut

corepack pnpm exec tsx "scripts/transport-legacy-alias-evidence.ts" \
  --verify ".trellis/tasks/07-17-transport-wave-a/evidence/legacy-alias-evidence.json" \
  --strict
```

- [x] Run scoped lint and CoreApp web typecheck.
- [x] Run node typecheck and confirm no changed-file diagnostics beyond unrelated baseline.
- [x] Run plugin preload and CoreApp startup smoke.

## Verification Result

- `legacy-alias-evidence/v1`: 71 mappings; 1,683 production files and 544 test/fixture files scanned; zero source hits; runtime observation remains `not-collected`; operator decision is `explicit-hard-cut`.
- Strict verifier accepted the generated artifact and rejected payload fields, missing/duplicate aliases, production hits, source-count mismatch, runtime hits, and missing decision.
- Utils focused tests: 57/57 passed. CoreApp focused tests: 81/81 passed, including OmniPanel canonical regression.
- Scoped Utils/CoreApp/root-script ESLint passed; CoreApp web typecheck passed; plugin preload smoke passed.
- CoreApp node typecheck remains blocked by four unrelated file-index/search baseline errors; no diagnostic points to a cutover line or removed alias surface.
- Isolated CoreApp dev smoke on port 5174 reached `Startup health check passed`, initialized CoreBox/Auth/Sync/Terminal/Opener, exercised CoreBox search stream cleanup, and entered graceful module unload on `Ctrl+C`.
