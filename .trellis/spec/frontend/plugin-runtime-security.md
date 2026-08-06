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
  | {
      type: 'setBounds'
      bounds: { x?: number; y?: number; width: number; height: number }
    }
  | { type: 'setAlwaysOnTop'; value: boolean }
```

Privileged plugin handlers use the protected transport registration contract:

```ts
createProtectedRegister(transport)(
  event,
  {
    permissionId: 'window.create',
    failClosedForPlugin: true,
    requireVerifiedPlugin: true,
    unavailableCode: 'PLUGIN_WINDOW_PERMISSION_UNAVAILABLE',
    deniedCode: 'PLUGIN_WINDOW_PERMISSION_DENIED',
    sdkMismatchCode: 'SDKAPI_MISMATCH',
  },
  handler,
)
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
  const win = new BrowserWindow(options)
  await win.loadURL(url)
})

const target = browserWindow[propertyName]
target(...args)
```

#### Correct

```ts
registerProtectedWindowChannel(PluginEvents.window.new, protectedWindowOptions, async (payload, context) => {
  const request = normalizePluginWindowRequest(payload)
  const target = await resolveLocalPluginWindowTarget(plugin.pluginPath, request.file)
  const preferences = buildPluginViewWebPreferences(profile, hostOptions)
  const navigation = await createPluginViewNavigationPolicy(policyOptions)
  const win = new TouchWindow(buildPublicPluginWindowOptions(request.options ?? {}, preferences))
  installPluginViewNavigationPolicy(win.window.webContents, navigation)
  await win.loadFile(target)
  return { id: win.window.webContents.id }
})
```

## Scenario: Authoritative Transport Caller Identity

### 1. Scope / Trigger

- Trigger: a plugin request reaches raw IPC, `ipcMain.handle`, local main-process
  invoke, a plugin-scoped MessagePort, or the isolated plugin-host protocol.
- The boundary spans plugin activation, every host-owned plugin WebContents,
  transport context construction, port ownership, privileged middleware, and test
  fixtures.

### 2. Contracts

- A plugin name is actor scope, not authentication. A non-empty `uniqueKey`,
  payload plugin name, port scope, child-process plugin name, or caller-authored
  `verified: true` must never authorize a privileged operation.
- The activation registry owns `{ name, pluginInstanceId,
activationGeneration, key }`. A plugin instance id is stable for one runtime
  object; generation increments on each successful enable; disable revokes and
  clears the current key.
- Register every host-created plugin WebContents before its first load/IPC. The
  registration snapshots the current activation and returns a token; destroyed or
  failed-load cleanup removes only the matching token, never a replacement entry.
- Registered senders always route through the PLUGIN lane. Sender id, registration,
  current activation, plugin name, instance, generation, and any supplied key must
  agree before the channel supplies an identity candidate. A stale or mismatched
  registration remains an unverified plugin caller; it never falls back to MAIN.
- `TuffMainTransport` issues a runtime-branded `PluginCallerIdentity`. Privileged
  code calls `isAuthoritativePluginContext()`; it does not inspect a boolean.
  Structurally copied or caller-authored identity objects fail the runtime brand.
- `ipcMain.handle` resolves the real `event.sender` through the same registry.
  Production local invoke ignores caller verification fields and resolves the
  current activation from `PluginKeyManager` before issuing `local-host` authority.
- A plugin-scoped port can be upgraded and confirmed only by an authoritative
  sender. Its record binds sender, plugin instance, and generation; stream context
  derives `message-port` authority with the concrete port id. Revocation or
  re-enable makes an old record unusable even before physical close.
- Plugin-host SDK calls use a cryptographically random main-issued handle plus the
  current host generation. The child cannot select a main SDK context by declaring
  a plugin name. Reload, host restart, exit, or stop invalidates stale handles.
- Unit tests that need positive privileged identity use
  `createTrustedTestPluginContext()` explicitly. The factory throws outside test
  runtime. Actor-only tests that do not exercise verification may use an
  unverified structural plugin scope.
- Activation keys, host handles, and branded proof never enter logs, audit,
  persistence, renderer replies, or plugin-visible payloads.

### 3. Validation Matrix

| Condition                                          | Required result                           |
| -------------------------------------------------- | ----------------------------------------- |
| Non-empty, stolen, or forged payload key           | No authoritative identity                 |
| Registered current sender, matching activation     | `web-contents` authority                  |
| Registered sender with mismatched/stale generation | PLUGIN lane, unverified                   |
| Unregistered sender presenting a valid plugin key  | PLUGIN lane, unverified                   |
| Destroyed registered sender                        | PLUGIN lane, unverified                   |
| Valid current local lookup                         | `local-host` authority                    |
| Caller passes `verified: true` or copied identity  | Unverified                                |
| Current plugin port confirmed                      | `message-port` authority bound to port id |
| Port reused after revoke/re-enable                 | Reject/fallback; no plugin port delivery  |
| Unknown or stale plugin-host handle/generation     | SDK result error; no context lookup       |
| Trusted-test factory outside test runtime          | Throw before identity issuance            |

### 4. Tests Required

- Channel resolver table tests cover omitted/mismatched/stolen keys, unknown and
  destroyed senders, stale generation, and unregistered valid-key holders.
- Registry tests cover activation snapshots and tokenized replacement cleanup.
- Main transport tests cover raw channel, `ipcMain.handle`, current/stale local
  lookup, runtime branding, explicit test issuance, port upgrade/confirm, and
  message-port stream provenance.
- Plugin lifecycle tests prove stable instance id, generation increment, key
  rotation, and revoke-on-disable.
- Plugin-window boundary tests prove CoreBox, DivisionBox, and public plugin windows
  register and unregister their WebContents before plugin execution.
- Privileged permission, localization, native capability, selection capture, and
  plugin window tests reject structural verification and accept branded contexts.
- Plugin-host tests cover current, unknown, stale-generation, reload, and
  cross-plugin handle behavior.

### 5. Wrong vs Correct

#### Wrong

```ts
const plugin = data.plugin ? { name: data.plugin, uniqueKey: data.header.uniqueKey, verified: true } : undefined
if (plugin?.verified) allowPrivilegedOperation()
```

#### Correct

```ts
const plugin = resolveHandlerPluginContext(realSender, currentActivation)
if (!isAuthoritativePluginContext(plugin)) denyPrivilegedOperation()
```

## Scenario: Isolated Plugin Prelude Runtime

### 1. Scope / Trigger

- Trigger: an official or third-party plugin Prelude executes in the plugin-host child
  VM and accesses host-owned work through declared capability facades.
- This boundary spans manifest permissions, capability projection, child realm
  construction, wire DTO normalization, business-resource ownership, canonical build
  resolution, rollout policy, and real Electron process smoke.

### 2. Signatures

```ts
type HostHeartbeat = HostMessageBase & { type: 'heartbeat' }
type HostHeartbeatResult = HostMessageBase & { type: 'heartbeat-result' }

const heartbeatIntervalMs = 2_000
const heartbeatTimeoutMs = 5_000
const restartBudget = { maxCrashes: 3, windowMs: 30_000 } as const
```

`HostMessageBase` includes the V2 protocol version, main-issued activation handle,
host generation, and request id.

### 3. Contracts

- The child global is a closed projection. Expose only immutable snapshots, standard
  safe intrinsics, logging, lifecycle registration, and facades derived from the
  exact capability manifest. Do not expose `process`, `Buffer`, `require`, Electron,
  filesystem APIs, host constructors, host arrays, host errors, or mutable host DTOs.
- A facade exists only when at least one of its capability IDs is declared, and each
  method exists only for its exact declared ID. `hostCapabilities.invoke()` remains
  declaration-gated; a facade must not broaden that authority.
- Host authorization is `manifest declaration AND current permission grant AND
current activation authority`. A default grant, including `storage.plugin`, never
  authorizes an undeclared permission. Normalize permission IDs before comparing the
  manifest declaration and store grant.
- Clone every capability request and result through bounded wire DTOs. Plugin-visible
  items use portable icon descriptors; never return absolute paths, native handles,
  Electron objects, host errors/stacks, or host-realm arrays and typed arrays.
- Capture byte-related intrinsic getters and mutation methods before plugin code runs.
  Determine `ArrayBuffer`, typed-array, and `DataView` offsets and lengths with those
  captured getters; enforce byte limits before iteration or other plugin-controlled
  callbacks; copy bytes by bounded index reads; use the captured typed-array `set`
  for `getRandomValues`. Digest inputs and outputs must not depend on `Buffer` or on a
  plugin-replaced iterator/prototype method.
- `TextEncoder`, `TextDecoder`, random bytes, and digest return values are child-realm
  values. Supported digest algorithms are an exact allow-list, and oversized input
  fails before hashing or invoking plugin-controlled iteration.
- Locale is a validated, bounded, immutable load snapshot. `plugin.getLocale()` reads
  that snapshot and does not call back into mutable main-process state.
- Prelude capability calls are asynchronous. Await clear-before-push, storage writes,
  clipboard writes, external opens, HTTP requests, and lifecycle cleanup before
  reporting success. Fixed business actions use exact host-owned request/reply IDs
  and bounded DTOs; child code never selects destinations, routes, credentials, SQL,
  filesystem paths, Flow identities, or other authority-bearing values. Map denials
  and operational failures to distinct stable codes and redacted messages; do not
  infer permission denial from every host exception. Filter sensitive content before
  public sharing and never send child-managed credentials across the channel.
- Canonical Prelude resolution accepts only the declared build artifact under the
  plugin root and verifies source/build/resource/runtime projection parity where a
  release projection exists. Never silently execute a stale root or generated copy.
- Production installs the isolated runtime by default after the exact 22/22 official
  manifest inventory passes. There is no environment override, singleton bridge,
  synthetic self-check, legacy protocol source, or main-process VM fallback. A new or
  incompatible plugin fails with a stable activation error; it never restores legacy
  execution.
- Main starts one heartbeat only after the activation becomes active and keeps at most
  one heartbeat request in flight. The child endpoint replies directly without invoking
  Prelude lifecycle code. Missing acknowledgement uses the canonical request timeout,
  cancel grace, authority invalidation, resource cleanup, forced kill, and real exit
  barrier. Every stop/crash/startup cleanup clears heartbeat state.
- Heartbeat requests use a dedicated single infrastructure pending slot, while business
  calls retain their configured concurrency limit. The session stores a monotonic
  heartbeat request-id watermark instead of retaining unbounded periodic history.
- An unexpected active-process termination records one plugin-scoped crash. Three crashes
  inside 30 seconds block the fourth explicit start before handle allocation or spawn with
  `PLUGIN_RUNTIME_RESTART_BUDGET_EXHAUSTED`. Normal stop and startup failure do not count;
  the budget expires after the stability window. The host never auto-restarts or falls
  back.
- Real Electron smoke executes every claimed compatible Prelude in at least two host
  generations. It records real child PIDs, verifies handle and generation rotation,
  and proves stale ports/messages cannot mutate storage, clipboard, open, HTTP, or
  published feature state after stop/reload.

### 4. Validation Matrix

| Condition                                                 | Required result                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Facade or method capability is undeclared                 | Property absent or stable undeclared-capability rejection             |
| Permission is granted by default but absent from manifest | Authorization denied before handler execution                         |
| Plugin replaces typed-array iterator, getter, or `set`    | No host constructor/value exposure; bounded operation remains correct |
| Byte input exceeds the wire limit                         | Reject before plugin iterator/callback and before digest allocation   |
| Clipboard/open/HTTP operation fails without a denial code | Stable operational failure, not `permission-denied`                   |
| Host denial code is returned                              | Stable `permission-denied`; no native detail or stack                 |
| Item contains file icon/path or host object               | Reject or project to a portable DTO before child publication          |
| Runtime service is initialized                           | Install the activation-scoped isolated runtime by default                |
| Official manifest inventory changes                      | Rollout contract test fails until the new Prelude is migrated            |
| Heartbeat result has wrong owner/generation/direction    | Protocol violation; no request completion                                |
| Heartbeat result is duplicate, late, or unknown          | Stable session rejection; no request-id reuse                            |
| Active child misses the heartbeat deadline               | Cancel, revoke, cleanup, kill, await exit, and report one stable crash    |
| Fourth explicit start after three recent crashes         | `PLUGIN_RUNTIME_RESTART_BUDGET_EXHAUSTED`; no spawn                       |
| Normal stop or failed startup                            | Do not consume restart budget                                             |
| Resolver sees stale root projection                       | Select the canonical declared build or fail closed                        |
| Old handle/port emits after generation rotation           | Ignore/reject; no stale side effect                                   |

### 5. Good / Base / Bad Cases

- Good: an active child answers endpoint heartbeats while async plugin work is pending;
  disable clears the timer, revokes authority, releases resources, and waits for exit.
- Base: a child event loop becomes stuck after lifecycle completion; the missed heartbeat
  follows timeout/cancel grace and force-kill without affecting another activation.
- Bad: rely only on lifecycle deadlines, keep an environment kill switch or main VM
  fallback, retain every heartbeat id forever, or automatically restart an unbounded crash
  loop.

### 6. Tests Required

- Child-realm RED tests replace `Uint8Array.prototype.set`, typed-array iterators, and
  related getters, then exercise random values, encoding/decoding, digest, and wire
  serialization. Assert no host constructor can recover `process` and oversized
  inputs reject before the plugin hook is observed.
- Authorization tests grant a default permission while omitting it from required and
  optional manifest declarations; assert both generic and business capabilities deny
  without consulting a permissive fallback.
- Facade projection tests cover absent facade, absent individual method, frozen
  null-prototype objects, local DTO clones, portable icons, locale snapshot, and no
  host path/error leakage.
- Official Prelude tests exercise success, denial, and ordinary failure for storage,
  clipboard, open URL, HTTP, and fixed request/reply operations; assert every success
  waits for its side effect, every failure is stable and redacted, persistence is
  bounded, clipboard placeholders read only when needed, and public payloads exclude
  sensitive content and credentials.
- Resolver/release tests cover canonical source selection, projection cleanup, and
  SHA-256 parity. Rollout tests prove the exact 22/22 inventory, production default-on,
  and fail-closed behavior for any future incompatible official plugin.
- Wire/session tests cover heartbeat direction, exact keys, owner/generation binding,
  duplicate/late/unknown responses, the dedicated pending slot, request-id watermark,
  and business pending limits.
- Host/process tests cover active-only scheduling, direct child acknowledgement, one
  in-flight heartbeat, missed-ack timeout through the real termination barrier, timer
  cleanup, cross-activation isolation, and no crash report on normal stop.
- Service tests cover three crashes in 30 seconds, fourth-start denial before spawn,
  plugin-name isolation, stability-window recovery, and exclusion of normal stop/startup
  failure.
- Real Electron smoke executes the complete claimed compatibility set twice and
  asserts PID/handle/generation rotation plus stale message and stale side-effect
  denial after the first host is stopped.

### 7. Wrong vs Correct

#### Wrong

```ts
if (permissionStore.hasPermission(pluginName, permissionId, sdkapi)) allow()
setInterval(() => child.postMessage({ type: 'ping' }), interval)
if (childExited) restartPluginWithoutLimit()
```

#### Correct

```ts
if (!manifestDeclares(plugin, permissionId)) deny()
if (!permissionStore.hasPermission(pluginName, permissionId, sdkapi)) deny()
const heartbeat = session.request(ownerBoundHeartbeat, heartbeatTimeoutMs)
await heartbeat // timeout uses canonical cancellation and termination
assertRestartBudget(pluginName, { maxCrashes: 3, windowMs: 30_000 })
```

The byte-codec boundary additionally captures intrinsic getters before plugin code runs:

```ts
const { byteLength, view } = readByteViewWithCapturedGetters(value)
assertWireByteLimit(byteLength)
const bytes = copyByBoundedIndex(view, byteLength)
Reflect.apply(capturedUint8ArraySet, target, [childRealmBytes])
```

## Scenario: Owner-Bound Fixed Process Action

### 1. Scope / Trigger

- Trigger: an isolated official Prelude needs to start or signal one known desktop
  application through `process.spawn`.
- This contract spans child facade projection, exact capability DTOs, main-owned
  discovery, permission authority, fixed spawn options, process ownership, and
  activation teardown.

### 2. Signatures

```ts
type SnipasteProcessRequest = {
  operation: 'snipaste-action'
  actionId: 'launch' | 'snip' | 'snip-full' | 'paste' | 'pick-color' | 'toggle-images' | 'docs'
}

type SnipasteProcessResult =
  | { actionId: SnipasteProcessRequest['actionId']; status: 'started' }
  | {
      actionId: SnipasteProcessRequest['actionId']
      status: 'blocked'
      reason: 'not-installed' | 'permission-denied' | 'permission-unavailable' | 'platform-unsupported'
    }
  | { actionId: SnipasteProcessRequest['actionId']; status: 'failed'; reason: 'spawn-failed' }
```

The child projection is `plugin.snipaste.runAction(actionId)`. It is frozen,
null-prototype, and present only when `process.spawn` is declared.

### 3. Contracts

- The child request contains exactly `operation` and `actionId`. Executable, path,
  command, arguments, environment, cwd, detached, shell, platform, and settings
  fields are forbidden.
- Main maps every action to one fixed argument vector. It discovers only canonical
  absolute regular files at platform-owned Snipaste locations and a bounded current
  user's `Applications` directory derived through Electron main. PATH lookup,
  command names, child settings, symlinks, non-files, and root escapes are denied.
- Capability construction accepts only a discovery object issued by the fixed discovery
  factory. A private type brand provides the compile-time contract and a module-owned
  identity registry provides the runtime signature; structural copies, proxies, and
  arbitrary main discovery adapters fail before permission watchers or host work.
- Spawn uses `shell: false`, `detached: false`, ignored stdio, a fixed executable
  directory cwd, and a platform allow-list of environment keys. Child input cannot
  affect any spawn option.
- Require current authoritative activation and host generation before and after
  discovery and spawn. Require declared/current `system.shell` on every call.
- A successfully started process stays owned by the exact activation after the RPC
  returns. Permission revoke, caller cancellation before completion, timeout,
  disable, crash, and generation rotation issue at most one kill and await the real
  child exit event. A kill request is not an exit barrier.
- Result and diagnostics contain only fixed action/status/reason values. Executable
  paths, native errors, environment values, activation keys, and host handles never
  cross to the child or logs.

### 4. Validation & Error Matrix

| Condition                                                       | Required result                                 |
| --------------------------------------------------------------- | ----------------------------------------------- |
| Unknown action or any extra request field                       | Invalid request before discovery/spawn          |
| Permission missing/revoked/unavailable                          | Stable permission failure; no new spawn         |
| Unsupported platform                                            | `blocked/platform-unsupported`                  |
| No canonical regular candidate                                  | `blocked/not-installed`; no PATH fallback       |
| Candidate/root resolves through symlink or outside trusted root | Skip/reject candidate                           |
| Arbitrary, copied, or proxied discovery adapter                 | Reject capability construction before host work |
| Spawn throws or emits a pre-spawn error                         | `failed/spawn-failed`, redacted                 |
| Cancel/timeout/revoke after process acquisition                 | Kill once and await real exit                   |
| Disable/crash with a previously started process                 | Close activation owner and await exit           |
| Old generation invokes or replies late                          | Reject/ignore; no new process or completion     |

### 5. Good/Base/Bad Cases

- Good: `runAction('snip-full')` resolves one canonical Snipaste executable in main,
  spawns the fixed `['snip', '--full', '-o', 'clipboard']` vector, and teardown owns
  the process until its real exit.
- Base: Snipaste is absent from every trusted location, so the plugin receives
  `not-installed` without a path or native error.
- Bad: accept `SNIPASTE_PATH`, `settings.json` custom args, `spawn('Snipaste')`, a
  symlinked app, inherited full environment, `shell: true`, or a child-selected cwd.

### 6. Tests Required

- DTO tests reject executable/path/command/args/env/cwd/shell/platform fields,
  accessors, proxies, unknown actions, and malformed results before host work.
- Discovery tests cover every platform candidate, bounded user Applications,
  missing/non-file/symlink/root escape, cancellation, no PATH command fallback, and
  construction-time rejection of arbitrary, structurally copied, and proxied adapters.
- Process tests separate spawn acknowledgement, kill request, and real exit; cover
  idempotent kill plus cancel, timeout, revoke, disable, stale activation, and host
  generation rotation.
- Child tests assert declaration gating, exact local action allow-list, frozen
  null-prototype facade, constructor containment, and no global process/spawn facade.
- Real Electron smoke loads the actual Prelude twice with an in-memory fake executor;
  prove permission deny/grant, PID/handle/generation rotation, stale old-port denial,
  and close barriers without launching the real application.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn(request.path || process.env.SNIPASTE_PATH || 'Snipaste', request.args, {
  shell: true,
  env: process.env,
})
```

#### Correct

```ts
const executable = await trustedDiscovery.discover(signal)
const action = validateExactFixedAction(request)
const owned = activationProcesses.start(executable, FIXED_SNIPASTE_ARGS[action])
await owned.started
assertCurrentActivationAndPermission()
return { actionId: action, status: 'started' }
```

## Scenario: Owner-Bound Voice Capability

### 1. Scope / Trigger

- Trigger: an isolated Prelude invokes dictation, streaming ASR, or speech synthesis
  through `voice.invoke` or `voice.stream`.
- This contract spans child facades, callback/resource transport, activation authority,
  permission revoke, native capture, intelligence STT/polish/TTS, and teardown barriers.

### 2. Signatures

```ts
interface IsolatedVoiceHostService {
  dictate(payload: VoiceDictatePayload, signal: AbortSignal, caller: string): Promise<VoiceDictateResult>
  speak(payload: VoiceSpeakPayload, signal: AbortSignal, caller: string): Promise<VoiceSpeakResult>
  streamDictation(
    payload: VoiceAsrStreamPayload,
    signal: AbortSignal,
    caller: string,
  ): AsyncIterable<VoiceAsrStreamEvent>
}

type VoiceStreamRequest = {
  operation: 'asr-stream'
  language?: string
  onEvent(event: VoiceAsrStreamEvent): Promise<void>
}
```

### 3. Contracts

- Require manifest declaration and a current grant for `voice.dictation` on every
  invoke and stream start. Bind the returned stream resource and retained callback
  to the current activation owner and generation.
- After authoritative activation and host-generation validation, main derives the
  provider caller as `plugin:<manifest plugin id>`. The child request cannot supply
  or override caller. Thread the derived caller through STT, polish, and TTS so quota,
  audit, and TTS cache entries remain plugin-scoped.
- Deliver stream events one at a time and await `onEvent` before reading the next
  event. `final`, `error`, and `end` are terminal and automatically dispose the
  resource; explicit `cancel()` and repeated disposal are idempotent.
- Propagate the capability `AbortSignal` through the production VoiceService. Abort
  cancels native microphone capture immediately and releases waits for STT, polish,
  and TTS without waiting for a provider promise that cannot be physically aborted.
- A provider promise that settles after abort is observed only to contain rejection;
  its value is discarded and cannot emit events, play audio, publish items, or settle
  a newer generation's request.
- TTS audio stays in main. The child receives bounded metadata only. Check abort
  after synthesis and immediately before playback so cancelled work never starts
  speaker output.
- Permission revoke and activation teardown abort the signal, dispose the resource,
  release the callback, and await native capture cancellation before the host stop
  barrier resolves.
- Every stream owns a dedicated `AbortController`. Explicit dispose aborts that
  controller before awaiting `iterator.return()`. WebSocket open, event-queue wait,
  and frame-pump delay all observe the signal; abort closes the socket, latches the
  queue terminal state, removes handlers, and awaits the stopped pump.

### 4. Validation & Error Matrix

| Condition                                              | Required result                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `voice.*` capability or method undeclared              | Facade/method absent or stable undeclared-capability failure    |
| `voice.dictation` missing or revoked                   | Reject before new native capture; close current stream resource |
| Child supplies/spoofs caller or plugin identity        | Reject the exact DTO before service work; main derives caller   |
| Signal aborts during capture                           | `cancelCapture(sessionId)` and `VOICE_OPERATION_CANCELLED`      |
| Signal aborts during STT/polish/TTS                    | Release awaiting caller; discard late result and side effects   |
| Signal aborts before TTS playback                      | No `playAudio` call                                             |
| Callback rejects or exceeds deadline                   | Stable redacted callback failure and resource disposal          |
| Duplicate cancel/dispose                               | No-op after the first completed cleanup                         |
| Dispose while WebSocket never opens or never finalizes | Abort provider signal, close socket, and settle disposer        |
| Old generation emits a late event                      | Reject/ignore; no callback or host side effect                  |

### 5. Good / Base / Bad Cases

- Good: Dictation starts an owner-bound stream, awaits each partial/final callback,
  auto-disposes on terminal delivery, and permission revoke cancels native capture.
- Base: one-shot STT/TTS completes normally; only bounded text/status metadata crosses
  to the child and no native audio bytes cross the capability boundary.
- Bad: remove the child iterator while leaving capture or provider work awaited in
  main, or race a TTS promise without checking abort before playback.

### 6. Tests Required

- VoiceService unit tests abort dictate, stream, and speak while work is pending;
  assert native cancel, stable cancellation, no STT after capture abort, and no audio
  playback after synthesis abort.
- Capability tests cover manifest/grant checks, owner/generation binding, main-derived
  caller attribution, per-event backpressure, terminal auto-dispose, callback failure,
  explicit cancel, repeated dispose, permission revoke, and activation cleanup.
- WebSocket tests cover never-open, open-without-final, external abort, and explicit
  resource dispose; assert stable cancellation, socket close, and bounded pump exit.
- Child VM tests cover declaration-gated frozen facades, terminal auto-dispose,
  idempotent cancel, callback error redaction, and absence when undeclared.
- Real Electron smoke runs the actual Dictation Prelude in two generations and proves
  permission deny/grant, partial/final delivery, clipboard action, resource count
  returning to zero, PID/handle/generation rotation, and stale-port rejection.

### 7. Wrong vs Correct

#### Wrong

```ts
const result = await Promise.race([voiceService.speak(payload), timeout])
// The provider can finish later and still play audio.
```

#### Correct

```ts
const activation = assertAuthoritativeActivation(context)
const caller = `plugin:${activation.name}`
const result = await voiceService.speak(payload, signal, caller)
signal.throwIfAborted()
// VoiceService also checks abort immediately before native playback.
```

## Scenario: Bounded Intelligence Invoke Capability

### 1. Scope / Trigger

- Trigger: an isolated Prelude needs non-streaming `text.chat`, `vision.ocr`, or
  public text-model discovery through the host Intelligence runtime.
- This foundation does not authorize context execution, streams, memory evaluation,
  agent sessions, provider configuration, or production rollout.

### 2. Signatures

```ts
type PluginIntelligenceRequest =
  | {
      operation: 'capability.invoke'
      capabilityId: 'text.chat'
      payload: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> }
      options?: SafePluginIntelligenceOptions
    }
  | {
      operation: 'capability.invoke'
      capabilityId: 'vision.ocr'
      payload: {
        source: { type: 'data-url'; dataUrl: string }
        language?: string
        includeLayout?: boolean
        includeKeywords?: boolean
      }
      options?: SafePluginIntelligenceOptions
    }
  | { operation: 'provider-models.list'; capabilityId: 'text.chat' }

interface PluginIntelligenceHostProjection {
  invoke(request: ProjectedInvoke, signal: AbortSignal, caller: string): Promise<ProjectedResult>
  listProviderModels(signal: AbortSignal, caller: string): Promise<ProjectedProvider[]>
}
```

### 3. Contracts

- Register exactly `intelligence.invoke` with permission `intelligence.basic`. Recheck
  branded plugin-host authority, current activation identity, and host generation on
  every call; main derives `plugin:<manifest id>` after those checks.
- Child requests cannot supply caller, plugin identity, key, quota scope, provider
  endpoint, credentials, authorization, cookies, or tokens. Options are limited to
  bounded provider/model preference, prompt template/variables, and exact diagnostic
  metadata. Metadata capability/provider/model values must agree with the request.
- Chat accepts at most 64 exact role/content messages within the aggregate byte budget.
  OCR accepts only canonical base64 PNG/JPEG/WebP data URLs with matching magic and a
  decoded limit of 640 KiB; the maximum valid request must fit the shared 1 MiB wire
  envelope. Remote URLs and file paths are never accepted.
- The injected host service is a projection adapter, not the raw Intelligence SDK.
  Before returning, it drops usage, reasoning, provider configuration, raw OCR blocks,
  credentials, native errors, and stacks. Capability validation rejects an unprojected
  service result instead of silently copying unknown fields.
- Service methods are snapshotted at capability creation. Permission revoke, activation
  rotation, and host-generation mismatch reject the invocation and discard late results.
- Cancellation authority is a CoreApp-private `AbortSignal` injected after capability DTO
  validation; `IntelligenceInvokeOptions` and child requests never contain `signal`. Only
  normalized `text.chat` and `vision.ocr` may use this host cancellation path. Other
  capabilities fail with `INTELLIGENCE_CANCELLATION_UNSUPPORTED` rather than inheriting
  unreviewed partial-side-effect semantics.
- Quota, strategy, primary provider, and each fallback run through an abort-listener
  boundary. Abort immediately settles the host SDK call with
  `INTELLIGENCE_OPERATION_CANCELLED`; attached handlers still observe and discard late
  provider settlement. This releases plugin-host concurrency but does not claim to stop
  provider computation or billing until provider interfaces accept the same signal.
- The final abort check before cache/audit is the success commit point. Abort before it
  writes neither cache nor audit and cannot start another fallback. Abort after it does not
  rewrite an already committed success while its success audit is settling. Signal is
  excluded from cache identity, so active-signal and signal-free calls share cache keys.
- Provider-supplied cancellation codes are ordinary provider failures; only the captured
  signal is authoritative. Signal-enabled quota/provider/fallback logs and failure audit
  use stable redacted codes and never persist native messages, causes, paths, or secrets.
- Context invoke/stream, memory, and handoff/session require separate owner-bound
  contracts. Never add them as generic operations or expose host-only session IDs.

### 4. Validation & Error Matrix

| Condition                                                                     | Required result                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unknown operation or capability ID                                            | Invalid request before service work                                                               |
| Child supplies caller, identity, endpoint, or credential field                | Invalid request before service work                                                               |
| Metadata capability/provider/model disagrees with options                     | Invalid request                                                                                   |
| OCR MIME is remote, non-image, malformed base64, wrong magic, or over 640 KiB | Invalid request                                                                                   |
| Permission denied or revoked                                                  | Stable permission error; late result discarded                                                    |
| Host signal is pre-aborted or aborts during quota/strategy/provider/fallback  | `INTELLIGENCE_OPERATION_CANCELLED` settles immediately; late settlement is observed and discarded |
| Host signal is attached to any capability except normalized chat/OCR          | `INTELLIGENCE_CANCELLATION_UNSUPPORTED` before provider work                                      |
| Provider throws a forged cancellation code                                    | Treat as ordinary provider failure/fallback; never as host cancellation                           |
| Abort occurs after the cache/audit commit point                               | Complete the already committed success; do not rewrite it as cancelled                            |
| Signal-enabled native quota/provider failure                                  | Stable redacted log/audit code; no native message/cause/path/secret                               |
| Activation or host generation is stale                                        | Stable stale/handler failure; no service work                                                     |
| Service returns usage, reasoning, raw data, credential, or stack fields       | Fail closed as unprojected handler result                                                         |
| Native service throws                                                         | Stable redacted handler failure                                                                   |

### 5. Good / Base / Bad Cases

- Good: a current plugin sends bounded chat messages; main derives its caller, invokes
  a projected host adapter, and returns only text/provider/model/trace/latency fields.
- Base: model discovery returns bounded public provider labels and model IDs, with no
  endpoint, key, account, quota, or routing configuration.
- Bad: pass the raw Prelude options with `metadata.caller`, accept a 5 MiB screenshot
  despite a 1 MiB wire limit, or expose `agent-session.update` under a child-selected ID.

### 6. Tests Required

- Authority tests cover forged context, stale activation, host-generation mismatch,
  permission denial/revoke, caller abort, and late success after revoke.
- Cancellation tests must settle the SDK rejection before resolving/rejecting deferred
  quota, strategy, primary provider, and fallback Promises. Assert canonical errors,
  no unhandled late rejection, no fallback after abort, no cache/audit write before the
  commit point, outer-governed containment, and committed success during audit-time abort.
- Cache tests prove signal is excluded from key identity. Redaction tests prove
  signal-enabled quota/provider/fallback logs and failure audits contain only stable codes;
  provider-forged cancellation codes must still take ordinary fallback.
- Scope tests reject host signal on every non-chat/OCR capability and prove the public
  Intelligence option DTO has no `signal` field.
- DTO tests cover extra keys, proxies, accessors, sparse arrays, cycles, classes,
  prototype keys, message/byte bounds, metadata consistency, and caller spoofing.
- OCR tests cover PNG/JPEG/WebP magic, MIME mismatch, canonical base64, remote/file
  denial, the 640 KiB boundary, and successful encoding within host wire limits.
- Projection tests reject raw SDK usage/reasoning/OCR/provider/credential fields and
  prove native failures remain redacted.
- Before production wiring, add real host-adapter tests, child facade tests, provider
  cancellation decisions, and real Electron enable/trigger/disable/revoke smoke.

### 7. Wrong vs Correct

#### Wrong

```ts
return tuffIntelligence.invoke(request.capabilityId, request.payload, request.options)
```

#### Correct

```ts
const activation = assertAuthoritativeActivation(context)
const caller = `plugin:${activation.name}`
// The adapter validates child DTOs first, then injects signal into CoreApp-private host options.
const projected = await intelligenceAdapter.invoke(request, signal, caller)
// Abort settles the host await immediately; late provider completion is only observed/discarded.
return validateProjectedIntelligenceResult(projected)
```

## Scenario: Activation-Bound Ephemeral Intelligence Context Invoke

### 1. Scope / Trigger

- Trigger: the exact isolated `touch-intelligence` activation needs a governed,
  non-streaming `text.chat` fallback without admitting a durable Context operation.
- This foundation covers `intelligence.context.invoke`, main-derived actor identity,
  current-input secret policy, host cancellation, exact result projection, and the child
  `intelligence.contextInvoke()` facade. Persistent sessions, turns, package logs,
  checkpoints, continuation, Memory and retrieval belong to the owner-bound stream path
  or a future terminable durable-operation contract.

### 2. Signatures

```ts
type EphemeralPluginContextInvokeRequest = {
  operation: 'context.invoke'
  capabilityId: 'text.chat'
  input: string
  payload: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  }
  options?: SafePluginIntelligenceOptions
  context: {
    mode: 'new' | 'stateless'
    owner: 'corebox' | 'assistant'
    scope?: 'light' | 'session' | 'retrieval'
    objective?: string
    tokenBudget?: number
    traceId?: string
  }
}

interface IntelligenceContextExecutionHostOptions {
  signal?: AbortSignal
  persistence?: 'full' | 'ephemeral' // CoreApp-private; never a child DTO field
}
```

The result contains the bounded invocation plus a summary with exactly one
`current_input` item and `degradedReason: 'isolated_context_persistence_unavailable'`.
It contains no session, turn, package, checkpoint or continuation identity.

### 3. Contracts

- Install `intelligence.context.invoke` only in the exact `touch-intelligence` activation.
  Recheck the branded plugin-host context, full activation identity, permission and host
  generation on every call. Main derives `caller = plugin:touch-intelligence`.
- The host service always injects frozen `{ signal, persistence: 'ephemeral' }`. Child
  fields cannot enable persistence, select an actor, provide a signal, or alter caller,
  endpoint, credentials, quota identity or host generation.
- Accept `new` and `stateless` only. Reject `continue` locally and again in main with
  `CONTEXT_EPHEMERAL_CONTINUATION_UNSUPPORTED` before provider work. Do not imply that a
  child session id was consumed.
- Validate the actor and fixed entrypoint pair before execution:
  `corebox.ai-ask/corebox` or `assistant.voice/assistant`, with matching mode.
- Build provider input from bounded system messages plus the trimmed current input only.
  Child user/assistant history is not trusted Context state. Apply the shared host secret
  classifier to current input, every provider-bound system message, every prompt variable,
  and both the raw and rendered prompt template before invoking a provider.
- The ephemeral path never calls `prepareTurn()`, `revalidatePackageMemories()` or
  `appendAssistantTurn()`. It creates no session, turn, checkpoint, ContextPackage or
  package log, so cancellation/retry cannot duplicate durable Context state.
- Cancellation uses the canonical capability protocol. Pre-abort and abort during provider
  wait reject; late provider settlement is observed and discarded. This is containment,
  not a claim that provider compute or billing physically stopped.
- Exact-project results before child delivery. Drop usage and reasoning; reject credential,
  endpoint, native-error, stack, persistent-id, arbitrary degraded-reason, extra-field and
  oversized results. The child independently enforces the same ephemeral summary shape.
- Full host-owned Context invoke keeps the existing persistent default. Owner-bound Context
  stream remains a separate capability/resource contract; this foundation must not be cited
  as persistent Context or official migration evidence by itself.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Non-`touch-intelligence`, stale activation, wrong host generation or missing permission | Reject before Context/provider work |
| Unknown operation/capability, extra field, Proxy, accessor, sparse/cyclic/class DTO | Invalid request before provider work |
| Child supplies caller, signal, persistence, endpoint, credential or mismatched entrypoint | Invalid request before host work |
| `continue` or any supplied session id | `CONTEXT_EPHEMERAL_CONTINUATION_UNSUPPORTED`; provider untouched |
| Secret in input, system message, prompt variable or rendered template | `CONTEXT_CURRENT_INPUT_POLICY_BLOCKED`; provider untouched |
| Signal aborts before or during provider wait | Canonical cancellation; no Context DB method called |
| Result contains a persistent id or non-fixed degraded reason | `PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID` |
| Result count/source shape differs from one current input | Invalid host/child result |
| Native provider failure | Stable redacted handler failure; no message, path, stack, key or cause crosses |

### 5. Good / Base / Bad Cases

- Good: the current `touch-intelligence` activation runs a bounded stateless AI command;
  main derives the caller, checks the fully rendered prompt for secrets, and returns an
  ephemeral metadata-only summary with no database write.
- Base: `new` executes with current input only and explicitly reports persistence
  unavailable; callers do not retain a returned session id.
- Bad: accept `continue`, run ContextHygiene, append an assistant turn, trust child history,
  or introduce a capability-specific committed-success exception after child cancellation.

### 6. Tests Required

- Context execution tests prove zero prepare/revalidate/append calls, fixed summary shape,
  full default persistence unchanged, and secret blocking for input, system message and
  rendered prompt template before provider work.
- Host/capability tests cover exact DTOs, actor derivation, private ephemeral injection,
  activation/host-generation/permission checks, cancellation, raw-result rejection and
  explicit denial of persistent ids and arbitrary degraded reasons.
- Child tests cover declaration gating, local `continue` denial, frozen null-prototype
  facade, exact result bounds, constructor containment and no stream/memory/session/admin
  expansion from the one-shot id.
- Real Electron smoke runs the actual Prelude once without the stream capability to force
  the one-shot fallback, then runs a separate generation with owner-bound stream. Both use
  controlled providers and prove process/generation rotation and cleanup.

### 7. Wrong vs Correct

#### Wrong

```ts
return contextExecution.invoke(request, actor, {
  signal,
  persistence: request.persistence,
})
```

#### Correct

```ts
const activation = assertTouchIntelligenceActivation(context)
const caller = `plugin:${activation.name}` as const
const projected = validatePluginIntelligenceContextRequest(request, caller)
return contextExecution.invoke(projected, { id: caller, type: 'plugin' }, {
  signal: hostSignal,
  persistence: 'ephemeral',
})
```

## Scenario: Activation-Bound Custom Widget Publication

### 1. Scope / Trigger

- Trigger: an isolated Prelude publishes a custom-render `TuffItem` whose renderer was
  compiled and registered from the same plugin manifest or an activation-local dynamic
  feature.
- Generic `feature.items.push` remains non-custom. Custom publication uses only
  `feature.items.widget.push` and the declaration-gated `plugin.widget.pushItems()` facade.

### 2. Signatures

```ts
type PluginWidgetPushRequest = {
  scope: 'active-feature'
  items: readonly PluginWidgetItemDto[]
}

plugin.widget.pushItems(items: readonly PluginWidgetItemDto[]): Promise<void>
```

### 3. Contracts

- The main registry derives plugin name, activation generation, item ownership and source
  provenance. Child `source`, `pluginName`, renderer content and generation are correlation
  data only and are rewritten or checked against the authoritative activation.
- Every custom renderer must resolve to one directly registered same-plugin feature with
  `interaction.type: 'widget'` and a concrete path. Alias chains, another plugin, dynamic
  paths and an arbitrary namespaced widget id fail before item mutation.
- Navigation actions are limited to exact host-owned action-id/path pairs. Other custom
  actions remain plugin lifecycle actions and cannot become a generic host command.
- Requests/results use bounded plain DTOs. The Prelude omits optional `undefined` fields
  before publication; main does not loosen item validation to accommodate them.
- Manifest platform booleans are host input only. `feature.registry.list` projects them to
  canonical `{ win|darwin|linux: { enable, arch, os } }` DTOs before child delivery.
- Clear, push, stream callback updates and lifecycle teardown are awaited. A detached
  publication after lifecycle scope completion is cancelled and cannot mutate a newer
  activation.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| `feature.items.widget.push` undeclared | `plugin.widget` absent; no generic fallback |
| Renderer missing, foreign, aliased, pathless or dynamic | Invalid request before feature-host mutation |
| Child source/plugin/generation differs from owner | Reject or replace from authoritative activation |
| DTO contains `undefined`, accessor, Proxy, class, cycle or oversized content | Stable invalid request before host work |
| Manifest uses `win32` boolean platform | Project to canonical `win` platform DTO |
| Permission revoked, activation stale or teardown started | Reject and remove only that activation's items |

### 5. Good / Base / Bad Cases

- Good: `touch-intelligence` publishes `touch-intelligence::intelligence-ask`; main verifies
  the manifest renderer, rewrites ownership and tracks the item for exact-generation cleanup.
- Base: a default-render item continues through `feature.items.push` and never acquires a
  custom renderer.
- Bad: allow arbitrary `render.custom.content`, accept another feature's alias chain, emit
  `draftId: undefined`, or fall back to generic item push after widget validation fails.

### 6. Tests Required

- Business capability tests cover same-plugin renderer success, foreign/path/alias denial,
  canonical source rewriting, manifest platform projection and activation cleanup.
- Child tests cover declaration gating, frozen null-prototype facade and builder methods,
  absent generic custom-render escape and hostile DTO rejection.
- Official Prelude tests load the real script, require pending/delta/ready widget writes and
  prove production exports contain no test hook.
- Real Electron smoke uses two utility-process generations and proves stale-port denial,
  item cleanup and no real provider, network, native or OS action.

### 7. Wrong vs Correct

#### Wrong

```ts
await plugin.feature.pushItems([
  { render: { custom: { content: childSelectedRenderer, data } } },
])
```

#### Correct

```ts
const item = compactPluginDto(builder.setCustomRender('vue', fixedRendererId, data).build())
await plugin.feature.clearItems()
await plugin.widget.pushItems([item])
```

## Scenario: Activation-Bound Intelligence Context Stream

### 1. Scope / Trigger

- Trigger: the isolated official `touch-intelligence` Prelude needs governed streaming
  `text.chat` events assembled through the host ContextHygiene pipeline.
- This contract covers the activation-local `intelligence.stream` capability, retained
  event callback, stream resource, child `intelligence.contextStream()` controller, and
  the official Prelude migration. It does not authorize another plugin, memory evaluation,
  Agent sessions, raw checkpoints, provider credentials, or a generic stream transport.

### 2. Contracts

- Register `intelligence.context.invoke` and `intelligence.stream` only through the exact
  `touch-intelligence` activation factory. Neither id belongs in the global manifest.
  Construction and every call must match the full activation identity and current host
  generation; main derives `caller = plugin:touch-intelligence`.
- `intelligence.stream` requires `intelligence.basic`, exact Context request DTOs, one
  resource-lifetime `onEvent` callback, a bounded timeout, and bounded concurrency. The
  child cannot supply caller, signal, actor authority, endpoint, credential, arbitrary
  capability id, or resource identity.
- Main obtains an `AsyncIterable` only from the snapped Context execution service. It
  validates and projects each event before invoking the retained callback. Allowed events
  are bounded `start`, `delta`, `message`, `usage`, `metadata`, and terminal `end`; native
  failures and malformed/premature termination become only `INTELLIGENCE_STREAM_FAILED`.
- The capability returns a `stream` resource. Cancellation, permission revoke, generation
  rotation, registry close, child cancel, and normal terminal disposal abort the host
  controller and await `iterator.return()` when available. Late events cannot cross a
  disposed resource or stale activation.
- The child projects `contextStream()` only when `intelligence.stream` is declared. It
  accepts only the named callback set, validates event discriminants again, and returns a
  frozen null-prototype controller with `cancel()` and read-only `cancelled`. Callback
  failure terminates and disposes the stream.
- Prelude lifecycle entrypoints must await the complete prompt/action dispatch. Work
  detached with `void` loses request-scoped lifecycle authority when the entrypoint
  resolves and must not later invoke Context, stream, feature, storage, or clipboard
  capabilities.
- Prelude feature/widget DTOs crossing the business boundary must contain only supported
  plain values. Optional values are omitted instead of emitted as `undefined`; manifest
  features used by a host fixture must be projected to the host runtime platform shape
  before business validation.
- The official Prelude uses only projected globals. It must not import/require Node or
  Electron, access `process`, call raw `fetch`, request permissions at runtime, expose
  test hooks, or retain the legacy channel bridge.

### 3. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Non-Intelligence activation, stale identity/generation, or undeclared capability | Reject before Context/provider work |
| Permission denied/revoked or stream resource disposed | Abort and close the iterator; no late child event |
| Extra request/event field, wrong capability id, Proxy/accessor/class DTO | Stable invalid request/result before plugin callback |
| Stream ends without a terminal event or host iteration fails | Redacted `INTELLIGENCE_STREAM_FAILED` |
| Child callback throws or receives a malformed event | `INTELLIGENCE_STREAM_CALLBACK_FAILED`, then dispose |
| Lifecycle entrypoint resolves before prompt dispatch settles | Forbidden detached work; regression must fail |
| Widget DTO contains `undefined` or an unprojected source-manifest feature | Business validation rejects; Prelude/fixture must omit/project |

### 4. Tests Required

- Capability and host-service tests cover exact DTOs, actor derivation, activation and host
  generation checks, permission/revoke/cancel/close races, iterator cleanup, malformed
  events, redaction, and Context execution delegation.
- Child tests cover declaration gating, callback allowlisting, event projection, terminal
  disposal, callback failure, frozen controller containment, and absent raw capability
  access.
- Official Prelude tests load the real script in the child VM and prove invoke plus stream,
  awaited lifecycle completion, widget updates, no forbidden globals, and no exported test
  surface.
- Real Electron smoke runs the actual Prelude in two activation generations with only fake
  Context/provider events. It must observe pending, delta, and ready widget writes, stale
  generation isolation, resource teardown, and no real provider, browser, network, native,
  or OS action.

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

| Condition                                 | Required result                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Undeclared or unavailable module          | Reject before module resolution; record registration failure evidence       |
| Raw `@talex-touch/utils/transport` import | Reject during package/runtime dependency validation                         |
| Dynamic source violation                  | `WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED`; source body is not executed          |
| Clipboard/location/worker/network attempt | `WIDGET_SANDBOX_CAPABILITY_DENIED`; host spy remains untouched              |
| Call 121 inside the fixed window          | `WIDGET_SANDBOX_QUOTA_EXCEEDED`; audit `quota-exceeded`                     |
| `postMessage` with cloneable data         | Deliver only to the widget-local message target; audit without data         |
| Cross-plugin IndexedDB/cache enumeration  | Filter the foreign namespace and strip the internal prefix from owned names |
| Cache network loader                      | Reject `add` / `addAll`; do not call the host Cache method                  |
| Host action after widget disposal         | Return `false`; do not invoke the host callback                             |
| Retained browser facade after disposal    | Reject with disposed-policy evidence                                        |

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
const executor = new Function('require', 'module', 'window', code)
const module = moduleName.startsWith('@talex-touch/') ? preloadedModules[moduleName] : undefined
```

Free identifiers and generic scoped packages can recover host capabilities outside the declared widget contract.

#### Correct

```ts
assertWidgetDynamicSource(widgetId, code)
const scope = new Proxy(scopedGlobals, {
  has: () => true,
  get: (target, key) => Reflect.get(target, key),
})
const module = isAllowedWidgetModule(moduleName) ? resolveAllowlistedWidgetModule(moduleName) : undefined
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
  type: 'webcontent' | 'widget'
  path?: string
  rendererFeatureId?: string
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
  id: 'dynamic-command',
  interaction: { type: 'widget', path: 'ask-panel' },
})

makeWidgetId(pluginName, 'dynamic-command')
```

The packaged build has no precompiled `dynamic-command` widget entry.

#### Correct

```ts
features.addFeature({
  id: 'dynamic-command',
  interaction: { type: 'widget', rendererFeatureId: 'intelligence-ask' },
})

makeWidgetId(pluginName, 'intelligence-ask')
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

| Widget event                  | Current item declaration                      | Required result                                                         |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| Matching action id            | `type: "navigate"`, non-empty `payload.path`  | Hide CoreBox and navigate; no plugin execute transport                  |
| Matching action id            | `type: "execute"`                             | Preserve plugin item execution                                          |
| Unknown action id             | Missing                                       | Preserve plugin item execution so existing widget commands keep working |
| Spoofed event payload path    | Declared navigate action has a different path | Ignore event path; use declared action payload                          |
| Valid plugin tab deep link    | `?tab=Permissions`                            | Select the exact declared Permissions tab                               |
| Missing or invalid plugin tab | None / unsupported value                      | Select `Overview`                                                       |

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
if (payload.actionId === 'open-settings') {
  router.push(String(payload.payload?.path))
}
```

The widget controls the route and bypasses the item's declarative action contract.

#### Correct

```ts
const declared = item.actions?.find(action => action.id === payload.actionId)
if (declared?.type === 'navigate') {
  await actionPanel.executeAction(payload.actionId, item)
  return
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
  code: string
  message: string
  reason: string
  recovery: string
}

interface IntelligenceWidgetFailurePayload {
  errorCode: string
  errorMessage: string
  errorReason: string
  errorRecovery: string
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

| Input                             | Required result                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Canonical reason/recovery present | Trim, truncate with existing ellipsis behavior, preserve both fields end to end |
| One field missing                 | Render only the populated row                                                   |
| Both fields missing               | Render no error-details group or empty labels                                   |
| Markup-like detail text           | Display escaped text; do not create DOM from it                                 |
| Retry after structured failure    | Host payload retains the bounded reason/recovery values                         |

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
const errorMessage = `${failure.message}: ${failure.recovery}`
```

This destroys structure, duplicates content, and prevents safe conditional presentation.

#### Correct

```ts
const failureState = {
  errorCode: failure.code,
  errorMessage: failure.message,
  errorReason: truncateText(failure.reason, 240),
  errorRecovery: truncateText(failure.recovery, 240),
}
```

The widget can present bounded guidance without guessing or parsing provider text.

## Scenario: User-Initiated Plugin AI Cancellation

### 1. Scope / Trigger

- Trigger: an official AI widget is in `ocr-pending` or `chat-pending` and the user selects `停止生成`.
- The boundary spans widget payload identity, plugin session state, transport stream controllers, stale callback guards, and cancelled-state presentation.

### 2. Signatures

```ts
interface CancelIntelligenceWidgetAction {
  actionId: 'cancel-request'
  payload: {
    requestId: string
    prompt: string
    answer: string
    status: 'ocr-pending' | 'chat-pending'
  }
}

type IntelligenceWidgetStatus = 'idle' | 'ocr-pending' | 'chat-pending' | 'ready' | 'cancelled' | 'error'
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

| Condition                                            | Required result                                           |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Matching active request with stream controller       | Cancel once; push `cancelled`; preserve partial answer    |
| Matching request before controller/invoke completion | Clear authority; ignore eventual completion               |
| Missing request id                                   | Return ignored; no controller or widget mutation          |
| Stale request id while newer request is active       | Return ignored; newer pending state remains authoritative |
| Late delta/end/error after stop                      | Ignore; cancelled widget remains unchanged                |

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
if (actionId === 'cancel-request') {
  supersedeAllActiveRequests()
}
```

One stale widget can cancel unrelated or newer feature work.

#### Correct

```ts
if (payload.requestId !== session.activeRequestId) return ignored
supersedeActiveRequest(session)
await pushWidgetState(featureId, { status: 'cancelled', answer: payload.answer })
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
  'getQuota' | 'setQuota' | 'deleteQuota' | 'getAllQuotas' | 'checkQuota' | 'getCurrentUsage'
>
```

Plugin invoke options are rebound at the host boundary:

```ts
function bindPluginInvokeCaller(
  options: IntelligenceInvokeOptions | undefined,
  context: Pick<HandlerContext, 'plugin'>,
): IntelligenceInvokeOptions | undefined
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

| Condition                                         | Required result                                               |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Plugin reads a host-only quota method from facade | `undefined`; method is not discoverable or enumerable         |
| Plugin sends a quota control-plane typed event    | `INTELLIGENCE_HOST_ONLY_CAPABILITY` before handler work       |
| Plugin omits `metadata.caller`                    | Runtime receives `plugin:<plugin id>`                         |
| Plugin supplies another caller id                 | Host overwrites it with `plugin:<plugin id>`                  |
| Host sends a quota event                          | Continue to normal payload validation and quota manager       |
| Host invokes with an explicit caller              | Preserve the host caller                                      |
| Primary provider fails, fallback succeeds         | One success audit with fallback identity/usage; result cached |
| Every provider fails                              | One failure audit; primary error preserved                    |
| Outer-governed fallback succeeds                  | No inner audit; result may be cached                          |

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
  await intelligenceQuotaManager.setQuota(config)
})

await tuffIntelligence.invoke(capabilityId, payload, payload.options)
```

#### Correct

```ts
registerSafe(intelligenceApiEvents.setQuota, async (config, context) => {
  assertHostOwnedIntelligenceControlPlane(context)
  await intelligenceQuotaManager.setQuota(config)
})

const options = bindPluginInvokeCaller(payload.options, context)
await tuffIntelligence.invoke(capabilityId, payload.payload, options)
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

| Condition                                                          | Required result                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Basic-only plugin invokes/streams autonomous capability            | `INTELLIGENCE_AGENTS_PERMISSION_DENIED`; runtime untouched        |
| Permission runtime unavailable                                     | `INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE`; runtime untouched   |
| Lifecycle facade streams autonomous capability                     | Same protected typed handler and `intelligence.agents` gate       |
| Lifecycle stream cancellation                                      | Protocol cancel event carries the same plugin identity            |
| Legacy Agent plugin caller missing/spoofed                         | Gate first; manager receives canonical plugin caller              |
| Legacy Agent host caller missing                                   | Manager receives `intelligence.agent-executor`                    |
| Legacy Agent LLM success                                           | SDK quota/audit sees caller; AgentResult preserves provider usage |
| Plugin sends a raw low-level Agent session/orchestrator/tool event | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; runtime untouched            |
| Plugin reads/enumerates a low-level Agent runtime method           | Missing/`undefined`; high-level `agent.run` remains               |
| Plugin calls any persisted workflow control-plane event            | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; storage/runtime untouched    |
| Host performs low-level session or persisted workflow operations   | Preserve host behavior                                            |

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
registerProtectedSafe(invokeEvent, 'Invoke', 'intelligence.basic', async data => {
  return tuffIntelligence.invoke(data.capabilityId, data.payload, data.options)
})
```

#### Correct

```ts
registerProtectedSafe(invokeEvent, 'Invoke', 'intelligence.basic', async (data, context) => {
  await assertAutonomousIntelligencePermission(data.capabilityId, data, context)
  return tuffIntelligence.invoke(data.capabilityId, data.payload, data.options)
})
```

## Scenario: Plugin Intelligence Admin Surface

### 1. Scope / Trigger

- Trigger: plugin code reaches provider testing/model discovery, capability smoke, audit/usage telemetry, or local Intelligence environment inspection.
- These APIs are host settings and diagnostics control plane, not ordinary `intelligence.basic` capability execution.

### 2. Signatures

The plugin facade omits:

```ts
type HostIntelligenceAdminMethod =
  | 'testProvider'
  | 'testCapability'
  | 'fetchModels'
  | 'getAuditLogs'
  | 'getTodayStats'
  | 'getMonthStats'
  | 'getUsageStats'
  | 'getLocalEnvironment'
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

| Condition                                  | Required result                                               |
| ------------------------------------------ | ------------------------------------------------------------- |
| Plugin reads/enumerates admin method       | Missing/`undefined`                                           |
| Plugin sends raw provider test/fetch event | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no provider/network work |
| Plugin sends raw stats/audit event         | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no telemetry query       |
| Plugin requests local environment          | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no scan                  |
| Host sends malformed admin request         | Continue to the existing payload-validation error             |
| Plugin calls safe capability discovery     | Preserve current result                                       |

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
  return fetchProviderModels(data.provider)
})
```

#### Correct

```ts
registerSafe(intelligenceApiEvents.fetchModels, async (data, context) => {
  assertHostOwnedIntelligenceControlPlane(context)
  return fetchProviderModels(data.provider)
})
```

## Scenario: Alternate Plugin Intelligence Caller Attribution

### 1. Scope / Trigger

- Trigger: a plugin invokes provider-backed compatibility routes such as `chatLangChain` or `ttsSpeak` instead of generic `invoke` / `stream`.
- These routes remain plugin-callable under `intelligence.basic`, but they must enter quota/audit with verified transport identity.

### 2. Signatures

```ts
function bindPluginMetadataCaller<T>(payload: T, context: Pick<HandlerContext, 'plugin'>): T
```

For a verified plugin, `metadata.caller` is always `plugin:<manifest plugin id>`.

### 3. Contracts

- Missing or spoofed payload `metadata.caller` must be overwritten before provider invocation.
- Provider/model selection, prompts, trace metadata, and TTS parameters must survive unchanged.
- Host payloads and caller metadata must remain unchanged and must not be copied unnecessarily.
- TTS cache identity must include caller so one caller cannot receive another caller's cached trace/result.
- Repeated normalized TTS input for the same caller may reuse cache without a provider call.

### 4. Validation & Error Matrix

| Condition                            | Required result                           |
| ------------------------------------ | ----------------------------------------- |
| Plugin chat omits caller             | Invoke as authenticated plugin caller     |
| Plugin chat spoofs host/other plugin | Replace with authenticated plugin caller  |
| Plugin TTS spoofs caller             | Replace before TTS cache/provider access  |
| Same TTS input, different callers    | Distinct cache entries/provider responses |
| Same TTS input, same caller          | Caller-local cache hit                    |
| Host supplies caller                 | Preserve exactly                          |

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
return intelligenceTtsService.speak(data)
```

#### Correct

```ts
return intelligenceTtsService.speak(bindPluginMetadataCaller(data, context))
```

## Scenario: Plugin Local Knowledge Namespace Isolation

### 1. Scope / Trigger

- Trigger: a plugin indexes a knowledge document/chunk or searches/builds local knowledge context.
- Local knowledge remains a plugin SDK capability, but caller-supplied `permissionScope` and globally keyed SQLite ids are not ownership proof.

### 2. Signatures

```ts
type PluginKnowledgeScope = `plugin:${string}`

function bindPluginKnowledgeDocument(
  input: IndexDocumentInput,
  context: Pick<HandlerContext, 'plugin'>,
): IndexDocumentInput
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

| Condition                                         | Required result                     |
| ------------------------------------------------- | ----------------------------------- |
| Plugin omits/spoofs scope                         | Force `plugin:<verified id>`        |
| Same plugin repeats explicit/implicit document id | Same opaque id                      |
| Different plugin uses same local id/content       | Different opaque id                 |
| Plugin supplies another namespace's id            | Remap into its own namespace        |
| Plugin search supplies scope array/default        | Replace with its single actor scope |
| Host supplies scope/id                            | Forward unchanged                   |

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
localKnowledgeEngine.search(data)
```

#### Correct

```ts
localKnowledgeEngine.search(bindPluginKnowledgeScope(data, context))
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

| Path                              | Plugin result                                           | Host result                        |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------- |
| `agentSessionStart(autoRunGraph)` | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no start/graph     | Supplied metadata preserved        |
| Runtime capability node           | Governed high-level/internal caller retained            | Internal fallback if caller absent |
| `workflowRun`                     | `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no service/runtime | Payload identity preserved         |
| Workflow model/context            | Bound caller wins over step spoof                       | Host workflow fallback preserved   |
| Workflow DeepAgent prompt/agent   | Caller in config/adapter/state                          | Host metadata preserved            |

### 4. Tests Required

- Channel tests cover raw plugin Agent/workflow denial, host session/workflow identity, high-level caller binding, and agents denial before runtime.
- Runtime graph tests cover governed high-level/internal caller and host fallback.
- Workflow orchestration tests cover runtime session, model/context, prompt/agent adapter paths, and spoof precedence.

### 5. Wrong vs Correct

#### Wrong

```ts
metadata: {
  caller: ('intelligence.orchestrator', sessionId, turnId)
}
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

| Condition                         | Required result                                              |
| --------------------------------- | ------------------------------------------------------------ |
| Self + plugin + quota allowed     | Provider runs; one safe audit                                |
| Self + plugin + quota denied      | No config/adapter/provider work                              |
| Self + plugin + provider failure  | Canonical failure audit; step fails                          |
| Outer generic Agent/Workflow      | No inner quota/audit duplication                             |
| Outer generic stable model step   | One outer charge/audit; provider/fallback behavior unchanged |
| Spoofed outer-governance metadata | Ordinary SDK quota/audit still applies                       |
| Direct stable model step          | Existing governed SDK invoke                                 |
| Host direct workflow              | Existing host semantics                                      |

### 4. Tests Required

- Workflow service tests prove fresh/resumed direct runs pass `self`.
- Orchestration tests prove quota ordering, success audit, failure audit, no prompt leakage, denied short-circuit, and outer no-duplication.
- Marker tests prove identity-only, non-serializable ownership, explicit clone inheritance, outer stable invoke/context marking, unmarked direct paths, and unchanged fallback.
- Focused diagnostics and orchestration/workflow lint pass.

### 5. Wrong vs Correct

#### Wrong

```ts
const raw = await adapter.run(state) // direct provider call for a bound non-host caller, no quota/audit
```

#### Correct

```ts
await checkQuota(caller)
const raw = await adapter.run(state)
await recordRuntimeAudit(toSafeAudit(raw))
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
return contextHygieneService.listPackageLogs(payload) // payload may omit sessionId
```

#### Correct

```ts
assertHostOwnedIntelligenceControlPlane(context)
return contextHygieneService.listPackageLogs(payload)
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
  messages: [{ role: 'user', content: selection.text }],
})
```

## Scenario: Host-Owned Pi Orchestration And CLI Import

### 1. Scope / Trigger

- Apply when adding an AI execution entrypoint, Pi runtime message, automation trigger, external CLI config adapter, imported Skill/Agent/Command/Rule, or MCP definition.
- This boundary spans the shared typed SDK, Electron main, Pi Utility Process, SQLite migrations, managed content blobs, secure store, renderer import UI, Tool Registry, and MCP Registry.

### 2. Signatures

- Runtime: `AiCliOrchestrator.execute(request: AiOrchestratorExecuteRequest): Promise<AiOrchestratorRunRecord>`; `runtimeProvider` is always `pi-core`.
- Approval: `orchestratorApprove({ runId })`; cancellation uses `orchestratorCancel({ runId })` and must also terminate queued/pending persisted runs.
- Import: `orchestratorPreviewImport(request?)`, `orchestratorApplyImport({ scanId, candidateIds, confirmSecretMigration, overrides? })`, plus host-only set-active/clone/delete methods.
- DB migration owners: `ai_import_*`, `ai_agent_profiles`, `ai_orchestrator_*`, `ai_automations`, and `ai_automation_runs`. Every schema addition requires the next numbered SQL migration and journal entry.

### 3. Contracts

- `pi-agent-core` runs only in the bundled Electron `utilityProcess`; model requests return to Tuff provider routing and every tool call returns to the host Tool/MCP registries. The child receives no provider or MCP secret.
- Codex, Claude Code, Pi, Oh My Pi, and OpenCode are read-only configuration sources, never execution backends. Scanning does not execute a CLI, command, hook, script, MCP server, or remote instruction URL.
- Import apply re-reads each canonical source file through the bounded regular-file reader, rejects symlink/root escape or fingerprint drift, writes credential-redacted content plus secure-store authRefs, commits SQLite, then activates registries. Any failure rolls back new blobs and secret writes; a failed rollback is surfaced, never swallowed.
- Workspace items and imported Agent profiles are visible only when run `cwd` is canonically contained by that workspace; workspace projection wins over same-provider global projection. Skills expose metadata until `skill.read`; Commands inject only for explicit `/name` and expand `$ARGUMENTS`/`$1..$9`; glob Rules inject only when the objective names a matching path; Instructions are scope-always-on; MCP connects on first list/call and closes after idle.
- A source-missing scan creates one new current `source-missing` revision while preserving content, authRefs, active preference, and prior revisions. Reapplying the same missing state is idempotent; runtime registries use only current `active` items.
- Interactive child delegation persists a dependency-aware plan and creates no child run before one-time approval. Automation delegation/tools/MCP/paths/network targets and finite budgets cannot exceed the versioned policy.
- Orchestrator/import SDK methods remain in `HOST_ONLY_INTELLIGENCE_METHODS`; plugins cannot inspect snapshots, mutate imported items, approve runs, or start automation through the plugin SDK.

### 4. Validation & Error Matrix

| Condition                                                                                 | Required result                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Unknown runtime protocol/version or missing worker artifact                               | Fail closed; no fallback to an external CLI                                    |
| Tool, Skill, MCP, path, network, profile, or budget outside policy                        | Persist `pending_approval` with an explicit reason                             |
| Import candidate missing/invalid, outside canonical source root, or changed after preview | Reject the whole selected transaction                                          |
| Secret plaintext without explicit confirmation or unavailable secure store                | Reject and rollback; ordinary DB/blob/renderer data stays redacted             |
| Rule glob is invalid, absolute, or escapes with `..`                                      | Mark candidate blocking; do not import or inject it                            |
| Tool side effect succeeds but durable result persistence fails                            | Fail the run and retain started-call replay protection; never report completed |
| External credential cannot be exported safely                                             | Store descriptor as `reauth-required`; do not activate it                      |
| Workspace Skill/MCP requested from another cwd                                            | Reject before content read or MCP connection                                   |
| App restart finds queued/running automation with changed policy version                   | Cancel or return to approval; never inherit stale authorization                |
| Pi initialization fails after worker start                                                | Stop scheduler and Utility Process before propagating the error                |

### 5. Good / Base / Bad Cases

- Good: one scan returns candidates from all installed/configured sources; the user selects a Skill and MCP, confirms secret migration, then Pi reads the Skill on demand and lazily connects the MCP inside the matching workspace.
- Base: a model-only Pi turn completes through Tuff provider routing with no tool approval and persists provider/model/usage/run history.
- Bad: spawning `codex`/`claude`/`pi`, placing plaintext tokens in SQLite, injecting every Skill body, auto-running imported Commands, connecting MCP during scan, or letting a plugin call orchestrator control APIs.

### 6. Tests Required

- Protocol/host tests: versioned worker ready, model/tool round-trip, usage, cancellation, timeout, permission pause, and bounded restart/cleanup.
- Import tests: stable identity states, damaged-source isolation, path/fingerprint guards, secret redaction/reauth, persistence-failure rollback, scope precedence, explicit Commands, Skill/MCP workspace isolation, clone/disable/delete lifecycle.
- Import semantic tests: unknown frontmatter reporting, Command argument expansion, Rule glob/always-apply behavior, workspace Agent visibility, source-missing version/idempotency, and blocked unsafe globs.
- Delegation/automation tests: malformed dependencies/cycles, missing profiles, tool/MCP escalation, child and concurrency budgets, policy version recovery, coalesced `missedCount`, and approval override.
- Cross-layer gates: CoreApp node/web typechecks, focused AI tests, full migration-chain execution in SQLite, Electron Vite build containing `out/main/pi-agent-runtime-worker.js`, and a real Utility Process ready/exit smoke.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn(importedProvider.command, importedProvider.args)
await mcpClient.connect(candidate.url, candidate.headers)
```

#### Correct

```ts
const run = await aiCliOrchestrator.execute(request)
const imported = await aiCliImportService.apply(confirmedSelection)
// Pi decides; Electron main authorizes; Tool/MCP registries perform side effects.
```

## Scenario: TPEX Package Policy Admission

### 1. Scope / Trigger

- Trigger: validating a plugin Manifest, staging a `.tpex`, previewing a package in Nexus, or admitting a Nexus plugin version.
- The boundary spans `packages/utils/plugin`, Tuff CLI validation/builder, Nexus tar parsing, package preview and version publish/re-edit.

### 2. Signatures

```ts
validatePluginPackagePolicy({
  profile: 'source-manifest' | 'staged-package' | 'registry-admission',
  manifest,
  entries,
  archiveSize,
  expected: { pluginId, pluginName, version },
}): PluginPackagePolicyResult
```

`PluginPackagePolicyResult` is a discriminated union. Success carries `policyVersion`, normalized identity and optional inventory; failure carries ordered `{ code, location, meta? }` violations. Human text is not a cross-layer contract.

### 3. Contracts

- `packages/utils/plugin/package-policy.ts` is the only owner of Manifest identity, SDK/category, permission shape, archive path/type, entry count/size, file-map and expected identity/version rules.
- `source-manifest` validates source metadata without requiring archive fields. `staged-package` additionally requires safe entries, packaged dev mode, `_files` and `_signature`. `registry-admission` also enforces the shared 30 MB archive ceiling and expected Nexus identity/version.
- Entry paths are raw archive paths. Reject NUL, backslash, drive/UNC/absolute paths, `./`, empty segments, traversal, duplicates and case-fold collisions before extraction.
- Only regular files and directories are admissible. Symlink, hardlink, device, FIFO and unknown tar entry types fail closed.
- Nexus preview, publish and rejected-version re-edit require both manifest integrity and package policy. A policy failure occurs before package object or version-row persistence.
- UI-only plugins may omit `main`; they must still declare reverse-domain `id`, slug `name`, SemVer `version`, supported `sdkapi` and SDK-required `category`.

### 4. Validation & Error Matrix

| Condition                                                      | Required result                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Missing/invalid id, name, version or sdkapi                    | Stable `PLUGIN_PACKAGE_MANIFEST_*` violation                 |
| SDK requires category but category is absent                   | `PLUGIN_PACKAGE_MANIFEST_CATEGORY_REQUIRED`                  |
| Unknown/malformed/duplicate permission                         | Permission violation before build/upload                     |
| Packaged dev source/address remains enabled                    | `PLUGIN_PACKAGE_DEV_MODE_ENABLED`                            |
| Traversal, absolute/backslash path or duplicate/case collision | Entry path/collision violation before extraction             |
| Link/device/FIFO/unknown entry                                 | `PLUGIN_PACKAGE_ENTRY_TYPE_DENIED`                           |
| Missing/duplicate root Manifest or mismatched `_files`         | Manifest/file-map violation                                  |
| Entry/file/expanded/archive limit exceeded                     | Stable size/count violation                                  |
| Nexus target id/name/version differs from Manifest             | Expected identity/version mismatch; no package/version write |

### 5. Good / Base / Bad Cases

- Good: an official-style Manifest and safe root inventory pass CLI and Nexus with the same policy version and identity.
- Base: a UI-only plugin omits `main` but otherwise satisfies source and packaged profiles.
- Bad: Nexus normalizes `../`, backslashes or duplicate tar entries before policy, or preview returns a manifest from a package that publish would reject.

### 6. Tests Required

- Pure policy tests cover identity, SemVer, SDK/category, permissions, dev mode, every path/type collision, inventory limits, file-map parity and expected identity/version.
- CLI tests prove validate and builder emit stable policy codes and preserve intended widget/build failures after valid baseline fixtures.
- Nexus tests prove raw tar paths/types reach policy, preview/publish parity, and no object/version persistence on rejection.
- `pnpm plugins:validate` must run the shared source profile over every canonical repository Manifest.

### 7. Wrong vs Correct

#### Wrong

```ts
if (file.name.endsWith('.tpex') && file.size < 30 * 1024 * 1024) await upload(file)
```

#### Correct

```ts
const metadata = await extractTpexMetadata(bytes, expectedIdentity)
const failure = getTpexAdmissionFailure(metadata)
if (failure) throw createSafeAdmissionError(failure)
await uploadPluginPackage(file, bytes)
```

## Scenario: Deterministic TPEX Security Scan

### 1. Scope / Trigger

- Trigger: a finalized `.tpex` is scanned locally by Tuff CLI or admitted by Nexus after integrity and Package Policy validation.
- The scanner is static and bounded: it reads package inventory and text/binary content without executing plugin code or extracting untrusted paths.

### 2. Signatures

```ts
scanPluginPackage({
  artifactSha256,
  policyVersion,
  policyPassed,
  manifest,
  files,
  waivers,
}): PluginSecurityScanReport
```

The report carries scanner/rule-set versions, artifact digest, bounded findings, inspected counts, timestamps and one of `passed`, `review-required`, `blocked` or `unavailable`.

### 3. Contracts

- `packages/utils/plugin/security-scan.ts` owns stable rule/failure codes, limits, deterministic finding reduction, waiver application and report serialization. CLI and Nexus must not fork the rule set.
- CLI scans the actual finalized `.tpex`; it must not bind a package digest to content read from a separate staging directory.
- Nexus performs the authoritative scan before package object upload or version-row persistence. `critical`/`high`, timeout, invalid input, rule-engine failure and Package Policy prerequisite failure all fail closed.
- `medium`/`low` unwaived findings produce `review-required`; they stay visible to reviewers but do not masquerade as `passed`.
- Findings retain only stable code, severity, relative path, line/column, file hash and permission id. Reports must never contain the matched value, source snippets, private-key body, token or user path.
- Version rows persist only the scan decision, report digest, scanner/rule-set versions, finding count and completion time. Full reports are not copied into public plugin metadata.
- Waivers are Nexus-owned records keyed by artifact SHA-256 and rule id. They require an authenticated admin owner, non-empty reason and future expiry; revocation and expiry take effect immediately. Package content cannot declare a waiver.
- Private-key, high-confidence secret and raw runtime escape findings are not waivable. A valid waiver keeps the original finding and attaches bounded audit metadata.
- Scan lifecycle and waiver mutation write governance events without source or secret material.

### 4. Rule / Decision Matrix

| Condition                                                                                 | Required result                                                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Private key or high-confidence secret material                                            | Critical finding; `blocked`; non-waivable                                   |
| Raw Electron, raw transport, `ipcRenderer`, process binding or non-webpack require escape | Critical finding; `blocked`; non-waivable                                   |
| Dynamic execution marker, Node VM or native executable/addon                              | High finding; blocked unless an active server-owned waiver permits the rule |
| Capability reference lacks its declared permission                                        | High `PLUGIN_SCAN_PERMISSION_MISMATCH`                                      |
| Per-file/total/file-count limit or timeout exceeded                                       | `blocked` finding or `unavailable`; never pass                              |
| Scanner exception, invalid digest or missing policy prerequisite                          | `unavailable`; no package/version write                                     |
| Only valid waived findings remain                                                         | `passed`, with original findings and waiver metadata retained               |

### 5. Tests Required

- Shared scanner tests cover clean deterministic output, lexical ordering, every stable rule code, timeout/invalid input fail-closed, waiver validity/expiry and secret-leakage serialization.
- CLI tests construct a real policy-valid `.tpex`, prove the report digest matches that artifact and prove a raw runtime escape blocks.
- Nexus tests cover clean, secret, raw escape and native package admission plus server-provided waiver behavior.
- Waiver-store tests cover create, active lookup, expiry, revocation and memory/D1-compatible persisted state.
- A real canonical plugin build must produce a `.tpex` that passes the same scanner used by Nexus.

### 6. Wrong vs Correct

#### Wrong

```ts
const artifactSha256 = sha256(tpexBytes)
const files = readFiles('dist/build')
return scanPluginPackage({ artifactSha256, files })
```

#### Correct

```ts
const archive = readBoundedTpex(packagePath)
const report = scanPluginPackage({
  artifactSha256: sha256(archive.bytes),
  policyPassed: archive.integrityPassed && archive.policy.ok,
  manifest: archive.manifest,
  files: archive.files,
})
assertPluginSecurityScan(report)
```

## Scenario: Ed25519 Plugin Signing Trust Chain

### 1. Scope / Trigger

- Trigger: publishing, admitting, downloading, or installing a registry `.tpex`.
- The chain separates artifact integrity, publisher identity, Nexus review/admission, and CoreApp trust-root verification. A SHA-256 digest or legacy `key.talex` is never an identity signature.

### 2. Signatures

```ts
createPluginPublisherSignature(packagePath, channel, options): PluginPublisherSigningBundle
verifyPluginPublisherSignature(event, input): Promise<VerifiedPublisherSignature>
createPluginAdmissionAttestation(event, input): Promise<PluginAdmissionAttestationV1>
verifyPluginPackageTrust(filePath, metadata, options): Promise<PluginTrustVerificationResult>
```

Required secret inputs are `TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM` or `TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE`, `TUFF_PLUGIN_SIGNING_KEY_ID`, `PLUGIN_ATTESTATION_PRIVATE_KEY_PEM`, and `PLUGIN_ATTESTATION_KEY_ID`. CoreApp reads public `TUFF_PLUGIN_TRUST_ROOTS_JSON` and optional `TUFF_PLUGIN_REVOKED_PUBLISHER_KEYS_JSON` only.

### 3. Contracts

- `talex.plugin-signing/v1` binds policy version, plugin id/name/version, channel, artifact SHA-256/size, normalized Manifest `_files` digest, issue time, and optional expiry. Canonical JSON recursively sorts object keys and rejects non-JSON/non-finite values.
- CLI reads the finalized policy-valid `.tpex`, signs canonical UTF-8 bytes with Ed25519, self-verifies, and sends only the envelope, public key, key id, and validity metadata. Private key bytes never enter multipart data, package inventory, logs, config, or evidence.
- Nexus registers public keys to the authenticated publisher owner. Key ids are globally stable; conflicting owner/fingerprint, revoked keys, invalid time windows, or non-Ed25519 keys fail closed.
- Nexus publish verifies package digest/policy/integrity, publisher payload fields, Manifest file-map digest, payload digest, key ownership/status/time, and Ed25519 signature before scan/persistence. Approval re-runs the same verification against persisted Manifest/artifact fields before attestation; a prior `verifiedAt` flag is not sufficient.
- Nexus signs `talex.plugin-attestation/v1` only after policy pass, scan `passed|review-required`, and explicit approved review. The payload fixes issuer `tuff-nexus`, audience `talex-touch-core-app`, publisher key/envelope, scan report digest, reviewer identity/time, and `admission: eligible`.
- CoreApp registry installs verify downloaded size/SHA-256, strict attestation shape, specific issuer/audience/algorithm/decision codes, trusted Nexus root validity/signature, current publisher revocation, publisher key time/status/signature, and identity/version/channel before extraction or installer mutation.
- Publisher key revocation is append-only for trust decisions. Nexus immediately blocks affected versions and clears their admission attestation; CoreApp rejects new installs through the signed key-set/revocation input.
- Legacy unsigned versions are not back-signed. They remain ineligible and must be republished through the canonical CLI; local developer trust is a separate explicit path and cannot produce registry-trusted metadata.

### 4. Validation & Error Matrix

| Condition                                                                                         | Required result                                                             |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Missing/private key invalid or algorithm is not Ed25519                                           | CLI/Nexus fail before publish; no unsigned fallback                         |
| Publisher key unknown, wrong owner, not yet valid, expired, or revoked                            | Stable signing/trust code; no scan, attestation, listing, or install        |
| Artifact, size, identity, channel, policy version, file map, payload digest, or signature differs | Reject at publisher verification and again at review                        |
| Scan blocked/unavailable or review not approved                                                   | No Nexus attestation                                                        |
| Attestation root unknown/invalid/expired/revoked                                                  | CoreApp `PLUGIN_TRUST_KEY_*` failure before extraction                      |
| Wrong issuer/audience or algorithm downgrade                                                      | Specific issuer/audience/algorithm trust code, not generic success/fallback |
| Publisher key revoked after attestation                                                           | Nexus withdraws immediately; CoreApp rejects new install                    |

### 5. Good / Base / Bad Cases

- Good: CLI signs one finalized artifact; Nexus re-verifies it, scans and approves it, then CoreApp validates both signatures against the same artifact digest before installation.
- Base: old and new publisher keys overlap during rotation; either valid key verifies until its declared window ends, while evidence identifies the exact key id.
- Bad: call a digest `signature`, trust `key.talex`, attest a persisted `verifiedAt` flag without re-verifying, embed a private PEM, or let local-dev trust impersonate Nexus.

### 6. Tests Required

- Shared/CLI vectors cover canonical key order, strict normalization, real Ed25519 sign/verify, every payload-field and artifact tamper, invalid configuration, and private-material exclusion.
- Nexus tests cover memory/D1 key lifecycle parity, ownership, overlap/revocation/time windows, publish verification, review-stage re-verification, canonical attestation fields, and unavailable/invalid platform keys.
- CoreApp tests cover every stable failure code, env trust-root parsing, valid two-layer verification, publisher revocation, and a real install-queue proof that verification failure performs no extraction/finalization mutation.
- CLI core tests, Nexus typecheck/build, CoreApp node typecheck, focused signing tests, and `git diff --check` are required gates.

### 7. Wrong vs Correct

#### Wrong

```ts
if (sha256(download) === version.signature) await install(download)
```

#### Correct

```ts
const trust = await verifyPluginPackageTrust(downloadPath, registryMetadata)
if (!trust.ok) throw new PluginTrustError(trust.code)
await installer.installVerified(downloadPath)
```

## Scenario: Nexus Plugin Release Eligibility Gate

### 1. Scope / Trigger

- Trigger: returning plugin data from Store list, search, detail, versions, latest selection, or download; also any review, artifact, policy, scan, signature, attestation, or revocation transition.
- Dashboard owner/admin inspection remains separate from public eligibility and may show safe reason codes for ineligible versions.

### 2. Signatures

```ts
evaluatePluginReleaseEligibility(input: PluginReleaseEligibilityInput): PluginReleaseEligibility
getPluginVersionEligibility(plugin, version, audience): PluginReleaseEligibility
invalidatePluginVersionsForPublisherKey(event, keyId, actorId): Promise<number>
markPluginVersionAdmissionBlocked(event, pluginId, versionId, reason, actorId?): Promise<void>
```

The ordered stable reasons use the `PLUGIN_ELIGIBILITY_*` namespace. Human text, source snippets, storage paths, and full scan/signature records are not public contracts.

### 3. Contracts

- One pure projection combines plugin/version review, channel/audience, artifact state, policy, scan, publisher trust, Nexus attestation, admission decision, and revocation. Public endpoints never restate a subset of these checks.
- Public Store permits approved eligible `RELEASE` only. Explicit beta audience may include `BETA`; `SNAPSHOT` remains owner/admin-only. Dashboard visibility does not grant public download eligibility.
- Latest selection filters eligibility first, then compares channel, semantic version, and deterministic creation/id tie-breakers. A newer pending/rejected/private version never hides the previous eligible release.
- Existing rows hydrate missing policy/signature/attestation fields as `not-evaluated` and ineligible. Cryptographic eligibility cannot be backfilled; legacy artifacts require canonical republish.
- D1 and memory fallback persist the same artifact/admission/revocation fields and eligibility revision/reasons. Every review or trust-state transition increments the revision and appends a bounded timeline event.
- Store list/search/detail/versions omit plugins or versions with no eligible release. Download re-evaluates the exact requested version immediately before R2/object access and marks missing/digest-mismatched artifacts blocked.
- There is no cached public eligibility decision. Cacheable readme/assets do not authorize package download; if a future Store cache is added, eligibility revision must enter its key/invalidation path.
- Publisher revocation clears Nexus attestation, blocks admission, sets revocation time/reasons, recomputes latest eligible selection, and writes timeline evidence in the same operation.

### 4. Validation & Error Matrix

| Condition                                                                                                             | Required result                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Plugin/version not approved                                                                                           | Publicly ineligible; owner/admin receives safe reason code                                |
| Policy missing/failed, scan blocked/unavailable, publisher unverified, attestation missing, admission pending/blocked | Hidden from every public Store surface and download                                       |
| Artifact missing/quarantined or key/version revoked                                                                   | Immediate withdrawal before object retrieval                                              |
| Eligible old release plus newer pending/rejected release                                                              | Keep the old release as public latest                                                     |
| `BETA` on public audience or any `SNAPSHOT` public request                                                            | `PLUGIN_ELIGIBILITY_CHANNEL_PRIVATE`                                                      |
| No eligible version remains                                                                                           | Omit plugin from list/search/detail; download returns safe unavailable/not-found response |

### 5. Good / Base / Bad Cases

- Good: one reviewed, policy-valid, scanned, publisher-verified, Nexus-attested RELEASE appears identically in list/search/detail/versions and downloads after exact re-evaluation.
- Base: version 1.0 remains eligible while 2.0 is pending; Store continues selecting 1.0 and Dashboard explains 2.0's reasons.
- Bad: list checks only plugin approval, detail checks only version status, download trusts a cached latest pointer, or revocation waits for TTL expiry.

### 6. Tests Required

- Pure matrix tests cover every status/channel/audience/artifact/policy/scan/publisher/attestation/admission/revocation dimension and stable reason order.
- Store API tests prove list/search/detail/versions/download consistency, beta/snapshot boundaries, old-release fallback, missing artifact, digest mismatch, and safe public responses.
- Store tests exercise memory and D1 parity. Revocation tests assert attestation clearing, blocked admission, revision/reason updates, latest recomputation, and timeline evidence.
- Nexus typecheck, focused API/store tests, and production build are required. The API route-tree guard has a repository-wide pre-existing failure if unrelated test files remain under `server/api`; it is not replaced by a narrowed pass claim.

### 7. Wrong vs Correct

#### Wrong

```ts
if (plugin.status === 'approved' && version.status === 'approved') return download(version.packageKey)
```

#### Correct

```ts
const eligibility = getPluginVersionEligibility(plugin, version, 'public')
if (!eligibility.eligible) throw createSafeUnavailableError(eligibility.reasons)
return getVerifiedPluginPackage(version)
```

## Scenario: Canonical Plugin Source Package Audit

### 1. Scope / Trigger

- Trigger: building an official or release-supported plugin artifact for Nexus admission, bundled projection, or release evidence.
- The boundary spans the versioned release-target registry, canonical plugin source, Tuff CLI prerequisites, package policy, security scan, publisher signature, CoreApp bundled projection, and machine-readable audit evidence.

### 2. Signatures

```text
pnpm plugins:release:audit -- [--target <plugin>] [--repeat 1|2]
  [--allow-dirty] [--ephemeral-signing] [--skip-prerequisites]
  [--output <report.json>]
```

```ts
interface PluginReleaseTarget {
  pluginName: string
  packageName: string
  root: string
  manifest: string
  bundledProjection?: string
  gates: {
    build: CommandSpec
    test: CommandSpec | NotApplicableGate
    typecheck: CommandSpec | NotApplicableGate
    lint: CommandSpec | NotApplicableGate
  }
}
```

`scripts/lib/plugin-release-targets.cjs` owns the ordered prerequisites and targets. `scripts/plugin-source-package-audit.ts` emits `talex.plugin-source-audit/v1`.

### 3. Contracts

- Copy canonical source into an isolated temporary workspace. Exclude every `node_modules`, nested `dist`, and existing `.tpex`; no generated archive may become build input.
- Derive `SOURCE_DATE_EPOCH` from the audited Git revision unless the caller supplies the same explicit epoch. Widget compilation uses build-relative POSIX paths for compiler ids and filenames, then sorts extracted styles by source path and external dependencies lexically.
- Run prerequisites and target gates in registry order. `test`, `typecheck`, or `lint` may be skipped only through a registry `notApplicable: true` entry with a non-empty reason.
- Read the final `.tpex` back through the bounded security reader. Package Policy, `_files` integrity, security scan, publisher signature, Manifest/package identity, and configured bundled projection must all bind to the audited content.
- Projection freshness compares normalized relative-path/SHA-256 inventories. Equal versions never substitute for content equality.
- Repeat mode compares normalized inventory digests separately from archive-container SHA-256. Container bytes may differ because of archive/signature metadata; the report must say `artifactContainer: different` instead of claiming byte reproducibility.
- Reports contain source revision, dirty policy, tool versions, sanitized command results, relative artifact paths/digests, gate applicability, decisions, and stable blockers. They never contain raw logs, absolute temporary paths, tokens, passwords, secrets, or private-key material.
- `--ephemeral-signing` produces local evidence only. Release-candidate evidence requires configured signing material and must not relabel an ephemeral audit as trusted release proof.

### 4. Validation & Error Matrix

| Condition                                                                   | Required result                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Unknown target, invalid repeat, dirty scoped source without opt-in          | Reject before prerequisites or target build                                   |
| Prerequisite or required target gate fails                                  | Stop in deterministic order; emit failed record with bounded sanitized reason |
| Stale/nested `.tpex`, `dist`, or `node_modules` exists in source            | Exclude from staging; never consume as input                                  |
| Manifest/package identity or version differs                                | Reject the target before evidence can pass                                    |
| `_files` mismatch, untracked archive entry, policy failure, or scan failure | Reject the final artifact                                                     |
| Bundled projection missing, extra, or changed content                       | Reject with bounded relative-path differences                                 |
| Repeated normalized inventory digest differs                                | `normalizedInventory: failed`; overall audit fails                            |
| Signing key absent without explicit ephemeral mode                          | Reject; do not fabricate a signature state                                    |

### 5. Good / Base / Bad Cases

- Good: clean canonical sources pass declared gates twice, both normalized inventories match, policy/scan/signature pass, bundled projections match, and the report binds each retained artifact SHA-256.
- Base: archive-container hashes differ while normalized inventories match. The audit passes content reproducibility and reports the container difference explicitly.
- Bad: copying an existing `dist/build`, accepting version-only projection parity, using host absolute paths as Vue compiler ids, or marking a missing test command as implicitly optional.

### 6. Tests Required

- Registry tests assert exact prerequisite/target order and a reason for every non-applicable gate.
- Staging tests prove nested `dist`, `node_modules`, and case-insensitive `.tpex` files are excluded.
- Inventory tests prove lexical path normalization, symlink rejection, digest order independence, and digest sensitivity to content.
- Command tests prove exit-code capture plus bounded path/token/secret/password/PEM redaction.
- Builder tests prove stable widget compiler ids, source-ordered styles, dependency ordering, and repeatable normalized projection inventory.
- Functional audit runs twice for every registered target and proves gate, policy, scan, signature, projection, and aggregate status fields.

### 7. Wrong vs Correct

#### Wrong

```ts
const artifact = findExistingTpex(pluginRoot)
if (bundledManifest.version === sourceManifest.version) markProjectionFresh(artifact)
```

#### Correct

```ts
const staging = await createIsolatedSourceWorkspace(target)
const artifact = await buildCanonicalTarget(staging, sourceRevision)
const inventory = readVerifiedArtifactInventory(artifact)
assertProjectionInventory(target.bundledProjection, inventory)
writeAuditRecord({ sourceRevision, artifactSha256: sha256(artifact), inventory })
```

## Scenario: Owner-Bound Fixed Window Presets

### 1. Scope / Trigger

- Trigger: the isolated `touch-window-presets` Prelude needs Windows window counts, two fixed layouts, or bulk topmost cleanup.
- This boundary spans the child facade, exact capability DTOs, main-owned selection, fixed PowerShell/Win32 execution, process ownership, and activation teardown.

### 2. Signatures

```ts
type WindowPresetRequest =
  | { operation: 'status' }
  | {
      operation: 'run-action'
      actionId: 'preset-two-column' | 'preset-dev-split' | 'preset-clear-topmost'
    }

type WindowPresetResult =
  | { operation: 'status'; status: 'available'; windowCount: number }
  | { operation: 'status'; status: 'blocked' | 'failed'; reason: string }
  | {
      operation: 'run-action'
      actionId: WindowPresetRequest['actionId']
      status: 'completed'
      affectedWindows: number
    }
  | {
      operation: 'run-action'
      actionId: WindowPresetRequest['actionId']
      status: 'blocked' | 'failed'
      reason: string
    }
```

The fixed capability ID is `system.window-presets`. The child projection is
`plugin.windowPresets.status()` plus `plugin.windowPresets.runAction(actionId)`.

### 3. Contracts

- Project the facade only when the exact capability is declared and the immutable manifest name is `touch-window-presets`. Do not project `system.invoke` or another plugin's system IDs.
- Child input contains only `operation` and, for execution, one fixed `actionId`. It cannot carry scripts, PowerShell, coordinates, handles, PIDs, commands, arguments, environment, cwd, executable, or platform.
- Main enumerates at most 128 visible windows and returns only a count. Names, titles, PIDs, handles, native paths, scripts, stderr, and errors never cross to the child.
- Main selects the first two ordered windows or the terminal/browser development pair. Handles originate only from the bounded host enumeration and match canonical positive decimal strings before entering fixed script templates.
- The branded executor uses only `<drive>:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, `shell: false`, fixed arguments, fixed cwd, two environment keys, hidden windows, piped stdout, and ignored stdin/stderr. Reject UNC roots and redirected non-Windows directories.
- Require current plugin-host authority, activation identity, host generation, manifest declaration, and current `system.shell` on every call and before/after each process boundary.
- Bound stdout to 256 KiB with stateful UTF-8 decoding; reject more than 128 windows, duplicate handles, oversized names/titles, extra fields, malformed JSON, and mismatched action summaries.
- Caller abort, timeout, permission revoke, disable, crash, and generation rotation terminate each owned process at most once and await the real `exit` event. A kill request alone is not a cleanup barrier.

### 4. Validation & Error Matrix

| Condition                                                | Required result                                       |
| -------------------------------------------------------- | ----------------------------------------------------- |
| Unknown action or any child authority field              | Invalid request before host work                      |
| Non-Windows platform                                     | Stable `platform-unsupported`; no spawn               |
| Permission missing/revoked/unavailable                   | Stable permission failure; no new process             |
| Fewer than two layout windows or no cleanup windows      | `insufficient-windows`; no action process             |
| Malformed/oversized/extra-field enumeration              | `status-failed` or `execution-failed`; no host detail |
| Executor is copied, proxied, or not fixed-factory issued | Reject capability construction                        |
| Cancel/revoke/close after process acquisition            | Kill once and await real exit                         |
| Old activation or host generation calls/replies          | Reject/ignore; no window mutation                     |

### 5. Good / Base / Bad Cases

- Good: `preset-dev-split` enumerates in main, selects one terminal and one browser, executes one fixed layout script, and returns only `{ status: 'completed', affectedWindows: 2 }`.
- Base: a non-Windows activation receives `platform-unsupported` without permission or process work.
- Bad: accept a child window handle, coordinate, script, `powershell.exe` argument, inherited environment, or generic `system.runAction()` fallback.

### 6. Tests Required

- DTO tests reject scripts, coordinates, handles/window IDs, command/args/env/cwd/platform, proxies, accessors, unknown IDs, and cross-variant result fields.
- Host tests cover bounded count, development selection, all three fixed actions, malformed/oversized results, unsupported platform, permission denial/revoke, caller cancel, stale activation/host generation, and structural executor rejection.
- Process tests separate spawn, stdout, kill request, and true exit; split a multibyte title across chunks and overflow stdout before exit.
- Child tests prove declaration and plugin-name gating, fixed local allowlist, frozen null-prototype facade, constructor containment, and absence of generic `system`.
- Real Electron smoke loads the actual Prelude twice with a fake fixed executor; prove deny/grant, status/action, PID/handle/generation rotation, stale old-port denial, and teardown without running a real window or OS action.

### 7. Wrong vs Correct

#### Wrong

```ts
execFile('powershell.exe', ['-Command', request.script])
```

#### Correct

```ts
const windows = await enumerateOwnedWindows(signal)
const pair = selectFixedPresetPair(request.actionId, windows)
const process = fixedExecutor.start({ operation: 'layout-windows', ...pair })
await process.started()
await process.wait() // real exit barrier
```

## Scenario: Owner-Bound Window Manager Tokens

### 1. Scope / Trigger

- Trigger: the isolated `touch-window-manager` Prelude needs to enumerate and act on desktop windows or reopen an application already present in the current host inventory.
- This boundary spans `system.window-manager`, child facade projection, host-only native inventory, activation-local opaque tokens, fixed Windows/macOS execution, permission revoke, and process teardown.

### 2. Signatures

```ts
type WindowManagerAction =
  | 'activate'
  | 'snap-left'
  | 'snap-right'
  | 'topmost-toggle'
  | 'close'
  | 'hide'
  | 'quit'
  | 'launch'

type WindowManagerRequest =
  | { operation: 'list' }
  | { operation: 'act'; action: WindowManagerAction; token: `wm_${string}` }

type WindowManagerDisplayItem =
  | {
      kind: 'window'
      token: string
      name: string
      title: string
      isFront: boolean
      topmost: boolean
      actions: readonly WindowManagerAction[]
    }
  | {
      kind: 'app'
      token: string
      name: string
      running: true
      actions: readonly ['launch']
    }
```

The child projection is exactly `plugin.windowManager.list()` and
`plugin.windowManager.act(action, token)`. The facade exists only for the immutable
manifest name `touch-window-manager` with the declared `system.window-manager` ID.

### 3. Contracts

- `list` runs a branded main-owned Windows PowerShell/Win32 or macOS JXA inventory. It validates at most 128 windows and 64 running applications before returning redacted display fields plus random 192-bit tokens. HWND, PID, start identity, bundle ID, application path, executable, script, stderr, and native errors remain in main.
- Every successful list starts a new bounded epoch and retires all prior tokens. Tokens expire after 10 seconds, are single-use, never reissued from a bounded no-reuse history, and are owned by one activation plus its current host generation.
- `act` accepts exactly `{ operation, action, token }`. Unknown, expired, replayed, previous-epoch, cross-plugin, cross-generation, and cross-host tokens fail before mutation.
- Before acting, main reruns the bounded inventory and matches process/window identity using the host-only PID, native ID, process start identity, and canonical application identity. A reused handle or replaced process fails as `native-replaced`. The fixed mutation process must repeat the PID/start plus HWND or Bundle identity check immediately before mutation; a successful prior inventory process is not an atomic authorization for a later action process.
- Windows mutation scripts contain only fixed host-selected operations and validated numeric native IDs. Native process names and titles never enter a mutation script. macOS JXA uses fixed `run(argv)` programs and validated PIDs; no child or native display string enters source text.
- `launch` never accepts or executes a child/app path or arbitrary app name. It only activates an application that is still present in the current inventory: Windows rechecks PID/start identity and activates that process's current main window; macOS rechecks PID/launch time/Bundle ID in fixed JXA and activates that exact `NSRunningApplication`. Persisted recent-window launch is intentionally unsupported because tokens cannot survive a list epoch or activation.
- Require authoritative activation, host generation, manifest declaration, and current `system.shell` before and after list, revalidation, process start, and process exit. Cancel, timeout, revoke, disable, crash, and rotation retire tokens, terminate each owned process at most once, and await the real exit event.
- The Prelude awaits list, action, clear, and push calls. Item payloads contain only `{ action, token }`; plugin storage, permission SDKs, process globals, child process APIs, raw handles, platform scripts, and generic system/window-presets facades are absent.

### 4. Validation & Error Matrix

| Condition                                                                  | Required result                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Extra request field, raw handle/PID/path/app name/script/args/env/platform | Invalid request before native work                   |
| Unknown or foreign token                                                   | `token-invalid`; no revalidation or mutation         |
| Previous list epoch or consumed token                                      | `token-replayed`; no mutation                        |
| Token exceeds TTL                                                          | `token-expired`; no mutation                         |
| Native PID/handle/start/app identity changed                               | `native-replaced`; no mutation                       |
| Action not valid for the token kind/platform                               | `action-unsupported`; no action process              |
| Malformed, proxied, oversized, duplicate, or over-count inventory          | `list-failed` / `action-failed`, redacted            |
| Permission denied/revoked/unavailable                                      | Stable capability permission failure; no new process |
| Cancel/revoke/close after process acquisition                              | Kill once and await the real exit event              |
| Copied/proxied/non-factory service                                         | Reject capability construction                       |

### 5. Good / Base / Bad Cases

- Good: list returns `Terminal / Workspace` with a short-lived token; `snap-left` consumes it, reenumerates the same native identity, runs one fixed Win32 script, and returns only `{ operation: 'act', action: 'snap-left', status: 'completed' }`.
- Base: a token expires while the result remains visible, so the action reports that the list must be refreshed and performs no host mutation.
- Bad: persist HWND/PID/path in plugin storage, build AppleScript from an app title, pass `Start-Process` a child/native path, accept arbitrary launch text, reuse a token after another list, or route through `system.invoke` / `system.window-presets`.

### 6. Tests Required

- DTO tests reject extra fields, raw handles, PIDs, paths, names, scripts, unknown actions, proxies/accessors, malformed tokens, and cross-variant results.
- Token tests cover unknown, cross-plugin, cross-generation, cross-host, previous list epoch, exact TTL expiry, replay, bounded no-reuse history, request-validation preservation, admitted-action failure consumption, and native identity replacement across both the inventory/action boundary and the final mutation boundary.
- Native tests cover Windows and macOS action subsets, bounded/oversized output, duplicate identities, fixed executable/options, no title interpolation, and path-free launch execution.
- Lifecycle tests cover permission deny/revoke, caller cancellation, timeout, reentrant/normal close, one kill request, real exit barriers, and token invalidation on teardown.
- Child tests prove exact declaration/plugin gating, fixed action membership, token validation after intrinsic mutation, frozen null-prototype methods, constructor containment, and absence of generic system/window-presets facades.
- Real Electron smoke loads the actual Prelude in two generations and uses only an in-memory fake native service. Assert distinct utility PIDs/handles/generations, deny/grant, list/action, restart rotation, stale old-port denial, and cleanup; never execute a real window or OS action.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn('powershell.exe', ['-Command', buildScript(request.handle, request.title)])
spawn(request.appPath ?? request.appName)
```

#### Correct

```ts
const owned = consumeActivationToken(request.token)
const current = await fixedService.list(signal)
const target = requireSameNativeIdentity(owned.target, current)
const process = fixedService.startAction(request.action, target)
await process.started()
await process.wait()
assertCurrentActivationAndPermission()
```

## Scenario: Owner-Bound Workspace Script Tokens

### 1. Scope / Trigger

- Trigger: the isolated `touch-workspace-scripts` Prelude needs to select one local workspace, list its declared package scripts, or run one selected script.
- This boundary spans `process.workspace-scripts`, main-owned directory selection and confirmation, canonical filesystem identity, activation-local opaque tokens, fixed package-manager execution, and process teardown.

### 2. Signatures

```ts
type WorkspaceScriptRequest =
  | { operation: 'select-workspace' }
  | { operation: 'list-scripts'; workspaceToken: `ws_${string}` }
  | { operation: 'run-script'; scriptToken: `wss_${string}` }

type WorkspaceScriptDisplay = {
  token: string
  name: string
}
```

The child projection is exactly `plugin.workspaceScripts.select()`,
`plugin.workspaceScripts.list(workspaceToken)`, and
`plugin.workspaceScripts.run(scriptToken)`. It exists only for the immutable manifest name
`touch-workspace-scripts` with the declared `process.workspace-scripts` ID.

### 3. Contracts

- The child can supply only an operation and one opaque token. It cannot supply a path, cwd, package name, script name, script body, command, executable, argument, environment, shell option, platform, or confirmation result.
- Main owns the directory dialog. Selection accepts only a canonical, non-symlink directory with a canonical, non-symlink regular `package.json`; root and package `dev`/`ino` identities are retained and revalidated after reads, after confirmation, immediately before spawn, and after the real spawn acknowledgement.
- Read at most 256 KiB from an `O_NOFOLLOW` package handle, verify handle identity before and after the read, parse JSON once, and accept at most 128 exact script names matching the bounded host grammar. Script bodies remain in main and are represented by SHA-256 digests.
- Workspace tokens use 192 random bits, expire after five minutes, allow at most 32 list uses, and rotate on selection. Script tokens use 192 random bits, expire after two minutes, rotate on every list, and are consumed once before revalidation or confirmation. Retired tokens are retained in a bounded no-reuse history.
- Require current plugin-host authority, activation identity, host generation, and `fs.read` on every call. Running additionally requires current `system.shell` before confirmation and before/after process acquisition.
- Main shows the workspace and script name and warns that package scripts are project-owned arbitrary code. Denial performs no spawn. After confirmation, revalidate root/package identity and the exact script digest before spawning; the branded process adapter receives the retained workspace identity rather than a bare cwd.
- Execution is fixed to an absolute canonical pnpm executable resolved from the main-owned PATH, `run <host-owned-script-name>`, `shell: false`, ignored stdio, a bounded environment snapshot, and the canonical workspace cwd. Relative/empty PATH entries and package-manager override variables are removed. On Windows, main invokes fixed `%SystemRoot%\\System32\\cmd.exe` with `/d /s /c`, `windowsVerbatimArguments: true`, and one quoted command string containing the absolute canonical `pnpm.cmd` plus the validated host-owned script name; unsafe expansion/metacharacter executable paths fail closed and the child controls none of those fields.
- At most two owned script processes may run. Caller abort, permission revoke, disable, crash, restart, and host-generation rotation retire tokens, issue at most one kill per process, and await the real child-process `exit` event.

### 4. Validation & Error Matrix

| Condition                                                                       | Required result                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Extra field or child path/name/command/executable/args/env/shell/platform       | Invalid request before dialog, read, confirmation, or spawn |
| Unknown, expired, replayed, prior-epoch, or stale-generation token              | Stable blocked/stale result; no privileged work             |
| Symlink, non-canonical root/package, replaced `dev`/`ino`, or oversized package | Stable invalid/replaced result; no spawn                    |
| Script body missing or digest changed before execution                          | `script-changed`; no spawn                                  |
| `fs.read` or `system.shell` denied/revoked/unavailable                          | Stable permission result; no new process                    |
| Confirmation denied/unavailable                                                 | Stable blocked/failed result; no spawn                      |
| More than two active owned processes                                            | `process-limit`; no additional spawn                        |
| Copied/proxied/non-factory host or process adapter                              | Reject capability construction/acquisition                  |
| Cancel/revoke/close after process acquisition                                   | Kill once and await the real `exit` event                   |

### 5. Trust Boundary

- Main does not trust the Prelude with filesystem selection, absolute paths, script bodies, command parsing, execution fields, permission decisions, confirmation, or process ownership.
- A selected `package.json` script is intentionally project-owned code. Once the user confirms its displayed workspace and script name, that script may perform arbitrary actions with the privileges of the application process. This capability constrains which selected script can be launched and prevents child-selected shell authority; it is not an OS sandbox for project code.
- Revalidation narrows accidental or adversarial drift before spawn, but package-manager execution necessarily reads project state from the selected workspace. Strong protection against a concurrently malicious local filesystem owner requires an OS sandbox or immutable workspace snapshot and is outside this utility-process boundary.

### 6. Tests Required

- DTO tests reject paths, names, commands, executable/args/env/cwd/shell/platform, extra fields, proxies/accessors, malformed tokens, and cross-variant results.
- Filesystem tests cover canonical roots, symlinked/replaced roots and packages, bounded reads/parsing/counts, package replacement, script drift, and digest revalidation after confirmation.
- Token tests cover unknown, exact TTL expiry, replay, list/selection epoch rotation, bounded workspace uses, no-reuse history, cross-activation, and cross-host generation.
- Process tests cover absolute main-owned package-manager resolution, relative PATH and environment override removal, fixed POSIX and quoted Windows invocation, safe environment/options, confirmation denial, confirmation/spawn-window replacement, process limits, structural adapter rejection, spawn acknowledgement, cancellation/revoke, idempotent kill, and true exit barriers.
- Child tests prove exact declaration/plugin gating, frozen null-prototype facade, token-only calls, constructor containment, and absence of filesystem, shell, dialog, permission, storage, or generic process facades.
- Real Electron smoke loads the official Prelude in two generations using only fake selection, confirmation, and process adapters. It proves deny/grant, select/list/run, token redaction, rotation, stale-port denial, and awaited cleanup without executing a real package script.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn(request.executable, request.args, { cwd: request.workspacePath, shell: true })
```

#### Correct

```ts
const owned = consumeScriptToken(request.scriptToken)
const current = await readCanonicalPackage(owned.workspace)
assertSameScriptDigest(owned, current)
await confirmInMain(owned.workspace.displayName, owned.scriptName)
const revalidated = await readCanonicalPackage(owned.workspace)
assertSameScriptDigest(owned, revalidated)
const process = fixedHost.startScript(revalidated.root, owned.scriptName)
await process.started()
```

## Scenario: Activation-Bound Fixed Browser Open

### 1. Scope / Trigger

- Trigger: the isolated `touch-browser-open` Prelude needs the main-owned browser inventory or needs to open one validated HTTP(S) URL in the default or a specifically listed browser.
- Search suggestions remain on the existing bounded, DNS-pinned, no-redirect `http.request` capability and never pass through browser-opening authority.

### 2. Signatures

```ts
type BrowserOpenRequest = { operation: 'list' } | { operation: 'open'; url: string; browserToken?: `bo_${string}` }

type BrowserOpenDisplay = {
  token: string
  id: string
  name: string
}

type BrowserOpenListResult = {
  operation: 'list'
  status: 'available'
  defaultAvailable: true
  browsers: BrowserOpenDisplay[]
}
```

The child projection is exactly `plugin.browser.list()` and `plugin.browser.open(url, browserToken?)`. It exists only for the immutable manifest name `touch-browser-open` with the declared `system.browser-open` ID.

### 3. Contracts

- The child can supply only an operation, one URL, and an optional opaque browser token. It cannot supply a browser path, executable, argument, script, command, shell option, platform, environment, cwd, or native identity.
- Main owns browser discovery and the trusted platform inventory. Specific-browser entries retain native `dev`/`ino` identity and are revalidated immediately before launch.
- Browser tokens use 192 random bits, expire after 30 seconds, are bound to plugin activation, host generation, and inventory epoch, and are consumed once. Every inventory refresh rotates the epoch; a late response from an older concurrent refresh is rejected, and retired values remain in a bounded no-reuse history.
- `list` requires current `system.shell`; `open` requires current `system.shell` and `network.internet`. Permission checks occur on every call and again before privileged launch.
- Accept only bounded `http:` and `https:` URLs without credentials or control characters. Main parses and canonicalizes the URL and passes it unchanged to a fixed launcher.
- Launchers are fixed and shell-free: macOS `/usr/bin/open`, Windows fixed System32 `rundll32.exe` for default opening or fixed PowerShell for an inventory-owned browser, and POSIX `/usr/bin/xdg-open`. Child input never selects an executable or argument shape.
- The main capability owns every launched process. Caller abort, permission revoke, disable, crash, restart, and host-generation rotation retire tokens, issue at most one kill, and await the real process `exit` event.
- Recent-browser storage contains display metadata only. A later use must call `list` and obtain a fresh authority token; no opaque token or native path is persisted.

### 4. Validation & Error Matrix

| Condition                                                                            | Required result                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| Extra field or child path/executable/args/script/command/shell/platform/env/cwd      | Invalid request before discovery or launch |
| Non-HTTP(S), credentialed, oversized, malformed, or control-character URL            | Stable blocked result; no launch           |
| Unknown, expired, replayed, prior-epoch, stale-activation, or stale-generation token | Stable blocked/stale result; no launch     |
| Specific browser path or `dev`/`ino` identity changed                                | Stable replaced result; no launch          |
| Required permission denied, revoked, or unavailable                                  | Stable permission result; no new process   |
| Copied/proxied/non-factory discovery or process adapter                              | Reject capability construction/acquisition |
| Cancel/revoke/close after process acquisition                                        | Kill once and await the real `exit` event  |

### 5. Trust Boundary

- Main does not trust the Prelude with browser discovery, installation paths, native identity, URL policy, permission decisions, executable selection, arguments, process ownership, or shell access.
- `network.internet` authorizes navigation to an arbitrary validated public HTTP(S) URL. This capability does not classify the destination as safe content and does not prevent a chosen browser from applying its own URL handlers, extensions, profile policy, or update behavior.
- Inventory trust is platform-specific and fixed in main. Linux default opening intentionally does not expose a discoverable specific-browser inventory; expanding that surface requires a new threat review rather than child-supplied executable data.

### 6. Tests Required

- DTO tests reject hostile URL variants, paths, scripts, commands, executables, arguments, shell, platform, environment, cwd, extra fields, accessors, proxies, and malformed tokens.
- Token tests cover unknown, exact TTL expiry, replay, inventory epoch rotation, no-reuse history, cross-activation, and cross-host generation.
- Native identity tests cover replacement after listing. Launcher tests assert exact fixed macOS, Windows, and Linux executable/argument contracts with `shell: false`.
- Permission/process tests cover shell/network denial and revoke, caller cancellation, close, idempotent kill, structural adapter rejection, process acknowledgement, and true exit barriers.
- Child tests prove exact declaration/plugin gating, frozen null-prototype facade, URL/token-only calls, constructor containment, and absence of filesystem, shell, process, permission, or native inventory facades.
- Real Electron smoke loads the official Prelude in two generations using only fake inventory, HTTP, and process adapters. It proves deny/grant, default/specific/search flows, token rotation, stale-port denial, and awaited cleanup without real browser, network, or OS activity.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn(request.browserPath, [request.url], { shell: true })
```

#### Correct

```ts
const target = request.browserToken ? consumeAndRevalidateInventoryToken(request.browserToken) : DEFAULT_BROWSER
const url = parseAllowedHttpUrl(request.url)
await assertCurrentPermissions(['system.shell', 'network.internet'])
await fixedBrowserHost.open(target, url)
```

## Scenario: Activation-Bound Browser Data Scan

### 1. Scope / Trigger

- Trigger: the isolated `touch-browser-data` Prelude needs local Chromium bookmarks or a bounded recent-history window.
- The boundary spans the exact `browser-data.scan` DTO, main-owned platform roots, temporary SQLite copies, activation permissions, child result projection, and cleanup barriers.

### 2. Signatures

```ts
type BrowserDataScanRequest = {
  operation: 'scan'
  sources: readonly ('bookmarks' | 'history')[]
  browser?: 'chrome' | 'edge' | 'brave' | 'arc'
}

type BrowserDataRecord = {
  source: 'bookmarks' | 'history'
  browser: 'chrome' | 'edge' | 'brave' | 'arc'
  browserName: string
  profile: string
  title: string
  url: string
  folder?: string
  visitedAt?: number
}

type BrowserDataScanResult =
  | { operation: 'scan'; status: 'completed'; records: BrowserDataRecord[]; diagnostics: BrowserDataDiagnostic[] }
  | {
      operation: 'scan'
      status: 'blocked'
      code: 'BROWSER_DATA_SOURCE_DISABLED' | 'BROWSER_DATA_PLATFORM_UNSUPPORTED'
      records: []
      diagnostics: []
    }
```

The child projection is exactly `plugin.browserData.scan(sources, browser?)`. It exists only for the immutable manifest name `touch-browser-data` with the declared `browser-data.scan` ID.

### 3. Contracts

- Child input contains only a non-empty unique source list and an optional fixed browser id. Paths, SQL, profile names, platform, time windows, limits, temp roots, and permission decisions remain in main.
- Main derives fixed Chromium roots from `home`, platform config data, and Windows `LOCALAPPDATA`. Canonical roots and profile directories must be non-symlink directories with stable `dev`/`ino` identity inside those main-owned parents.
- Bookmarks are read through an `O_NOFOLLOW` handle, bounded to 4 MiB, and revalidated before return. Profile enumeration stops after 128 entries without first materializing an unbounded directory, and parsing is iterative and bounded by depth/member/record limits.
- History never queries the live browser database. The temp root must itself be a canonical non-symlink directory before `mkdtemp`; a pre-positioned symlink is rejected before browser bytes are copied. Main snapshots the regular database plus bounded `-wal`/`-shm` sidecar membership and each file's `dev`/`ino`/`size`/`mtimeNs`/`ctimeNs`, copies them through revalidated `O_NOFOLLOW` handles into one private temp directory, then repeats the complete set snapshot. A new, removed, replaced, resized, or modified member rejects the copy before query. Only then may a worker execute the fixed `chromium-history` query with host-owned lower/upper visit-time parameters against that owned copy.
- Worker `readOnly` means query-only protocol admission. It does not rely on unsupported libSQL `?mode=ro` URI behavior; the original browser file remains protected because only the temporary copy is opened.
- Every temp directory is removed after success, failure, cancellation, revoke, and close. Cleanup failure is a stable terminal error and must not be swallowed, including copy-acquisition rollback.
- `fs.read` is required for every scan. `fs.index` is required only when an enabled history source is admitted; disabling history must not block bookmarks.
- Activation, host generation, permission, and enabled-source state are rechecked before and after privileged work. Revoke/disable aborts the fixed query and `close()` waits for active cleanup.
- Return at most 100 records and 768 KiB. Aggregate truncation marks the source diagnostic `partial`. Display text replaces C0/C1 controls with normalized spaces, URLs containing control characters are dropped, and results contain only canonical public HTTP(S) URLs, safe timestamps, and stable diagnostics. No path, SQL, native error, `dev`/`ino`, database name, or temp identity crosses to the child.

### 4. Validation & Error Matrix

| Condition                                                                                       | Required result                                                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Extra field, duplicate source, path, SQL, profile, platform, or unknown browser                 | Invalid request before filesystem/query work                                   |
| C0/C1 controls in URL or display fields                                                         | Drop the URL record or normalize display controls before child projection      |
| Source disabled by current main registry                                                        | Omit it; if none remain, `BROWSER_DATA_SOURCE_DISABLED`                        |
| `fs.read` missing/unavailable                                                                   | Stable permission result; no file open                                         |
| Enabled history with `fs.index` missing/unavailable                                             | Stable permission result; bookmarks remain available when requested separately |
| Root/profile/file or temp root is symlinked, non-canonical, non-regular, replaced, or oversized | Per-source safe diagnostic; no leaked path/native error                        |
| Database/WAL/SHM membership or fingerprint changes during the complete copy                     | Reject and remove the copy before query; stable safe diagnostic                |
| Query-only worker receives execute, transaction, multiple statements, PRAGMA, or ATTACH         | Stable SQL-policy rejection; database remains unchanged                        |
| SQLite rows exceed the fixed per-profile limit                                                  | `BROWSER_DATA_RESULT_LIMIT`; discard that profile                              |
| Caller abort, permission revoke, stale generation, or close                                     | Abort query, remove temp copy, await cleanup barrier                           |
| Temp cleanup fails during success or rollback                                                   | `BROWSER_DATA_TEMP_CLEANUP_FAILED`; never silently leave browser data          |
| Arc requested on Linux or another unavailable fixed browser                                     | Stable `BROWSER_DATA_PLATFORM_UNSUPPORTED`; no arbitrary fallback              |

### 5. Good / Base / Bad Cases

- Good: Chrome history is copied to one private temp directory, queried with fixed SQL, projected to bounded URL/title/time fields, then removed before the capability settles.
- Base: history is disabled or lacks `fs.index`; bookmarks still scan through the fixed JSON path with no history query.
- Bad: pass a child path or SQL string, query the live database, follow a symlinked temp root, query a DB/WAL/SHM set that changed during acquisition, inherit arbitrary browser profile locations, open a SQLite URI selected by the child, or swallow temp cleanup failure.

### 6. Tests Required

- DTO tests reject authority fields, paths, SQL, duplicate/unknown sources, extra keys, accessors, proxies, and malformed results before host work.
- Filesystem tests cover fixed macOS/Windows/Linux roots, unsupported Arc on Linux, bounded directory enumeration, symlink/non-regular/oversized inputs, canonical temp-root rejection, database/WAL/SHM copy and whole-set drift, host-owned SQL time bounds, row/result limits, partial diagnostics, control-character sanitation, schema-error redaction, and path/native-field exclusion.
- Permission/lifecycle tests cover disabled history without index permission, read/index denial, revoke during query, stale activation, close waiting, and cleanup after success/failure/cancel.
- Worker tests prove `readOnly` owners can query the owned copy; reject execute, transaction, multiple-statement, PRAGMA, and ATTACH operations; preserve ordinary plugin SQLite behavior; and retain the 64 MiB quota.
- Child tests prove exact manifest/declaration gating, frozen null-prototype facade, fixed browser/source membership, constructor containment, and no filesystem/SQLite/process surface.
- Real Electron smoke loads the actual Prelude in two generations using only temporary fixtures and a fake fixed query. It proves deny/grant, bookmarks/history, action dispatch, revoke cancellation, temp cleanup, generation rotation, stale-port denial, and no real browser/network/OS action.

### 7. Wrong vs Correct

#### Wrong

```ts
const database = request.path ?? path.join(process.env.HOME!, request.profile, 'History')
return sqlite.prepare(request.sql).all()
```

#### Correct

```ts
const profile = await resolveFixedCanonicalProfile(owner, request.browser)
const copy = await copyStableBrowserDatabaseSet(profile.history, owner.canonicalTempRoot, signal)
return await withOwnedTemporaryCopy(copy, () => fixedReadOnlyQuery(copy.databasePath, 'chromium-history', signal))
```

## Scenario: Owner-Bound Intelligence Stream Finalization

### 1. Scope / Trigger

- Trigger: activation-local `intelligence.stream` runs for the exact isolated
  `touch-intelligence` activation and persists the terminal assistant turn through its
  owner-bound retained resource.
- This boundary covers callback backpressure, iterator teardown, stream finalization,
  custom widget projection and activation close. It does not change the ephemeral
  `intelligence.context.invoke` contract above; host-owned non-plugin Context invoke keeps
  its separate persistent default.

### 2. Signatures

```ts
type PluginIntelligenceStreamRequest = {
  operation: 'context.stream'
  capabilityId: 'text.chat'
  input: string
  context: PluginIntelligenceContextRequest['context']
  onEvent(event: ProjectedContextStreamEvent): Promise<void>
}

type PluginIntelligenceStreamResource = {
  id: string
  kind: 'stream'
}
```

### 3. Contracts

- Install `intelligence.stream` only for the exact `touch-intelligence` activation with
  `intelligence.basic`, one retained `onEvent` callback and one owner-bound stream resource.
- Main derives actor/caller, prepares persistent Context through the host service and
  validates every event before invoking the child callback. Callback delivery is serial and
  awaited for backpressure.
- Stream finalization is signal-raced. Cancel/revoke/close releases the visible stream,
  aborts provider iteration, observes late append settlement and converges on one idempotent
  resource disposer plus `iterator.return()` path.
- A provider iterator must emit a terminal `end`. Completion without a terminal event emits
  stable `INTELLIGENCE_STREAM_FAILED` and disposes callbacks/resources.
- Host-owned direct Context invoke may retain full persistence and await its assistant-turn
  append. The plugin one-shot capability must never acquire this behavior or add a special
  registry commit mode.
- Custom widget items may render only through a same-plugin feature whose renderer target
  directly owns a widget path. Navigate actions are limited to exact host-owned
  action-id/path pairs.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Permission revoke, activation rotation or resource dispose | Abort iteration, release callback/resource and reject late events |
| Callback rejects or exceeds its deadline | Stable callback failure and one disposer path |
| Stream append is pending when cancellation wins | Visible stream settles cancelled; late append settlement is contained |
| Provider stream completes without `end` | Emit stable stream failure and dispose retained state |
| Duplicate cancel/dispose/end | Idempotent no-op after the first cleanup |
| Widget renderer resolves through another alias | Reject before item push |
| Unknown or mismatched navigate action/path | Reject before item push |

### 5. Good / Base / Bad Cases

- Good: the owner-bound stream emits start/delta/end with awaited callbacks, persists its
  terminal answer through host Context, then disposes the iterator and resource exactly once.
- Base: user cancellation stops visible delivery and cleanup without waiting for provider
  computation that cannot be physically cancelled.
- Bad: reuse one-shot invoke commit exceptions, detach assistant persistence from every
  resource owner, accept completion without a terminal event, or let a widget select an
  arbitrary host route.

### 6. Tests Required

- Stream tests cover callback backpressure, terminal and missing-terminal completion,
  callback failure, cancellation during finalization, permission revoke, generation
  rotation and awaited iterator disposal.
- Registry/resource tests cover owner/generation matching, retained callback release,
  duplicate disposal and no late event after close.
- Widget tests cover declaration gating, direct renderer ownership, exact navigation pairs
  and activation-owned item cleanup.
- Real Electron smoke loads the actual Prelude in two generations and proves stream
  pending/delta/end writes, cancellation, stale-port rejection, callback/resource cleanup
  and no real provider/native action.

### 7. Wrong vs Correct

#### Wrong

```ts
await contextInvoke(request) // then retrofit a committed-success exception after cancel
```

#### Correct

```ts
const resource = await startOwnerBoundContextStream(request, onEvent, hostSignal)
try {
  await resource.completed
} finally {
  await resource.dispose()
}
```

## Scenario: Activation-Bound Translation Prelude

### 1. Scope / Trigger

- Trigger: the exact isolated `touch-translation` activation needs text translation,
  screenshot OCR-to-text, public provider enumeration, feature-item publication, and an
  explicit copy action.
- This boundary does not authorize direct network access, provider configuration, provider
  credentials, generic Intelligence, image translation output, or window/control-plane APIs.

### 2. Signatures

```ts
type PluginTranslationFacade = Readonly<{
  translate(payload: { text: string; sourceLang?: string; targetLang: string }, options?: {
    preferredProviderId?: string
    modelPreference?: readonly string[]
    metadata?: TranslationDiagnosticMetadata
  }): Promise<ProjectedTranslationResult>
  ocr(payload: {
    source: { type: 'data-url'; dataUrl: string }
    language?: string
    includeLayout?: boolean
    includeKeywords?: boolean
  }, options?: { metadata?: TranslationDiagnosticMetadata }): Promise<ProjectedOcrResult>
  listProviders(): Promise<readonly PublicTranslationProvider[]>
}>
```

### 3. Contracts

- Main installs `intelligence.invoke` only into the exact current `touch-translation`
  activation, bound to its main-issued activation identity and host generation, and limits it
  to `text.translate`, `vision.ocr`, and public `text.translate` provider enumeration.
- The child exposes a frozen null-prototype `plugin.translation` facade only when both the
  manifest name and declaration match. For Translation, raw `hostCapabilities`, generic
  Intelligence, HTTP/open-url, Secret, Storage, permission, channel, process, filesystem,
  system, QuickOps, Flow, feature-registry, voice, and widget facades remain absent even if
  shared host definitions exist in the activation manifest.
- Translation options admit only provider/model preference plus exact diagnostic metadata.
  OCR options admit diagnostic metadata only. Caller, credentials, endpoints, headers,
  tokens, quota identity, prompt templates/variables, and generic AI command fields fail
  before service work.
- OCR accepts only canonical bounded PNG/JPEG/WebP base64 data URLs with matching signatures.
  Main returns OCR text only; source bytes, layout blocks, raw provider data, usage, reasoning,
  native errors, and stacks do not cross back to the child.
- `text.translate` cancellation is contained by the activation-local capability registry.
  The current Intelligence SDK does not accept a provider signal for this capability, so the
  host adapter must not pass one; cancel/revoke releases the host await and discards observed
  late settlement. OCR continues to receive the supported host signal.
- The Prelude owns one current request across all Translation features. Every item publication
  is serialized and rechecks request/generation/signal after `clearItems()` and before
  `pushItems()`, preventing an old request from erasing or replacing newer output.
- Input and result bounds are UTF-8 byte bounds, not JavaScript code-unit counts. Screenshot
  results contain OCR/translation text only and never the source image or translated image.
- A copy action is accepted only when its activation-generation request id and exact bounded
  text match a currently published result retained by the Prelude. Clipboard writes are
  awaited; forged text, stale generations, denial, and operational failure remain distinct.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Wrong plugin name, undeclared capability, stale activation/host generation | Reject before provider enumeration or invocation |
| Prompt/control-plane option, caller, credential, endpoint, header, token, or extra DTO field | Invalid request before service work |
| Non-canonical, oversized, mismatched-signature, or unsupported image data URL | Invalid request before OCR/provider work |
| Permission revoke or lifecycle cancellation during provider wait | Stable cancellation/permission result; late value discarded |
| Older feature request settles after a newer feature begins | No old clear/push or copy authority may affect current output |
| Forged copy text with a current request id | `invalid-payload`; no clipboard write |
| Previous activation-generation copy item | `stale-request`; no clipboard write |
| SDK result contains usage/reasoning/raw OCR/provider internals | Reject or project them away before child delivery |

### 5. Good / Base / Bad Cases

- Good: a current Translation activation uses only the fixed facade, awaits serialized item
  publication and accepts copy only for its own generation-bound result.
- Base: a denied provider or unsupported OCR input returns a stable blocked result without
  feature mutation, provider detail or native image output.
- Bad: expose generic Intelligence/network/storage, let the child select a credential or
  endpoint, reuse a prior generation request id, or return source image bytes.

### 6. Tests Required

- Host DTO tests cover exact translate/OCR/provider-list requests and projections, multibyte
  bounds, hostile records/arrays, extra control fields, authority, permission, revoke,
  cancellation, and late settlement.
- Child tests declare unrelated shared capabilities deliberately and still prove only the
  Translation-specific facade plus required feature/clipboard surfaces are reachable.
- Prelude tests cover text, multi-source cap, screenshot OCR-to-text, cross-feature races,
  serialized clear/push, forged/stale copy actions, destroy invalidation, redaction, and UTF-8
  bounds.
- Real Electron smoke runs two activation generations with fake providers only and proves
  generation rotation, stale action rejection, no image return, no network/native action,
  and awaited shutdown.

### 7. Wrong vs Correct

#### Wrong

```ts
const config = await plugin.storage.getFile('providers_config')
return tuffIntelligence.invoke('text.translate', payload, { ...options, signal })
```

#### Correct

```ts
const providers = await plugin.translation.listProviders()
const result = await activationRegistry.dispatch('intelligence.invoke', exactRequest, signal)
if (isCurrentRequest()) await serializedPublish(result)
```

## Scenario: Production Plugin Prelude Hard Cut

### 1. Scope / Trigger

- Trigger: all 22 manifested official Preludes satisfy the isolated contract and CoreApp
  installs the activation-scoped utility-process runtime as the only production Prelude path.
- This cut covers rollout policy, legacy-source removal, fixed artifact packaging, heartbeat
  containment, crash behavior and activation teardown. It does not claim an OS sandbox beyond
  Electron `utilityProcess` plus the closed child projection.

### 2. Signatures

```ts
const PLUGIN_RUNTIME_DEFAULT_ENABLED = true
shouldInstallPluginRuntimeServiceByDefault(): true

PluginRuntimeHostResourceLimits = {
  heartbeatIntervalMs: number
  heartbeatTimeoutMs: number
  maxOldSpaceMb: number
  // existing wire, request, callback, resource and lifecycle limits
}
```

### 3. Contracts

- Production always injects `PluginRuntimeService` into `TouchPlugin`; there is no environment
  flag, compatibility profile, main-process VM fallback or synthetic self-check.
- Every activation, including an empty Prelude, owns one fresh process, control port,
  activation key, opaque handle and host generation. Reload/re-enable rotates all authority.
- `plugin-host-bridge.ts` and the legacy reflective `plugin-host-protocol.ts` do not exist in
  the production source graph. Main never accepts `chain: string[]` dispatch.
- The only child artifact is the fixed bundled `out/main/plugin-host.js`; a missing, malformed
  or non-file artifact fails activation before plugin script execution.
- Heartbeat starts only after activation commit, permits one in-flight probe and uses the
  ordinary correlated request timeout/cancel-grace/real-exit barrier. Startup rollback and
  controlled stop leave no heartbeat timer.
- Automatic crash restart budget is zero. Unexpected exit, heartbeat timeout or protocol
  violation invalidates authority, rejects work, disposes resources and leaves the plugin
  `CRASHED`; only an explicit enable/reload may create a new generation. Therefore an
  unattended crash loop cannot spawn replacement processes.
- Disable, reload, unload, uninstall and module teardown revoke authority first and await
  capability/resource cleanup plus the actual child exit before their barrier settles.
- Resource close attempts every disposer and waits every barrier. Any failure is reduced to a
  stable `PLUGIN_HOST_RESOURCE_DISPOSE_FAILED`, `PLUGIN_RUNTIME_HOST_CLEANUP_FAILED`, or
  `PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED` result only after remaining cleanup and child exit.
- A failed controlled stop, active crash, or startup rollback leaves its service record
  non-accepting and retains the exact rejected stop promise. It cannot be replaced by another
  generation, reloaded, uninstalled, or force-updated. Activation-local business resource
  owners are cleared only after their own close succeeds so a later disable can retry them.
- `stopAll()` accumulates cleanup failures across concurrent operations, records and the host
  manager; a later successful barrier must never overwrite an earlier cleanup failure.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Runtime default evaluated in production | Isolated service installed; no alternate branch |
| Fixed child artifact missing or malformed | Stable activation failure; no VM fallback |
| Heartbeat reply missing | Timeout, cancel grace, forced termination and real exit barrier |
| Wrong/duplicate/stale heartbeat result | Protocol rejection scoped to that activation |
| Unexpected child exit | One redacted crash notification after cleanup; no automatic restart |
| Explicit re-enable after crash | Fresh key, handle, host generation and process |
| Controlled disable during heartbeat | Clear timer/request and await normal/forced exit |
| Any disposer or activation close fails | Continue all cleanup and child exit, then reject with a stable cleanup code |
| Cleanup fails during stop, crash, or startup rollback | Retain a non-accepting failed record; reject generation replacement |
| Reload, uninstall, resolver update, or dev force-update sees failed teardown | Preserve the current generation/files and return failure |
| Concurrent stop operation fails before other records close | `stopAll()` retains the earlier failure after all barriers settle |
| Legacy bridge/protocol import or `TUFF_PLUGIN_ISOLATION` appears | Production contract test fails |

### 5. Good / Base / Bad Cases

- Good: 22 official activations run in distinct processes, a hung child is killed without
  blocking a healthy child, and explicit re-enable rotates every authority value only after
  the previous cleanup barrier succeeds.
- Base: an empty Prelude loads an empty lifecycle in its own child and shuts down through the
  same barrier.
- Bad: default-off rollout, main `vm.runInContext`, shared singleton child, environment
  fallback, reflective chain dispatch, automatic unbounded restart, swallowing disposer
  failures, deleting runtime records before cleanup succeeds, or overwriting an earlier
  `stopAll()` failure with a later successful barrier.

### 6. Tests Required

- Static production-contract tests assert default-on, legacy-source absence, no VM loader,
  no environment flag and fixed packaged artifact binding.
- Host/session/process tests cover strict heartbeat directions, duplicate/stale correlation,
  one in-flight probe, timeout, startup rollback, controlled stop and real exit barriers.
- TouchPlugin/PluginModule tests prove default runtime injection, one crash notification,
  no automatic replacement, fresh explicit re-enable authority, failed-resource retention,
  stable cleanup errors, and blocked reload/unload/uninstall replacement.
- Service tests prove controlled-stop, unexpected-crash and startup-rollback cleanup failures
  retain their generation; concurrent `stopAll()` failures cannot be overwritten. Resolver
  and development installer tests prove plugin files are preserved after incomplete teardown.
- Complete plugin tests, Node/Web typechecks, scoped lint, 24/24 validation, production build,
  built-child forbidden scan, `git diff --check` and real Electron two-generation smoke are
  required before the hard cut is committed.

### 7. Wrong vs Correct

#### Wrong

```ts
const runtime = process.env.TUFF_PLUGIN_ISOLATION ? isolated : mainVmFallback
runtime.restartOnExit()
```

#### Correct

```ts
TouchPlugin.setRuntimeService(pluginRuntimeService)
const stopped = await plugin.disable()
if (!stopped) throw new Error('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
await replacePluginFiles()
// Crash cleanup is terminal. A later generation starts only after cleanup succeeds.
```

### 8. Fixed widget navigation paths are byte-checked contract constants

`FIXED_WIDGET_NAVIGATION` in `src/main/modules/plugin/plugin-business-capabilities.ts` and the
matching constant inside each official plugin (e.g. `plugins/touch-intelligence/index.js`) form a
host↔plugin whitelist: the host **verifies** the plugin-declared `payload.path` against its own
constant (`payload.path !== fixed.path → authorityInvalid()`), it does not rewrite it.

- Never "migrate" such a path in-place when a renderer route moves. Changing only the host rejects
  every widget item pushed by installed plugins; changing both host and plugin still rejects
  **already-installed** plugin versions, because plugins load from the user data directory and do
  not update with the app.
- The correct move is to keep the constant stable forever and absorb route changes with a router
  redirect (done 2026-08-06 for `/intelligence/channels` → `/setting/intelligence/channels`).
- Renderer tests that assert these payloads (`useActionPanel.test.ts`) must keep asserting the
  wire constant, not the current route, with a comment pointing here.
- Retiring a constant for real requires a dedicated task covering host + plugin + the four
  cross-package tests + a compatibility window for installed plugin versions.
