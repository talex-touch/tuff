# Channel / Transport Contracts (main ↔ renderer)

## Scenario: main process notifies a renderer (intent/notification events)

### 1. Scope / Trigger

Any main→renderer send of a TuffEvent. The channel layer has two distinct delivery
modes and picking the wrong one produces 60s timeout warnings that `.catch()` cannot
suppress (2026-08-06, `core-box:ui:shortcut-triggered`).

### 2. Signatures

```ts
// Request-response: registers a pending entry + CHANNEL_DEFAULT_TIMEOUT (60s) timer
// (channel-core.ts:23); on expiry channel-core.ts:727 logs
// `[Channel] Request "<name>" timed out after 60000ms` — the caller's .catch() only
// swallows the promise rejection, never this WARN.
transport.sendTo(webContents, event, payload): Promise<TRes>
transport.sendToWindow(windowId, event, payload): Promise<TRes>

// Fire-and-forget: same envelope minus the sync block; no pending entry, no timer.
transport.broadcastToWindow(windowId, event, payload): void
```

### 3. Contracts

- **Notification events (`define<void, void>()` / no consumer of the response) MUST use
  `broadcastToWindow`.** `sendTo`/`sendToWindow` are only for calls that read the reply.
- Delivery target is identical either way: `broadcastToWindow` resolves
  `BrowserWindow.fromId(id).webContents` — the same object `sendTo(webContents, …)` took.
- Renderer side needs no changes when switching: `__handle_main` dispatches non-reply
  envelopes purely by event name to the same `transport.on(event, …)` listener.
- Port channel is not a fork: only the allowlist in `transport/sdk/port-policy.ts`
  (clipboard change, file-index progress, search indexCommitted by default) rides
  MessagePorts; everything else uses the bridge in both modes. Short-lived
  `core-box:search:session` streams default to typed channel transport so a new
  query never waits for an optional Port upgrade. Explicit environment allowlists
  remain supported; do not add the search session back to the default set merely
  because its output is streamed.
- Single-path delivery per envelope: main's stream runtime sends each chunk/end/error
  over the port when it still holds a confirmed record, otherwise over the bridge
  (`server-runtime.ts sendWithFallback`) — never both. The client runtime therefore
  delivers whatever arrives on either path; it must not treat a bridge envelope as a
  duplicate because the port was active earlier. That guard (`portActive` in the bridge
  handlers) made a long-lived CoreBox deaf to `index-committed` once main dropped its
  port record (2026-09-21). If double delivery is ever introduced, dedupe by
  streamId + sequence in the protocol, do not restore the guard. Anchors:
  `renderer-transport-stream.test.ts` "delivers channel chunks and the channel end
  after the port has already been active".
- `broadcastToWindow` throws synchronously if the window id is gone (`sendTo` rejected
  instead) — validate the window (`isDestroyed()`) before sending, as `show()` does.
- A broadcast to a still-loading webContents is dropped, same as an unanswered `sendTo`
  minus the hang. If delivery must be guaranteed, queue on the renderer-ready signal —
  do not "fix" it by switching back to request-response.
- A short-lived `WebContentsView` that cannot use `broadcastToWindow` must pair request-style
  `sendTo` with a real response and an explicit renderer-ready handshake. Document load,
  `isLoading() === false`, `dom-ready`, and `did-finish-load` do not prove that the route component
  registered its transport listeners.
- Derive the ready sender from `HandlerContext`; never trust a renderer-authored id. Accept only
  the current owned WebContents, keep at most the latest pending payload, keep the view hidden until
  readiness, and clear pending/ready state on hide, destruction, or renderer loss.
- `MetaOverlayEvents.ui.show` is the concrete bidirectional example: CoreBox → main and main → the
  MetaOverlay renderer each return `{ accepted: true }`; `MetaOverlayEvents.ui.ready` releases the
  current manager's pending show exactly once.
- Renderer transport payloads must remain structured-cloneable. Storing an incoming IPC object in a
  deep Vue `ref` turns it into a Proxy that Electron cannot clone on the return trip; use
  `shallowRef` (or an explicitly reconstructed plain DTO) for opaque transport records and defend
  the outbound payload with a real `structuredClone` regression.

### 4. Validation & error matrix

| Condition                                                | Outcome                                          |
| -------------------------------------------------------- | ------------------------------------------------ |
| `sendTo` a void event, renderer listener not yet mounted | silent 60s hang → WARN in channel-core, per send |
| `broadcastToWindow` with destroyed window id             | synchronous throw at call site                   |
| Broadcast before renderer registers listener             | event dropped (pre-existing semantics)           |

### 5. Wrong vs Correct

#### Wrong

```ts
void transport.sendTo(window.window.webContents, CoreBoxEvents.ui.shortcutTriggered, undefined).catch(() => {}) // swallows the rejection, NOT the channel-core timeout WARN
```

#### Correct

```ts
this.getTransport().broadcastToWindow(window.window.id, CoreBoxEvents.ui.shortcutTriggered, undefined)
```

### 6. Tests required

Mock the transport as a **stable object** (a factory returning a fresh object per call
makes call-order assertions silently vacuous — `window.test.ts` had this trap). Assert:
broadcast called with (windowId, event, payload), `sendTo` never called, and relative
ordering against sibling events (`window.test.ts` "broadcasts the shortcut intent…" is
the model).

### 7. Known remaining instance

`core-box/index.ts:94` sends `CoreBoxEvents.beginner.shortcutTriggered` via
`sendToWindow` to the main window; its only listener lives in onboarding `Done.vue`.
Gated by `admission.state === 'blocked'`, so it only warns for users mid-onboarding.
Convert to broadcast on next touch of that file.

## Scenario: Register Main Stream Handlers Before Creating Their Renderer

- A renderer may start a typed stream as soon as its component mounts. For CoreBox,
  `usePreviewHistory()` starts `ClipboardEvents.change` immediately.
- The owning main module must therefore register the base event's `onStream` handler before the
  module that creates/prewarms that renderer. `app-ready`, `dom-ready`, and `did-finish-load` do
  not prove handler readiness.
- The foreground startup order keeps `clipboardModule` before `coreBoxModule`; a contract test
  must compare their actual positions. Reversing them produces
  `clipboard:monitor:change:stream:start` / `reason=no_handler` during a fresh process.
- Do not hide the race with renderer retries or a swallowed `.catch()`: those suppress UI fallout,
  not the missing-handler request or its performance/error records.

## Scenario: Renderer Quiesce Before Main Handler Teardown

### 1. Scope / Trigger

Changing app quit order, renderer transport destruction, auto-save, or renderer performance reporting. Main modules unregister request handlers during `BEFORE_APP_QUIT`; a still-sending renderer otherwise produces `No handler registered` storms.

### 2. Signatures

```ts
quiesceRenderersBeforeQuit(): Promise<void>
TuffRendererTransport.destroy(): void
reportPerfToMain(report: RendererPerfReport): void
```

### 3. Contracts

- Before emitting `TalexEvents.BEFORE_APP_QUIT`, main sends `AppEvents.lifecycle.beforeQuit` to every live app renderer (excluding DevTools) and waits up to 1.5 seconds for acknowledgements.
- The renderer flushes pending transport batches, then destroys its transport. `destroy()` is idempotent and permanently rejects every later `send()` before the underlying channel.
- The finalizer fallback broadcast is idempotent; it must not reopen renderer work after quiesce.
- Performance reporting never reports the `app:analytics:perf-report` event itself. A missing perf handler must not recursively generate another perf report.
- Default-session permissions remain denied during shutdown, but expected denial logs are suppressed once `TouchApp.isQuitting` is true.

### 4. Validation & Error Matrix

| Condition                                    | Required outcome                                                 |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Renderer acknowledges                        | Flush/destroy completes before storage/analytics handlers unload |
| Renderer hangs or already died               | 1.5s bound expires; main continues shutdown                      |
| Debounced save fires after destroy           | Reject locally with transport-destroyed error; no main IPC       |
| Perf-report send itself fails                | No recursive performance report                                  |
| Permission request arrives after quit begins | Deny silently; no shutdown-noise warning                         |

### 5. Good / Base / Bad Cases

- Good: benchmark/user quit logs `App quit requested` with zero post-request `storage:app:save` or `app:analytics:perf-report` missing-handler pairs.
- Base: one renderer flushes immediately and normal module unload proceeds.
- Bad: unload main handlers first, then broadcast shutdown; or make `destroy()` remove listeners while leaving `send()` live.

### 6. Tests Required

- Renderer transport test: after `destroy()`, `send()` rejects and the fake channel receives zero calls.
- Existing before-quit guard/finalizer/module-manager tests stay green.
- Isolated Electron auto-quit smoke: inspect the post-`App quit requested` log for missing-handler recursion and permission-denial noise.

### 7. Wrong vs Correct

```ts
// Wrong: request producers stay alive after main handlers disappear.
await unloadAll('app-quit')
transport.broadcast(AppEvents.lifecycle.beforeQuit, undefined)

// Correct: quiesce renderers, then unload handlers; destroyed transports reject locally.
await quiesceRenderersBeforeQuit()
await touchEventBus.emitAsync(TalexEvents.BEFORE_APP_QUIT, quitEvent)
```

## Scenario: Owner-Bound Stream And MessagePort Lifecycle

### 1. Scope / Trigger

- Trigger: registering a main-process stream handler, accepting a stream start or
  cancel envelope, upgrading a MessagePort, rotating plugin activation authority,
  destroying a sender, or unregistering the handler.
- This contract spans the raw MAIN/PLUGIN lanes, authoritative plugin identity,
  server stream runtime, MessagePort registry, and Electron `WebContents` lifecycle.

### 2. Signatures

```ts
type ServerStreamOwnerKey = object

interface ServerStreamRequest<TReq, TSender, TPlugin = unknown> {
  streamId: string
  ownerKey: ServerStreamOwnerKey
  portId?: string
  payload: TReq
  sender: TSender
  plugin?: TPlugin
}

interface ServerStreamCancelRequest {
  streamId?: string | null
  ownerKey: ServerStreamOwnerKey
}

interface ServerStreamRuntime<TReq, TSender, TPlugin = unknown> {
  handleStart(request: ServerStreamRequest<TReq, TSender, TPlugin>): void
  handleCancel(request: ServerStreamCancelRequest): void
  cancelOwner(ownerKey: ServerStreamOwnerKey): void
  cancelAll(): void
  dispose(): void
}
```

`ownerKey` is a host-only opaque object. It is never accepted from a renderer or
plugin payload.

### 3. Contracts

- Resolve ownership from the concrete sender object plus the host-selected lane.
  Each sender has separate MAIN and unverified-PLUGIN owners. Each authoritative
  plugin activation has another owner keyed by its current host-issued activation
  key; actor name alone is insufficient.
- The same `streamId` may exist for different owners. A second active id for the
  same owner throws `stream_id_conflict` and leaves the original stream active.
- Cancel resolves the owner again from the real sender, lane, and current branded
  identity. Ignore caller-authored owner fields. A foreign sender, lane, activation,
  or unverified caller cannot cancel another owner's stream.
- Terminal `end`/`error`, explicit cancel, activation invalidation, sender destroy,
  and handler unregister all remove forward and reverse indexes exactly once.
  Cancel aborts the owned `AbortSignal`; late `emit`/`end`/`error` callbacks are
  silent and cannot recreate state or send data.
- Sender destruction cancels all MAIN, unverified-PLUGIN, and authoritative plugin
  owners for that exact `WebContents`. Handler unregister removes channel handlers,
  invalidation watchers, and sender listeners before disposing all active state.
- A plugin MessagePort is confirmed, resolved, used, and closed only when the
  concrete sender object, channel, scope, port id, and complete authoritative
  activation provenance match. A numeric sender id is not ownership.
- Plugin activation invalidation physically closes ports with the exact activation
  key, clears pending confirm timers, and removes both global and sender indexes.
  MAIN/window ports and other plugin activations remain open.

### 4. Validation & Error Matrix

| Condition                                    | Required result                                                  |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Duplicate active id under one owner          | `stream_id_conflict`; original remains active                    |
| Same id under another sender/lane/activation | Independent stream accepted                                      |
| Foreign sender/lane/activation cancel        | No effect on target stream                                       |
| Current owner cancel                         | Exact signal aborts; later callbacks are silent                  |
| Activation rotates or revokes                | Exact plugin streams abort and ports close                       |
| Sender is destroyed                          | All streams/ports for that object close; foreign object survives |
| Handler unregisters                          | Handlers/watchers/listeners removed; all active streams abort    |
| Same numeric sender id, different object     | No port confirmation, lookup, use, or close                      |
| Port terminal send fails                     | Fallback may run; stream state still cleans up                   |

### 5. Good / Base / Bad Cases

- Good: two senders reuse one stream id; cancelling one aborts only its signal, and
  rotating one plugin activation closes only its streams and MessagePorts.
- Base: a current owner reaches `end`; its state is removed and the same id can be
  reused by that owner later.
- Bad: index streams globally by id, trust `ownerKey` from the payload, compare only
  `sender.id`, or leave watchers/ports alive after revoke or handler unregister.

### 6. Tests Required

- Runtime tests cover same-owner duplicate rejection, cross-owner id reuse, exact
  cancel, cancel-all/dispose, terminal cleanup, send failure, and late callbacks.
- Transport tests cover MAIN vs raw PLUGIN lanes, verified vs unverified plugin
  owners, activation rotation/revoke, sender destruction, and unregister cleanup.
- MessagePort tests use two sender objects with the same numeric id and cover
  confirm/use/close isolation, complete activation provenance, physical close on
  invalidation, confirm-timer cleanup, and no collateral close.
- Every regression asserts both the target was cleaned up and an unrelated stream
  or port stayed live; a one-sided cleanup assertion is insufficient.

### 7. Wrong vs Correct

#### Wrong

```ts
const activeStreams = new Map<string, StreamState>()
activeStreams.get(payload.streamId)?.abortController.abort()
if (record.sender.id === event.sender.id) record.confirmed = true
```

#### Correct

```ts
const ownerKey = resolveOwnerKey(channelType, event.sender, authoritativePlugin, true)
runtime.handleStart({ streamId, ownerKey, payload, sender: event.sender, plugin })

const cancelOwnerKey = resolveOwnerKey(channelType, event.sender, authoritativePlugin, false)
if (cancelOwnerKey) runtime.handleCancel({ streamId, ownerKey: cancelOwnerKey })
if (record.sender === event.sender) record.confirmed = true
```

## Scenario: Typed Reasoning Effort On Intelligence Requests

### 1. Scope / Trigger

- Trigger: changing `IntelligenceInvokeOptions.reasoningEffort`, the decision it resolves to on
  events and results, the shared table `packages/utils/intelligence/reasoning-effort.ts`, or any
  hop that carries them: renderer → `intelligence:api:stream` / `intelligence:api:invoke` → main
  SDK → provider → Tuff Nexus `/api/v1/intelligence/{stream,invoke}` → upstream adapter.
- The field rides the existing events; no channel is added.

### 2. Signatures

```ts
IntelligenceInvokeOptions.reasoningEffort?: 'low' | 'medium' | 'high' | 'max' // absent = auto

interface IntelligenceReasoningEffortDecision {
  requested: IntelligenceReasoningEffort
  applied: IntelligenceReasoningLevel | null // null whenever nothing was sent
  status: 'applied' | 'clamped' | 'unsupported-model' | 'unsupported-provider' | 'forwarded'
}
IntelligenceStreamEvent.reasoningEffort?  // `start` and `end` only
IntelligenceInvokeResult.reasoningEffort?
IntelligenceStreamChunk.reasoningEffort?  // a routed backend's own report (Nexus)

sanitizeReasoningRequest(options)                       // main SDK entry
planProviderReasoning(options, providerConfig, model)   // one plan per provider attempt
settleReasoningDecision(plan, reported)                 // what `end` / the result carries
```

### 3. Contracts

- Auto is absence. The renderer omits the field (`normalizeReasoningEffort` maps `auto` and anything
  unknown to `undefined`); without it main plans nothing, and every request body and CLI argv is
  byte-identical to the pre-setting one.
- Every hop re-normalizes and drops rather than forwards: the renderer's settings read and request,
  the main SDK entry (`sanitizeReasoningRequest` in `prepareRuntimeOptions` and `invokeStream`,
  before routing and the cache key), Nexus `parseRequest` / `invokeIntelligenceCapability`, and
  every decision read off the wire or out of stored turn meta (`normalizeReasoningEffortDecision`).
- The plan is host-only. The SDK entry strips a caller's `reasoningPlan`; the SDK attaches main's
  plan per provider attempt, for `chat` capabilities only, after the provider is chosen and its
  model preference applied. Providers translate `readReasoningPlan(options)` and never re-decide.
  Nexus plans per upstream context with the same table.
- The planned model is the surviving preference or the provider's `defaultModel`; a missing one is
  sent nothing (`unsupported-model`). One exception: the Codex CLI handed no model runs the `model`
  in its own `~/.codex/config.toml`, so the plan reads it (`readCodexConfiguredModel()`) instead of
  refusing a route that answers every unpinned turn.
- `end` (or the invoke result) is authoritative: a fallback provider's `start` is swallowed, and a
  routed backend may report mid-stream. The renderer records `start`, then lets the final decision
  replace it whole, as flat structured-cloneable turn-meta fields.
- A routed backend's report replaces only main's `forwarded` placeholder, and only when it answers
  the same `requested` level; main's own decisions are never overruled.
- Audit metadata carries exactly `reasoningEffort` / `reasoningApplied` / `reasoningStatus`, always
  set from main's decision, so caller metadata cannot claim a level main never resolved.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Composer on auto, or no getter | field omitted; no plan; no decision on any event, result or audit |
| Unknown level (`'ultra'`, `'xhigh'`, a number) at any hop | dropped at that hop; never forwarded or planned |
| Caller-supplied `reasoningPlan` | stripped at the SDK entry |
| Non-chat capability carrying a level | planned nothing; no decision on the result |
| Route or model takes no effort | `unsupported-provider` / `unsupported-model`, `applied: null`; request built exactly as on auto |
| Model lacks the level | nearest level, stronger first → `clamped`; `max` = the model's strongest → `applied` |
| Nexus route on a server without the field | `forwarded` stays |
| Nexus report that contradicts itself or names another `requested` | ignored; `forwarded` stays |
| Provider fails before the first delta | the fallback is re-planned for itself; `end` carries its decision |

### 5. Tests Required

- Shared table and plans: `packages/utils/__tests__/reasoning-effort.test.ts`.
- Main: `reasoning-effort-runtime.test.ts`, `intelligence-sdk.reasoning.test.ts` (auto plans
  nothing and puts no decision on events; per-attempt re-plan; forged plan stripped; audit keys).
- Wire: the provider `*.reasoning.test.ts` suites pin the **whole** auto body or argv as literals,
  not only the absence of the new field, and assert a plan that sends nothing builds the auto bytes.
- Renderer: `useHomeConversation.reasoning.test.ts` (exact auto request shape, same level on the
  non-streaming fallback, clone-safe turn meta), `turn-info-rows.test.ts`, `HomeModelMenu.test.ts`.
- Nexus: `tuffIntelligenceReasoningEffort.test.ts`, `tuffIntelligenceLangChainProviderAdapters.test.ts`,
  `test/api/v1/intelligence/stream.post.test.ts`.
