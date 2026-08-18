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
  (clipboard change, file-index progress, search indexCommitted/session) rides
  MessagePorts; everything else uses the bridge in both modes.
- `broadcastToWindow` throws synchronously if the window id is gone (`sendTo` rejected
  instead) — validate the window (`isDestroyed()`) before sending, as `show()` does.
- A broadcast to a still-loading webContents is dropped, same as an unanswered `sendTo`
  minus the hang. If delivery must be guaranteed, queue on the renderer-ready signal —
  do not "fix" it by switching back to request-response.

### 4. Validation & error matrix

| Condition | Outcome |
|---|---|
| `sendTo` a void event, renderer listener not yet mounted | silent 60s hang → WARN in channel-core, per send |
| `broadcastToWindow` with destroyed window id | synchronous throw at call site |
| Broadcast before renderer registers listener | event dropped (pre-existing semantics) |

### 5. Wrong vs Correct

#### Wrong

```ts
void transport
  .sendTo(window.window.webContents, CoreBoxEvents.ui.shortcutTriggered, undefined)
  .catch(() => {}) // swallows the rejection, NOT the channel-core timeout WARN
```

#### Correct

```ts
this.getTransport().broadcastToWindow(
  window.window.id,
  CoreBoxEvents.ui.shortcutTriggered,
  undefined
)
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

| Condition | Required outcome |
|---|---|
| Renderer acknowledges | Flush/destroy completes before storage/analytics handlers unload |
| Renderer hangs or already died | 1.5s bound expires; main continues shutdown |
| Debounced save fires after destroy | Reject locally with transport-destroyed error; no main IPC |
| Perf-report send itself fails | No recursive performance report |
| Permission request arrives after quit begins | Deny silently; no shutdown-noise warning |

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
