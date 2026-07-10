# Technical Design

## Security Invariants

1. Authorization and source validation complete before `BrowserWindow`
   construction.
2. Remote content never runs in a renderer with Node privileges.
3. A trusted plugin page receives only a host-owned bridge, not raw Electron or
   arbitrary plugin preload source.
4. A plugin controls only windows registered under that plugin instance.
5. Public window commands are a closed union; no reflective member name reaches
   Electron.

## Boundary Components

```text
PluginEvents.window.*
  -> protected typed handler
  -> PluginWindowPolicy
       -> permission readiness / permission decision
       -> local target resolver
       -> security profile resolver
       -> navigation policy
       -> command validator
  -> PluginWindowController
       -> TouchWindow / BrowserWindow
       -> plugin-owned window registry
```

`PluginWindowPolicy` should be a small main-process module with pure helpers
where possible. `plugin-module.ts` keeps registration and plugin lookup, while
policy and command execution become independently testable.

## Permission Enforcement

Use the existing `window.create` permission for creation, visibility, and
control of plugin-owned windows. A new permission would create manifest churn
without a distinct user decision: a plugin allowed to create a window may
control that same window through the narrow command set.

Add real event mappings for:

- `window:new`
- `window:visible`
- `window:command` (new typed event)
- `window:property` only while the narrow legacy translator exists

The general `withPermission()` helper currently allows startup calls when the
permission module is missing. Add a fail-closed option or a dedicated protected
registration for privileged plugin capabilities. When `context.plugin` exists,
permission-runtime absence returns a typed denial. Main-process internal calls
must use an explicit internal path rather than relying on missing plugin context.

## Local Target Resolution

The request contract becomes mutually exclusive:

```ts
type PluginWindowNewRequest = {
  file: string
  options?: PluginWindowOptions
}
```

The public `url` form is rejected by the SDK and main process. Main-process
validation remains authoritative for older SDK callers.

`PluginWindowOptions` is a closed subset such as validated bounds, title,
resizable, always-on-top, and initial visibility. It explicitly excludes
`webPreferences`, preload, session/partition, parent/modal, kiosk/fullscreen,
and unknown fields. Main process normalization applies stable defaults and
rejects unsafe or unknown keys before window construction.

Resolution algorithm:

1. Reject empty input and URL-like schemes.
2. Resolve relative input against `plugin.pluginPath`; permit an absolute input
   only when it resolves inside the same root.
3. Obtain `realpath()` for the root and target.
4. Use `path.relative(realRoot, realTarget)` and reject empty-parent anomalies,
   `..` prefixes, and absolute relatives.
5. Require a regular local file with an HTML-like extension.
6. Return the canonical file path used by `loadFile()`.

Extract/reuse the path-containment behavior already present in
`plugin-view-loader.ts`, but add realpath-based symlink protection.

## Navigation Policy

Install policy immediately after window construction and before `loadFile()`:

- `will-navigate`: allow the initial canonical file and same-document fragment
  changes; deny other navigation and optionally send approved external links to
  the existing external URL policy.
- `setWindowOpenHandler`: deny all new windows from plugin content.
- `will-attach-webview`: deny for trusted views. Compatibility webview use is an
  explicit legacy exception and is restricted to canonical local content with
  Node disabled in the guest.
- deny permission requests not explicitly brokered by the host.

For CoreBox/DivisionBox development content, permit a remote origin only when
the application is not packaged, the plugin is explicitly in development mode,
and the URL origin is exact loopback (`127.0.0.1`, `[::1]`, or `localhost`) and
matches the configured plugin dev origin. Lock navigation and popups to that
decision. Packaged/non-dev plugin views use canonical local content only.

The generic `TouchWindow` ready-to-show navigation hook is too late to be the
security boundary; plugin policy must be installed before loading.

## Trusted Bridge

Add a host-owned plugin-view preload entry to the Electron build. It receives
sanitized metadata through `additionalArguments` or another immutable
main-to-preload bootstrap mechanism:

- plugin name, SDK version, and plugin version;
- unique channel key;
- minimal initial theme data;
- no arbitrary JavaScript source and no unrestricted filesystem path map.

The preload uses `contextBridge` to expose:

- immutable `$plugin` metadata;
- a narrow `$config` snapshot;
- a `$channel` adapter implementing the typed async send/on behavior required by
  the plugin SDK.

Do not expose raw `ipcRenderer`, `require`, `process`, or the full
`@electron-toolkit/preload` API to page context. The bridge internally restricts
IPC to the plugin transport envelope and owning unique key.

Trusted CoreBox and DivisionBox call sites use this preload instead of writing
combined executable files to the OS temp directory. CSS/theme application may
remain a post-load host operation if it contains data/styles rather than plugin
executable preload source.

Legacy custom preload/webview markers continue to resolve to compatibility mode
and are logged as migration blockers. They are local-only and do not weaken the
public window URL/navigation policy.

## Effective Profile Resolution

Change the resolver result to:

```ts
return {
  candidateProfile: candidate.profile,
  effectiveProfile: candidate.profile,
  reason: candidate.reason
}
```

This is valid only after the trusted bridge is wired at every caller. Tests must
prove that each caller passes the correct fixed preload and does not subsequently
override managed preferences.

Do not globally weaken `trusted-plugin-view`. Compatibility profile cleanup can
be incremental, but compatibility surfaces must receive the local/navigation
containment policy in this child.

## Typed Window Commands

Add a discriminated request:

```ts
type PluginWindowCommand =
  | { type: 'focus' }
  | { type: 'close' }
  | { type: 'setBounds'; bounds: { x?: number; y?: number; width: number; height: number } }
  | { type: 'setAlwaysOnTop'; value: boolean }
```

Validate finite integer coordinates, positive bounded dimensions, and boolean
flags. Execute through a `switch` against the plugin-owned `BrowserWindow`.
There is no WebContents command.

For one migration period, `window:property` may accept only legacy object shapes
that map exactly to this union. Multiple or unknown properties return
`PLUGIN_WINDOW_COMMAND_REMOVED`; no partial application occurs. Update the SDK
type from mapped Electron members to the command union and deprecate
`setWindowProperty()`.

## Error Contract

Use stable error codes at the transport boundary, including:

- `PLUGIN_WINDOW_PERMISSION_UNAVAILABLE`
- `PLUGIN_WINDOW_PERMISSION_DENIED`
- `PLUGIN_WINDOW_REMOTE_URL_DENIED`
- `PLUGIN_WINDOW_PATH_OUTSIDE_ROOT`
- `PLUGIN_WINDOW_TARGET_INVALID`
- `PLUGIN_WINDOW_OPTIONS_INVALID`
- `PLUGIN_WINDOW_COMMAND_REMOVED`
- `PLUGIN_WINDOW_NOT_FOUND`

Avoid returning raw filesystem paths or Electron error stacks to plugin
renderers. Log sanitized plugin id, surface, profile reason, and error code.

## Rollout and Rollback

The safety cut is atomic for the public window API: remote URL and reflective
commands have no rollback flag.

Trusted-profile activation may be rolled back for one explicitly audited plugin
only by classifying it as a named compatibility exception with owner and reason.
The exception remains local-only and permission-enforced. A global return to
observation-only effective profiles is not an acceptable rollback.

## Test Matrix

| Surface | Trusted | Legacy compat | Denied/invalid |
| --- | --- | --- | --- |
| Public window | local file + fixed bridge | local-only + explicit reason | remote/path/permission rejected before create |
| CoreBox plugin view | fixed bridge | local-only legacy path | no managed preference override |
| DivisionBox plugin view | fixed bridge | local-only legacy path | no managed preference override |
| Window command | closed union | same union | unknown/cross-plugin id rejected |

Packaged validation must inspect actual `webContents.getLastWebPreferences()` or
equivalent evidence and page-context globals, not only resolver return values.
