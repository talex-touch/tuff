# Business Capability Map - Plugin Prelude Isolation #297

## Scope And Current State

This note inventories the current workspace implementation for the first business capability families requested by #297. It covers the 27 fixed IDs from `plugin-host-wire.ts` between `plugin.info.get` and `channel.unsubscribe`.

Current construction is still empty:

- `PluginModule.onInit()` creates `PluginRuntimeService` with `capabilityDefinitions: Object.freeze([])` at `apps/core-app/src/main/modules/plugin/plugin-module.ts:1522-1543`.
- `PluginRuntimeService` snapshots the definitions once, advertises exactly those IDs to the child, and creates an activation-bound `PluginHostCapabilityRegistry` at `apps/core-app/src/main/modules/plugin/host/plugin-runtime-service.ts:700-721`.
- The registry already enforces current activation, per-definition permission, deadline, per-ID/global concurrency, request/result validation, cancellation and stable errors at `plugin-host-capabilities.ts:314-510`.
- The current dirty workspace also contains an uncommitted owner-bound resource registry in `plugin-host-resources.ts`. It supports `subscription|stream|disposer|process`, but `PluginRuntimeService` does not yet construct/pass it to `PluginHostCapabilityRegistry`. Therefore resource-returning definitions such as `channel.subscribe` are not implementable end-to-end in the current wiring.

## Mandatory Construction Fixes

### 1. Authorize canonical permission IDs through PermissionStore

`PluginHostCapabilityDefinition.permission` is a canonical permission ID such as `storage.plugin`. The current constructor callback is unsafe for this contract:

```ts
getPermissionModule()?.checkPermission(pluginName, permissionId).allowed ?? false
```

`checkPermission()` expects an API name and asks `PermissionGuard.getRequiredPermissions()` for a mapping. Passing `storage.plugin`, `clipboard.read`, or `network.internet` finds no API mapping, returns an empty required-permission list, and allows the call. Use the canonical store check instead, with the authoritative plugin's host-resolved sdkapi:

```ts
permissionModule.getStore().hasPermission(pluginName, permissionId, plugin.sdkapi)
```

Relevant source: `permission-guard.ts:153-207,276-290`, `permission-store.ts:589-647`, and `plugin-module.ts:1527-1528`.

`storage.plugin` and `window.create` are currently in `DEFAULT_PERMISSIONS` (`packages/utils/permission/registry.ts:376-379`), and the default check precedes manifest declaration enforcement. Nine of the ten official Preludes using `plugin.storage.*` do not declare `storage.plugin`; this is compatible with the current product contract, but not with a future explicit-declaration-only policy.

### 2. Resolve plugins only from the issued context

Every adapter must require `isAuthoritativePluginContext(context)`, use `context.identity.pluginName`, and compare instance/generation against `TouchPlugin.getActivationIdentity()`. Do not accept `pluginName`, sdkapi, key, generation, or `verified` in capability DTOs. Reuse the resolver semantics already implemented for SQLite and Secret in `plugin-storage-transport-service.ts:131-169`; extract it rather than duplicate it.

### 3. Close exact activation resources

`PluginSqliteResourceOwnerRegistry` already owns SQLite clients by `pluginName + pluginInstanceId + activationGeneration` and exposes `closeActivation()` (`plugin-sqlite-resource-owner.ts:208-280`). Runtime teardown currently calls `closePlugin(activation.name)` (`plugin-module.ts:1540-1542`), which can close a newer generation if an old cleanup races with replacement. Activation teardown must call `closeActivation()`; permission revoke/revokeAll and uninstall may intentionally keep using `closePlugin()`.

The same exact-activation owner is needed for dynamic features, pushed items, channel subscriptions and callbacks. Crash cleanup must clear these even when `TouchPlugin.disable()` is not reached. Current `TouchPlugin.disable()` clears items, but runtime crash cleanup only closes SQLite.

### 4. Build definitions through one business adapter factory

Recommended main-owned boundary:

```ts
const business = createPluginBusinessCapabilities({
  resolvePluginFromContext,
  permissionStore,
  pluginManager: () => this.pluginManager,
  sqliteOwners: this.pluginSqliteResources,
  secureStoreRoot: () => this.secureStoreRootPath,
  clipboard: clipboardHostService,
  network: getNetworkService,
  transport: ioRuntime.transport,
})

new PluginRuntimeService({
  capabilityDefinitions: business.definitions,
  authorizeCapability: business.authorize,
  watchPermissionRevoked: existingPermissionRevokedWatcher,
  closeResources: activation => business.closeActivation(activation),
  // existing options...
})
```

The factory should live in a new host-owned file such as `apps/core-app/src/main/modules/plugin/host/plugin-business-capabilities.ts`. Validators should be pure and colocated or split into `plugin-business-capability-dto.ts`. Transport registration functions should call shared business services; capability adapters must not invoke arbitrary raw transport names to reuse handlers.

## DTO Conventions

- Requests never contain plugin identity.
- Validators accept exact plain-object keys only; all strings, arrays and nested DTOs have local bounds below the global 1 MiB/depth-32/member-10,000 codec limits.
- Successful mutations return `{ ok: true }` or a typed result; business failures throw stable codes. Do not carry native error messages in normal results.
- `FeatureDto` and `TuffItemDto` are explicit JSON-like projections, not class instances. Reject functions, accessors and unknown fields before constructing `PluginFeature`/updating `BoxItemManager`.
- `ResourceHandle<K>` means the codec-owned opaque resource marker, never a raw string ID.
- Concurrency below is the per-definition `maxConcurrency`. `fast/io/user/stream` is the intended scheduler class; the current definition type only stores the numeric limit, so class-level admission still needs a small shared scheduler if #297 wants aggregate IO/process lanes.

## Fixed Capability Matrix

| Capability | Request DTO -> result DTO | Permission | Deadline / class / max | Current source of truth and adapter note |
| --- | --- | --- | --- | --- |
| `plugin.info.get` | `null -> PluginRuntimeInfoDto` | none | 5s / fast / 8 | Resolve current `TouchPlugin`; add a redacted serializer based on `toJSONObject()` (`plugin.ts:570-657`). Do not return `pluginPath`, data paths, dev address, issue stack/meta or keys. Manifest/platform are already in the frozen load snapshot (`plugin.ts:1265-1274`). |
| `feature.registry.add` | `{ feature: FeatureDto } -> { added: boolean }` | none | 10s / io / 1 | `TouchPlugin.addFeature()` + `PluginFeature` (`plugin.ts:679-720`, `plugin-feature.ts:29-108`). Await host icon initialization and track features added by this activation for rollback/teardown. No reusable strict dynamic-feature validator exists today. |
| `feature.registry.remove` | `{ featureId: string } -> { removed: boolean }` | none | 5s / fast / 1 | `TouchPlugin.delFeature()` (`plugin.ts:722-728`). Only remove activation-owned dynamic IDs; manifest/static and another generation's features are not removable. |
| `feature.registry.list` | `null -> { features: FeatureDto[] }` | none | 5s / fast / 8 | `TouchPlugin.getFeatures()` plus `PluginFeature.toJSONObject()` (`plugin.ts:730-735`, `plugin-feature.ts:85-107`). Return copies, never live feature objects. |
| `feature.items.push` | `{ scope: 'active-feature'\|'root-results', items: TuffItemDto[] } -> { ok: true }` | `search.root-results` | 30s / io / 1 | Extract `processItemIcon`, source enrichment, active-state and provider policy from `TouchPlugin.getFeatureUtil()` (`plugin.ts:2214-2301`). Final mutation remains `BoxItemManager.batchUpsert()` (`box-item-manager.ts:189-237`). Bound item count per call. |
| `feature.items.update` | `{ scope, id, patch } -> { updated: boolean }` | `search.root-results` | 30s / io / 1 | Extract `updateBoxItem()` (`plugin.ts:2303-2326`), preserving source enrichment/provider checks. Ensure the existing item belongs to this activation/plugin before mutation. |
| `feature.items.remove` | `{ id: string } -> { removed: boolean }` | none | 5s / fast / 1 | `BoxItemManager.delete()` (`box-item-manager.ts:172-180`), but first enforce `get(id)` belongs to the authoritative plugin. Current SDK can delete a globally known foreign ID and must not be reused unchanged. No permission keeps cleanup possible after revoke. |
| `feature.items.clear` | `null -> { removed: number }` | none | 5s / fast / 1 | `BoxItemManager.getBySource()/clear(pluginName)` (`box-item-manager.ts:292-329`). Host teardown calls the same owner-scoped cleanup. |
| `feature.items.list` | `null -> { items: TuffItemDto[] }` | none | 5s / fast / 8 | `BoxItemManager.getBySource(pluginName)` (`box-item-manager.ts:292-294`). Return bounded copies only. |
| `storage.file.read` | `{ name: string } -> { found: boolean, value?: JsonDto }` | `storage.plugin` | 30s / io / 8 | Current source is `TouchPlugin.getPluginFile()` (`plugin.ts:2701-2718`) and transport registration at `plugin-storage-transport-service.ts:256-271`. Extract an async host service; preserve safe-root resolution but replace ambiguous missing `{}` at the wire boundary. |
| `storage.file.write` | `{ name: string, value: JsonDto } -> { ok: true }` | `storage.plugin` | 30s / io / 1 | `TouchPlugin.savePluginFile()` (`plugin.ts:2726-2758`). Convert sync filesystem work to bounded async IO, keep atomic/size semantics, and emit `PLUGIN_STORAGE_UPDATED` only after success. No `pluginName` in request. |
| `storage.file.remove` | `{ name: string } -> { removed: boolean }` | `storage.plugin` | 30s / io / 1 | `TouchPlugin.deletePluginFile()` (`plugin.ts:2765-2786`). Same async safe-root service and stable missing result. |
| `storage.file.list` | `null -> { names: string[] }` | `storage.plugin` | 30s / io / 8 | `TouchPlugin.listPluginFiles()` (`plugin.ts:2792-2797`). Decide the contract for extensionless files before migration: current writer accepts them while list returns only `.json`. |
| `storage.sqlite.execute` | `{ op: 'query'\|'execute', sql: string, params?: SqlValueDto[] } -> { op:'query', rows, columns } \| { op:'execute', rowsAffected, lastInsertRowId }` | `storage.sqlite` | 30s / io / 8 | Extract the orchestration in `plugin-storage-transport-service.ts:188-233,672-700`; reuse `validatePluginSql`, `validatePluginSqlParams`, `normalizePluginSqlForExecution`, then the activation-owned resource client's `query/execute`. Inner worker deadlines remain 2s query/5s write. The `op` discriminant is required because the fixed wire list has no `storage.sqlite.query`. |
| `storage.sqlite.batch` | `{ statements: { sql, params? }[] } -> { results: { rowsAffected, lastInsertRowId }[] }` | `storage.sqlite` | 30s / io / 8 | Extract `plugin-storage-transport-service.ts:703-723`; reuse `validatePluginTransactionStatements()` and `PluginSqliteResourceOwnerRegistry.acquire()`. Existing limits are 64 statements, queue 8, global active 4, 16 workers (`plugin-sql-policy.ts:4-7`, `plugin-sqlite-worker-protocol.ts:8-12`). |
| `secret.get` | `{ key: string } -> { found: boolean, value?: string }` | `storage.plugin` | 30s / io / 8 | Extract `normalizePluginSecretKey()` and Secret lane from `plugin-storage-transport-service.ts:110-129,201-205,313-337`; retain host-only `getSecureStoreValueStrict()` (`secure-store.ts:493-500`). Key regex stays 1-48 `[a-z0-9._-]`; prefix derives from authority. |
| `secret.set` | `{ key: string, value: string } -> { ok: true }` | `storage.plugin` | 30s / io / 4 | Reuse `setSecureStoreValue()` and its per-root serialized atomic mutation (`secure-store.ts:502-531`). Do not preserve nullable-set-as-delete on the capability wire because `secret.delete` is explicit. Never log key/value. |
| `secret.delete` | `{ key: string } -> { ok: true }` | `storage.plugin` | 30s / io / 4 | Same extracted Secret service and `setSecureStoreValue(..., null)` (`plugin-storage-transport-service.ts:388-421`). Revocation retains values; uninstall alone uses `deleteSecureStoreValuesByPrefix()` (`secure-store.ts:533-546`). |
| `clipboard.read` | `{ op:'text'\|'snapshot'\|'image'\|'files'\|'has', preview?:boolean, format?:string } -> discriminated read result` | `clipboard.read` | 5s / fast / 4 | Business behavior is split between private methods in `ClipboardModule` (`clipboard.ts:649-675`) and `ClipboardTransportHandlersRegistry` (`clipboard-transport-handlers.ts:136-191,249-281`). Extract a public `ClipboardHostService`; do not call Electron clipboard directly from the adapter. |
| `clipboard.write` | `{ op:'write', content:{ text?,html?,image?,files? } } \| { op:'clear' } -> { ok:true }` | `clipboard.write` | 5s / fast / 2 | Reuse `ClipboardModule.write()/writePayload()` after extraction (`clipboard.ts:1188-1231`) and current typed `ClipboardWriteRequest` (`events/types/clipboard.ts:177-184`). Host permission is mandatory even when the plugin previously called `permission.check()`. |
| `clipboard.copy-and-paste` | `{ text?, html?, image?, files?, delayMs?, hideCoreBox? } -> ClipboardActionResult` | `clipboard.write` | 30s / io / 1 | Reuse `ClipboardAutopasteAutomation` through the current handler seam (`clipboard.ts:1181-1186`, `clipboard-transport-handlers.ts:237-245`). Pass authoritative actor context explicitly and clamp delay/payload sizes. `touch-dictation` currently uses write/copy-paste but does not declare `clipboard.write`. |
| `dialog.open` | `{ kind:'file'\|'directory', title?, defaultPath?, buttonLabel?, filters?, multiple? } -> { canceled:boolean, filePaths:string[] }` | `fs.read` | 120s / user / 1 | Extract a validated dialog service from `createSafePluginDialogApi()` (`plugin.ts:156-165`) or the better focused-window path in `common.ts:928-953`. Restrict properties to the DTO enum. Electron native dialogs do not accept `AbortSignal`; the 120s deadline can kill the activation but cannot reliably dismiss the native dialog, so deterministic cancellation remains a blocker. |
| `open-url` | `{ url:string } -> { opened:true, protocol:string }` | none | 5s / fast / 4 | Reuse `openValidatedExternalUrl()` + injected `shell.openExternal` (`external-url-policy.ts:11-45`), not the duplicate helper in `plugin.ts:181-201`. Only `http:`, `https:`, `mailto:`, `tel:` and `tuff:` are currently allowed. Treat this as a narrow user-visible opener, not `system.shell`. |
| `http.request` | `{ method, url, headers?, query?, body?, responseType:'json'\|'text'\|'bytes', timeoutMs? } -> { status,statusText,headers,data,url,ok }` | `network.internet` | 30s / io / 8 | Reuse `getNetworkService().request()` (`network-service.ts:517-537`) and pass the registry signal. Do not expose retry/cooldown/proxy override or `stream`. Enforce `http/https`, response/body/header bounds, and a private/loopback/link-local policy; local network needs a distinct `network.local` capability because one definition has one static permission. |
| `channel.invoke` | `{ operation: PluginChannelOperationId, payload: Dto } -> { operation, data: Dto }` | none, only for explicitly unprivileged operations | 5s / fast / 8 | Resolve `operation` through a frozen adapter registry to a concrete `TuffEvent` and request/result validators, then use shared handler/service logic. Never use `defineRawEvent(request.eventName)` or expose generic `transport.invoke()`. Privileged domains already have dedicated capabilities. |
| `channel.subscribe` | `{ topic: PluginChannelTopicId, callback: CallbackHandle } -> ResourceHandle<'subscription'>` | none, plugin-private topics only | 5s setup / stream / 8 | Register only allowlisted, plugin-namespaced topics and return an owner resource whose disposer unregisters the exact callback. Use `callbackLifetime:'resource'`. Current `PluginHostResourceRegistry` design is suitable, but runtime-service wiring is absent and the default resource context throws `PLUGIN_HOST_RESOURCE_CLOSED`. |
| `channel.unsubscribe` | `{ subscription: ResourceHandle<'subscription'> } -> { ok:true }` | none | 5s / fast / 8 | Dispose through the same owner registry; never accept event name + callback ID. The current capability invoke context exposes `register()` but not `dispose()`, while `resource-dispose` protocol already exists. Prefer making the child SDK call resource disposal directly; otherwise inject an owner dispatcher into this adapter. Do not build a second subscription map. |

## Dialog And Channel Gaps

### Dialog ID coverage

Official Preludes use both `showOpenDialog` and `showMessageBox`:

- open + message: `touch-batch-rename`, `touch-workspace-scripts`;
- message only: `touch-quick-actions`, `touch-system-actions`.

The fixed list has only `dialog.open`. Overloading it with a message-box union is undesirable: `dialog.open` needs `fs.read`, while message boxes should not require filesystem permission. Add a separate fixed `dialog.message` capability before official migration, or migrate confirmations to a domain capability that owns the dangerous action and confirmation. No official Prelude was found using `showSaveDialog`.

### Generic channel must not expose host transport

Only two official raw invoke usages were found:

- `touch-intelligence`: `auth:session:get-state`;
- `touch-snippets`: `account:auth:get-token`.

The first can become a small sanitized auth-state operation. The second must not be admitted to `channel.invoke`: it exports a host account token into the plugin child. Replace the snippets flow with a host-owned authenticated cloud operation or an HTTP credential handle so the token never crosses into Prelude. Generic subscriptions were not found in official Prelude output; intelligence/voice streams belong to their dedicated fixed capability families.

## Reuse Classification

### Directly reusable

- Authority issuance/verification: `plugin-host-capabilities.ts` and `packages/utils/transport/security/plugin-identity.ts`.
- Canonical permission decision: `PermissionStore.hasPermission()`.
- Permission revoke event/watcher: `PermissionModule.publishRevocation()` (`permission/index.ts:259-277`) and the existing `PluginModule` watcher.
- SQLite SQL policy, worker client and activation owner: `plugin-sql-policy.ts`, `plugin-sqlite-worker-client.ts`, `plugin-sqlite-resource-owner.ts`.
- Secure store crypto/atomic mutation: `main/utils/secure-store.ts`.
- URL validation: `main/utils/external-url-policy.ts`.
- HTTP execution: `NetworkService.request()`.
- Final item store operations: `BoxItemManager`, after owner/policy validation.

### Extract before reuse

- `PluginStorageHostService`: authoritative plugin resolver, file storage, SQLite orchestration, Secret key normalization/error mapping. Both transport handlers and capabilities call it.
- `PluginFeatureHostService`: dynamic feature validation/ownership, icon processing, item source enrichment/provider policy and activation cleanup.
- `ClipboardHostService`: current private ClipboardModule operations and autopaste context.
- `PluginDialogHostService`: exact option validation, focused parent window and stable results.
- `PluginChannelOperationRegistry`: fixed operation/topic IDs with individual DTO validators and optional domain permissions.

### Do not reuse as capability dispatch

- `TouchPlugin.getFeatureUtil()` objects: they close over mutable plugin/main objects and include raw channel construction.
- `transport.invoke(defineRawEvent(childString), ...)`: this recreates arbitrary host dispatch.
- `createSafePluginClipboardApi()` and `createSafePluginDialogApi()` directly: they expose broad Electron APIs and currently rely on plugin-side permission checks.
- Payload plugin-name fallback in file storage handlers.
- `TouchPlugin.toJSONObject()` unchanged for `plugin.info.get`: it can include paths, dev data and issue metadata not needed by child runtime.

## Recommended Close Barrier

For one activation, the business close hook should be idempotent and ordered after authority invalidation by `PluginRuntimeHost`:

```text
abort capability calls and permission watchers
-> dispose callback/subscription/resource registry
-> remove activation-owned dynamic features
-> clear activation-owned BoxItem state
-> closeActivation(SQLite owner identity)
-> await remaining business disposers
```

Permission revoke behavior remains narrower:

- `storage.sqlite`/revokeAll: close matching plugin SQLite resources before emitting the event;
- other permissions: registry aborts matching in-flight calls and owner services dispose retained resources that depend on that permission;
- `storage.plugin` revoke retains file data and Secret values;
- uninstall waits for activation close, then purges `plugin.<name>.` Secret prefix and data.

## Implementation Order Suggested By The Map

1. Fix canonical permission authorization and exact-activation `closeResources`.
2. Add strict DTO validators plus `plugin.info`, feature registry/items and file storage services.
3. Extract SQLite/Secret orchestration without changing #299 policy/worker ownership.
4. Extract Clipboard service and enforce host-side read/write permission on every call.
5. Add dialog service and the missing `dialog.message` fixed ID.
6. Add HTTP URL/network policy and cancellation.
7. Wire owner resource registry, then implement channel subscribe/dispose.
8. Keep `channel.invoke` on a minimal operation registry; migrate raw auth-token use to a host-owned authenticated operation.
