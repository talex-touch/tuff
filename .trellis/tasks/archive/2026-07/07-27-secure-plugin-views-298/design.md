# Technical Design — Enforce Secure Plugin Views #298

## Decision

Use one production plugin view profile only: `trusted-plugin-view`. Legacy characteristics are classification inputs, not an alternate Electron configuration. `resolvePluginViewSecurityProfile()` records diagnostics and throws `PluginViewCompatibilityError` before any Electron object is constructed.

## Shared Contracts

### Stable error

Add `PLUGIN_WINDOW_LEGACY_RUNTIME_UNSUPPORTED` to `PLUGIN_WINDOW_ERROR_CODES`. `PluginViewCompatibilityError` carries this code plus one stable reason:

- `sdkapi-before-trusted-marker`
- `legacy-preload`
- `legacy-webview`
- `explicit-legacy-runtime`

The public window handler maps it through `toPluginWindowErrorData`; CoreBox and DivisionBox propagate the same typed error to their existing activation failure path.

### Bridge version

`PLUGIN_VIEW_BRIDGE_VERSION = 1` lives in `src/shared/plugin-view-bridge.ts`. The bootstrap schema requires the exact version. The bundled preload exposes it as `$plugin.bridgeVersion`, while retaining `$plugin`, `$config`, and `$channel` for current SDK consumers.

### Security profile

`WindowSecurityProfile` becomes `app | trusted-plugin-view`; both share the hardened managed-key base. `buildPluginViewWebPreferences()` accepts only trusted profile, always chooses bundled preload, and salts the partition with bridge version.

## Runtime Flow

1. Resolve loaded plugin from authoritative host context.
2. Classify SDK and injection requirements.
3. If legacy, record a blocked diagnostic and throw stable compatibility error.
4. Build immutable bootstrap and hardened preferences.
5. Create exact local/dev navigation policy.
6. Construct BrowserWindow/WebContentsView.
7. Register WebContents to current activation.
8. Install navigation/session/download policy bound to the owner id.
9. Load canonical target; on failure unregister and destroy.

## Policy Details

- Main-frame navigation: exact entry or exact dev origin only.
- Subframes and requests: canonical plugin root for local mode; exact dev origin for dev mode; bounded data/blob behavior.
- Popups: deny all.
- `<webview>`: deny attach; top-level plugin and app windows have `webviewTag: false`.
- Downloads: deny only when initiating WebContents id equals owner; non-owner calls are denied by their own policy and never inherit owner allowance.
- Permissions: handlers return false and callback false; no plugin permission maps to Electron session permission.
- Protocol: unknown/custom schemes fail resource allowlist. `atom:` returns 410 and never maps a path.

## Legacy Surface Removal

`PluginView.vue` and `ViewPlugin.vue` are unreferenced historical webview hosts. Remove them after a repository reference check, then remove `enableWebviewTag` from `MainWindowOption`. Keep WidgetFrame unchanged because it is not a separate Electron WebContents.

## Bundled Migration

Raise only bundled plugins that actually create webcontent surfaces and pass validation (`clipboard-history`, `touch-translation`) to SDK 260615. Do not blanket-bump unrelated plugins.

## Testing

- Pure profile tests: every legacy reason throws stable code; no env changes behavior.
- preferences tests: only hardened profile, managed overrides stripped.
- bridge tests: exact version roundtrip; missing/wrong rejected.
- host tests: bundled preload only, partition includes version.
- policy tests: top-frame/subframe/resource protocol matrix; owner-bound download/permission; webview denied.
- source contract tests: all three surfaces call gate before constructor; no compat/dynamic preload branch; main window webview disabled; atom has no file fetch.
- real Electron smoke: preferences, minimal globals, bridge version, popup/resource/navigation/permission/download denial.
- compatibility tests: public SDK preserves legacy error code; bundled manifests meet marker.

## Rollback

Rollback must restore the entire hard-cut contract, not only the profile selector. Never restore insecure managed preferences as an emergency fallback; incompatible plugins remain blocked with the stable error while migration is fixed.
