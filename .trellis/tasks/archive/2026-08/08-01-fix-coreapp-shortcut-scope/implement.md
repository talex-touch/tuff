# Implementation Plan

1. Add bulk retired-shortcut removal to shared `ShortcutStorage` with focused unit coverage.
2. Run the retired-ID migration in `ShortcutModule.onInit()` before global registration.
3. Remove AI Quick Call registration/teardown and update CoreBox lifecycle tests.
4. Remove FlowBus global shortcut registration, callbacks, imports, and teardown.
5. Move the existing typed Flow trigger producer to the CoreBox plugin-view `before-input-event` context, retain renderer listeners, and update architecture event-table ownership while preserving host-page `useKeyboard` -> `useDetach` handling.
6. Add dedicated `CoreBoxEvents.uiMode.detach`: accept only the owning CoreBox renderer, resolve main-owned plugin/view identity, enforce DivisionBox permission, and transfer the same view without weakening generic `plugin://` authorization.
7. Make view ownership transfer-safe: relinquish the exact CoreBox cache entry without closing the view before async session creation, block concurrent CoreBox attachment, classify partial DivisionBox release as `released` / `not-owned` / `failed`, restore view/feature/cache only after safe release, and abandon monitoring/UI state instead of restoring on failed release.
8. Add focused shortcut-classification, CoreBox sender-authorization, same-view transfer, cache relinquish/restore, partial-attach rollback ordering, modifier-rejection, and repeat-rejection coverage.
9. Remove retired shortcut labels from both locale catalogs.
10. Verify no global runtime references remain for retired IDs and no FlowBus trigger producers remain.
11. Run focused tests:
   - shared shortcut storage and transport-domain tests;
   - `src/main/modules/global-shortcon.test.ts`;
   - `src/main/modules/box-tool/core-box/index.test.ts`, `ipc.test.ts`, `window.test.ts`, and `key-event.test.ts`;
   - `src/renderer/src/modules/box/adapter/hooks/useKeyboard.test.ts` and `useDetach.test.ts`.
12. Run `pnpm -C apps/core-app run typecheck:node`, `pnpm -C apps/core-app run typecheck:web`, `pnpm lint:changed`, and `git diff --check`.
13. Perform final review for unrelated changes, stale imports, registration gaps, view/cache ownership guards, partial-session rollback safety, migration safety, and generic DivisionBox authorization preservation.

## Rollback Points

- After steps 1-2: migration can be reverted independently before feature registrations are removed.
- After steps 3-6: all removed runtime paths can be restored without touching unrelated shortcut records.

## Review Gate

Implementation may start because the user explicitly requested the fix and delegated the page-level design choice after the analysis. The plan chooses the existing renderer route instead of introducing a new shortcut subsystem.
