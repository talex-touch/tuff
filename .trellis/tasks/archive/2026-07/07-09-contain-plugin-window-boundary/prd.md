# Contain Plugin Window Privilege Boundary

## Goal

Close the release-blocking plugin window trust boundary. Plugin-originated
window operations must be permission-enforced, remote content must not enter a
privileged renderer, eligible plugin views must actually use hardened Electron
preferences, and arbitrary reflective `BrowserWindow` / `WebContents` access
must be removed.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P0.
- Explicit dependency: none. This is the first release-safety child.
- Approved decision: hard safety cut. Unknown third-party compatibility does
  not preserve remote compatibility windows or reflective commands.

## Background

- `resolvePluginViewSecurityProfile()` currently reports trusted candidates but
  always returns the compatibility profile as effective at
  `apps/core-app/src/main/modules/plugin/runtime/plugin-view-security-profile.ts:35`.
- The compatibility profile enables Node, Node in subframes, disables context
  isolation/sandbox/web security, and enables webviews at
  `apps/core-app/src/main/core/window-security-profile.ts:35`.
- Public window handlers accept arbitrary URLs and reflectively invoke arbitrary
  Electron members at
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2070` and
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2200`.
- The permission mapping names `window:create`, while the real event is
  `window:new`, at
  `apps/core-app/src/main/modules/permission/permission-guard.ts:95` and
  `packages/utils/transport/events/index.ts:1945`.
- The existing permission wrapper permits calls when the permission module is
  unavailable at
  `apps/core-app/src/main/modules/permission/channel-guard.ts:60`. Privileged
  plugin window operations must use a fail-closed variant or an explicit module
  readiness invariant.
- CoreBox and DivisionBox assemble executable preload source in temporary files.
  A hardened profile therefore also needs a host-owned bridge rather than only
  changing the effective preference flag.
- No non-test first-party use of `createWindow`, `toggleWinVisible`, or
  `setWindowProperty` was found. The repository therefore provides no internal
  requirement for broad legacy property compatibility.

## Requirements

### R0.1 - Enforce permission at the actual handler boundary

- Map `window:new`, `window:visible`, and the replacement control event to the
  existing `window.create` permission.
- Register every public plugin window handler through typed permission
  enforcement.
- A plugin-originated call fails closed if the permission module is not ready,
  the declared SDK version is inconsistent, or permission is denied.
- Non-plugin internal callers remain explicit and cannot be mistaken for a
  plugin caller.
- Window ids remain scoped to the owning plugin's `_windows` map.

### R0.2 - Constrain content before a window is created

- The public plugin window API accepts one local HTML entry only. Remote URL
  input is rejected with a stable typed error.
- Replace full `BrowserWindowConstructorOptions` input with a reviewed
  `PluginWindowOptions` allowlist. Plugin requests cannot supply
  `webPreferences`, preload, session/partition, kiosk/fullscreen, parent/modal,
  or other unreviewed Electron options.
- Resolve and realpath both the plugin root and requested file; reject traversal,
  symlink escape, missing files, non-files, and files outside the owning plugin
  root.
- Attach navigation, popup, and webview policies before the first load. Remote
  navigation, `window.open`, and remote/subframe escalation are denied.
- Do not create a `BrowserWindow` until permission and content validation pass.

### R0.3 - Make hardened profiles real

- A supported SDK marker with no legacy preload/webview requirement uses
  `trusted-plugin-view` as its effective profile.
- Trusted views use a host-owned, bundled preload bridge. They do not concatenate
  plugin-provided executable source into a temporary preload.
- Custom plugin preload and explicit legacy-webview requirements remain
  observable compatibility exceptions; they never permit remote content.
- Compatibility reason, candidate/effective profile, source surface, and blocked
  policy reason are available in diagnostics without logging sensitive payloads.
- CoreBox, DivisionBox, and the public window API use the same resolver and
  policy contract.
- Packaged plugin views load canonical local content. Explicit development views
  may use only their configured exact loopback origin while the app and plugin
  are in development mode; arbitrary remote dev origins are rejected.

### R0.4 - Replace reflective property access

- Replace open-ended `BrowserWindow` / `WebContents` property maps with a typed
  command union.
- The initial allowlist is limited to operations on the plugin-owned window:
  `focus`, `close`, `setBounds`, and `setAlwaysOnTop`. Visibility remains on the
  existing typed visibility event.
- Validate every command argument. No WebContents command and no string-based
  member lookup is accepted.
- The legacy SDK helper may translate only these known shapes for one migration
  period. Unknown keys fail closed with a stable migration error.
- The public SDK types must no longer imply that every Electron member is legal.

### R0.5 - Add executable security invariants

- Contract tests enumerate privileged plugin window events and prove permission
  enforcement.
- Tests cover denied permission, permission runtime unavailable, SDK mismatch,
  remote URL, unsafe window options/preload, path traversal, symlink escape,
  unknown command, cross-plugin window id, trusted profile activation, exact
  loopback dev-origin policy, and explicit legacy exceptions.
- A packaged smoke test verifies the trusted bridge can deliver plugin metadata
  and typed transport without Node globals in page context.

## Acceptance Criteria

- [x] `window:new`, `window:visible`, and window control calls are denied before
  handler execution when `window.create` is unavailable or denied.
- [x] `https:`, `http:`, protocol-relative, non-file URL, traversal, and symlink
  escape inputs cannot create or navigate a plugin window.
- [x] Plugin callers cannot inject `webPreferences`, preload, session/partition,
  kiosk/fullscreen, parent/modal, or unknown BrowserWindow options.
- [x] Supported non-legacy plugins receive `trusted-plugin-view` as the effective
  profile with Node disabled, context isolation enabled, sandbox enabled, web
  security enabled, and webviews disabled.
- [x] Trusted CoreBox, DivisionBox, and public plugin views use a host-owned bridge
  and expose no page-context `require`, `process`, or raw `ipcRenderer`.
- [x] Compatibility views are local-only, explicitly diagnosed, and cannot open
  remote popups, remote navigation, or privileged subframes.
- [x] A development plugin view can use only its configured exact loopback
  origin; packaged and non-dev views cannot use remote origins.
- [x] Reflective `BrowserWindow` / `WebContents` invocation is absent. Only the
  typed command allowlist succeeds for a plugin-owned window.
- [x] Existing plugin security/profile, permission, SDK, CoreBox, DivisionBox,
  and build/type-check suites pass.
- [x] No unrelated dirty files are reformatted, reverted, or overwritten.

## Out of Scope

- Reintroducing remote plugin-window content. A future Node-disabled remote-view
  profile would require a separate permission, origin allowlist, and task.
- Migrating every legacy plugin view off custom preload/webview in this child.
  This child contains them and records migration blockers.
- Redesigning the entire plugin permission system or changing unrelated
  privileged APIs.
- General decomposition of `plugin-module.ts` beyond the policy/handler boundary
  required for this fix.
