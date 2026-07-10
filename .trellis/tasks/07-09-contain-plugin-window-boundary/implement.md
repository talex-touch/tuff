# Implementation Plan

## Prerequisites

- Parent hard-cut decision is approved.
- Run `trellis-before-dev` before product edits and load main-process, transport,
  plugin SDK, and relevant cross-layer specifications.
- Re-read overlapping dirty files before every edit; do not normalize unrelated
  changes.

## Ordered Checklist

### 1. Lock the failing contracts

- [x] Extend security-profile tests so trusted candidates expect an actually
  trusted effective profile.
- [x] Add public window policy tests for remote input, traversal, symlink escape,
  unsafe BrowserWindow options/preload, permission denial/unavailability, exact
  loopback dev origins, and create-before-validation ordering.
- [x] Add command tests proving unknown and WebContents properties are rejected.
- [x] Add a privileged-event mapping invariant for the actual event names.
- [x] Add trusted-bridge tests that assert no raw Electron/Node globals are
  exposed to page context.

### 2. Add typed policy and error contracts

- [x] Define narrow window request/options/command/response types in
  `packages/utils`.
- [x] Add stable error codes and SDK error mapping.
- [x] Implement pure local-target, navigation-decision, and command validators.
- [x] Add fail-closed privileged permission registration without weakening
  internal non-plugin calls.

### 3. Contain the public window API

- [x] Validate permission and canonical target before constructing `TouchWindow`.
- [x] Reject the public URL form in SDK and main process.
- [x] Normalize the closed window-options allowlist and reject caller-supplied
  preload/webPreferences or unknown Electron options.
- [x] Install navigation/popup/webview policy before the first load.
- [x] Replace reflective property application with the typed command switch.
- [x] Keep only the narrow legacy translator and emit removal diagnostics for
  unknown shapes.

### 4. Build the trusted plugin bridge

- [x] Add a bundled plugin-view preload entry with immutable bootstrap metadata.
- [x] Expose the minimal plugin metadata/config/channel bridge through
  `contextBridge`.
- [x] Restrict bridge transport to the owning unique key and plugin envelope.
- [x] Remove temp executable preload composition for trusted CoreBox,
  DivisionBox, and public plugin windows.
- [x] Preserve explicit local-only legacy preload/webview exceptions with
  diagnostics.

### 5. Activate hardened profiles

- [x] Make candidate profile effective after all trusted call sites use the fixed
  bridge.
- [x] Verify managed preference overrides remain stripped.
- [x] Add per-surface profile diagnostics and compatibility blocker counts.

### 6. Verify and review

- [x] Run focused utils and CoreApp tests.
- [x] Run CoreApp type-check and changed-file lint.
- [x] Run a packaged trusted-plugin smoke test and inspect page globals,
  navigation denial, permissions, and actual web preferences.
- [x] Run `trellis-check` across SDK -> transport -> permission -> main handler ->
  Electron window data flow.
- [x] Update Trellis specs if the fail-closed privileged-handler or plugin-view
  preload contract should become project-wide guidance.

## Validation Commands

```bash
corepack pnpm -C packages/utils exec vitest run \
  __tests__/plugin-window-sdk.test.ts \
  __tests__/plugin-transport-stream.test.ts \
  __tests__/plugin-channel-send-sync-hard-cut.test.ts \
  __tests__/transport-event-boundary.test.ts

corepack pnpm -C apps/core-app exec vitest run \
  src/main/core/window-security-profile.test.ts \
  src/main/modules/permission/permission-guard.test.ts \
  src/main/modules/plugin/runtime/plugin-view-security-profile.test.ts \
  src/main/modules/plugin/view/plugin-view-loader.test.ts \
  src/main/modules/plugin/plugin.test.ts \
  src/main/modules/box-tool/core-box/window.test.ts

corepack pnpm -C apps/core-app run typecheck
corepack pnpm lint:changed
```

Add focused tests for the new policy/controller/preload files to these commands
once filenames are chosen.

## Verification Results

- `packages/utils`: 4 focused files, 19 tests passed.
- `apps/core-app`: 12 focused files, 80 tests passed.
- Full CoreApp `typecheck` passed, including node and web checks.
- Task-scoped CoreApp and utils ESLint passed without findings.
- Repository `lint:changed` remains blocked only by the unrelated import-order
  error at `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts:56`;
  unrelated AI files also report existing formatting warnings.
- `build:vite` passed and emitted `out/preload/plugin-view.js`.
- Real Electron smoke passed with the built preload, hardened actual preferences,
  isolated session, no Node/Electron page globals, typed channel disposer, and
  denial of remote navigation, popup, resource, and permission requests.
- Task-scoped whitespace checks passed. Repository-wide `git diff --check` remains
  unsuitable as task evidence because the worktree contains unrelated existing
  changes and whitespace findings.

## Risky Files

- `apps/core-app/src/main/modules/plugin/plugin-module.ts`: large and likely to
  overlap user work. Extract policy/controller code and keep handler edits small.
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts` and
  `apps/core-app/src/main/modules/division-box/session.ts`: dynamic preload and
  renderer lifecycle paths; validate both cached and fresh views.
- `apps/core-app/src/main/core/window-security-profile.ts`: shared by more than
  plugin windows; do not weaken app/trusted baselines.
- `packages/utils/transport/events/types/plugin.ts` and plugin SDK exports:
  public compatibility surface; require synchronized type/runtime tests.
- Electron Vite preload inputs and packaged paths: development success is not
  sufficient; verify the packaged preload artifact resolves.

## Rollback Points

- Policy parsing and typed commands can be reverted as one unit only before
  release; remote/reflection behavior is never retained as fallback.
- A single trusted plugin can be moved to an explicit compatibility exception if
  the fixed bridge lacks a required capability. Record plugin id, owner, reason,
  and removal condition.
- If packaged preload resolution fails, keep trusted activation disabled only
  until the host-owned preload artifact is fixed. Do not ship a trusted marker
  that silently receives full compatibility privileges.

## Pre-Start Gate

- [x] Parent and child artifacts reviewed by the user.
- [x] No unresolved product/scope decision remains.
- [x] `task.py validate 07-09-contain-plugin-window-boundary` passes.
- [x] Relevant Trellis specs are identified by `trellis-before-dev`.
- [x] The task is explicitly started before any product source edit.
