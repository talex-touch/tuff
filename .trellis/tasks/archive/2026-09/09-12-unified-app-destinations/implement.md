# Implementation plan

## Parallel contract

All agents implement against `design.md`. Shared public names and shapes are frozen before dispatch:

- shared module: `apps/core-app/src/shared/app-destinations.ts`;
- provider: `app-destination-provider.ts`, `AppDestinationProvider`, `appDestinationProvider`;
- service: `app-destination/app-destination-navigation.ts`, `AppDestinationNavigationService`, `getAppDestinationNavigationService`;
- action IDs: `open-destination:<AppDestinationId>`;
- common-settings order: general, appearance, channels, voice, plugins, file-index, network, update;
- route delivery: `broadcastToWindow(..., AppEvents.window.navigate, { path })` only after explicit primary `AppEvents.window.rendererReady` from a renderer whose route listeners are registered and whose initial router navigation has resolved;
- MetaOverlay delivery: `MetaOverlayEvents.ui.ready` from the current owned WebContents releases one latest pending show request; stale senders and document-load heuristics cannot release it.

No agent may change these names without messaging the integration owner first.

## Ownership slices

### Catalog slice

Owns:

- `apps/core-app/src/shared/app-destinations.ts`;
- English/Chinese destination localization entries;
- production-only catalog implementation.

Must not edit provider, navigation service, caller modules, or tests.

### Provider slice

Owns:

- move/rewrite of `main-window-provider.ts` to `app-destination-provider.ts`;
- SearchCore provider imports/registration and same-name mocks/comments;
- production provider behavior and local class icon.

Must not edit the shared catalog contract, navigation-service implementation, localization, caller modules, or tests.

### Navigation slice

Owns:

- `apps/core-app/src/main/modules/app-destination/app-destination-navigation.ts`;
- explicit renderer-ready event/handler and primary-frame cross-document readiness reset;
- tray, Assistant, local-AI, and privileged plugin main-window caller migrations.

Must not edit catalog/provider production files or tests.

### Test slice

Owns focused test files for catalog, provider, navigation state machine, route parity, grouped action behavior, and migrated callers. It may adjust existing tests only where the public behavior intentionally changed. It must not change production code.

### Asset audit slice

Read-only census of production first-party remote icon/image URLs affected by this destination slice. Report exact file/symbol and classify static first-party vs dynamic/user/test. Do not edit.

## Integration sequence

1. Catalog, provider, navigation, tests, and asset audit run concurrently against the frozen contract.
2. Integration owner reviews each claimed change, resolves only contract-level conflicts, and completes any missed callsite migration.
3. If tests reveal a contract defect, fix production at the owning source; do not weaken tests or add a second alias/cache/navigation path.
4. Update the parent PRD/task metadata and relevant living spec only after runtime behavior is proven.

## Focused verification

Run once after all slices land:

```bash
pnpm -C apps/core-app exec vitest run \
  src/shared/app-destinations.test.ts \
  src/main/modules/box-tool/addon/system/app-destination-provider.test.ts \
  src/main/modules/app-destination/app-destination-navigation.test.ts \
  src/renderer/src/modules/settings/categories.smoke.test.ts \
  src/main/modules/plugin/host/plugin-system-capabilities.test.ts
pnpm -C apps/core-app run typecheck:node
pnpm -C apps/core-app run typecheck:web
pnpm lint:changed
mise run docs:verify
git diff --check
```

Adjust the exact focused file list to the test author’s final paths. Do not run the full repository suite unless a focused result identifies cross-package fallout.

## Behavioral smoke

1. Launch CoreApp with an isolated profile through the project’s existing dev/runtime command; verify startup health before interaction.
2. Open CoreBox and query `主窗口`, `首页`, `设置`, `外观`, `模型渠道`, `语音设置`, `网络设置`, `检查更新`.
3. Confirm one destination row per query and correct offline class icon.
4. Press Enter and observe the main window route; `主窗口` must preserve the existing route.
5. On the Settings result, open Meta+K, exercise at least General, Model Channels, Voice Input, and Network grouped actions, then close and reopen the panel to prove a recreated renderer receives its first queued show after the ready handshake.
6. Query negative controls `open`, `show`, `window`, `窗口`, `AI`, `network`; confirm no destination-provider row.
7. Reload the main renderer, request two routed destinations before explicit renderer readiness, and confirm only the latest route is delivered after the renderer re-registers navigation and announces ready; confirm an iframe/srcdoc load does not strand later navigation.
8. Exercise tray Settings, Assistant intelligence recovery, local-AI settings recovery when available, and plugin `open-main-window` without a 60-second navigation timeout warning.

## Cleanup

- Remove the old `main-window-provider.ts`; no re-export/shim.
- Remove remote favicon references from production destination code.
- Remove obsolete imports and duplicated show/focus/navigation helpers in migrated callers.
- Update the recommendation-source living spec entry that describes the old duplicate provider.
- Keep generated output, isolated profiles, screenshots, and logs out of source unless explicitly curated as evidence.
