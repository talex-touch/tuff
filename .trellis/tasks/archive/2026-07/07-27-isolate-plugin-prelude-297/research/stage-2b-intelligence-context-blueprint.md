# Stage 2B: Owner-Bound Intelligence Context Invoke/Stream Blueprint

> Research status: the invoke foundation has been implemented and its executable contract
> now lives in `.trellis/spec/frontend/plugin-runtime-security.md` under
> `Activation-Bound Intelligence Context Invoke`. The implementation uses the final nested
> `{ invocation, context }` result projection. Stream, callback/resource, and official
> Prelude sections below remain design research, not completed behavior or release evidence.

## 1. Fixed Capability IDs & Exact DTOs

### Capability IDs (separate from existing `intelligence.invoke`)

```
intelligence.context.invoke   — one-shot context execution (prepare → invoke → finalize)
intelligence.context.stream   — streaming context execution (prepare → stream → finalize)
```

These are distinct from Stage 2A `intelligence.invoke` which only wraps raw `text.chat`/`vision.ocr` without context session/memory/retrieval/hygiene.

### Invoke Request DTO (`intelligence.context.invoke`)

```
{
  operation: 'context.invoke',
  capabilityId: 'text.chat',              // only 'text.chat' is valid
  input: string,                          // max 16 KiB, non-empty trimmed
  payload: {
    messages: [{ role: 'system'|'user'|'assistant', content: string }]
  },
  options?: {
    preferredProviderId?: string,         // max 256 bytes
    modelPreference?: string[],           // max 8 entries, each max 256 bytes
    promptTemplate?: string,              // max 32 KiB
    promptVariables?: Record<string, string>, // max 32 keys, each value max 8 KiB
    metadata?: {
      entry?: string,
      featureId?: string,
      requestId?: string,
      inputKinds?: string[],             // max 16, each 64 bytes
      aiCommandId?: string,
      aiCommandVersion?: string,
      capabilityId?: 'text.chat',
      selectedProviderId?: string,
      selectedModel?: string
      // "caller" is FORBIDDEN — main derives it
    }
  },
  context: {
    mode: 'new' | 'continue' | 'stateless',
    owner?: 'corebox' | 'assistant',     // only 'corebox'|'assistant' accepted from touch-intelligence
    sessionId?: string,                   // max 256 bytes, only when mode='continue'
    scope?: 'light' | 'session' | 'retrieval',
    objective?: string,                   // max 16 KiB
    tokenBudget?: number,                 // 1..16000
    traceId?: string                      // max 256 bytes
    // "history" / "conversation" is FORBIDDEN — main derives from hygiene service
  }
}
```

### Invoke Result DTO

```
{
  operation: 'context.invoke',
  result: string,                         // bounded 256 KiB text
  providerId: string,
  modelId: string,
  traceId: string,
  latency: number,
  context: {                              // IntelligenceContextExecutionSummary subset
    mode: 'new' | 'continue' | 'stateless',
    scope: string,
    sessionId?: string,
    turnId?: string,
    packageId?: string,
    traceId?: string,
    itemCount: number,
    tokenBudget: number,
    tokenEstimate: number,
    sourceTypes: string[],
    retrievalItemCount: number,
    citationCount: number,
    degradedReason?: string
    // "checkpoint", "continuation" are host-only, not exposed to child
  }
}
```

### Stream Request DTO (`intelligence.context.stream`)

```
{
  operation: 'context.stream',
  capabilityId: 'text.chat',              // only 'text.chat'
  input: string,                          // same bounds as invoke
  payload: { messages: [...] },           // same as invoke
  options?: { ... },                      // same as invoke
  context: { ... },                       // same as invoke
  onStart: CALLBACK,                      // callbackField[0]
  onDelta: CALLBACK,                      // callbackField[1]
  onUsage: CALLBACK,                      // callbackField[2] (optional)
  onEnd: CALLBACK,                        // callbackField[3]
  onError: CALLBACK                       // callbackField[4]
}
```

### Stream Event DTOs (main→child callback args)

```
// onStart event
{
  type: 'context.stream.start',
  providerId: string,
  modelId: string,
  traceId: string,
  context?: IntelligenceContextExecutionSummary
}

// onDelta event
{
  type: 'context.stream.delta',
  delta: string,                          // max 16 KiB
  content?: string,                       // cumulative content, max 256 KiB
  providerId?: string,
  modelId?: string,
  traceId?: string
}

// onUsage event
{
  type: 'context.stream.usage',
  usage: {
    promptTokens: number,
    completionTokens: number,
    totalTokens: number
    // cost is host-only, not exposed
  },
  providerId?: string,
  modelId?: string,
  traceId?: string
}

// onEnd event
{
  type: 'context.stream.end',
  content?: string,                       // final content, max 256 KiB
  result?: string,                        // same as content
  providerId?: string,
  modelId?: string,
  traceId?: string,
  latency?: number,
  metadata?: { latency?: number },
  context: IntelligenceContextExecutionSummary
}

// onError event
{
  type: 'context.stream.error',
  code: string                            // stable redacted code, never native message
}
```

### Bounds Constants

```
MAX_INPUT_BYTES = 16 * 1024
MAX_MESSAGES = 64
MAX_MESSAGE_BYTES = 16 * 1024
MAX_CHAT_BYTES = 64 * 1024
MAX_RESULT_TEXT_BYTES = 256 * 1024
MAX_STREAM_DELTA_BYTES = 16 * 1024
MAX_STREAM_CONTENT_BYTES = 256 * 1024
MAX_OBJECTIVE_BYTES = 16 * 1024
MAX_OWNER_STRING_BYTES = 64
MAX_SESSION_ID_BYTES = 256
MAX_TRACE_ID_BYTES = 256
MAX_SOURCE_TYPES = 16
MAX_SOURCE_TYPE_BYTES = 32
DEPTH_LIMIT = 32
MEMBER_LIMIT = 10_000
WIRE_MESSAGE_BYTES = 1 * 1024 * 1024
INVOKE_TIMEOUT_MS = 60_000
STREAM_TIMEOUT_MS = 30_000   // start timeout, stream may run longer
MAX_CONCURRENT_CONTEXT = 2   // one invoke + one stream per activation
CONTEXT_PERMISSION = 'intelligence.basic'
```

### Child Cannot Supply

- `caller` / `actor.id` / `owner` — main derives `plugin:<manifest name>` from authoritative activation
- `signal` / `AbortSignal` — main injects its own; child DTO has no signal field
- `context.owner` outside `['corebox', 'assistant']` — only these two are valid for touch-intelligence
- Raw `sessionId` for handoff — main owns the context session namespace
- `history` / `conversation` / `messages` as trusted context — main derives from hygiene service
- `endpoint` / `apiKey` / `credentials` / `providerEndpoint` / `quota` / `token`
- `contextEntrypoint.id` except `corebox.ai-ask` and `assistant.voice`

---

## 2. Main Host Projection Using IntelligenceContextExecutionService

### Host Service Interface

```ts
interface PluginIntelligenceContextHostService {
  contextInvoke(
    request: ValidatedContextRequest,
    signal: AbortSignal,
    caller: string              // "plugin:<manifest name>"
  ): Promise<ValidatedContextInvokeResult>

  contextStream(
    request: ValidatedContextStreamRequest,
    signal: AbortSignal,
    caller: string
  ): AsyncIterable<ValidatedContextStreamEvent>
}
```

### Implementation: `createPluginIntelligenceContextHostService()`

File: `apps/core-app/src/main/modules/plugin/host/plugin-intelligence-context-host-service.ts`

```ts
import { intelligenceContextExecutionService } from '../../ai/intelligence-context-execution'

export function createPluginIntelligenceContextHostService(deps?) {
  const execution = deps?.execution ?? intelligenceContextExecutionService

  return Object.freeze({
    async contextInvoke(request, signal, caller) {
      // 1. Validate call boundary (capabilityId, signal, caller format)
      // 2. Build IntelligenceContextExecutionRequest:
      //    - capabilityId: 'text.chat'
      //    - input: validated bounded string from request
      //    - payload: validated chat payload from request
      //    - options: validated invoke options (with caller injected into metadata.caller)
      //    - context: {
      //        mode, owner, sessionId, scope, objective, tokenBudget, traceId
      //      }
      // 3. Build actor: { id: caller, type: 'plugin' }
      // 4. Call execution.invoke<string>(contextRequest, actor)
      // 5. Validate & project result:
      //    - strip usage (promptTokens, completionTokens, totalTokens, cost)
      //    - strip raw blocks, reasoning
      //    - project context summary (strip checkpoint, continuation)
      //    - validate latency bounds
      // 6. Return frozen DTO

      const actor = { id: caller, type: 'plugin' as const }
      const contextRequest = buildContextExecutionRequest(request, actor)

      if (signal.aborted) throw cancelledError()

      const result = await execution.invoke<string>(contextRequest, actor)

      if (signal.aborted) throw cancelledError()

      return projectContextInvokeResult(result)
    },

    async *contextStream(request, signal, caller) {
      // Same preparation as invoke, but:
      // 1. Build context request
      // 2. Get async generator from execution.stream()
      // 3. For each event:
      //    - start/delta/usage/end: project to bounded stream event DTO
      //    - Inject context summary on start/end events
      //    - Check signal.aborted on every yield
      //    - Strip raw provider internals
      // 4. On signal abort: iterator.return(), yield error event
      // 5. On native error: yield { type: 'context.stream.error', code: stableCode }
    }
  })
}
```

### Actor Derivation

Main derives actor strictly from the authoritative activation:

```ts
const caller = `plugin:${activation.name}`
const actor = { id: caller, type: 'plugin' as const }
```

The `canUseRequestedOwner()` check in `IntelligenceContextExecutionService` already gatekeeps:
- `actor.type === 'host'` → any owner allowed
- `actor.type === 'plugin'` + `actor.id === 'plugin:touch-intelligence'` + owner is `corebox` or `assistant` → allowed
- Otherwise → `CONTEXT_SESSION_OWNER_FORBIDDEN`

This is already correct for isolated touch-intelligence. No extension needed.

### Signal Propagation

The host injects its own `AbortSignal` into `IntelligenceContextExecutionService` calls:

1. **IntelligenceContextExecutionService.invoke()** calls `this.runtime.invoke()` which goes to `tuffIntelligence.invoke()`. The Stage 1 cancellation path (host-only intersection type with `AbortSignal`) is already in place for `text.chat` and `vision.ocr`.

2. **For context invoke**: The signal must propagate through the entire pipeline:
   - `prepare()` (hygiene service) — is NOT currently signal-aware
   - `runtime.invoke()` — IS signal-aware (Stage 1)
   - `finalizeAssistantTurn()` — is NOT currently signal-aware

3. **Required extension to context service**:
   - `ContextHygieneService.prepareTurn()` should accept an optional `AbortSignal` and abort early
   - `IntelligenceContextExecutionService.invoke()` should pass signal to both `prepare()` and `finalizeAssistantTurn()`
   - For stream: `IntelligenceContextExecutionService.stream()` already uses an `AsyncGenerator`; the host should wrap it with signal-aware iteration

4. **Honest physical-vs-containment boundary**: Like Stage 1, signal propagation to the provider is containment-only for `text.chat`. The `tuffIntelligence.invoke()` with signal aborts the host-side await but underlying provider compute may continue. This is acceptable and must be documented as containment, not physical cancellation.

### Extension Required: `IntelligenceContextExecutionService` Signal Propagation

```ts
// In intelligence-context-execution.ts, add AbortSignal to interface:
interface ContextExecutionOptions {
  signal?: AbortSignal
}

// Pass through invoke():
async invoke<T>(request, actor, options?: ContextExecutionOptions) {
  const execution = await this.prepare(request, actor, options?.signal)
  const invocation = await this.runtime.invoke<T>(
    request.capabilityId,
    execution.payload,
    { ...execution.options, signal: options?.signal }
  )
  const context = await this.finalizeAssistantTurn(execution.summary, ...)
  return { invocation, context }
}
```

This is a non-breaking extension: `ContextExecutionOptions` is optional with a default undefined signal.

---

## 3. Stream Pump: Callback + Owner-Bound Resource

### Architecture

Following the Voice stream pattern (`plugin-voice-capabilities.ts` lines 310-370):

```
Child                  Main
  |                      |
  |-- context.stream --> |  (with 5 callback handles: onStart, onDelta, onUsage, onEnd, onError)
  |                      |
  |                      |-- prepare (hygiene)
  |                      |-- execution.stream()
  |                      |
  |<-- onStart ----------|  (event with context summary)
  |<-- onDelta ----------|  (delta text)
  |<-- onUsage ----------|  (token usage)
  |<-- onEnd ------------|  (final content + context summary)
  |                      |-- finalizeAssistantTurn
  |                      |-- auto-dispose resource
  |                      |
  |-- cancel ----------->|  (child-side dispose)
  |<-- resource-disposed-|  (ack)
```

### Key Design Decisions

1. **Capability definition**: `callbackLifetime: 'resource'`, `callbackFields: ['onStart', 'onDelta', 'onUsage', 'onEnd', 'onError']`
2. **One resource per stream**: Main registers a `'stream'` kind resource that wraps `AsyncIterator.return()` + `AbortController`
3. **Event FIFO with backpressure**: Each callback invocation is awaited before the next event is consumed from the iterator
4. **Terminal auto-dispose**: `onEnd` and `onError` trigger automatic resource disposal after the callback completes
5. **Idempotent cancel**: `resource-dispose` from child and host-side teardown are both idempotent; first wins, second is no-op
6. **Callback failure containment**: If `onDelta`/`onStart` throws, the pump catches it, sends `onError`, and disposes

### Stream Pump Implementation (main-side)

```ts
// In plugin-intelligence-context-capabilities.ts

function startContextStreamPump(
  iterable: AsyncIterable<ValidatedContextStreamEvent>,
  request: ContextStreamRequest,
  parentSignal: AbortSignal,
  streamController: AbortController,
  resources: PluginHostCapabilityResourceContext
): object {
  let iterator: AsyncIterator<ValidatedContextStreamEvent>
  try {
    iterator = iterable[Symbol.asyncIterator]()
  } catch { invalid() }
  if (!iterator || typeof iterator.next !== 'function') invalid()

  let disposed = false
  let disposePromise: Promise<void> | null = null

  const dispose = (): Promise<void> => {
    if (disposePromise) return disposePromise
    disposed = true
    parentSignal.removeEventListener('abort', onAbort)
    streamController.abort()
    disposePromise = Promise.resolve()
      .then(async () => {
        if (typeof iterator.return === 'function') await iterator.return()
      })
      .then(() => undefined)
    return disposePromise
  }

  const onAbort = () => { void dispose().catch(() => undefined) }
  parentSignal.addEventListener('abort', onAbort, { once: true })
  if (parentSignal.aborted) onAbort()

  const handle = resources.register('stream', dispose)

  setImmediate(() => {
    void (async () => {
      try {
        while (!disposed && !streamController.signal.aborted) {
          const step = await iterator.next()
          if (disposed || streamController.signal.aborted || step.done) break

          const event = step.value
          switch (event.type) {
            case 'context.stream.start':
              await request.onStart(event)
              break
            case 'context.stream.delta':
              await request.onDelta(event.delta, event)
              break
            case 'context.stream.usage':
              await request.onUsage?.(event.usage, event)
              break
            case 'context.stream.end':
              await request.onEnd(event)
              // auto-dispose after onEnd
              await dispose()
              return
            case 'context.stream.error':
              await request.onError(event)
              await dispose()
              return
          }
        }
      } catch {
        if (!disposed && !streamController.signal.aborted) {
          try {
            await request.onError({ type: 'context.stream.error', code: 'INTELLIGENCE_CONTEXT_STREAM_FAILED' })
          } catch { /* contained */ }
          await dispose()
        }
      }
    })()
  })

  return handle
}
```

### Lifecycle Integration

- **Permission revoke**: Calls `streamController.abort()` → pump sees aborted signal → disposes iterator → sends error event → releases resource
- **Disable/rotation**: `resources.close()` disposes all registered resources → each stream's dispose is called → iterator.return() + abort
- **Cancel before resource**: If child calls `dispose()` before the resource handle is returned, main's resource registration is no-op (already disposed)
- **Late resource**: If the `setImmediate` pump hasn't started and child disposes, the pump checks `disposed` flag on first iteration and exits

---

## 4. Child Facade API

### API Surface (compatible with touch-intelligence current usage)

```js
// globalThis.intelligence (and plugin.intelligence alias, frozen null-prototype)

// NEW: context invoke/stream
intelligence.contextInvoke(request)   // → Promise<ContextInvokeResult>
intelligence.contextStream(request, callbacks)  // → Promise<StreamController>

// EXISTING (Stage 2A): basic invoke
intelligence.invoke(capabilityId, payload, options?)
intelligence.text.chat(payload, options?)
intelligence.vision.ocr(payload, options?)
intelligence.getProviderModelOptions({ capabilityId: 'text.chat' })

// NOT exposed (absent keys):
// intelligence.agentSessionStart    → undefined
// intelligence.contextEvaluateMemory → undefined
// intelligence.agentSessionStart    → undefined
// intelligence.memory               → undefined
// intelligence.hostCapabilities     → undefined (same as Stage 2A)
```

### `contextInvoke(request)` Contract

```ts
interface ContextInvokeRequest {
  capabilityId: 'text.chat'
  input: string
  payload: { messages: Array<{ role: string, content: string }> }
  options?: { /* same as intelligence.invoke options */ }
  context: {
    mode: 'new' | 'continue' | 'stateless'
    owner?: 'corebox' | 'assistant'
    sessionId?: string
    scope?: 'light' | 'session' | 'retrieval'
    objective?: string
    tokenBudget?: number
    traceId?: string
  }
}

interface ContextInvokeResult {
  result: string
  provider: string
  model: string
  traceId: string
  latency: number
  context: {
    mode: string
    scope: string
    sessionId?: string
    turnId?: string
    itemCount: number
    // ... summary fields
  }
}
```

### `contextStream(request, callbacks)` Contract

```ts
interface ContextStreamCallbacks {
  onStart(event: ContextStreamStartEvent): Promise<void> | void
  onDelta(delta: string, event: ContextStreamDeltaEvent): Promise<void> | void
  onUsage?(usage: { promptTokens: number, completionTokens: number, totalTokens: number }, event: ContextStreamUsageEvent): Promise<void> | void
  onEnd(event: ContextStreamEndEvent): Promise<void> | void
  onError(event: ContextStreamErrorEvent): Promise<void> | void
}

interface StreamController {
  readonly id: string
  readonly cancelled: boolean
  cancel(): Promise<void>
}
```

### Local Denial

- `contextInvoke` with `capabilityId !== 'text.chat'` → `PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED` locally
- `contextStream` with `capabilityId !== 'text.chat'` → same
- `context.owner` outside `['corebox', 'assistant']` → rejected locally before capability dispatch
- `context.mode` not `'new'|'continue'|'stateless'` → rejected locally
- Missing required `input` or `payload.messages` → rejected locally
- `callbacks.onStart`/`onDelta`/`onEnd`/`onError` must be functions → rejected locally

### Child Implementation (in plugin-host-child-runtime.ts)

```js
// Gate on hasDeclaredCapability('intelligence.context.invoke')
const hasContextInvokeFacade = hasDeclaredCapability('intelligence.context.invoke')
const hasContextStreamFacade = hasDeclaredCapability('intelligence.context.stream')

if (hasContextInvokeFacade) {
  defineFacadeMethod(intelligenceFacade, 'contextInvoke', (request) => {
    // Local validation: capabilityId, input, payload, context
    // Build wire DTO { operation: 'context.invoke', ... }
    // invokeCapability('intelligence.context.invoke', wireRequest)
    // Map result: project context summary fields
  })
}

if (hasContextStreamFacade) {
  defineFacadeMethod(intelligenceFacade, 'contextStream', (request, callbacks) => {
    // Same local validation as invoke
    // Extract callbacks: onStart, onDelta, onUsage, onEnd, onError
    // Build wire DTO with callback fields
    // invokeCapability('intelligence.context.stream', wireRequest)
    // Map result: extract stream resource → build StreamController
    // Same pattern as voice.asrStream()
  })
}
```

---

## 5. agentSessionStart / contextEvaluateMemory — Safe Absence

### Analysis

The touch-intelligence Prelude uses these methods in the following code paths:

1. **`agentSessionStart`** (lines 1084-1118 in index.js):
   - Called in `ensureHandoffSession()` before every AI Ask invocation
   - If `client?.agentSessionStart` is missing, returns `''` (graceful degradation)
   - Used to persist conversation state across sessions via the agent session subsystem
   - **Safe to be absent**: The Prelude checks for its existence and degrades gracefully. Without it, conversation history is not persisted across CoreBox restarts, but within-session conversation continues to work via local `session.history`.

2. **`contextEvaluateMemory`** (lines 1277-1296 in index.js):
   - Called in `evaluateMemoryPolicyForAsk()` only when the prompt matches explicit memory intent patterns
   - If `typeof client?.contextEvaluateMemory !== 'function'`, returns `null` (graceful degradation)
   - **Safe to be absent**: Memory policy evaluation is entirely optional. Without it, explicit "remember this" commands silently become ordinary AI prompts. No data loss.

3. **`updateHandoffSession`** (lines 1117-1133 in index.js):
   - Also uses `client?.agentSessionStart` but with existing `session.handoffSessionId`
   - Same graceful degradation as `ensureHandoffSession`

### Conclusion

- Both `agentSessionStart` and `contextEvaluateMemory` can be **absent** without data loss or broken behavior
- The Prelude already has `if (!client?.agentSessionStart) return ''` and `if (typeof client?.contextEvaluateMemory !== 'function') return null`
- After migration, the `intelligence` global will simply not have these keys → the `typeof` checks will evaluate to `'undefined'` → graceful degradation paths activate
- **No Prelude code changes needed** for these two methods — the existing fallback paths handle their absence correctly

### What Must Change in the Prelude

1. **Remove `require('node:crypto')`**: `crypto.createHash('sha256')` is used for `buildHandoffSessionId` and `buildContextTraceId`. Replace with a child-local hash (e.g., simple FNV-1a or allowlisted `node:crypto`). Since handoff sessions are degraded anyway, the hash just needs to be deterministic per input string.

2. **Remove `require('@talex-touch/utils/plugin/widget')`**: `makeWidgetId` fallback is `(pluginName, featureId) => \`${pluginName}::${featureId}\``. The isolated child can use the fallback directly.

3. **Remove `require('@talex-touch/utils/intelligence')`**: `createIntelligenceContextExecutionRequest` factory. The child no longer needs this — `contextInvoke`/`contextStream` on main handles execution request construction. The child just passes raw input/payload/options/context fields.

4. **Remove `require('@talex-touch/utils/transport/events')`**: `AuthEvents.session.getState` for `AUTH_SESSION_GET_STATE_EVENT`. This is used by `getAuthState()` which calls `touchChannel.send()` — but `touchChannel` is already a child-local capability. The child can use the fixed event name string directly instead of the dynamic binding.

5. **Remove `require('@talex-touch/tuff-intelligence/client')`**: `createIntelligenceClient(touchChannel)`. In isolation, the intelligence client is replaced by the `intelligence.*` facade. The `resolveIntelligenceClient()` function already prefers `intelligence?.invoke` → `plugin?.intelligence`. After migration, only the facade path is used; the `require` fallback is dead code.

6. **Remove `__test` export**: Production Prelude must not export `__test`. Test-only exports move to a separate test helper.

7. **Remove `globalThis` usage** for `plugin`, `clipboard`, `intelligence`, `features`, etc.: These are injected by the child runtime and accessed via `globalThis` destructuring. This is fine — the child runtime injects frozen null-prototype objects.

8. **Replace `crypto.randomUUID()`**: Used for `requestId` generation. Replace with `crypto.randomUUID()` from allowlisted `node:crypto` or a child-local UUIDv4 implementation.

### user-visible behavior preservation

- AI Ask with conversation history: works via `context.mode: 'continue'` + `context.sessionId`
- AI Commands (rewrite/summarize/explain): work via `context.mode: 'stateless'`
- Custom AI Commands: work via same stateless path
- OCR → Chat pipeline: Stage 2A `intelligence.invoke` handles OCR; context invoke handles the subsequent chat
- Handoff session degradation: gracefully absent, no user-facing change
- Memory policy: gracefully absent, "remember" prompts become ordinary AI calls

---

## 6. Required RED Tests & Recommended Split

### Required RED Tests

#### A. Capability Validation Tests (plugin-intelligence-context-capabilities.test.ts)
- [ ] Invoke definition: `intelligence.context.invoke` ID, `intelligence.basic` permission, `60_000` timeout, `maxConcurrency: 2`, `callbackLifetime: 'transient'`
- [ ] Stream definition: `intelligence.context.stream` ID, same permission, `30_000` start timeout, `callbackLifetime: 'resource'`, `callbackFields: ['onStart', 'onDelta', 'onUsage', 'onEnd', 'onError']`
- [ ] Reject unknown capability discriminant, `agent.run`, `context.invoke` with `vision.ocr`
- [ ] Reject child-supplied `caller`, `apiKey`, `endpoint`, `credentials`, `signal`, `history`
- [ ] Reject `context.owner` outside `['corebox', 'assistant']`
- [ ] Reject oversized input/payload/messages/objective/traceId
- [ ] Reject proxy, accessor, cycle, class instance, sparse array in any DTO field
- [ ] Reject `context.mode` not in `['new', 'continue', 'stateless']`
- [ ] Reject `context.mode: 'continue'` without `sessionId`
- [ ] Validate invoke result: strip usage/reasoning/blocks, project context summary, validate latency
- [ ] Validate stream events: exact types, bounded delta/content, strip raw internals

#### B. Authority Tests
- [ ] Derive actor `plugin:<manifest name>` from authoritative activation
- [ ] Reject stale generation, host mismatch, cross-plugin identity
- [ ] Permission deny → `PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED`
- [ ] Revoke during in-flight invoke → `PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED`
- [ ] Revoke during active stream → error event + resource disposal

#### C. Host Service Tests (plugin-intelligence-context-host-service.test.ts)
- [ ] Project context invoke result: strip `usage`, `reasoning`, raw `blocks`, `apiKey`
- [ ] Project context stream events: exact DTO shapes
- [ ] Propagate cancellation: signal.abort → iterator.return → error event
- [ ] Contain native failures: `apiKey=secret` → redacted stable code
- [ ] Snapshot injected dependencies, reject post-construction mutation

#### D. Stream Pump Tests
- [ ] Terminal auto-dispose after `onEnd`
- [ ] Terminal auto-dispose after `onError`
- [ ] Idempotent child-side dispose
- [ ] Backpressure: next event only after callback promise settles
- [ ] Callback throw → contained, `onError` sent, resource disposed
- [ ] Iterator throw → `onError` sent, resource disposed
- [ ] Cancel before first event → pump exits immediately
- [ ] Late dispose after stream already settled → no-op

#### E. Child Facade Tests (plugin-host-child-intelligence.test.ts extension)
- [ ] `contextInvoke` projects request, maps result with context summary
- [ ] `contextStream` projects request with callbacks, returns StreamController
- [ ] `StreamController.cancel()` sends dispose
- [ ] `StreamController.cancelled` getter reflects state
- [ ] `contextInvoke` absent when `intelligence.context.invoke` undeclared
- [ ] `contextStream` absent when `intelligence.context.stream` undeclared
- [ ] `agentSessionStart` / `contextEvaluateMemory` / `memory` are `undefined`
- [ ] Local rejection: bad capabilityId, bad owner, missing callbacks
- [ ] Frozen null-prototype facade
- [ ] Constructor/code-generation escape rejected

#### F. Integration & Rollout Tests
- [ ] `TouchPlugin` wires context capability definitions only for `touch-intelligence`
- [ ] Rollout count stays at 19/22 (intelligence not yet compatible)
- [ ] `PluginModule` creates/closes context service per generation
- [ ] Production build: host artifact includes both `intelligence.invoke` and `intelligence.context.*`
- [ ] Built child forbidden scan: no Electron/fs/SQLite/child-process/worker import

#### G. Electron Two-Generation Smoke
- [ ] Load actual touch-intelligence Prelude (after migration)
- [ ] `contextInvoke` with stateless mode → result
- [ ] `contextStream` with onStart/onDelta/onEnd → full stream
- [ ] Permission deny/grant
- [ ] Two distinct PIDs/handles/host generations
- [ ] Stale old-port response rejection
- [ ] Timeout containment
- [ ] Teardown + listener cleanup
- [ ] Smoke uses fake IntelligenceContextExecutionService; no real AI provider

### Recommended Split

If full Stage 2B is too large, split into:

**Stage 2B-1: Context Invoke Only**
- `intelligence.context.invoke` capability + host service + child facade
- No stream, no callback fields
- Covers ~60% of touch-intelligence behavior (stateless commands + degraded ask)
- RED/GREEN: ~40 tests

**Stage 2B-2: Context Stream**
- `intelligence.context.stream` capability + stream pump + callback fields
- Adds streaming chat with delta events
- Covers remaining 40% (full ask with streaming)
- RED/GREEN: ~35 tests

**Stage 2B-3: Prelude Migration & Integration**
- Rewrite touch-intelligence Prelude
- Remove `require` calls, `__test`, privileged imports
- Integration tests + Electron smoke
- Add to rollout inventory (19→20/22)

---

## 7. Known Flaws in Voice Pump Pattern — Do Not Copy

### F1: `setImmediate` Pump Start (voice line ~345)
```ts
setImmediate(() => { void (async () => { ... })() })
```

**Problem**: The pump starts asynchronously. If `dispose()` is called synchronously before the first `setImmediate` tick:
- The `disposed` flag is set
- But the `AsyncIterator` was already created and held
- The pump body checks `disposed` on entry, but the iterator is never `return()`ed

**Fix**: Start the pump synchronously after registration, or register a synchronous on-dispose that calls `iterator.return()`:

```ts
const handle = resources.register('stream', () => {
  disposed = true
  return iterator.return?.() ?? Promise.resolve()
})
// Start pump as async background work
void (async () => { ... })()
```

### F2: Callback Error Silently Disposes Without Error Event (voice line ~355)
```ts
} catch {
  if (!disposed && !streamController.signal.aborted) {
    try { await request.onEvent(...) } catch {}
  }
}
```

**Problem**: If the pump loop body throws (e.g., `validateStreamEvent` fails), it jumps to the catch block and sends a generic error. But if `onEvent` itself throws during error delivery, the second catch silently swallows it. The child never learns that error delivery failed.

**Fix**: Always attempt error delivery, but if it fails, ensure the resource is still disposed. Log the double-fault at debug level but don't propagate.

### F3: Iterator Not Returned on Abort-While-Waiting (voice line ~308)
```ts
parentSignal.addEventListener('abort', onAbort, { once: true })
```

**Problem**: If the parent signal aborts while the pump is awaiting `iterator.next()`, the `onAbort` handler sets `disposed = true` but does NOT call `iterator.return()`. The iterator may leak (e.g., an HTTP connection stays open).

**Fix**: `onAbort` should call `iterator.return?.()` in addition to setting the flag:

```ts
const onAbort = () => {
  disposed = true
  streamController.abort()
  iterator.return?.()?.catch(() => undefined)
}
```

### F4: No Per-Event Timeout
**Problem**: Voice stream has a 30s start timeout but no per-event timeout. A stalled iterator (hanging `next()`) blocks the pump indefinitely.

**Fix for intelligence stream**: Add a per-event deadline (e.g., 120s) with `Promise.race([iterator.next(), timeout])`. On timeout, treat as error + dispose.

### F5: Disposed Flag vs Dispose Promise Race (voice lines ~296-306)
**Problem**: `dispose()` creates a `disposePromise` but sets `disposed = true` synchronously. The pump loop checks `disposed` before each iteration, but the actual async disposal work may not have completed. This can cause a race where the pump exits but resources haven't been released yet.

**Fix**: The `disposePromise` should be the single source of truth. The pump should check `disposePromise !== null` instead of a separate boolean. Or: make the pump await the dispose promise before considering itself done.

---

## Unresolved P0/P1 Blockers

### P0: None identified
The core architecture is proven by existing Migration 1-19 patterns.

### P1: IntelligenceContextExecutionService signal extension
- **What**: `prepare()` and `finalizeAssistantTurn()` in `IntelligenceContextExecutionService` are not signal-aware
- **Impact**: Cancellation during context prepare/finalize doesn't propagate to the hygiene service
- **Fix**: Add optional `AbortSignal` to `invoke()`/`stream()` and pass through to `prepare()`/`finalize()`. This is a non-breaking extension.
- **Risk**: Low — hygiene service methods are synchronous-ish (DB reads). Signal check between steps is sufficient.

### P1: touch-intelligence `require` removal scope
- **What**: The Prelude has 7 `require` calls that must be removed or replaced
- **Impact**: Cannot declare migration complete until all privileged imports are eliminated
- **Fix**: See Section 5 "What Must Change in the Prelude"
- **Risk**: Medium — `createIntelligenceContextExecutionRequest` is the most invasive removal since it changes how the request is constructed

### P2: Stream pump flaws from Voice pattern
- **What**: Five known issues in the Voice pump pattern (Section 7)
- **Impact**: Potential iterator leaks, silent error drops, missing per-event timeouts
- **Fix**: Apply fixes documented in Section 7
- **Risk**: Low — these are pre-existing in Voice; intelligence stream gets the fixes from day one

---

## Minimal Ordered Implementation Plan

### Step 1: Extend IntelligenceContextExecutionService (non-breaking)
- Add optional `AbortSignal` to `invoke()` and `stream()`
- Pass signal to `prepare()` (check between hygiene steps) and `finalizeAssistantTurn()`
- File: `apps/core-app/src/main/modules/ai/intelligence-context-execution.ts`
- Tests: add signal propagation test in `intelligence-context-execution.test.ts`

### Step 2: Create Host Service (RED first)
- Create `plugin-intelligence-context-host-service.ts`
- Implement `createPluginIntelligenceContextHostService()`
- Binds `intelligenceContextExecutionService`, projects invoke/stream results
- Write RED tests → GREEN implementation
- Files: `plugin-intelligence-context-host-service.ts`, `.test.ts`

### Step 3: Create Capability Definitions (RED first)
- Create `plugin-intelligence-context-capabilities.ts`
- Define `intelligence.context.invoke` and `intelligence.context.stream`
- Implement stream pump with Voice-pattern fixes applied
- Write full RED suite (authority, DTO validation, permission, cancel, revoke, resource lifecycle)
- Files: `plugin-intelligence-context-capabilities.ts`, `.test.ts`

### Step 4: Child Facade (RED first)
- Extend `plugin-host-child-runtime.ts` intelligence facade
- Add `contextInvoke()`, `contextStream()`, local denial
- Ensure `agentSessionStart`/`contextEvaluateMemory`/`memory` keys are `undefined`
- Files: `plugin-host-child-runtime.ts`, `plugin-host-child-intelligence.test.ts`

### Step 5: TouchPlugin & PluginModule Integration
- Wire context capability definitions only for `touch-intelligence`
- Create activation-local definitions, close on teardown
- Files: `plugin-runtime-service.ts`, `plugin-module.ts`, `plugin.test.ts`

### Step 6: Rollout & Build
- Add `intelligence.context.invoke` and `intelligence.context.stream` to capability IDs
- Update production build contract test
- Rollout count stays at 19/22 (Prelude not yet migrated)
- Files: `plugin-runtime-rollout.ts`, build contract tests

### Step 7: Rewrite touch-intelligence Prelude
- Remove all 7 `require` calls
- Replace with child-local equivalents
- Remove `__test` export
- Update test imports
- File: `plugins/touch-intelligence/index.js`

### Step 8: Integration Tests & Smoke
- Package test: `packages/test/src/plugins/intelligence.test.ts` update
- Electron smoke: fake `IntelligenceContextExecutionService`, two-generation isolation

### Step 9: Add to Rollout Inventory
- Update `PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES` to include `touch-intelligence`
- Update rollout test: 20/22, default disabled

---

## File:Line Reference Index

| Contract | File | Lines |
|----------|------|-------|
| Stage 1 invoke cancellation | `intelligence-invoke-governance.ts` | (host-only intersection type) |
| Stage 2A capability definition | `plugin-intelligence-capabilities.ts` | 1-709 |
| Stage 2A child facade | `plugin-host-child-runtime.ts` | 1364, 1697-1785 |
| Stage 2A host service | `plugin-intelligence-host-service.ts` | 1-488 |
| Context execution service | `intelligence-context-execution.ts` | 1-398 |
| Context execution types | `packages/utils/types/intelligence.ts` | 1852-1899 |
| Voice stream pump pattern | `plugin-voice-capabilities.ts` | 310-370 |
| Voice child facade (stream) | `plugin-host-child-runtime.ts` | 1604-1695 |
| Host resources | `plugin-host-resources.ts` | 1-840 |
| Host callbacks | `plugin-host-callbacks.ts` | 1-590 |
| Capability registry | `plugin-host-capabilities.ts` | (imported type) |
| Current rollout (19/22) | `plugin-runtime-rollout.ts` | 1-27 |
| touch-intelligence Prelude | `plugins/touch-intelligence/index.js` | 1-3759 |
| Intelligence package test | `packages/test/src/plugins/intelligence.test.ts` | 1-4285 |
| `canUseRequestedOwner` | `intelligence-context-execution.ts` | 54-64 |
