# Hook Guidelines

> How composables and lifecycle helpers are used in this Vue/Nuxt codebase.

---

## Overview

This project uses Vue composables, not React hooks. New shared stateful frontend logic should usually be a `use*` composable, a Pinia store, or a pure helper depending on ownership and lifecycle needs.

---

## Custom Composable Patterns

Use `use*` names and keep the returned API explicit.

Example: `apps/core-app/src/renderer/src/views/base/settings/components/useShortcutCopy.ts`

```ts
export const useShortcutCopy = (messages: ShortcutCopyMessages) => {
  const copyStateMap = reactive(new Map<string, CopyState>())
  const copyTimers = new Map<string, number>()

  const resetCopyState = (): void => {
    copyStateMap.clear()
    for (const timer of copyTimers.values()) {
      window.clearTimeout(timer)
    }
    copyTimers.clear()
  }

  return {
    copyShortcutId,
    getCopyState,
    getCopyIcon,
    resetCopyState
  }
}
```

Preferred shape:

- Keep transient UI state inside the composable.
- Return functions and readonly accessors needed by the caller.
- Provide cleanup/reset when timers, listeners, subscriptions, or external resources are created.
- Keep business display transformations pure when they do not need lifecycle; see `indexing-source-diagnostics-display.ts` re-exported from the Settings view.

---

## Browser Lifecycle And SSR

Nexus code must protect browser-only APIs.

Example: `apps/nexus/app/composables/useDocEngagementTracker.ts`

- Uses `import.meta.client` before `document`, `crypto.subtle`, and other browser-only APIs.
- Uses Vue/VueUse lifecycle utilities such as `useEventListener`.
- Avoids `beforeunload` in docs tracking because it blocks bfcache; use `visibilitychange` / `pagehide` style flushing instead.

CoreApp renderer code runs in Electron renderer, but still keep host access behind typed SDKs and existing wrappers.

### CoreApp window visibility and continuous work

CoreBox is the startup-critical renderer and stays prewarmed. This does not authorize hidden renderers to keep continuous work active. Any recursive RAF, animation, timer, observer, or polling loop must have one owner and an idempotent suspend/resume boundary. For Electron keep-alive windows, the host's typed native show/hide event is authoritative: `document.hidden` can remain `false` while a `BrowserWindow` is hidden.

```ts
let rafId: number | null = null
let lastFrameTime: number | null = null

function syncLoop(nativeVisible: boolean): void {
  if (!nativeVisible || document.hidden) {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    lastFrameTime = null
    return
  }
  if (rafId !== null) return
  lastFrameTime = performance.now()
  rafId = requestAnimationFrame(onFrame)
}

transport.on(CoreBoxEvents.ui.trigger, ({ show }) => syncLoop(show))
```

- Hidden time is not UI jank; restart with a fresh timing baseline. Treat `document.visibilityState` only as a fallback when no typed native-window signal exists.
- A visibility transition must never create a second concurrent loop.
- Optional windows, WebContentsViews, and utility processes are lazy by default and require explicit teardown ownership. CoreBox eager creation is the documented exception.
- A short full-screen effect uses a minimal per-display transparent entry and destroys it after its TTL; it must not load the full CoreApp renderer or remain resident.

### Scenario: CoreBox native visibility handshake

#### 1. Scope / Trigger

- Apply when a prewarmed Electron renderer owns continuous work and native `BrowserWindow` visibility can diverge from `document.visibilityState`.

#### 2. Signatures

- `CoreBoxEvents.ui.getVisibility`: `void -> CoreBoxVisibilityResponse`.
- `CoreBoxVisibilityResponse`: `{ visible: boolean }`.
- `CoreBoxEvents.ui.trigger`: push `CoreBoxTriggerPayload`; a boolean `show` is the authoritative visibility update.
- `setRendererActivity(active: boolean): void`: update renderer-local activity state without loading the telemetry chunk.

#### 3. Contracts

- Register the `ui.trigger` listener before requesting `ui.getVisibility`.
- Main derives the query response from the current native window: missing, destroyed, or hidden means `visible: false`.
- Increment a renderer-local version for each valid native push. Ignore an older query response when a push arrived after the request began.
- Malformed pushes/responses and query failure do not replace known native state; document visibility remains the fallback until a valid native signal arrives.
- Native hide cancels the single telemetry RAF, clears its timing baseline, and flushes buffered metrics. Native show may schedule at most one RAF with a fresh baseline.

#### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| No current CoreBox window | `{ visible: false }` |
| Destroyed or hidden native window | `{ visible: false }` |
| Malformed `show` or `visible` field | Ignore; do not claim native authority |
| Query fails before any push | Keep document-visibility fallback |
| Push races an in-flight query | Push wins; stale query is ignored |
| Repeated show/hide value | No duplicate activity transition or RAF loop |

#### 5. Good / Base / Bad Cases

- Good: hidden CoreBox reports `document.hidden === false`, but the native query returns false and telemetry owns zero RAF callbacks.
- Base: a show push starts one loop; a hide push cancels it and a later show rebases timing.
- Bad: relying only on `document.hidden`, or letting a stale initial query overwrite a newer show/hide push.

#### 6. Tests Required

- Main IPC: visible, hidden, destroyed, and missing CoreBox window responses.
- Renderer hook: initial query, malformed response, query failure, and push-over-query race.
- Packaged Electron smoke: hidden CoreBox has no telemetry RAF; show starts one loop; hide stops it; CoreBox search input still completes without spawning Pi Runtime.

#### 7. Wrong vs Correct

```ts
// Wrong: Electron can keep this visible while the native window is hidden.
syncLoop(document.visibilityState === 'visible')

// Correct: native state is authoritative; document state is only an additional stop signal.
transport.on(CoreBoxEvents.ui.trigger, ({ show }) => setRendererActivity(show === true))
const { visible } = await transport.send(CoreBoxEvents.ui.getVisibility)
setRendererActivity(visible)
```

---

## Data Fetching And Host Access

- CoreApp renderer should call existing SDK/domain modules, not raw IPC.
- Plugin UI should use plugin SDK facades, permission SDKs, secret SDKs, and clipboard SDKs.
- Nexus client/server calls should use existing request utilities such as `requestJson` or server route helpers.
- Do not add hidden global fetch clients or ad-hoc event buses when a package already has a typed transport/domain SDK.

---

## Subscriptions

Subscriptions should return or register cleanup.

Example: `apps/core-app/src/renderer/src/stores/plugin.ts`

```ts
async function initialize(): Promise<() => void> {
  const unsubscribe = pluginSDK.subscribe((event) => {
    handleStateEvent(event)
  })

  const pluginList = await pluginSDK.list()
  initPlugins(pluginList)
  return unsubscribe
}
```

If initialization can fail, keep cleanup valid and avoid leaving partial listeners running.

---

## Naming Conventions

- `use*` for composables with state or lifecycle: `useShortcutCopy`, `useDocEngagementTracker`.
- `create*Sdk` for SDK factory helpers.
- `resolve*`, `format*`, `summarize*`, `normalize*` for pure helpers.
- `handle*` for event handlers that mutate local component state.

---

## Common Mistakes

- Adding a composable where a pure helper would be easier to test and reuse.
- Capturing timers/listeners without exposing cleanup.
- Reading `document`, `window`, random values, time, or localStorage during Nexus SSR.
- Calling `ipcRenderer`, `navigator.clipboard`, or host APIs directly from plugin or renderer UI.
- Hiding cross-layer payload normalization inside a composable instead of a typed helper/domain SDK.
