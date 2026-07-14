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

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Plugin reads a host-only quota method from facade | `undefined`; method is not discoverable or enumerable |
| Plugin sends a quota control-plane typed event | `INTELLIGENCE_HOST_ONLY_CAPABILITY` before handler work |
| Plugin omits `metadata.caller` | Runtime receives `plugin:<plugin id>` |
| Plugin supplies another caller id | Host overwrites it with `plugin:<plugin id>` |
| Host sends a quota event | Continue to normal payload validation and quota manager |
| Host invokes with an explicit caller | Preserve the host caller |

### 5. Good / Base / Bad Cases

- Good: `third-party-plugin` invokes `text.chat`; runtime quota metadata uses `plugin:third-party-plugin` regardless of payload.
- Base: a host settings view reads or updates a quota through the full domain SDK and reaches normal validation/storage.
- Bad: a plugin sends `setQuota({ callerId: "__default_plugin__" })`, enumerates all quotas, or omits caller metadata to bypass quota checks.

### 6. Tests Required

- Facade surface: all six control-plane methods fail membership, property-read, and enumeration checks while safe capability methods remain.
- Raw transport: every quota handler rejects a verified plugin context with `INTELLIGENCE_HOST_ONLY_CAPABILITY`; assert storage is untouched.
- Actor binding: invoke and stream override missing/spoofed plugin callers and preserve unrelated options; host callers remain unchanged.
- Regression: text/chat capability execution with `intelligence.basic` remains available and still passes through internal quota enforcement.

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

- Trigger: a plugin requests Agent or workflow execution through a generic capability, session auto-run, or workflow-run API.
- `intelligence.basic` covers ordinary governed model calls. Any path that can plan and execute tools requires the existing high-risk `intelligence.agents` grant.

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
- Apply the same gate before creating an auto-running session and before direct `workflowRun()` execution.
- Register direct workflow run with `intelligence.agents`, not `intelligence.basic`.
- Inert session creation remains available under basic permission. Host context remains allowed.
- Permission runtime absence must fail closed for plugin autonomous requests.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Basic-only plugin invokes/streams autonomous capability | `INTELLIGENCE_AGENTS_PERMISSION_DENIED`; runtime untouched |
| Permission runtime unavailable | `INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE`; runtime untouched |
| Basic-only plugin starts inert session | Session creation remains available |
| Plugin starts `autoRunGraph` session | Require `intelligence.agents` before session creation |
| Plugin calls direct workflow run | Require `intelligence.agents` before wait/runtime |
| Host performs the same operations | Preserve host behavior |

### 5. Good / Base / Bad Cases

- Good: a plugin declares and receives `intelligence.agents`, then runs an approved Agent workflow.
- Base: a chat plugin with only `intelligence.basic` calls `text.chat` or creates a non-running session.
- Bad: a basic-only plugin routes around tool permissions through generic `invoke("agent.run")`, `workflow.execute`, `autoRunGraph`, or `workflowRun()`.

### 6. Tests Required

- Generic invoke/stream tests must prove both autonomous capability ids fail before the Intelligence SDK and that `text.chat` still runs.
- Session tests must distinguish inert creation from `autoRunGraph` and assert no orphan session is created on permission failure.
- Workflow tests must assert registration permission id plus defense-in-depth handler rejection before runtime.
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
