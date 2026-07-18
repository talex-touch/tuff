# Transport Typed Event Hard Cut — Implementation

## sendSync

- [x] Remove method/property from plugin channel interface/class and delete removed-error helper.
- [x] Remove renderer hook and shared channel-type declarations.
- [x] Remove Prelude method and dead capability string.
- [x] Update fake channels/source-contract tests and preload smoke expectations.
- [x] Audit production source for zero callable `sendSync`.

## CoreBox types and definitions

- [x] Move retained payload interfaces to `events/types/core-box.ts` and export them.
- [x] Inline canonical retained builder definitions into `CoreBoxEvents`.
- [x] Convert active raw CoreBox search events to builder definitions, preserving stream/batch metadata.
- [x] Convert active input/item/clipboard raw events to builder definitions.
- [x] Reduce `core-box-retained.ts` to a legacy-only object importing shared payload types.
- [x] Update event-name contract assertions and source-boundary audit.
## Verification Result

- sendSync hard-cut + renderer storage: 2 files / 13 tests passed.
- Utils CoreBox transport/SDK: 4 files / 60 tests passed.
- CoreApp preload/CoreBox/search: 3 files / 26 tests passed.
- Plugin-view preload smoke passed and observed `$channel.sendSync === undefined` with hardened preferences.
- Scoped ESLint and CoreApp web typecheck passed.
- CoreApp node typecheck remains blocked only by pre-existing app/file-index/search-index errors outside this slice; no changed transport/CoreBox file appeared in diagnostics.


## Verification

```bash
corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/plugin-channel-send-sync-hard-cut.test.ts" \
  "__tests__/transport-event-boundary.test.ts" \
  "__tests__/transport-domain-sdks.test.ts" \
  "__tests__/plugin-sdk-lifecycle.test.ts"

corepack pnpm -C "apps/core-app" exec vitest run \
  "src/preload/plugin-view-channel.test.ts" \
  "src/main/modules/box-tool/core-box/ipc.test.ts" \
  "src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts"

corepack pnpm -C "apps/core-app" run smoke:plugin-view-preload
corepack pnpm -C "apps/core-app" run typecheck:web
```

- [x] Run scoped ESLint on touched files.
- [x] Run CoreApp node typecheck and confirm no changed-file diagnostics even if unrelated baseline errors remain.
