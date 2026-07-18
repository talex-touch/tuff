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
  file: string;
  options?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    title?: string;
    resizable?: boolean;
    alwaysOnTop?: boolean;
    visible?: boolean;
  };
  _sdkapi?: number;
}
```

Window control is a discriminated union:

```ts
type PluginWindowCommand =
  | { type: "focus" }
  | { type: "close" }
  | {
      type: "setBounds";
      bounds: { x?: number; y?: number; width: number; height: number };
    }
  | { type: "setAlwaysOnTop"; value: boolean };
```

Privileged plugin handlers use the protected transport registration contract:

```ts
createProtectedRegister(transport)(
  event,
  {
    permissionId: "window.create",
    failClosedForPlugin: true,
    requireVerifiedPlugin: true,
    unavailableCode: "PLUGIN_WINDOW_PERMISSION_UNAVAILABLE",
    deniedCode: "PLUGIN_WINDOW_PERMISSION_DENIED",
    sdkMismatchCode: "SDKAPI_MISMATCH",
  },
  handler,
);
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

| Condition                                                     | Required result                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| Permission runtime unavailable                                | `PLUGIN_WINDOW_PERMISSION_UNAVAILABLE` before handler execution |
| Permission missing or denied                                  | `PLUGIN_WINDOW_PERMISSION_DENIED` before handler execution      |
| Payload SDK conflicts with enforced declared SDK              | `SDKAPI_MISMATCH` before handler execution                      |
| `http:`, `https:`, protocol-relative, or other URL-like input | `PLUGIN_WINDOW_REMOTE_URL_DENIED`                               |
| Traversal, absolute escape, or symlink escape                 | `PLUGIN_WINDOW_PATH_OUTSIDE_ROOT`                               |
| Missing, non-file, or non-HTML target                         | `PLUGIN_WINDOW_TARGET_INVALID`                                  |
| Unknown or unsafe Electron option                             | `PLUGIN_WINDOW_OPTIONS_INVALID`                                 |
| Reflective, WebContents, multi-property, or malformed command | `PLUGIN_WINDOW_COMMAND_REMOVED`                                 |
| Unknown or cross-plugin window id                             | `PLUGIN_WINDOW_NOT_FOUND`                                       |
| Remote compatibility or non-loopback development view         | `PLUGIN_WINDOW_REMOTE_URL_DENIED`                               |

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
  const win = new BrowserWindow(options);
  await win.loadURL(url);
});

const target = browserWindow[propertyName];
target(...args);
```

#### Correct

```ts
registerProtectedWindowChannel(
  PluginEvents.window.new,
  protectedWindowOptions,
  async (payload, context) => {
    const request = normalizePluginWindowRequest(payload);
    const target = await resolveLocalPluginWindowTarget(
      plugin.pluginPath,
      request.file,
    );
    const preferences = buildPluginViewWebPreferences(profile, hostOptions);
    const navigation = await createPluginViewNavigationPolicy(policyOptions);
    const win = new TouchWindow(
      buildPublicPluginWindowOptions(request.options ?? {}, preferences),
    );
    installPluginViewNavigationPolicy(win.window.webContents, navigation);
    await win.loadFile(target);
    return { id: win.window.webContents.id };
  },
);
```

## Scenario: Plugin-Owned Runtime Overlay

### 1. Scope / Trigger

- Trigger: a plugin can register host-consumed runtime data such as Domain Lexicon entries while official data remains immutable.
- The contract spans SDK marker/versioning, typed transport, manifest permission declaration, permission grant, verified transport identity, host namespace assignment, read isolation, validation bounds, and lifecycle cleanup.

### 2. Contracts

- The request payload must not contain an authoritative plugin id, namespace, or provenance. Derive all three from verified transport context and the loaded plugin instance.
- Require the minimum SDK marker and explicit read/register permissions. A missing permission module, declaration, grant, loaded plugin, verified context, or compatible marker fails closed before registry access.
- Accept only plugin-local ids. The host assigns canonical `plugin:<pluginId>:<localId>` ids and `plugin:<pluginId>` provenance; reject pre-prefixed ids and any collision with official data.
- Read operations merge immutable official entries with only the caller's overlay. Never enumerate or search another plugin's overlay.
- Validate plain JSON metadata recursively, including cycle rejection, and enforce per-batch byte/entry bounds plus a per-plugin total before mutation.
- Build and validate the complete candidate registry before replacing existing state. A failed registration preserves the previous overlay.
- Keep plugin overlays in memory unless a separate signed catalog/persistence contract exists. Clear the owning overlay on disable and unload; official entries remain available.

### 3. Tests Required

- Authorization matrix: missing verified identity, unsupported/mismatched marker, unavailable permission runtime, undeclared permission, denied grant, and successful call.
- Namespace/isolation: host-owned id and provenance, official override denial, prefixed-id denial, same local id in two plugins, and no cross-plugin resolve/search.
- Atomic bounds: malformed entry, unsafe metadata, duplicate/collision, oversized batch, per-plugin limit, replace semantics, and previous-state preservation after every failure.
- Lifecycle: disable/unload clear only the owning plugin overlay while official entries and other plugin overlays remain intact.

## Scenario: Same-Realm Widget Host-API Containment

### 1. Scope / Trigger

- Trigger: compiled `vue`, `webcomponent`, or `arrow` widget code is registered inside the CoreApp renderer.
- This boundary spans package-time dependency validation, renderer module resolution, dynamic component evaluation, browser API facades, `WidgetFrame` host actions, quota/audit evidence, and widget disposal.
- The current implementation is same-realm host-API containment. It is not a process, origin, or intrinsic realm boundary; evidence must state this limitation instead of calling it secure code isolation.

### 2. Signatures

```ts
type WidgetSandboxDecision = "allowed" | "denied" | "quota-exceeded";

interface WidgetSandboxAuditEntry {
  sequence: number;
  timestamp: number;
  widgetId: string;
  pluginName: string;
  operation: WidgetSandboxOperation;
  decision: WidgetSandboxDecision;
  reason?: string;
}

interface WidgetSandboxQuotaEvidence {
  windowMs: 10_000;
  maxCalls: 120;
  usedCalls: number;
  blockedCalls: number;
  resetsAt: number;
}

runWidgetHostAction(
  widgetId: string,
  operation: "clipboard.hostAction" | "history.hostAction" | "hostAction.invoke",
  callback: () => void,
): boolean;
```

### 3. Contracts

- Build one policy per registered widget and dispose it on failure, replacement, or unregister. A retained facade from a disposed policy must reject every later operation.
- Inject `window`, `globalThis`, browser capabilities, CommonJS bindings, and allow-listed safe globals through one `with` scope whose `has` trap prevents unresolved identifiers from falling through to the host global object.
- Run lexical preflight before the widget factory. Reject direct `eval`, `Function`, dynamic import, `importScripts`, WebAssembly, escaped identifiers, and constructor/prototype escape markers.
- `navigator.clipboard`, document clipboard commands, `location` mutation, workers, service workers, direct network constructors, `window.open`, and `window.close` fail closed. Widgets request user-visible work only through typed host actions.
- `history` is widget-local memory. `postMessage` targets a widget-local `EventTarget`; `BroadcastChannel` names are plugin-prefixed. Neither path dispatches onto the host window.
- Local/session storage and cookies are widget-namespaced. IndexedDB database enumeration and CacheStorage keys/matches expose only the owning plugin namespace. `Cache.add` and `Cache.addAll` are network operations and must reject.
- Charge dynamic evaluation, sensitive browser operations, widget messages, and typed host actions to the 120-call/10-second budget. Quota exhaustion fails closed before the host callback or browser operation.
- Keep at most 2,048 audit entries globally. Entries contain identity, operation, decision, and a static/sanitized reason only; never record clipboard data, message data, host-action payloads, URLs with query strings, or cache content.
- Package and runtime module allow-lists must agree: only exact `WIDGET_ALLOWED_PACKAGES` and declared `WIDGET_ALLOWED_PACKAGE_PREFIXES` subpaths may remain external. A generic `@talex-touch/*` wildcard is forbidden because it exposes transport and plugin SDK internals.
- Forward the same host callback props through Vue, WebComponent, and Arrow adapters. Runtime choice must not bypass host-action quota or cleanup semantics.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Undeclared or unavailable module | Reject before module resolution; record registration failure evidence |
| Raw `@talex-touch/utils/transport` import | Reject during package/runtime dependency validation |
| Dynamic source violation | `WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED`; source body is not executed |
| Clipboard/location/worker/network attempt | `WIDGET_SANDBOX_CAPABILITY_DENIED`; host spy remains untouched |
| Call 121 inside the fixed window | `WIDGET_SANDBOX_QUOTA_EXCEEDED`; audit `quota-exceeded` |
| `postMessage` with cloneable data | Deliver only to the widget-local message target; audit without data |
| Cross-plugin IndexedDB/cache enumeration | Filter the foreign namespace and strip the internal prefix from owned names |
| Cache network loader | Reject `add` / `addAll`; do not call the host Cache method |
| Host action after widget disposal | Return `false`; do not invoke the host callback |
| Retained browser facade after disposal | Reject with disposed-policy evidence |

### 5. Good / Base / Bad Cases

- Good: a widget sends a cloneable local message, updates its isolated history, then emits a declared host action. Each operation is charged and audited without payload content.
- Base: a widget renders with Vue/TuffEx only and never calls a privileged browser surface. Registration records guarded dynamic execution evidence and the runtime remains compatible.
- Bad: expose the preloaded transport/plugin SDK, delegate unknown `window` properties to the host, call `new Worker`, persist raw message data in audit, let CacheStorage match foreign namespaces, or describe same-realm evaluation as a secure realm.

### 6. Tests Required

- Registration/mount tests for Vue, WebComponent, and Arrow, including identical host-action forwarding and cleanup behavior.
- Host-spy tests proving clipboard, history/location, network, workers, raw transport modules, and DOM anchor/form navigation do not reach host capabilities.
- Local messaging/history tests proving useful widget-local behavior and no cross-widget/host delivery.
- Quota/audit tests for exact exhaustion, allowed/denied decisions, 2,048-entry retention, payload exclusion, and disposed-policy rejection.
- Storage tests for cookie/local isolation, IndexedDB database filtering, CacheStorage key/match filtering, cache network denial, and BroadcastChannel namespace/quota.
- Dynamic preflight tests for every denied form and an assertion that source-side effects never execute.
- Package builder tests proving exact packages and declared prefixes remain external while arbitrary `@talex-touch/*` imports fail before packaging.
- Renderer web type-check plus focused registration/mount tests are required proof for cross-runtime callback contracts.

### 7. Wrong vs Correct

#### Wrong

```ts
const executor = new Function("require", "module", "window", code);
const module = moduleName.startsWith("@talex-touch/")
  ? preloadedModules[moduleName]
  : undefined;
```

Free identifiers and generic scoped packages can recover host capabilities outside the declared widget contract.

#### Correct

```ts
assertWidgetDynamicSource(widgetId, code);
const scope = new Proxy(scopedGlobals, {
  has: () => true,
  get: (target, key) => Reflect.get(target, key),
});
const module = isAllowedWidgetModule(moduleName)
  ? resolveAllowlistedWidgetModule(moduleName)
  : undefined;
```

The factory sees only explicit globals and modules; privileged behavior remains behind quota-governed typed host actions.

## Scenario: Dynamic Feature Identity

### 1. Contracts

- `feature.id` is the canonical lifecycle identity for dynamically registered features. Display names are labels, not lookup keys.
- `addFeature()` rejects both duplicate ids and duplicate display names without replacing the existing feature.
- `getFeature()` and `removeFeature()` accept only `feature.id`; removal of an unknown id returns `false` and must not mutate the registry.
- Registry-backed plugins reconcile by id so rename, reload, and deletion cannot remove the wrong feature.
- Plain runtime feature objects with `icon.type: "file"` must start the same host-owned `TuffIconImpl` initialization used by manifest features. Relative values resolve inside the owning plugin root; traversal or missing targets fail closed instead of reaching CoreBox as raw relative paths.

### 2. Tests Required

- Prove that a duplicate id with a different name is rejected and preserves the original feature.
- Prove that removal by id deletes only the target, retains siblings, and returns `false` for unknown ids.
- Prove that registering a plain runtime feature initializes its file icon; packaged smoke must observe the resolved plugin-root asset rather than the declared relative path.

## Scenario: Active Feature Items And Shared Widget Renderers

### 1. Scope / Trigger

- Trigger: a plugin pushes state for an explicitly activated feature, or a runtime-added feature reuses a widget that was precompiled for a manifest feature.
- This contract spans `plugin.feature`, root-scoped `boxItems`, `IFeatureInteraction`, widget registration, dynamic feature lifecycle, and packaged plugin output.

### 2. Signatures

```ts
interface IFeatureInteraction {
  type: "webcontent" | "widget";
  path?: string;
  rendererFeatureId?: string;
}
```

`rendererFeatureId` is a same-plugin `feature.id`, not a widget id or display name.

### 3. Contracts

- `boxItems.push*` and `boxItems.update` are root-search writes. They require `search.root-results` and respect the owning Search Provider's enabled state.
- `plugin.feature.pushItems()` and `plugin.feature.updateItem()` are active-feature state writes. They still require an active plugin and the declared permission, but a disabled root-search provider must not drop the explicitly invoked feature state.
- When `rendererFeatureId` is absent, widget registration uses the triggered feature as before.
- When `rendererFeatureId` is present, resolve it only through the owning plugin's feature registry. The target must exist and declare `interaction.type: 'widget'` with a concrete `path`.
- Register the target renderer, then invoke the lifecycle with the original dynamic feature id. A custom-render item emitted for that feature must use the target renderer's namespaced widget id.
- Never synthesize or runtime-compile an unbuilt widget id for a dynamic feature in a packaged app.

### 4. Validation & Error Matrix

| Condition                                        | Required result                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Plugin inactive or permission denied             | Drop the active-feature write before `BoxItemManager` mutation         |
| Root `boxItems` provider disabled                | Drop root push/update; remove and clear remain cleanup-safe            |
| Active feature provider disabled                 | Preserve `plugin.feature` push/update                                  |
| `rendererFeatureId` missing                      | Use the triggered feature's existing widget registration path          |
| Renderer target missing, non-widget, or pathless | Return `false`, emit widget-load failure, and do not invoke lifecycle  |
| Valid same-plugin renderer target                | Register target renderer and invoke original dynamic feature lifecycle |

### 5. Good / Base / Bad Cases

- Good: `intelligence-custom-professional-tone` reuses `intelligence-ask`; the packaged host registers the precompiled ask renderer, then opens the custom command in no-history mode.
- Base: a manifest feature with its own `interaction.path` omits `rendererFeatureId` and keeps the existing registration behavior.
- Bad: a dynamic feature points at its own unbuilt id, a display name, another plugin, or a target without a widget path.

### 6. Tests Required

- Disabled-provider tests must prove root `boxItems` stays blocked while `plugin.feature.pushItems/updateItem` reaches `BoxItemManager`.
- Shared-renderer tests must assert `registerWidget` receives the stored target feature while lifecycle receives the original dynamic feature.
- Invalid-target tests must assert `false`, no renderer call, no lifecycle call, and an explicit widget-load notification.
- Packaged smoke must save a dynamic feature, find it without restart, open it, and observe the reused widget renderer.

### 7. Wrong vs Correct

#### Wrong

```ts
features.addFeature({
  id: "dynamic-command",
  interaction: { type: "widget", path: "ask-panel" },
});

makeWidgetId(pluginName, "dynamic-command");
```

The packaged build has no precompiled `dynamic-command` widget entry.

#### Correct

```ts
features.addFeature({
  id: "dynamic-command",
  interaction: { type: "widget", rendererFeatureId: "intelligence-ask" },
});

makeWidgetId(pluginName, "intelligence-ask");
```

## Scenario: Declared Widget Host Navigation

### 1. Scope / Trigger

- Trigger: a custom widget emits `host-action` for an internal host route instead of a plugin lifecycle command.
- This contract spans widget events, the current `TuffItem.actions` declaration, CoreBox dispatch, `useActionPanel`, and renderer navigation.

### 2. Signatures

```ts
interface WidgetHostAction {
  actionId: string;
  payload?: Record<string, unknown>;
}

interface DeclaredWidgetNavigationAction {
  id: string;
  type: "navigate";
  primary?: boolean;
  payload: { path: string };
}

executeAction(actionId: string, targetItem: TuffItem): Promise<void>;
```

### 3. Contracts

- A widget navigation event is host-owned only when `actionId` matches an action on the current item and that action has `type: "navigate"`.
- Route through the public `useActionPanel.executeAction(actionId, item)` path. The declared action payload is authoritative; the widget event cannot replace its `path`.
- The CoreBox navigation callback hides CoreBox, then pushes the declared internal route.
- Undeclared actions and declared `execute` actions retain the plugin execution path, including the existing item-meta payload merge and `CoreBoxEvents.item.execute` transport call.
- Do not grant widgets generic `copy`, `open`, or arbitrary host-action dispatch as part of a navigation-only change.
- Internal tab deep links are allow-listed by the destination component. A missing or invalid `?tab=` selects the component default; navigating to another plugin without a tab query must not leak the previous selection.

### 4. Validation & Error Matrix

| Widget event | Current item declaration | Required result |
| --- | --- | --- |
| Matching action id | `type: "navigate"`, non-empty `payload.path` | Hide CoreBox and navigate; no plugin execute transport |
| Matching action id | `type: "execute"` | Preserve plugin item execution |
| Unknown action id | Missing | Preserve plugin item execution so existing widget commands keep working |
| Spoofed event payload path | Declared navigate action has a different path | Ignore event path; use declared action payload |
| Valid plugin tab deep link | `?tab=Permissions` | Select the exact declared Permissions tab |
| Missing or invalid plugin tab | None / unsupported value | Select `Overview` |

### 5. Good / Base / Bad Cases

- Good: AI provider failures declare `open-intelligence-settings -> /intelligence/channels`; permission failures declare `open-plugin-permissions -> /plugin/touch-intelligence?tab=Permissions`. Each widget emits only its matching id after a user click.
- Base: `retry`, `select-model`, and `select-context-mode` remain plugin actions because the item does not declare them as navigation.
- Bad: a widget emits an undeclared route, overrides the declared path in event payload, or routes every host action through navigation dispatch.

### 6. Tests Required

- Hook test: call public `executeAction()` with a declared navigate action; assert the navigation callback receives the exact declared path and `CoreBoxEvents.item.execute` is not sent.
- Plugin item test: assert each recoverable error code declares exactly one non-primary navigate action and unrelated errors declare none.
- Widget test: click the visible recovery control and assert exactly one matching `host-action`; assert non-recoverable and non-error states hide it.
- Deep-link test: valid `Permissions` selects that tab, invalid values fall back to `Overview`, and plugin navigation without `?tab=` resets prior selection.
- Renderer type-check must prove CoreBox can call the public hook method without bypasses.

### 7. Wrong vs Correct

#### Wrong

```ts
if (payload.actionId === "open-settings") {
  router.push(String(payload.payload?.path));
}
```

The widget controls the route and bypasses the item's declarative action contract.

#### Correct

```ts
const declared = item.actions?.find((action) => action.id === payload.actionId);
if (declared?.type === "navigate") {
  await actionPanel.executeAction(payload.actionId, item);
  return;
}
```

The host validates intent against the current item and reuses the established navigation executor.

## Scenario: Structured Plugin Intelligence Failure Guidance

### 1. Scope / Trigger

- Trigger: a governed Intelligence call rejects with canonical `code`, `message`, and optional user-safe `reason` / `recovery` fields.
- The boundary spans plugin error normalization, widget state, item metadata, custom-render payload, and widget retry events.

### 2. Signatures

```ts
interface NormalizedPluginIntelligenceError {
  code: string;
  message: string;
  reason: string;
  recovery: string;
}

interface IntelligenceWidgetFailurePayload {
  errorCode: string;
  errorMessage: string;
  errorReason: string;
  errorRecovery: string;
}
```

`errorReason` and `errorRecovery` are trimmed plain text with a maximum of 240 characters each.

### 3. Contracts

- Preserve supplied canonical reason/recovery separately from the localized summary message; do not parse them back out of provider strings.
- Missing structured fields remain empty. Never invent a generic reason/recovery placeholder that could misstate the failure.
- Apply the same 240-character bound during error normalization, widget-state mapping, custom payload creation, and metadata mapping.
- Push both fields through every widget error writer and retain them in the retry action payload.
- Render details through Vue text interpolation under `原因` / `建议`. Never use raw HTML for provider/runtime failure content.
- When the terminal assistant error message exactly matches `errorMessage`, suppress only that final duplicate from `TxAiConversation`; preserve earlier/distinct history and do not render empty-conversation copy in error state.

### 4. Validation & Error Matrix

| Input | Required result |
| --- | --- |
| Canonical reason/recovery present | Trim, truncate with existing ellipsis behavior, preserve both fields end to end |
| One field missing | Render only the populated row |
| Both fields missing | Render no error-details group or empty labels |
| Markup-like detail text | Display escaped text; do not create DOM from it |
| Retry after structured failure | Host payload retains the bounded reason/recovery values |

### 5. Good / Base / Bad Cases

- Good: `PROVIDER_UNAVAILABLE` displays the localized error summary plus the runtime's bounded reason and concrete recovery guidance.
- Base: a plugin-local permission denial has no structured guidance and keeps the existing permission hint without empty detail rows.
- Bad: discard runtime recovery, concatenate it into `errorMessage`, expose an unbounded provider body, or render it with `v-html`.

### 6. Tests Required

- Normalizer test: supplied values are trimmed, bounded at 240 characters, and missing values remain empty.
- Lifecycle test: a real rejected plugin invoke reaches the pushed custom widget payload with code, reason, and recovery intact.
- Payload/meta test: `buildWidgetPayload()` and item Intelligence metadata expose the separate fields.
- Widget test: visible labels and escaped values render only when populated; retry emits both fields.
- Deduplication test: matching terminal error appears once in the notice, prior/distinct messages remain, non-error states are unchanged, and no empty-state copy appears.

### 7. Wrong vs Correct

#### Wrong

```ts
const errorMessage = `${failure.message}: ${failure.recovery}`;
```

This destroys structure, duplicates content, and prevents safe conditional presentation.

#### Correct

```ts
const failureState = {
  errorCode: failure.code,
  errorMessage: failure.message,
  errorReason: truncateText(failure.reason, 240),
  errorRecovery: truncateText(failure.recovery, 240),
};
```

The widget can present bounded guidance without guessing or parsing provider text.

## Scenario: User-Initiated Plugin AI Cancellation

### 1. Scope / Trigger

- Trigger: an official AI widget is in `ocr-pending` or `chat-pending` and the user selects `停止生成`.
- The boundary spans widget payload identity, plugin session state, transport stream controllers, stale callback guards, and cancelled-state presentation.

### 2. Signatures

```ts
interface CancelIntelligenceWidgetAction {
  actionId: "cancel-request";
  payload: {
    requestId: string;
    prompt: string;
    answer: string;
    status: "ocr-pending" | "chat-pending";
  };
}

type IntelligenceWidgetStatus =
  | "idle"
  | "ocr-pending"
  | "chat-pending"
  | "ready"
  | "cancelled"
  | "error";
```

### 3. Contracts

- Show the stop control only for a pending widget with a non-empty current `requestId`.
- Accept cancellation only when `payload.requestId === session.activeRequestId`; missing or stale ids are no-ops.
- Cancel only the matching feature session through `supersedeActiveRequest(session)`. Never cancel every plugin session for a user stop.
- A context-stream controller is cancelled exactly once. If cancellation occurs before a cancellable controller exists, clear request authority so later OCR/invoke completion is ignored.
- Push neutral `cancelled` state immediately. Preserve visible partial answer and current provider/model/context metadata, but do not commit the incomplete answer as completed conversation history.
- `canCommitResponse()` remains the authority for rejecting late delta/end/error callbacks after cancellation.
- Partial cancelled output stays eligible for copy and replace actions; cancellation is not a red error and must not create an `IntelligenceErrorCode`.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Matching active request with stream controller | Cancel once; push `cancelled`; preserve partial answer |
| Matching request before controller/invoke completion | Clear authority; ignore eventual completion |
| Missing request id | Return ignored; no controller or widget mutation |
| Stale request id while newer request is active | Return ignored; newer pending state remains authoritative |
| Late delta/end/error after stop | Ignore; cancelled widget remains unchanged |

### 5. Good / Base / Bad Cases

- Good: stop a streaming answer after one delta; the current text remains copyable and later provider callbacks cannot overwrite it.
- Base: stop before the first delta; show `已停止生成` with no empty-conversation or error fallback.
- Bad: call `supersedeAllActiveRequests()`, trust only widget status, accept a stale id, or report cancellation as provider failure.

### 6. Tests Required

- Runtime integration: matching cancellation calls the controller once, preserves partial output, and rejects late callbacks.
- Stale guard: missing/stale ids cannot cancel or replace a newer pending request.
- Widget behavior: pending states expose one semantic `停止生成` action with current request payload; ready/error/idle/cancelled states hide it.
- Cancelled presentation: neutral stopped copy renders and partial answer copy/replace controls remain available.

### 7. Wrong vs Correct

#### Wrong

```ts
if (actionId === "cancel-request") {
  supersedeAllActiveRequests();
}
```

One stale widget can cancel unrelated or newer feature work.

#### Correct

```ts
if (payload.requestId !== session.activeRequestId) return ignored;
supersedeActiveRequest(session);
await pushWidgetState(featureId, { status: "cancelled", answer: payload.answer });
```

Cancellation is identity-bound, local to one session, and leaves a stable user-visible terminal state.

## Scenario: Plugin Intelligence Quota Ownership

### 1. Scope / Trigger

- Trigger: a plugin calls Intelligence capabilities or attempts to read or mutate the local quota/usage control plane.
- The boundary spans the plugin facade, typed transport, transport actor context, `IntelligenceModule`, and invoke-time quota enforcement.
- `intelligence.basic` grants governed capability execution. It does not grant quota administration or authority to choose a billing identity.

### 2. Signatures

The plugin facade omits the quota control plane:

```ts
type PluginIntelligenceSdk = Omit<
  IntelligenceSdk,
  | "getQuota"
  | "setQuota"
  | "deleteQuota"
  | "getAllQuotas"
  | "checkQuota"
  | "getCurrentUsage"
>;
```

Plugin invoke options are rebound at the host boundary:

```ts
function bindPluginInvokeCaller(
  options: IntelligenceInvokeOptions | undefined,
  context: Pick<HandlerContext, "plugin">,
): IntelligenceInvokeOptions | undefined;
```

### 3. Contracts

- For plugin transport context, `invoke()` and `stream()` must overwrite `options.metadata.caller` with `plugin:<context.plugin.name>` before calling the Intelligence runtime.
- Preserve all unrelated options and metadata. A host context preserves the caller supplied by the host.
- `getQuota`, `setQuota`, `deleteQuota`, `getAllQuotas`, `checkQuota`, and `getCurrentUsage` are host-only transport handlers.
- Hide host-only methods from property reads, `in`, and own-key enumeration. Facade omission is developer guidance, not the security boundary.
- Raw typed-event calls from a plugin must fail before payload validation, storage import, or quota mutation.
- Invoke-time internal quota checks remain active; plugins do not preflight or administer them through the public facade.
- Non-stream fallback audit/cache follows the terminal invocation outcome: successful fallback writes one success using the actual fallback result and caches it under the original key; exhausted fallback writes one failure and rethrows the primary error. Never persist a recoverable primary failure as an extra billed/audited call.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Plugin reads a host-only quota method from facade | `undefined`; method is not discoverable or enumerable |
| Plugin sends a quota control-plane typed event | `INTELLIGENCE_HOST_ONLY_CAPABILITY` before handler work |
| Plugin omits `metadata.caller` | Runtime receives `plugin:<plugin id>` |
| Plugin supplies another caller id | Host overwrites it with `plugin:<plugin id>` |
| Host sends a quota event | Continue to normal payload validation and quota manager |
| Host invokes with an explicit caller | Preserve the host caller |
| Primary provider fails, fallback succeeds | One success audit with fallback identity/usage; result cached |
| Every provider fails | One failure audit; primary error preserved |
| Outer-governed fallback succeeds | No inner audit; result may be cached |

### 5. Good / Base / Bad Cases

- Good: `third-party-plugin` invokes `text.chat`; runtime quota metadata uses `plugin:third-party-plugin` regardless of payload.
- Base: a host settings view reads or updates a quota through the full domain SDK and reaches normal validation/storage.
- Bad: a plugin sends `setQuota({ callerId: "__default_plugin__" })`, enumerates all quotas, or omits caller metadata to bypass quota checks.

### 6. Tests Required

- Facade surface: all six control-plane methods fail membership, property-read, and enumeration checks while safe capability methods remain.
- Raw transport: every quota handler rejects a verified plugin context with `INTELLIGENCE_HOST_ONLY_CAPABILITY`; assert storage is untouched.
- Actor binding: invoke and stream override missing/spoofed plugin callers and preserve unrelated options; host callers remain unchanged.
- Regression: text/chat capability execution with `intelligence.basic` remains available and still passes through internal quota enforcement.
- Fallback regression: ordinary success uses one fallback audit plus cache reuse; total failure uses one failure audit; outer-governed calls remain audit-free.

### 7. Wrong vs Correct

#### Wrong

```ts
registerSafe(intelligenceApiEvents.setQuota, async config => {
  await intelligenceQuotaManager.setQuota(config);
});

await tuffIntelligence.invoke(capabilityId, payload, payload.options);
```

#### Correct

```ts
registerSafe(intelligenceApiEvents.setQuota, async (config, context) => {
  assertHostOwnedIntelligenceControlPlane(context);
  await intelligenceQuotaManager.setQuota(config);
});

const options = bindPluginInvokeCaller(payload.options, context);
await tuffIntelligence.invoke(capabilityId, payload.payload, options);
```

## Scenario: Autonomous Intelligence Permission

### 1. Scope / Trigger

- Trigger: a plugin requests Agent or workflow execution through a governed generic capability. Low-level Agent session/orchestrator/tool events and persisted workflow control-plane events are host APIs, not permission-granted plugin APIs.
- `intelligence.basic` covers ordinary governed model calls. High-level paths that can plan and execute tools require the existing high-risk `intelligence.agents` grant.

### 2. Signatures

```ts
const autonomousCapabilities = {
  "agent.run": true,
  "workflow.execute": true,
} as const;

assertAutonomousIntelligencePermission(
  capabilityId: string,
  payload: unknown,
  context: Pick<HandlerContext, "plugin">,
): Promise<void>;
```

### 3. Contracts

- Apply the agents gate to generic invoke and stream before config loading, provider selection, or Agent runtime startup when the capability is `agent.run` or `workflow.execute`.
- Every plugin surface, including the main-process lifecycle `context.utils.intelligence`, must use the typed stream transport. It must carry `_sdkapi` and verified plugin context, return `StreamController`, and never replace the protected handler with a direct `tuffIntelligence.stream` call.
- Legacy `AgentsEvents.api.execute` / `executeImmediate` must use the same fail-closed agents gate. The channel overwrites plugin caller with `plugin:<transport id>`, preserves explicit host caller, and defaults missing host caller to `intelligence.agent-executor` before runtime readiness or queueing.
- LLM-backed legacy Agent execute/chat/plan fallbacks forward only safe caller/agent/task/session metadata to Intelligence. Provider usage must flow through the bridge into `AgentResult`; it must not be replaced by hard-coded zero tokens.
- Keep `workflowList/Get/Save/Delete/Run/History/ReviewUpdate` host-only regardless of `intelligence.agents`; a grant authorizes high-level autonomous execution, not ownership of shared persisted workflow definitions or history.
- Reject raw plugin workflow events before storage lookup, mutation, runtime wait, or provider/tool work.
- Keep `agentSession*`, `agentPlan/Execute/Reflect`, and `agentTool*` host-only regardless of plugin grants; `agent.run()` / `workflow.execute()` remain the plugin autonomy surface and host context retains the full runtime.
- Permission runtime absence must fail closed for plugin autonomous requests.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Basic-only plugin invokes/streams autonomous capability | `INTELLIGENCE_AGENTS_PERMISSION_DENIED`; runtime untouched |
| Permission runtime unavailable | `INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE`; runtime untouched |
| Lifecycle facade streams autonomous capability | Same protected typed handler and `intelligence.agents` gate |
| Lifecycle stream cancellation | Protocol cancel event carries the same plugin identity |
| Legacy Agent plugin caller missing/spoofed | Gate first; manager receives canonical plugin caller |
| Legacy Agent host caller missing | Manager receives `intelligence.agent-executor` |
| Legacy Agent LLM success | SDK quota/audit sees caller; AgentResult preserves provider usage |
| Plugin sends a raw low-level Agent session/orchestrator/tool event | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; runtime untouched |
| Plugin reads/enumerates a low-level Agent runtime method | Missing/`undefined`; high-level `agent.run` remains |
| Plugin calls any persisted workflow control-plane event | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; storage/runtime untouched |
| Host performs low-level session or persisted workflow operations | Preserve host behavior |

### 5. Good / Base / Bad Cases

- Good: a plugin declares and receives `intelligence.agents`, then calls the governed `agent.run()` / `workflow.execute()` wrapper.
- Base: a chat plugin with only `intelligence.basic` calls `text.chat`; no low-level session or persisted workflow surface is needed.
- Bad: a basic-only plugin routes around tool permissions through generic `invoke("agent.run")` / `workflow.execute`, or sends raw low-level Agent/workflow events after any grant.

### 6. Tests Required

- Generic invoke/stream tests must prove both autonomous capability ids fail before the Intelligence SDK and that `text.chat` still runs.
- Lifecycle facade tests must prove stream start/cancel protocol routing, `_sdkapi`, plugin identity, and returned controller; protected-handler tests own the denial-before-runtime assertion.
- Legacy Agent channel tests cover denied/unavailable-before-runtime, plugin spoof overwrite, host preservation/default, queued/immediate paths; executor tests cover safe invoke metadata, execute/plan fallback usage, and provider failure.
- Session boundary tests must prove facade omission plus raw plugin request/stream denial before trace query, subscription, mutation, timer, or disconnect-pause side effects, while host session behavior remains.
- Workflow boundary tests must prove facade omission plus raw plugin list/get/save/delete/run/history/review denial before service/runtime work while host behavior remains.
- Permission-guard tests own granted/denied/unavailable matrix behavior and stable error fields.

### 7. Wrong vs Correct

#### Wrong

```ts
registerProtectedSafe(invokeEvent, "Invoke", "intelligence.basic", async data => {
  return tuffIntelligence.invoke(data.capabilityId, data.payload, data.options);
});
```

#### Correct

```ts
registerProtectedSafe(invokeEvent, "Invoke", "intelligence.basic", async (data, context) => {
  await assertAutonomousIntelligencePermission(data.capabilityId, data, context);
  return tuffIntelligence.invoke(data.capabilityId, data.payload, data.options);
});
```

## Scenario: Plugin Intelligence Admin Surface

### 1. Scope / Trigger

- Trigger: plugin code reaches provider testing/model discovery, capability smoke, audit/usage telemetry, or local Intelligence environment inspection.
- These APIs are host settings and diagnostics control plane, not ordinary `intelligence.basic` capability execution.

### 2. Signatures

The plugin facade omits:

```ts
type HostIntelligenceAdminMethod =
  | "testProvider"
  | "testCapability"
  | "fetchModels"
  | "getAuditLogs"
  | "getTodayStats"
  | "getMonthStats"
  | "getUsageStats"
  | "getLocalEnvironment";
```

Safe plugin discovery remains `getCapabilityStatus`, `getProviderModelOptions`, and `getCapabilityTestMeta`.

### 3. Contracts

- Hide every admin method from plugin property access, membership, and enumeration.
- Every corresponding CoreApp typed-event handler must call the host-ownership guard before payload validation or dependency work.
- Provider testing/model fetch must not become a plugin network or provider-cost bypass.
- Audit/usage queries must not expose another caller's telemetry.
- Local environment inspection must not expose host cwd, tool paths, config roots, or sensitive-key structure.
- Host renderer domain SDK remains complete; safe read-only capability discovery remains available to plugins.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Plugin reads/enumerates admin method | Missing/`undefined` |
| Plugin sends raw provider test/fetch event | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no provider/network work |
| Plugin sends raw stats/audit event | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no telemetry query |
| Plugin requests local environment | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no scan |
| Host sends malformed admin request | Continue to the existing payload-validation error |
| Plugin calls safe capability discovery | Preserve current result |

### 5. Good / Base / Bad Cases

- Good: a plugin checks `text.chat` availability and provider model options, then uses the governed text wrapper.
- Base: a host settings view tests a provider, fetches models, or renders aggregate usage.
- Bad: a plugin uses `fetchModels` against an arbitrary endpoint, runs paid capability smoke as `system`, enumerates audit logs, or scans local tool/config paths.

### 6. Tests Required

- Facade tests cover all eight methods through `in`, property reads, and own-key enumeration while retaining safe discovery.
- Raw handler tests cover provider, capability, stats, and environment registrars with verified plugin context and assert dependencies remain untouched.
- Host malformed-payload tests prove ownership checks do not remove existing validation.
- Existing safe discovery tests remain green.

### 7. Wrong vs Correct

#### Wrong

```ts
registerSafe(intelligenceApiEvents.fetchModels, async data => {
  return fetchProviderModels(data.provider);
});
```

#### Correct

```ts
registerSafe(intelligenceApiEvents.fetchModels, async (data, context) => {
  assertHostOwnedIntelligenceControlPlane(context);
  return fetchProviderModels(data.provider);
});
```

## Scenario: Alternate Plugin Intelligence Caller Attribution

### 1. Scope / Trigger

- Trigger: a plugin invokes provider-backed compatibility routes such as `chatLangChain` or `ttsSpeak` instead of generic `invoke` / `stream`.
- These routes remain plugin-callable under `intelligence.basic`, but they must enter quota/audit with verified transport identity.

### 2. Signatures

```ts
function bindPluginMetadataCaller<T>(
  payload: T,
  context: Pick<HandlerContext, "plugin">,
): T;
```

For a verified plugin, `metadata.caller` is always `plugin:<manifest plugin id>`.

### 3. Contracts

- Missing or spoofed payload `metadata.caller` must be overwritten before provider invocation.
- Provider/model selection, prompts, trace metadata, and TTS parameters must survive unchanged.
- Host payloads and caller metadata must remain unchanged and must not be copied unnecessarily.
- TTS cache identity must include caller so one caller cannot receive another caller's cached trace/result.
- Repeated normalized TTS input for the same caller may reuse cache without a provider call.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Plugin chat omits caller | Invoke as authenticated plugin caller |
| Plugin chat spoofs host/other plugin | Replace with authenticated plugin caller |
| Plugin TTS spoofs caller | Replace before TTS cache/provider access |
| Same TTS input, different callers | Distinct cache entries/provider responses |
| Same TTS input, same caller | Caller-local cache hit |
| Host supplies caller | Preserve exactly |

### 5. Good / Base / Bad Cases

- Good: a plugin uses `ttsSpeak` twice and reuses only its own cached audio.
- Base: host CoreBox invokes compatibility chat with `host:corebox` metadata unchanged.
- Bad: a plugin sets `caller: "system"` to escape plugin quota, or receives a trace cached for another plugin.

### 6. Tests Required

- Handler tests cover missing and spoofed callers for both compatibility paths.
- Host tests prove object/metadata semantics are preserved.
- TTS service test uses identical normalized input for two callers, then repeats the second caller; provider calls must be `2`, not `1` or `3`.
- Generic invoke/stream actor-boundary tests remain green.

### 7. Wrong vs Correct

#### Wrong

```ts
return intelligenceTtsService.speak(data);
```

#### Correct

```ts
return intelligenceTtsService.speak(bindPluginMetadataCaller(data, context));
```

## Scenario: Plugin Local Knowledge Namespace Isolation

### 1. Scope / Trigger

- Trigger: a plugin indexes a knowledge document/chunk or searches/builds local knowledge context.
- Local knowledge remains a plugin SDK capability, but caller-supplied `permissionScope` and globally keyed SQLite ids are not ownership proof.

### 2. Signatures

```ts
type PluginKnowledgeScope = `plugin:${string}`;

function bindPluginKnowledgeDocument(
  input: IndexDocumentInput,
  context: Pick<HandlerContext, "plugin">,
): IndexDocumentInput;
```

Document and chunk ids returned to plugins are opaque, deterministic, actor-namespaced identifiers.

### 3. Contracts

- Every plugin index/search/build request is scoped from verified transport identity, never payload `permissionScope`.
- Explicit and implicit document ids are deterministic within one plugin and distinct across plugins.
- Chunk `documentId` and optional chunk id are namespaced; a document id returned to the same plugin is stable when fed back into `knowledgeIndexChunk`.
- A plugin cannot overwrite a host or another plugin's document/chunk by guessing its SQLite id.
- Search and context build cannot omit scope or request `default` / another plugin's scope.
- Host requests preserve their exact payload object and existing explicit-scope semantics.
- Host-owned retrieval may intentionally aggregate plugin-public content; this boundary prevents plugin-to-plugin direct access and row collision.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Plugin omits/spoofs scope | Force `plugin:<verified id>` |
| Same plugin repeats explicit/implicit document id | Same opaque id |
| Different plugin uses same local id/content | Different opaque id |
| Plugin supplies another namespace's id | Remap into its own namespace |
| Plugin search supplies scope array/default | Replace with its single actor scope |
| Host supplies scope/id | Forward unchanged |

### 5. Good / Base / Bad Cases

- Good: a plugin indexes a note, uses the returned document id for an extra chunk, then searches without selecting a scope.
- Base: a host page explicitly searches `workspace:tuff`.
- Bad: a plugin queries with no scope to read all FTS rows, requests `plugin:other`, or overwrites `default` with a chosen id.

### 6. Tests Required

- Capture all four knowledge handlers and assert actor-derived scope plus field preservation.
- Prove explicit and implicit id determinism, cross-plugin divergence, and returned-document-id reuse.
- Prove search/build override omitted/string/array spoofed scopes.
- Prove host calls forward the same object identity.

### 7. Wrong vs Correct

#### Wrong

```ts
localKnowledgeEngine.search(data);
```

#### Correct

```ts
localKnowledgeEngine.search(bindPluginKnowledgeScope(data, context));
```

## Scenario: Autonomous Intelligence Caller Propagation

### 1. Scope / Trigger

- Trigger: a verified plugin runs a governed high-level Workflow or Agent capability after `intelligence.agents` succeeds; host code may separately use low-level session and persisted workflow control planes.
- Permission approval does not make payload `metadata.caller` trustworthy and does not unlock host-only Agent/workflow methods.

### 2. Contract

- Generic invoke/stream boundaries overwrite missing/spoofed caller with `plugin:<manifest plugin id>`; raw plugin low-level Agent and persisted workflow requests fail host-only before caller propagation, storage, or runtime access.
- Session runtime capability nodes preserve the caller supplied by governed high-level/internal execution while host-owning `sessionId` and `turnId`; absent host caller falls back to `intelligence.orchestrator`.
- Workflow runtime session metadata, stable model invoke options, host-owned context actor id, DeepAgent runtime config, adapter construction, and adapter state all retain the bound caller.
- Workflow step/input metadata cannot replace the bound caller.
- Non-identity metadata and provider/model/tool options survive.
- Host payload object and supplied caller remain unchanged.
- Existing `intelligence.agents` denial still happens before runtime/provider/tool work.

### 3. Validation Matrix

| Path | Plugin result | Host result |
| --- | --- | --- |
| `agentSessionStart(autoRunGraph)` | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no start/graph | Supplied metadata preserved |
| Runtime capability node | Governed high-level/internal caller retained | Internal fallback if caller absent |
| `workflowRun` | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no service/runtime | Payload identity preserved |
| Workflow model/context | Bound caller wins over step spoof | Host workflow fallback preserved |
| Workflow DeepAgent prompt/agent | Caller in config/adapter/state | Host metadata preserved |

### 4. Tests Required

- Channel tests cover raw plugin Agent/workflow denial, host session/workflow identity, high-level caller binding, and agents denial before runtime.
- Runtime graph tests cover governed high-level/internal caller and host fallback.
- Workflow orchestration tests cover runtime session, model/context, prompt/agent adapter paths, and spoof precedence.

### 5. Wrong vs Correct

#### Wrong

```ts
metadata: { caller: "intelligence.orchestrator", sessionId, turnId }
```

#### Correct

```ts
metadata: { ...requestMetadata, caller: resolvedCaller, sessionId, turnId }
```

## Scenario: Direct Workflow DeepAgent Governance

### 1. Scope / Trigger

- Trigger: a host-owned persisted/direct workflow executes prompt or agent steps with a canonical non-host caller and calls the DeepAgent adapter outside the generic Intelligence SDK wrapper.
- Stable model steps already use governed SDK invoke; prompt/agent steps require defense-in-depth provider governance even though the persisted registry is not plugin-callable.

### 2. Contract

- Persisted/direct workflow executor context uses `providerGovernance: "self"`; generic `workflow.execute` uses `"outer"`.
- Self-governance applies only to canonical bound non-host callers carried by host orchestration.
- Check caller quota before runtime-config resolution, adapter construction, or provider work.
- Quota denial blocks all downstream work and returns the existing canonical quota failure path.
- Each successful self-governed DeepAgent call records caller, capability, provider/model, normalized usage, latency, and safe source/session metadata.
- Failure records zero usage plus canonical code/message/reason/recovery, then rethrows so workflow step status remains failed.
- Audit metadata must not contain prompt text, adapter messages, credentials, or tool payloads.
- Outer-governed generic Agent/Workflow calls must not perform duplicate inner quota checks or audits.
- Outer-owned stable model steps carry an in-memory, identity-bound marker into SDK invoke; the SDK skips only its inner quota check and success/failure audit while preserving provider selection, execution, fallback, cache, result, and caller metadata.
- Context request/options cloning must explicitly inherit that marker. Serialized fields and caller-controlled metadata cannot forge it.
- Host direct workflows retain existing behavior.

### 3. Validation Matrix

| Condition | Required result |
| --- | --- |
| Self + plugin + quota allowed | Provider runs; one safe audit |
| Self + plugin + quota denied | No config/adapter/provider work |
| Self + plugin + provider failure | Canonical failure audit; step fails |
| Outer generic Agent/Workflow | No inner quota/audit duplication |
| Outer generic stable model step | One outer charge/audit; provider/fallback behavior unchanged |
| Spoofed outer-governance metadata | Ordinary SDK quota/audit still applies |
| Direct stable model step | Existing governed SDK invoke |
| Host direct workflow | Existing host semantics |

### 4. Tests Required

- Workflow service tests prove fresh/resumed direct runs pass `self`.
- Orchestration tests prove quota ordering, success audit, failure audit, no prompt leakage, denied short-circuit, and outer no-duplication.
- Marker tests prove identity-only, non-serializable ownership, explicit clone inheritance, outer stable invoke/context marking, unmarked direct paths, and unchanged fallback.
- Focused diagnostics and orchestration/workflow lint pass.

### 5. Wrong vs Correct

#### Wrong

```ts
const raw = await adapter.run(state); // direct provider call for a bound non-host caller, no quota/audit
```

#### Correct

```ts
await checkQuota(caller);
const raw = await adapter.run(state);
await recordRuntimeAudit(toSafeAudit(raw));
```

## Scenario: Plugin Context Observability Ownership

### Scope

- Trigger: a plugin reads ContextHygiene checkpoints or ContextPackage build logs through typed SDK methods or raw events.
- `metadata-only` describes content minimization, not ownership. Checkpoint summary/reason/metadata and package trace/source/item metadata remain actor-sensitive.

### Contract

- Hide `contextListCheckpoints` and `contextListPackageLogs` from the plugin facade across property reads, membership, enumeration, and TypeScript surface.
- Reject raw plugin query events with `INTELLIGENCE_HOST_ONLY_CAPABILITY` before ContextHygieneService or SQLite access. A guessed/returned session ID is not an authorization token.
- Preserve full query behavior for CoreApp renderer host callers.
- Keep `contextInvoke`, `contextStream`, and pure `contextEvaluateMemory` plugin-callable; they return host-curated summaries/policy decisions rather than arbitrary stored rows.
- Reintroducing plugin observability requires a durable verified owner/namespace on sessions and logs plus cross-plugin tests; redaction alone is insufficient.

### Validation

- Facade tests prove both query methods are absent while safe context methods remain.
- Handler tests prove plugin checkpoint and unfiltered package-log requests fail before service calls.
- Host tests preserve payload object identity and exact service results for both queries.

### Wrong vs Correct

#### Wrong

```ts
return contextHygieneService.listPackageLogs(payload); // payload may omit sessionId
```

#### Correct

```ts
assertHostOwnedIntelligenceControlPlane(context);
return contextHygieneService.listPackageLogs(payload);
```

## Scenario: Plugin Selected-Text Capture Boundary

### 1. Scope / Trigger

- Trigger: a plugin reads the active application's selected text for an AI command, transform, translation, or contextual action.
- The boundary spans plugin System SDK, typed App/System transport, permission middleware, platform capability detection, accessibility lookup, copy fallback, and clipboard restoration.

### 2. Contracts

- `system.captureSelection()` / `captureSelectedText()` is the only plugin entry point; do not add a raw selection channel or plugin-side `navigator.clipboard` fallback.
- Require verified plugin identity and granted `clipboard.read` before accessibility, keyboard shortcut, or clipboard work. Missing permission runtime, denial, identity failure, and SDK mismatch fail closed before the service.
- OmniPanel and plugins reuse one host-owned selection capture service. macOS tries AXSelectedText first; copy fallback follows the current platform capability adapter.
- Snapshot and restore every readable clipboard format on fallback success, empty selection, timeout, and failure. Restore failure is a failed capture and must not return selected text as success.
- Return typed `supportLevel`, `issueCode`, `issueMessage`, `limitations`, and `capturedAt`; empty/disabled/failed/unsupported are explicit non-success states.
- Never write selected text to ordinary logs, audit metadata, persistent history, sync payloads, or permission diagnostics.

### 3. Tests Required

- Service tests prove macOS direct preference, copy fallback, multi-format restore, empty/error restore, unsupported state, and fail-closed restore failure.
- Handler tests prove unverified, unavailable, denied, and SDK-mismatched plugin calls perform zero service work; a verified permitted call preserves result identity.
- SDK tests prove the typed event is used and malformed host envelopes reject without fabricating text.
- OmniPanel regression proves it delegates to the shared service and preserves existing context metadata.

### 4. Wrong vs Correct

#### Wrong

```ts
const text = await navigator.clipboard.readText()
await intelligence.text.chat({ messages: [{ role: 'user', content: text }] })
```

#### Correct

```ts
const selection = await system.captureSelection()
if (!selection.text) return
await intelligence.text.chat({
  messages: [{ role: 'user', content: selection.text }]
})
```
