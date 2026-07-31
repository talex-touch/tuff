# Rust Native Communication Protocol - Design

## 1. Scope and invariants

Protocol v1 is the internal boundary between the Electron main process and Rust capability addons. It reuses TuffTransport's request, stream, cancellation, and single-terminal semantics, but it does not copy Electron channel routing, batching, cache, MessagePort, or plugin identity.

The design has these non-negotiable invariants:

1. Only the Electron main process loads production native addons.
2. Control data and binary data travel separately. The attachment lane ends in the main process; renderer/plugin TuffTransport receives only bounded metadata and controlled local-resource descriptors.
3. Every unary request and stream has at most one terminal result.
4. A timeout, caller cancellation, or transport dispose suppresses late native completion.
5. Stream production is credit-bounded; no layer may add an unbounded queue.
6. Capability addons remain independently loadable and independently degradable.
7. Rust protocol/core code has no Electron or N-API dependency.
8. Sensitive payloads and attachments are never logged or embedded in errors.

## 2. Architecture

```text
renderer / plugin / system action / Assistant
                     |
              typed TuffTransport
                     |
       NativeCapabilitiesModule (policy)
      caller identity / permission / products
                     |
              NativeTransport (main)
       routing / timeout / cancel / health
           /             |              \
 NapiCarrier(audio) NapiCarrier(screenshot) future sidecar
           |             |
       identical protocol-v1 N-API exports
           |             |
        native-napi adapter linked into each addon
           |             |
       native-core registry/runtime/state machines
           |             |
       capability-specific Rust implementation
```

`NativeTransport` is the only post-migration product entry point. It owns carrier loading, handshake, routing, in-flight state, timers, stream queues, tombstones, health, and disposal. `NativeCapabilitiesModule` remains above it and retains caller identity, plugin authorization, clipboard, file selection, temporary-resource, and `tfile` policy.

Each `.node` addon links the shared Rust libraries but owns its own registry and process-local runtime state. One addon's load or system dependency failure therefore cannot prevent another addon from handshaking.

## 3. Workspace ownership

The target Rust layout is:

```text
packages/tuff-native/
  Cargo.toml                       # workspace root and one Cargo.lock
  native-core/                     # carrier-neutral protocol/runtime
  native-napi/                     # napi-rs packet and callback adapter
  native-screenshot/               # independent cdylib
  native-audio/                    # independent cdylib, not migrated in this task
  fixtures/native-protocol-addon/  # test-only cdylib, never packaged
```

`native-core` owns:

- protocol v1 models and validation;
- version negotiation;
- attachment descriptor validation;
- stable errors and categories;
- capability and operation descriptors;
- unary and stream registry traits;
- cancellation tokens, credit accounting, and terminal guards;
- bounded runtime limits;
- golden fixture decoding.

`native-napi` owns only carrier adaptation:

- control JSON parse/encode;
- JS `Buffer[]` conversion;
- napi-rs async unary execution;
- per-stream ThreadsafeFunction delivery;
- N-API environment cleanup hooks;
- mapping unexpected N-API failures to a sanitized carrier error.

It must not contain screenshot/audio business logic or main-process policy.

## 4. Carrier-neutral packet model

### 4.1 Encoding

A packet consists of:

```ts
interface NativePacket {
  control: string       // UTF-8 JSON, bounded before parsing
  attachments: Buffer[] // never base64 or nested in control
}
```

The same control JSON is usable by N-API now and by a framed sidecar later. Protocol v1 does not promise zero-copy. At the N-API boundary, input attachments become Rust-owned bytes before asynchronous work outlives the call; output `Vec<u8>` values become Node Buffers owned by the JS result. A later carrier may optimize copies without changing ownership semantics.

This is a deliberately narrow revision to the existing native-resource rule: the bounded N-API attachment array is the internal Rust-to-main data plane, not a renderer-facing native callback payload. `NativeTransport` validates the packet and the owning capability service must consume or materialize large resource bytes under the controlled local-resource/`tfile` boundary. It must not relay attachments through typed TuffTransport, MessagePort, preload, renderer, or plugin SDK. The task must update `.trellis/spec/frontend/native-resource-protocols.md` to record this distinction before completion.

Control JSON readers ignore unknown fields within a compatible minor version. Required fields and semantic invariants remain strict. JSON numbers must be finite, control depth remains within the parser's bounded depth, and the encoded control byte limit is checked before decoding.

### 4.2 Version negotiation

Client hello advertises a supported range:

```ts
interface ClientHelloV1 {
  kind: 'client_hello'
  protocol: { major: 1; minMinor: number; maxMinor: number }
  client: { name: 'core-app'; version: string }
  requestedFeatures: Array<'attachments' | 'stream-credit-v1'>
}
```

Server hello returns the selected version and runtime snapshot:

```ts
interface ServerHelloV1 {
  kind: 'server_hello'
  protocol: { major: 1; minor: number }
  runtime: {
    addonId: string
    addonVersion: string
    target: string
    platform: string
    arch: string
    buildProfile: 'debug' | 'release'
  }
  carrierFeatures: Array<'attachments' | 'stream-credit-v1'>
  limits: NativeProtocolLimits
  capabilities: NativeCapabilityDescriptor[]
}
```

A major mismatch is fatal for that carrier. Minor negotiation chooses the highest shared minor. Missing mandatory carrier features is also a handshake failure. Build metadata must not include source paths, usernames, signing identities, or environment contents.

### 4.3 Request and response

```ts
interface NativeRequestV1 {
  kind: 'request'
  protocol: { major: 1; minor: number }
  requestId: string
  capability: string
  operation: string
  deadlineUnixMs?: number
  payload: unknown
  attachments: NativeAttachmentDescriptor[]
}

interface NativeAttachmentDescriptor {
  id: string
  index: number
  byteLength: number
  mediaType?: string
  purpose?: string
}

type NativeResponseV1 =
  | {
      kind: 'response'
      protocol: { major: 1; minor: number }
      requestId: string
      ok: true
      payload: unknown
      attachments: NativeAttachmentDescriptor[]
      meta: NativeRunMeta
    }
  | {
      kind: 'response'
      protocol: { major: 1; minor: number }
      requestId: string
      ok: false
      error: NativeProtocolError
      attachments: []
      meta: NativeRunMeta
    }
```

`requestId`, capability, operation, attachment ID, error code, and feature IDs are bounded printable ASCII identifiers. The descriptor array must match the actual `Buffer[]` exactly by index and byte length. Duplicate IDs, sparse indexes, undeclared Buffers, and declared-but-missing Buffers are rejected before capability dispatch.

`deadlineUnixMs` is checked at admission and drives a Rust cancellation token during execution. Native code uses an internal monotonic timer after admission. Expiration yields `DEADLINE_EXCEEDED`; it is never reported as a generic internal failure.

`NativeRunMeta` is allowlisted and bounded:

```ts
interface NativeRunMeta {
  durationMs: number
  engine?: string
  degraded?: boolean
  cancellation?: 'cooperative' | 'best-effort' | 'none'
  counters?: Record<string, number> // descriptor-defined safe counters only
}
```

It cannot contain payload excerpts, attachment bytes, titles, paths, OCR/QR text, or free-form platform exception text.

## 5. Errors

```ts
interface NativeProtocolError {
  code: string
  category:
    | 'protocol'
    | 'validation'
    | 'availability'
    | 'permission'
    | 'not_found'
    | 'cancelled'
    | 'timeout'
    | 'resource'
    | 'internal'
  message: string
  retryable: boolean
  details?: Record<string, string | number | boolean>
}
```

Core v1 codes include:

- `PROTOCOL_VERSION_UNSUPPORTED`
- `PROTOCOL_FEATURE_UNSUPPORTED`
- `MALFORMED_CONTROL`
- `INVALID_ENVELOPE`
- `CAPABILITY_NOT_FOUND`
- `OPERATION_NOT_FOUND`
- `INVALID_ARGUMENT`
- `ATTACHMENT_MISMATCH`
- `ATTACHMENT_LIMIT_EXCEEDED`
- `DEADLINE_EXCEEDED`
- `CANCELLED`
- `TRANSPORT_DISPOSED`
- `NATIVE_BUSY`
- `NATIVE_UNAVAILABLE`
- `PERMISSION_DENIED`
- `RESOURCE_EXHAUSTED`
- `CAPABILITY_CONFLICT`
- `DUPLICATE_REQUEST_ID`
- `STREAM_NOT_FOUND`
- `NATIVE_PROTOCOL_VIOLATION`
- `NATIVE_BACKPRESSURE_BROKEN`
- `NATIVE_DISPOSE_TIMEOUT`
- `INTERNAL`

Capabilities may add stable namespaced codes such as `SCREENSHOT_DISPLAY_NOT_FOUND`. Their category and retryability are explicit, not inferred from message text.

Only errors deliberately constructed as `NativeProtocolError` may cross the protocol boundary. Unexpected Rust, N-API, or system errors are sanitized to a stable code and safe message. Main maps these to `NativeTransportError`; raw addon stacks are not forwarded to renderers/plugins.

## 6. Capability discovery and routing

```ts
interface NativeCapabilityDescriptor {
  id: string
  version: string
  engine?: string
  state: 'available' | 'degraded' | 'unavailable'
  reason?: string
  features: string[]
  operations: Array<{
    name: string
    mode: 'unary' | 'stream'
    cancellation: 'cooperative' | 'best-effort' | 'none'
    acceptsAttachments: boolean
    emitsAttachments: boolean
  }>
}
```

Descriptors are snapshots from handshake. Runtime health is a carrier-scoped control operation implemented by each addon's registry, not an advertised aggregate capability. `NativeTransport.health()` iterates initialized carriers directly and invokes reserved `native.runtime/health` on that carrier; `native.runtime` is excluded from the capability route table and cannot conflict across addons or be invoked through the generic product API. Health may update state/reason, but it cannot silently change protocol version or operation shape.

`NativeTransport` routes descriptors in `available` or `degraded` state and retains the degraded reason in health/results. `unavailable` descriptors are diagnostic-only and are not routable. If more than one carrier advertises the same routable capability ID, that capability fails with `CAPABILITY_CONFLICT`; filesystem order never selects a winner. One routable descriptor plus any number of unavailable descriptors remains routable. Dynamic health never promotes an initially unavailable descriptor into the route table; that requires a new app/addon lifecycle and handshake.

Unavailable addons and descriptors remain in the aggregate health snapshot with sanitized reasons. Other carriers continue to initialize.

## 7. N-API v1 exports

Every protocol-enabled addon exposes the same versioned functions:

```ts
nativeProtocolV1Handshake(control: string): string
nativeProtocolV1Invoke(control: string, attachments: Buffer[]): Promise<NativePacket>
nativeProtocolV1OpenStream(
  control: string,
  attachments: Buffer[],
  onFrame: (packet: NativePacket) => void,
): NativePacket // accepted response
nativeProtocolV1Ack(control: string): void
nativeProtocolV1Cancel(control: string): void
nativeProtocolV1Dispose(): Promise<void>
```

The export names are versioned so an old binary fails loader validation before a misleading partial handshake.

The workspace keeps one napi-rs toolchain declaration: `napi 3.8.6`, `napi-derive 3.5.5`, and `napi-build 2.3.1`, with `napi4` plus `tokio_rt` where the adapter exports Promise-returning async functions. Cargo.lock pins the Tokio version for all addons. `nativeProtocolV1Invoke` and explicit dispose are `#[napi] async`; capability futures run on the Rust async runtime, and blocking device/system work must use a capability-owned OS queue/thread or `spawn_blocking`. It must never execute on the JS thread.

Handshake, structural validation, ACK, and cancellation are bounded synchronous calls. `openStream` only validates/registers a stream and returns its accepted response; source startup failure is delivered as its single terminal error frame.

A stream owns one bounded ThreadsafeFunction with a compile-time queue capacity of `HARD_MAX_STREAM_WINDOW + 1`; napi-rs 3.x does not accept a runtime value for this capacity. Handshake advertises `maxStreamWindow <= HARD_MAX_STREAM_WINDOW`, and the negotiated effective window is a logical credit limit within the fixed queue. The extra slot is reserved for terminal delivery. All TSFN publication is non-blocking; under the credit and single-terminal invariants, valid data plus one terminal cannot fill beyond that capacity.

`QueueFull` is therefore an invariant breach, not flow control. The adapter atomically marks the stream faulted with `NATIVE_BACKPRESSURE_BROKEN`, cancels its source, and makes no further call into the same TSFN. The next ACK, cancel, or carrier-health control observes that fault; main synthesizes the one local terminal and closes the stream. A caller that stops consuming is still bounded by credit and is released by its explicit cancel/deadline/transport dispose. `begin_dispose()` aborts the TSFN and never waits for queue drainage. Tests must prove valid flows never reach QueueFull and injected QueueFull cannot block cancel/dispose. `Closing` after local cancel/dispose or environment cleanup is a release condition, not a second terminal.

Source-specific sampling may discard source frames before protocol publication, but published protocol frames are never silently dropped. Safe numeric source-drop counters may be reported as metadata.

## 8. Stream protocol

### 8.1 Open and frames

The open request is a normal `NativeRequestV1` whose payload contains a main-generated `streamId` and requested initial window. Main installs the stream state before calling the synchronous export. Open returns a normal `NativeResponseV1`; success has the exact payload below and no attachments, while structural/registry rejection is the normal `ok: false` response correlated by `requestId`. Control so malformed that no valid request ID can be recovered is rejected by N-API as a sanitized `MALFORMED_CONTROL` carrier error rather than inventing an uncorrelated response.

```ts
interface NativeStreamOpenPayload {
  streamId: string
  initialWindow: number
  input: unknown
}

interface NativeStreamAcceptedPayload {
  streamId: string
  effectiveWindow: number
  cancellation: 'cooperative' | 'best-effort' | 'none'
}

type NativeStreamAcceptedV1 = Extract<NativeResponseV1, { ok: true }> & {
  payload: NativeStreamAcceptedPayload
  attachments: []
}

type NativeStreamOpenResultV1 =
  | NativeStreamAcceptedV1
  | Extract<NativeResponseV1, { ok: false }>

type NativeStreamFrameV1 =
  | {
      kind: 'stream_data'
      protocol: { major: 1; minor: number }
      streamId: string
      sequence: number
      payload: unknown
      attachments: NativeAttachmentDescriptor[]
      meta?: { counters?: Record<string, number> }
    }
  | {
      kind: 'stream_end'
      protocol: { major: 1; minor: number }
      streamId: string
      sequence: number
      payload?: unknown
      attachments: NativeAttachmentDescriptor[]
    }
  | {
      kind: 'stream_error'
      protocol: { major: 1; minor: number }
      streamId: string
      sequence: number
      error: NativeProtocolError
      attachments: []
    }
```

Data sequence starts at `1` and is contiguous. Every sequence and window value must be a positive JavaScript safe integer (`<= 2^53 - 1`) and is checked before conversion to Rust `u64`. The terminal frame uses checked `lastDataSequence + 1`; reaching the maximum terminates with `RESOURCE_EXHAUSTED` before overflow. Exactly one of `stream_end` or `stream_error` is allowed. A terminal frame does not consume credit.

### 8.2 Credit and ACK

The producer starts with `effectiveWindow` credits. Publishing one data frame consumes one credit. Main sends one synchronous ACK immediately when its AsyncIterator removes each next contiguous chunk from the local queue, before resolving that iterator result; v1 does not batch or defer ACKs to a threshold/microtask.

```ts
interface NativeStreamAckV1 {
  kind: 'stream_ack'
  protocol: { major: 1; minor: number }
  streamId: string
  ackSequence: number // cumulative safe integer
}

interface NativeCancelV1 {
  kind: 'cancel'
  protocol: { major: 1; minor: number }
  target: { type: 'request' | 'stream'; id: string }
  reason: 'caller' | 'consumer_closed' | 'deadline' | 'dispose'
}
```

For each stream, Rust maintains the checked invariant:

```text
0 <= lastAckSequence <= lastPublishedSequence <= 2^53 - 1
inFlight = lastPublishedSequence - lastAckSequence
effectiveWindow >= 1
0 <= inFlight <= effectiveWindow
availableCredit = effectiveWindow - inFlight
```

`ackSequence === lastAckSequence` is an idempotent no-op. A regression or ACK beyond the last published data sequence is `NATIVE_PROTOCOL_VIOLATION`. Rust grants exactly the checked positive delta and never lets available credit exceed the effective window. The synchronous ACK export only updates stream state and wakes the background producer; it must never resume production or make a blocking/non-blocking TSFN call inline on the JS stack.

Rust atomically moves terminal stream credit state from the active map into a fixed-size completed-stream tombstone map before announcing idle. This preserves cumulative ACK validation when the producer has queued terminal and removed active work before JS consumes the final data callback. Tombstones retain no payload or attachment bytes, are capped at 256 entries, reject ID reuse while retained, and are cleared on dispose; unknown IDs still return `STREAM_NOT_FOUND`.

If the consumer stalls, Rust pauses at zero credit. System capture APIs may maintain their own explicitly bounded queue or sampling policy, but they cannot spill unbounded frames into protocol memory.

### 8.3 Main API

```ts
interface NativeTransport {
  initialize(): Promise<NativeTransportSnapshot>
  invoke<TInput, TOutput>(
    capability: string,
    operation: string,
    input: TInput,
    options?: NativeInvokeOptions,
  ): Promise<NativeResult<TOutput>>
  openStream<TInput, TChunk>(
    capability: string,
    operation: string,
    input: TInput,
    options?: NativeStreamOptions,
  ): NativeStream<TChunk>
  health(): Promise<NativeTransportHealth>
  dispose(): Promise<void>
}

interface NativeInputAttachment {
  id: string
  data: Buffer
  mediaType?: string
  purpose?: string
}

interface NativeInvokeOptions {
  attachments?: NativeInputAttachment[]
  signal?: AbortSignal
  timeoutMs?: number
}

interface NativeStreamOptions extends NativeInvokeOptions {
  initialWindow?: number
}

interface NativeStream<T> extends AsyncIterable<NativeResult<T>> {
  readonly id: string
  readonly closed: Promise<NativeStreamTerminal>
  cancel(): void
}
```

The internal queue is bounded by the negotiated window. Iterator `return()`, AbortSignal, deadline, sender teardown at the policy layer, and transport disposal all call the same idempotent cancel path. Cancel control carries only a fixed reason code (`caller`, `consumer_closed`, `deadline`, or `dispose`), never caller-authored free text.

## 9. State machines

### 9.1 Unary

```text
CREATED -> DISPATCHED -> TERMINAL -> RELEASED
    |          |            ^
    +-> CANCELLED_LOCAL -----+
    +-> TIMED_OUT_LOCAL ------+
    +-> DISPOSED_LOCAL -------+
```

The main state owns the only promise resolver. Request and stream IDs use a cryptographically random per-process nonce plus a monotonically increasing BigInt counter encoded as ASCII; they are never reused within the process, and counter exhaustion fails closed. Every native callback also captures the exact main state token/generation created before dispatch and must match by object identity, not only by ID. Tombstones are bounded diagnostic suppression, not the primary anti-reuse mechanism.

Local cancel/timeout/dispose atomically claims terminal ownership, sends best-effort native cancellation, rejects the caller, removes in-flight state, and leaves a short-lived tombstone. A later native completion is rejected by state-token ownership and cannot re-resolve or log payload data.

Rust has its own atomic terminal guard and cancellation token. Cooperative operations poll or await that token. An operation descriptor marked `best-effort` may finish an uninterruptible system call, but its result is discarded after cancellation.

### 9.2 Stream

```text
OPENING -> OPEN -> CANCELLING -> TERMINAL -> RELEASED
              |                     ^
              +---------------------+
```

Frame validation checks carrier ownership, stream ID, exact next sequence, attachments, and terminal state. Invalid sequence or attachment shape terminates locally with `NATIVE_PROTOCOL_VIOLATION`, cancels Rust, and closes the ThreadsafeFunction.

Native cancellation should emit one `CANCELLED` terminal error. Main does not wait indefinitely: after a bounded cancellation grace period it synthesizes the corresponding local terminal, releases state, and tombstones the stream. Any later callback is ignored by state-token identity. Caller-initiated cancellation may clear queued chunks immediately; a native error/end without local cancellation preserves already queued contiguous chunks before exposing terminal state.

Terminal precedence is first-owner with stable local codes: a main deadline that claims first reports `DEADLINE_EXCEEDED`; caller/iterator cancellation that claims first reports `CANCELLED`; dispose that claims first reports `TRANSPORT_DISPOSED`; an already processed native end/error wins only if it claimed first. A native terminal merely queued in TSFN has not yet claimed main terminal ownership, so a local deadline may still win. Rust maps an internally expired deadline to `DEADLINE_EXCEEDED`, not generic cancellation.

Main creates OPENING state before the synchronous open call. A frame callback arriving before application code observes the accepted response is queued against that state. An open rejection, local cancellation, or dispose atomically closes it; subsequent accepted/frame callbacks cannot resurrect it.

## 10. Lifecycle and disposal

`NativeTransport` has an explicit lifecycle:

```text
NEW -> INITIALIZING -> READY -> DISPOSING -> DISPOSED
```

Concurrent `initialize()` calls share one Promise. `dispose()` during initialization marks disposal intent first; each completed handshake checks that intent before route registration, and every loaded carrier is disposed even if initialization never reaches READY. A handshake cannot publish a carrier after DISPOSING begins. Repeated `dispose()` calls share one Promise. An addon that has entered disposed state cannot accept new work; recovery requires a new app/addon process lifecycle.

Dispose is split into two idempotent Rust phases. `begin_dispose()` is synchronous and non-blocking: mark non-accepting, cancel tokens, wake credit waiters, stop future callbacks, and request source shutdown. `finish_dispose()` performs bounded joins away from the JS thread.

Explicit application disposal runs:

1. transition once to DISPOSING and reject new calls;
2. await/settle any shared initialization within `NativeTransportPolicy.handshakeTimeoutMs`;
3. atomically terminate main unary and stream states using the precedence rules above;
4. send cancel for every native operation;
5. start every loaded carrier dispose concurrently; each Rust runtime uses its advertised `disposeGraceMs` for worker completion;
6. cap the whole `Promise.allSettled` phase with `NativeTransportPolicy.maxTransportDisposeMs`, so total shutdown does not grow linearly with carrier count;
7. abort/release ThreadsafeFunctions and clear maps/timers/tombstones;
8. transition to DISPOSED and reject post-dispose calls with `TRANSPORT_DISPOSED`.

`finish_dispose()` waits on worker completion channels up to `disposeGraceMs`; Rust does not attempt an unbounded `JoinHandle::join`. On timeout it retains the worker's Arc-owned state until self-termination, prevents addon re-entry, reports `NATIVE_DISPOSE_TIMEOUT`, and never unloads/frees state still reachable by that worker. Main timeout applies even if a carrier Promise fails to settle, records only carrier ID/count/code, and continues its own bounded shutdown policy.

The N-API environment cleanup hook can no longer await JS-visible work, so it invokes only `begin_dispose()`, marks the environment token dead, and prevents all subsequent TSFN/Promise publication. Owned workers observe cancellation and self-terminate; explicit app shutdown remains the evidence-bearing path that awaits `finish_dispose()`.

## 11. Limits

Handshake advertises concrete limits and main enforces the stricter of its policy and carrier values:

```ts
interface NativeProtocolLimits {
  maxControlBytes: number
  maxAttachmentCount: number
  maxAttachmentBytes: number
  maxPacketAttachmentBytes: number
  maxInFlightUnary: number
  maxOpenStreams: number
  maxStreamWindow: number
  cancelGraceMs: number
  disposeGraceMs: number
}

interface NativeTransportPolicy {
  handshakeTimeoutMs: number
  maxTransportDisposeMs: number
}
```

Initial implementation values belong in one shared limits module and golden fixtures, not scattered magic numbers. Capability-level budgets may be stricter. `RESOURCE_EXHAUSTED` identifies admission/budget failure; allocation failure never becomes fake success.

## 12. Compatibility

This task adds the protocol path without forcing all native features through it at once:

- current screenshot/audio/OCR/Everything facades keep their existing exports and behavior;
- the package adds a low-level protocol carrier facade for main-process use;
- migrated business services depend on `NativeTransport`, never the raw binding;
- screenshot migrates in its child task after protocol acceptance;
- audio/OCR/Everything migrate only through later scoped tasks;
- the native-resource spec is revised so bounded N-API attachments are explicitly Rust-to-main only, while outer TuffTransport/native resource consumers remain descriptor-only.

No renderer or plugin receives the low-level carrier export. `NativeEvents` and `NativeSdk` remain the external typed boundary.

## 13. Observability and privacy

Allowed diagnostics:

- carrier/addon ID and version;
- protocol version;
- platform, architecture, engine, and capability state;
- request/stream opaque IDs;
- operation ID, duration, counts, byte lengths, and stable error code;
- queue depth/credit values without payload contents.

Forbidden diagnostics:

- control payload serialization;
- attachment contents or base64;
- screenshot/audio/OCR/QR content;
- window titles;
- absolute sensitive paths;
- raw native exception text that may contain any of the above.

Tests include a logger spy proving fixture secrets do not appear in messages or metadata.

## 14. Verification strategy

One fixture directory is consumed by both Rust and Node tests. It covers hello negotiation, successful/failed responses, unknown operation, incompatible major/minor, malformed control, attachment round-trip/mismatch, stream accepted/rejected/data/end/error, duplicate/regressive/ahead ACK, safe-integer limits, typed cancel reasons, deadline precedence, and every core stable error code.

A test-only addon provides:

- `fixture.echo` unary with input/output attachments;
- `fixture.delay` cooperative cancellation and late completion;
- `fixture.counter` reliable stream with configurable count/window;
- `fixture.fail` structured terminal error;
- disposal while unary and stream work are active.

A real integration test loads that addon through the production `NapiCarrier`, passes it into the production main-process `NativeTransport`, and consumes the resulting `NativeStream` AsyncIterable. It asserts input Buffer post-call mutation isolation, output Buffer round-trip, contiguous sequence, immediate consumer-driven ACK, queue bound, cancel/error/end single terminal, initialize/dispose races, state-token late-delivery suppression, unsubscribe, dispose, and sanitized logging.

Compatibility tests separately exercise screenshot/audio/OCR/Everything facades with bindings present, absent, and env-disabled where supported. The mocked CoreApp VoiceService test supplements but does not replace an audio package-facade contract test.

## 15. Rollout and rollback

1. Land workspace/core, fixtures, and tests without migrating production capabilities.
2. Land N-API carrier and main `NativeTransport` behind no user-facing call site.
3. Prove fixture unary and stream in development and CI.
4. Migrate screenshot in its own task while preserving the legacy facade as a bounded fallback.
5. Remove fallback only after packaged evidence and audit closure.

Rollback disables protocol-backed capability routing and restores the existing capability facade. It does not remove the shared workspace or alter outer TuffTransport contracts. Protocol mismatch, addon absence, or failed handshake must remain visible as stable degraded health, never as a successful empty result.
