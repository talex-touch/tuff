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
