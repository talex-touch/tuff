# Plugin Runtime Security

> Executable contracts for privileged plugin windows and plugin-owned Electron renderers.

## Scenario: Privileged Plugin Window Boundary

### 1. Scope / Trigger

- Trigger: a plugin can create or control a window, or host HTML inside CoreBox,
  DivisionBox, or another Electron view.
- This contract spans the plugin SDK, typed transport, permission handler, main
  process policy, Electron web preferences, preload bridge, and packaged smoke.
- The boundary must fail closed. Compatibility requirements may select a named
  compatibility profile, but they do not permit remote content.

### 2. Signatures

Public window creation is file-only and uses a closed options object:

```ts
interface PluginWindowNewRequest {
  file: string
  options?: {
    width?: number
    height?: number
    x?: number
    y?: number
    title?: string
    resizable?: boolean
    alwaysOnTop?: boolean
    visible?: boolean
  }
  _sdkapi?: number
}
```

Window control is a discriminated union:

```ts
type PluginWindowCommand =
  | { type: 'focus' }
  | { type: 'close' }
  | { type: 'setBounds'; bounds: { x?: number; y?: number; width: number; height: number } }
  | { type: 'setAlwaysOnTop'; value: boolean }
```

Privileged plugin handlers use the protected transport registration contract:

```ts
createProtectedRegister(transport)(event, {
  permissionId: 'window.create',
  failClosedForPlugin: true,
  requireVerifiedPlugin: true,
  unavailableCode: 'PLUGIN_WINDOW_PERMISSION_UNAVAILABLE',
  deniedCode: 'PLUGIN_WINDOW_PERMISSION_DENIED',
  sdkMismatchCode: 'SDKAPI_MISMATCH'
}, handler)
```

### 3. Contracts

- Register `window:new`, `window:visible`, `window:command`, and the temporary
  narrow `window:property` translator through the protected registration above.
- Complete permission, SDK, request, option, and canonical path validation before
  constructing `BrowserWindow`, `TouchWindow`, or `WebContentsView`.
- Resolve `realpath()` for both the plugin root and target. The canonical target
  must be a regular `.html` or `.htm` file strictly inside the owning plugin root.
- A plugin window id is valid only through that plugin instance's `_windows` map.
  Do not recover public plugin windows through global Electron id lookup.
- Strip caller-supplied `preload`, `partition`, `additionalArguments`, and managed
  security preferences. The host creates an isolated non-persistent partition.
- A trusted plugin view uses the bundled host preload and exposes exactly
  `$plugin`, `$config`, and `$channel`. Page context must not receive `require`,
  `process`, raw `ipcRenderer`, Electron APIs, synchronous channel send, or the
  preload channel destroy method.
- Install navigation, popup, webview, resource, and permission policy before the
  first load. Local views may read canonical resources inside the plugin root.
- `trusted-plugin-view` is effective only for a supported trusted SDK marker with
  no custom preload, legacy webview, or explicit legacy runtime requirement.
- `compat-plugin-view` is always local-only. Temporary executable preload
  composition is permitted only on an explicitly diagnosed compatibility path.
- A development view may use only its configured exact loopback origin, only when
  the app is unpackaged, plugin development is enabled, the source is a development
  source, and the effective profile is trusted.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Permission runtime unavailable | `PLUGIN_WINDOW_PERMISSION_UNAVAILABLE` before handler execution |
| Permission missing or denied | `PLUGIN_WINDOW_PERMISSION_DENIED` before handler execution |
| Payload SDK conflicts with enforced declared SDK | `SDKAPI_MISMATCH` before handler execution |
| `http:`, `https:`, protocol-relative, or other URL-like input | `PLUGIN_WINDOW_REMOTE_URL_DENIED` |
| Traversal, absolute escape, or symlink escape | `PLUGIN_WINDOW_PATH_OUTSIDE_ROOT` |
| Missing, non-file, or non-HTML target | `PLUGIN_WINDOW_TARGET_INVALID` |
| Unknown or unsafe Electron option | `PLUGIN_WINDOW_OPTIONS_INVALID` |
| Reflective, WebContents, multi-property, or malformed command | `PLUGIN_WINDOW_COMMAND_REMOVED` |
| Unknown or cross-plugin window id | `PLUGIN_WINDOW_NOT_FOUND` |
| Remote compatibility or non-loopback development view | `PLUGIN_WINDOW_REMOTE_URL_DENIED` |

Do not return raw filesystem paths or Electron stacks to a plugin renderer. Log
only sanitized plugin identity, source surface, profile reason, and stable code.

### 5. Good / Base / Bad Cases

- Good: a supported plugin opens `views/panel.html`; root and file realpaths are
  contained, the trusted profile is effective, and the host preload supplies the
  typed channel bridge in an isolated session.
- Base: a plugin declares a custom preload or legacy webview. It receives a named
  compatibility reason and local-only content while migration remains pending.
- Bad: a plugin supplies `https://example.com`, `../outside.html`, a symlink escape,
  `{ webPreferences: { nodeIntegration: true } }`, or `openDevTools`. Reject before
  constructing or controlling a window.

### 6. Tests Required

- Permission tests: unavailable runtime, denied permission, verified plugin
  requirement, and SDK mismatch must prove the handler was not called.
- Policy tests: remote forms, traversal, symlink escape, invalid targets, unsafe
  options, bounds validation, exact legacy translation, and unknown commands.
- Ownership tests: visibility and commands resolve ids only from the owning
  plugin's `_windows` map.
- Profile tests: trusted activation, custom preload/webview compatibility reasons,
  managed preference stripping, host partition generation, and preload bootstrap.
- Navigation tests: canonical local entry/resources, remote denial, exact configured
  loopback development origin, and compatibility local-only behavior.
- Bridge tests: bootstrap normalization, unique-key filtering, async send/on,
  disposer behavior, timeout/destroy cleanup, and no raw page-context APIs.
- Packaged Electron smoke: load the built preload; assert metadata/config/channel,
  no Node/Electron page globals, hardened actual web preferences, isolated session,
  and denial of remote navigation, popup, resource, and permission requests.
  `getLastWebPreferences()` does not report the preload path in all Electron
  versions, so successful bridge exposure is the executable proof that it loaded.

### 7. Wrong vs Correct

#### Wrong

```ts
transport.on(PluginEvents.window.new, async ({ url, ...options }) => {
  const win = new BrowserWindow(options)
  await win.loadURL(url)
})

const target = browserWindow[propertyName]
target(...args)
```

#### Correct

```ts
registerProtectedWindowChannel(
  PluginEvents.window.new,
  protectedWindowOptions,
  async (payload, context) => {
    const request = normalizePluginWindowRequest(payload)
    const target = await resolveLocalPluginWindowTarget(plugin.pluginPath, request.file)
    const preferences = buildPluginViewWebPreferences(profile, hostOptions)
    const navigation = await createPluginViewNavigationPolicy(policyOptions)
    const win = new TouchWindow(buildPublicPluginWindowOptions(request.options ?? {}, preferences))
    installPluginViewNavigationPolicy(win.window.webContents, navigation)
    await win.loadFile(target)
    return { id: win.window.webContents.id }
  }
)
```
