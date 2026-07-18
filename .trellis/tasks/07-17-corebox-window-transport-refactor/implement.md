# Implementation Plan

## Execution Order

1. Capture baseline lint counts, focused tests, type-check, and build state.
2. Replace the incorrect Search End fixture with the shared event contract and extend delimiter-drift governance while retaining explicit legacy pairs.
3. Run ESLint auto-fix on `window.ts`, then manually resolve the remaining JSDoc warnings; verify no behavior changes.
4. Extract `key-event.ts`, `focus-policy.ts`, and pure `bounds.ts`; add focused behavioral coverage and delegate from the facade.
5. Extract `bounds-controller.ts`; preserve animation cancellation, retargeting, temporary resizable restoration, and position behavior.
6. Extract `theme-controller.ts`; preserve settings subscription, file/bundled CSS selection, and dark-class synchronization.
7. Extract `plugin-view-controller.ts`; preserve security/navigation setup, view ownership, attach/detach/extract/restore, message routing, and forwarding permissions.
8. Reduce `WindowManager` to orchestration while keeping every public export/signature stable.
9. Run focused tests, zero-warning lint, Node type-check, TuffEx/CoreApp production build, event-contract scan, and runtime CoreBox smoke.

## Verification Commands

- `corepack pnpm exec eslint --max-warnings=0 <changed files>`
- `corepack pnpm -C apps/core-app run typecheck:node`
- Focused Vitest suites for CoreBox window/manager/IPC, plugin feature/view policy, and transport governance.
- `corepack pnpm --filter @talex-touch/tuffex run build`
- `corepack pnpm -C apps/core-app run build:vite`

## Review Gates

- Gate A: event contract scan has no unapproved delimiter collision.
- Gate B: mechanical lint cleanup leaves behavior tests unchanged.
- Gate C: each controller extraction passes before the next extraction starts.
- Gate D: final built main and renderer contain matching canonical event names.

## Rollback Points

- Revert only the latest extracted controller if its focused gate fails; prior pure-helper and lint work remains independently valid.
- Do not keep compatibility aliases or duplicated controller/facade implementations after a successful extraction.
