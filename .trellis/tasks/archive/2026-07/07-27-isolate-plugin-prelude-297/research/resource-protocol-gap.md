# V2 Resource Protocol Gap Audit

## Scope And Snapshot

Audit target: current V2 wire/session/codec/child capability client/child VM/runtime host,
cross-checked against channel subscription, Voice ASR, Intelligence streams, and feature
lifecycle cancellation.

The worktree changed concurrently during this audit. In addition to the established V2
invoke-only baseline, an uncommitted resource/callback foundation appeared in:

- `apps/core-app/src/main/modules/plugin/host/plugin-host-callbacks.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-resources.ts`
- related edits to wire, codec, session, child capabilities/runtime, capability registry,
  runtime host, and runtime service

The findings below therefore distinguish **working baseline**, **foundation/WIP**, and
**missing end-to-end semantics**. Re-check the listed transient WIP hazards after the
parallel implementation settles.

## Executive Conclusion

V2 currently has enough syntax and bounded-value machinery to build resource semantics,
but not yet a complete callback/subscription/disposer/stream protocol.

The established executable path is still invoke-only:

```text
child VM hostCapabilities.invoke
  -> child capability client
  -> capability-call
  -> main capability registry
  -> capability-result
```

The central gaps are:

1. `callback-call`, resource handles, and `resource-dispose` exist at the wire/session
   layer, but the established main/child endpoint path does not complete their behavior.
2. Lifecycle cancellation is activation-destructive today: the child cancels **all**
   capability promises, while main starts the host termination grace timer. Normal
   feature supersession can therefore stop the activation instead of cancelling only the
   superseded feature request.
3. Cancellation is one-directional (`main-to-child`) and has no canonical completion/ack
   state. Child-originated cancellation of an in-flight capability is not expressible.
4. Voice/Intelligence streams are compound resources: callbacks, a controller, several
   host transport subscriptions, provider cancellation, ordering, and teardown must share
   one owner. Returning an opaque resource token alone is not SDK-compatible.
5. Permission revoke protection ends when a capability call settles. A returned stream or
   subscription needs a retained permission dependency, or the activation must terminate
   fail closed on revoke.

Do not migrate official streaming plugins until callback RPC, resource retention,
request-scoped cancellation, and cleanup barriers pass in one real Electron process path.

## Current Support Matrix

| Area | Working evidence | Gap / consequence |
| --- | --- | --- |
| Fixed protocol | Fixed capability IDs and exact discriminants in `plugin-host-wire.ts:3-216`; strict direction/owner parsing at `:390-522`. | `resource-dispose` is bidirectional but has no result; `cancel` is main-to-child only (`:468-474`). |
| Session correlation | Request/response pairs include callback calls (`plugin-host-session.ts:77-109`); pending and duplicate/late tracking are bounded. | A cancel deletes pending immediately and classifies every later response as late (`:431-486`); there is no canonical cancellation completion. |
| Wire codec | Bounded callbacks, cancel handles, resource handles, bytes/errors/undefined with rollback (`plugin-host-wire-codec.ts:1-302`, `:334-480`). | Handle resolvers are hooks, not ownership by themselves. Established `PluginRuntimeHost` did not inject them; VM has a second JSON bridge that also needs equivalent marker support. |
| Main capability registry | Authoritative activation, permission, timeout, concurrency, caller abort, fail-close grace (`plugin-host-capabilities.ts:314-392`, `:394-611`). | Settled long-lived resources outlive the call's permission watcher. Resource registration was unavailable in the baseline. |
| Main runtime host | Per-call `AbortController` for child capability calls (`plugin-runtime-host.ts:891-923`); pending work aborts before cleanup (`:1121-1243`). | Established message switch ignores `resource-dispose` and has no callback-call initiator (`:863-885`). Capability results containing functions are intentionally rejected (`plugin-runtime-host.test.ts:940-967`). |
| Child capability client | Bounded correlation, fixed local manifest denial, timeout, cancel-all, close (`plugin-host-child-capabilities.ts`). | No per-request signal/cancel; `cancelAll()` abandons every pending call. No child-to-main cancel message. |
| Child endpoint | Lifecycle requests get a child-realm AbortSignal; active lifecycle calls are tracked (`plugin-host-process.ts:233-275`). | Established callback handler returns `PLUGIN_HOST_CHILD_CALLBACK_UNSUPPORTED` (`:277-286`); `resource-dispose` is ignored (`:303-324`). |
| Child VM | Frozen local AbortController/AbortSignal and lifecycle signal injection (`plugin-host-child-runtime.ts`, context bootstrap and `callLifecycle`). | Capability invocation is global rather than lifecycle-scoped. Established lifecycle cancel calls `cancelCapabilities?.()` globally (`:1073-1089`). |
| Host cleanup | Authority invalidation -> owned dispatcher close -> external resources -> shutdown/kill/exit barrier (`plugin-runtime-host.ts:1131-1237`). | Resource registry must be inserted into this barrier exactly once. Fine-grained permission revoke is not retained after stream creation. |
| Electron smoke | Two distinct PIDs, invoke-only capability, local manifest denial, timeout isolation, stale injection, exit barriers (`apps/core-app/scripts/plugin-host-isolation-smoke.cjs:172-250`). | No real callback, subscription, disposer, stream, child-originated cancel, permission revoke, or callback-in-flight crash proof. |

## Cross-Domain Contract Map

### Channel

The existing plugin channel surface has three distinct contracts:

- `send()` is one-shot async invoke (`packages/utils/plugin/sdk/channel-client.ts:14-17`).
- `regChannel()` installs a handler and returns a disposer.
- `unRegChannel()` removes a handler by callback identity.

For V2, use:

```text
channel.invoke     -> ordinary capability result
channel.subscribe  -> callback in request + subscription resource result
resource.dispose   -> authoritative unsubscribe (preferred)
```

`channel.unsubscribe` should not require child-provided callback identity. If retained for
SDK compatibility, it should accept only the opaque owner-bound resource ID and delegate
to the same registry. Never expose raw event names without an adapter allowlist/schema.

### Intelligence

`IntelligenceSdk.stream/contextStream` accepts several callbacks and returns a
`StreamController` (`packages/utils/transport/sdk/domains/intelligence.ts:610-628`,
`:1476-1518`, `:1715-1750`). The underlying transport owns three fallback channel
subscriptions plus an optional dedicated MessagePort and cancels all of them through one
controller (`packages/utils/transport/sdk/stream/client-runtime.ts:35-255`).

Recommended V2 adapter shape:

```text
intelligence.stream request:
  bounded invoke DTO + one onEvent(discriminated Intelligence event) callback

result:
  stream resource descriptor { resourceId, streamId }

child SDK projection:
  maps onEvent to onStart/onDelta/onMessage/onUsage/onMetadata/onEnd/onError
  returns child-realm StreamController with idempotent cancel()
```

Use one event callback rather than six wire callbacks. This reduces handle pressure and
gives one FIFO ordering point. Main may use the existing typed transport internally, but
its MessagePort and channel subscriptions stay main-owned and never enter the plugin
child.

`touch-intelligence` stores a stream controller and also supports cancellation before the
controller Promise resolves (`plugins/touch-intelligence/index.js:1555-1708`). The child
projection must preserve this race: cancelling before start completion marks the request
cancelled, disposes a late resource immediately, and suppresses all late events.

### Voice

`VoiceSdk.asrStream` has the same callback/controller contract
(`packages/utils/transport/sdk/domains/voice.ts:74-118`, `:143-150`).
`touch-dictation` does not retain the returned controller; it waits for callbacks
(`plugins/touch-dictation/index.js:78-113`). Therefore host-side terminal end/error and
activation teardown must release the stream even when plugin code never calls cancel.

The current Voice source labels ASR streaming as a reserved seam, so the isolated adapter
must fail with a stable unavailable code when the backend is unavailable. It must not
silently fall back to raw channels.

### Feature Lifecycle And AbortSignal

`TouchPlugin.triggerFeature()` aborts the prior controller for the same feature before
starting the next invocation (`apps/core-app/src/main/modules/plugin/plugin.ts:761-766`)
and passes that signal to isolated `onFeatureTriggered` (`:848-858`). This is normal
supersession, not an activation failure.

The current V2 behavior conflicts with that contract:

1. main sends cancel and immediately puts the host into `stopping` with a 500 ms grace;
2. child cancellation calls global `capabilityClient.cancelAll()`;
3. a second feature invocation can be rejected because the host is stopping;
4. the activation is cleaned up even when the child cooperated.

Required behavior:

- bind each lifecycle invocation to a request scope;
- associate capability calls created under that async scope with the lifecycle request;
- abort only that scope on feature supersession;
- suppress late callback/stream events for that scope;
- keep the activation active after a canonical cancellation completion;
- kill the process only when cancellation does not complete within grace or code is
  CPU-blocked/unresponsive.

Use host-owned `AsyncLocalStorage` in the utility-process runtime (not exposed to Prelude)
to preserve lifecycle/callback/resource scope across `await`. A single mutable
`currentLifecycleId` is unsafe for concurrent async lifecycles.

## Recommended Owner-Bound Registries

### Main Resource Registry

Each record should snapshot:

```text
ResourceRecord = {
  owner: activationHandle + hostGeneration,
  activation: pluginName + pluginInstanceId + activationGeneration,
  id: random opaque ID,
  kind: subscription | stream | disposer | process,
  capabilityId,
  permissionId?,
  state: active | disposing | disposed,
  dispose(): Promise<void>,
  callbackIds: Set<id>,
  revokeDisposer?,
}
```

Rules:

- Registration is possible only inside an active capability invocation.
- The capability validator must return the exact handle registered by that invocation.
- Resource lookup matches registry instance, opaque ID, exact kind, current activation,
  activation handle, and host generation.
- Remove the record and mark disposing **before** awaiting native cleanup.
- `close()` bypasses current-authority lookup and disposes every record exactly once.
- Child dispose, terminal stream end/error, permission revoke, capability rollback,
  runtime crash, and activation teardown converge on the same idempotent disposer.
- Retain the capability permission on the resource. If fine-grained revoke notification is
  not ready, terminate the entire activation immediately on permission revoke.

The new WIP `PluginHostResourceRegistry` already has random IDs, activation checks,
register/inspect/dispose/close, and total limit support. It still needs per-kind limits,
permission/capability metadata, host-to-child disposal notification, deterministic dispose
completion, and descriptor-safe option snapshotting consistent with the rest of V2.

### Callback Registries

Callbacks flow only from child capability payloads to main proxies:

```text
child callback function
  -> callback marker owned by capability request
  -> main proxy
  -> callback-call to same child/owner
  -> child callback-result
```

Rules:

- Callback values are accepted only in capability-call payloads; never lifecycle payloads,
  callback results, or arbitrary capability results.
- Definition request validation owns the allowed callback fields.
- Transient callbacks are released when the capability result settles.
- Resource callbacks move atomically from `byRequest` to `byResource` only when the
  authoritative main result is the resource created by that same capability invocation.
- Callback invocation has its own deadline, concurrency budget, bounded result codec, and
  pending cancellation.
- A callback throw returns only a stable code. Callback timeout/unknown/stale IDs fail the
  owning resource; malformed/cross-generation IDs fail the activation.
- Resource disposal releases its callback set on both ends before native disposer work can
  emit another event.

The new WIP callback registries implement request/resource retention and concurrency. The
final re-check saw partial wiring through main callback requests, child `handleCallback`,
session codec hooks, resource close, and child VM markers; these paths still require focused
RED coverage and real Electron proof before they count as complete.
Per-host construction is necessary; adding explicit owner/activation snapshots makes the
ownership invariant testable rather than relying only on closure placement.

### Child Resource Facades

Do not expose a frozen opaque object directly to official Prelude code. Project a
child-realm typed facade:

- stream: `{ streamId, readonly cancelled, cancel(): void }`
- subscription/disposer: an idempotent local disposer; SDK wrapper may expose the legacy
  function shape while internally owning the token
- process (later slice): only fixed typed methods such as `terminate`, never a native
  ChildProcess object

The first local `cancel/dispose` transitions state and sends exactly one dispose request.
Repeated calls are local no-ops. A main-originated disposal marks the facade disposed and
releases callbacks without echoing another dispose message.

## Cancellation Protocol

### Required Directionality

Permit `cancel` in both directions:

- main -> child: lifecycle or callback request cancellation;
- child -> main: capability request cancellation.

The session must resolve the target only in the sender's request direction. A child cancel
must never cancel a main-origin request with the same numeric ID.

### Canonical Completion

Current session behavior treats every response after cancel as a fatal late response. Keep
a bounded `cancelledAwaitingCompletion` record instead. The target endpoint must return the
normal paired result type with `ok:false` and one exact cancellation code. That canonical
result is the cancellation acknowledgement and clears the grace timer; success or any
other late result remains a protocol violation.

This avoids adding a second generic ack message while preserving request/response typing.
After acknowledged caller cancellation, the activation remains active. If completion is
not received within `cancelGraceMs`, terminate the activation. For timeout, use the same
mechanism; a cooperative abort may preserve the process, while CPU hang cannot respond and
is killed.

### Scope

Replace global `cancelCapabilities()` with:

```text
cancelScope(lifecycleRequestId | callbackRequestId | resourceId)
```

Each child capability pending record carries its originating async scope and optional
AbortSignal. Scope cancellation sends child-to-main cancel for each posted call, rejects
local Promises once, and retains bounded ack tombstones. Activation shutdown remains the
only operation that calls `cancelAll()`.

## Limits

Keep existing wire and process limits, then add explicit resource budgets:

| Limit | Recommended initial value | Notes |
| --- | ---: | --- |
| message/result bytes | 1 MiB | Existing V2 codec limit |
| depth / members | 32 / 10,000 | Existing V2 codec limit |
| all pending protocol requests | 32 | Existing session limit; includes callback calls |
| active capability calls | 32 | Existing global registry default |
| active IO / stream start / process calls | 8 / 8 / 2 | Definition-level concurrency |
| live callback handles | 64 | Per activation/generation |
| active callback invocations | 16 | Prevent event fan-out starvation |
| live resources total | 64 | Per activation/generation |
| subscriptions / streams / disposers / processes | 32 / 8 / 32 / 2 | Enforce per kind, not total only |
| queued events per stream | 32 | FIFO; overflow cancels stream fail closed |
| queued event bytes per stream | 1 MiB | Count before copying |
| callback deadline | 5 s | Same as fast call; timeout disposes owning resource |
| stream start deadline | 30 s | Main business deadline |
| lifecycle / teardown | 60 s / 2 s | Existing design |
| cancel grace / shutdown grace | 500 ms / 2 s | Existing host defaults |
| child old space | 128 MiB | Existing process factory |

Do not count only active invocation Promises. Callback/resource records and queued stream
events remain memory authority after the creating capability has settled.

## Teardown And Revoke Ordering

### Graceful Disable / Reload / Unload / Uninstall

```text
1. acceptingWork = false; remove manager resolution for new lifecycle work
2. cancel ordinary lifecycle/callback scopes and reject new capability calls
3. run bounded onDestroy through a dedicated teardown lane
4. invalidate activation authority/key/host binding
5. close capability dispatcher and permission watchers
6. close owner resource registry (streams -> subscriptions -> process/disposers)
7. release all callback registries and external plugin-owned UI/storage resources
8. send shutdown; await exit; force kill after grace; await real exit barrier
9. publish terminal lifecycle state
```

`onDestroy` may use already-declared host capabilities only in step 3. It cannot create a
new long-lived resource. After step 4, no plugin code or late message can retain/recreate a
resource.

### Crash / Protocol Violation / Timeout / Permission Revoke

```text
1. acceptingWork = false and invalidate authority immediately
2. abort all calls; block callback delivery and resource creation
3. dispose affected resources; if dependency cannot be proven, dispose all resources
4. close callbacks/dispatcher/external resources
5. shutdown when cooperative, otherwise kill; await exit barrier
6. emit one redacted terminal diagnostic
```

Do not run capability-enabled `onDestroy` after a security revoke. Permission revoke may
remain fine-grained only when every retained resource records its permission dependency
and main can notify child of disposal. Otherwise terminate the activation fail closed.

## RED/GREEN Slices

### 3B1 - Callback RPC, Transient Lifetime

RED:

- callback IDs are owner/generation/request bound;
- functions are rejected outside declared capability payload fields;
- callback invoke/result round-trip, throw redaction, timeout, concurrent limit;
- duplicate/unknown/stale callback IDs and late results fail closed;
- codec partial-decode rollback releases every callback.

GREEN:

- wire `PluginRuntimeHost` callback requests to child `handleCallback`;
- wire child VM callback markers to child registry;
- release transient callbacks on every success/failure/cancel/timeout/close path.

### 3B2 - Bidirectional Request-Scoped Cancellation

RED:

- child-to-main capability cancel;
- canonical cancelled result accepted once, late success rejected;
- cancelling lifecycle A does not cancel lifecycle B or callback/resource work;
- cooperative feature supersession leaves host active; unresponsive scope is killed after
  grace;
- shutdown still cancels all scopes.

GREEN:

- symmetric cancel parser/session state;
- async-scope ownership in child runtime;
- per-request capability cancellation instead of `cancelAll()`.

### 3B3 - Resource / Disposer Ownership

RED:

- capability may return only a resource registered by that exact invocation;
- wrong kind, cross-plugin/generation, forged/duplicate ID, invalid result rollback;
- child dispose and main close are exactly once;
- main-originated disposal invalidates child facade without echo;
- resource callback retention/release is atomic;
- per-kind and total limits.

GREEN:

- connect main resource registry to capability registry and runtime host;
- connect child resource client to codec and VM child-realm facades;
- add deterministic dispose completion (prefer paired `resource-dispose-result`; if keeping
  one-way dispose, child API stays void and main must track the Promise in teardown).

### 3B4 - Channel Subscription Adapter

RED:

- invoke is one-shot; subscribe returns owner-bound disposer;
- event callback result/error/timeout behavior;
- unsubscribe/dispose twice is locally idempotent;
- revoke/disable removes host listener before callback release completes;
- no raw event/port/key/handler object crosses the boundary.

GREEN:

- typed `channel.invoke` and `channel.subscribe` validators/adapters;
- SDK wrapper maps subscription token to legacy disposer shape.

### 3B5 - Intelligence And Voice Streams

RED:

- ordered start/delta/end/error events and exact-once terminal cleanup;
- cancel before controller resolution, after first delta, and after end;
- callback timeout/queue overflow/provider error dispose all main transport resources;
- late events after cancel/revoke/disable are ignored;
- `touch-intelligence` partial-result cancellation and `touch-dictation` no-controller
  retention behavior;
- no MessagePort is exposed to child.

GREEN:

- one discriminated event callback per stream;
- main-owned adapter wraps existing typed transport controller;
- child SDK projects official callback/controller API.

### 3B6 - Lifecycle And Security Barriers

RED:

- normal disable ordering and security revoke ordering above;
- onDestroy cannot create retained resources;
- callback pending during crash rejects; all registry counts reach zero before observer;
- replacement generation rejects every old callback/resource/cancel/dispose message.

GREEN:

- integrate registries into runtime service ownership and exactly-once cleanup;
- make termination observer run only after the real child `exit` event.

## Electron Smoke Extension

Extend `apps/core-app/scripts/plugin-host-isolation-smoke.cjs` with two real utility
processes and an in-memory main adapter:

1. Alpha subscribes through a callback; main emits two events; child observes FIFO values
   and returns them through a lifecycle query.
2. Alpha starts an Intelligence-like stream; main emits start/delta/end; child receives
   one terminal end and registry counts return to zero.
3. Start another Alpha stream, cancel before its resource/controller Promise resolves,
   then resolve late. Main disposer runs once, no callback fires, and Alpha remains active.
4. Supersede one Alpha feature lifecycle. Only calls in that lifecycle receive abort;
   another Alpha lifecycle and Beta remain usable.
5. Dispose a channel subscription twice through the child facade. Exactly one wire dispose
   and one main disposer occur.
6. Revoke the stream permission. Authority/resources/callbacks clear before exit; late
   provider events cannot post to child.
7. Rotate Alpha generation and inject old callback/result/dispose/cancel messages. None
   complete new work; Beta stays active.
8. Crash Alpha while a callback is pending. Callback Promise rejects with a stable code,
   all Alpha resources close, exit barrier settles, and Beta completes a fresh call.
9. Send oversized callback payload/result and overfill stream queue. Alpha fails closed
   with stable diagnostics and no payload/path/handle leakage; Beta remains healthy.

Assertions must include distinct PIDs, zero pending callbacks/resources/subscriptions after
each terminal path, exact disposer counts, listener removal, main process survival, and
absence of raw handles/keys/native errors in output.

## Transient WIP Hazards To Re-check

These were observed while parallel edits were still in progress and may be resolved by the
time implementation consumes this document:

- `PluginHostChildCapabilityClient` called `callbacks.hasRequest(...)` before that method
  existed in the observed callback registry snapshot.
- capability manifests changed from IDs to declaration objects; child VM construction must
  build its declared-ID set from `declaration.id`, not object identity.
- capability callback lifetime types existed in both wire and capability modules; keep one
  canonical type.
- new resource registry option snapshots used direct property reads/spread in the observed
  snapshot; hostile accessors must be rejected without execution.
- child VM resource projection was being added, but end-to-end child-realm
  `cancelled/cancel/dispose` behavior and host-to-child disposal were not yet complete.
- no focused `plugin-host-callbacks.test.ts` or `plugin-host-resources.test.ts` existed in
  the observed snapshot.

## Source References

- `.trellis/tasks/07-27-isolate-plugin-prelude-297/{prd.md,design.md,implement.md}`
- `.trellis/spec/frontend/plugin-runtime-security.md`
- `.trellis/spec/frontend/native-resource-protocols.md`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-wire.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-session.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-wire-codec.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-capabilities.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-child-capabilities.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-child-runtime.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-host-process.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-runtime-host.ts`
- `apps/core-app/src/main/modules/plugin/host/plugin-runtime-service.ts`
- `packages/utils/transport/sdk/stream/{protocol,client-runtime,server-runtime}.ts`
- `packages/utils/transport/sdk/domains/{intelligence,voice}.ts`
- `packages/utils/plugin/sdk/{channel,channel-client,intelligence,voice}.ts`
- `plugins/{touch-intelligence,touch-dictation,touch-translation}/index.js`
- Electron 41.10.2 local declaration: `node_modules/electron/electron.d.ts:15372-15539`
  (`exit` is emitted after termination; `kill()` requests graceful SIGTERM/reaping on
  POSIX; transferred `MessagePortMain` ownership is explicit).
