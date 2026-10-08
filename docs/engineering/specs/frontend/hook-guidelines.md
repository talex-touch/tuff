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

### Frame-driven motion composables (Home send lift, 2026-09-26)

**Scope**: any composable that moves an element per frame against layout it does not own — the Home send lift (`composables/send-lift/`, wired by `useSendChoreography().liftDraft`) is the reference.

**Contracts**
- **One motion, started on the press.** A send is one spring from where the user's text sat to its row (`LIFT_SCORE.spring`, ζ≈0.84, ~0.40s response; the conversation's first message rides `openingSpring` with a 320ms stiffness ramp so it peels off instead of being shot out). Splitting a send into separately timed beats (sprout, neck, snap, scale, blur, knock, ripple) read as "weird" to the user and was removed.
- **Text continuity.** The lifted bubble is laid out once exactly like the landed row (same class, `max-width` = lane × 78%) and placed so its lines sit on the draft's (`liftOrigin`, block-centred when the line counts match). Only when the bubble breaks lines differently does the draft cross-fade (140ms).
- **A frame reads no layout.** It advances springs (`springSteps`, wall-clock dt capped at 0.1s) and writes `transform` / `opacity` only. The row is read at launch (predicted past the stream's glide), once at ~70% of the travel, and at rest before the swap; a moved row is retargeted with velocity kept.
- **Swap in one frame.** The row is revealed in the frame the overlay clears; the last pose must be within 0.5px of the row (tests assert it). Hooks (`onClear`, `onImpact`, `onLand`) fire exactly once on every exit path; a newer send, a thread switch or unmount lands the lift at once.
- **Layering.** The lift starts as text lying on the composer, so it sits above it (`--home-z-lift`); its fill stays transparent while it overlaps the box.

**Wrong** — timers and per-frame reads:
```ts
requestAnimationFrame(() => { el.style.top = `${row.getBoundingClientRect().top}px` }) // forced layout every frame
```
**Correct** — springs toward a target read at fixed beats:
```ts
[x, v] = springSteps(x, v, target, LIFT_SCORE.spring, dt) // target from readLanding() at launch / 70% / rest
ghost.style.transform = `translate(${x}px, ${y}px)`
```

**Tests required**: fake-clock driver tests for beat order, read count (launch/mid/rest only), landing ≤0.5px, retarget without a jump, every hook exactly once on early finish/timeout; composable tests for glyph alignment and the cross-fade rule. Verify in the real window over CDP with a per-rAF sampler (pose vs row at the swap frame, rAF interval probe + `long-animation-frame` observer).

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
