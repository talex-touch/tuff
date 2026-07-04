# State Management

> How state is managed across CoreApp, Nexus, TuffEx, and plugin UI.

---

## Overview

Use the smallest state boundary that matches the data owner.

- Component-local state: `ref`, `reactive`, `computed`.
- Cross-view CoreApp renderer state: Pinia setup stores.
- Host/application state: typed SDKs, typed transport, existing modules, and SQLite-backed services.
- Nexus route/server state: Nuxt pages, composables, route helpers, and server API utilities.
- Plugin state: plugin SDKs and plugin storage/secret capabilities, not direct host access.

---

## State Categories

### Local UI State

Use local Vue state for transient UI behavior: dropdowns, loading flags, copy feedback, selected tabs, timers, and one-view form state.

Example: `TxFileUploader` keeps `inputRef` and `dropActive` local, derives `value` from `modelValue`, and emits updates instead of owning durable file state.

### Global Renderer State

Use Pinia when multiple CoreApp renderer views or subscriptions need the same state.

Example: `apps/core-app/src/renderer/src/stores/plugin.ts`

```ts
export const usePluginStore = defineStore('plugin', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())

  function handleStateEvent(event: PluginStateEvent): void {
    switch (event.type) {
      case 'added':
        setPlugin(event.plugin)
        break
      case 'removed':
        deletePlugin(event.name)
        break
    }
  }

  return { plugins, handleStateEvent, initialize }
})
```

This is a good pattern for host-subscribed renderer state: typed event in, normalized store state out.

### Host And Durable State

Do not make renderer state the source of truth for host data.

- CoreApp local business SoT is SQLite where the domain already uses SQLite.
- Renderer stores mirror and display host state; they do not replace the owning module.
- Plugin secrets belong in secure plugin secret capability / secure-store facade, not ordinary UI state or localStorage.
- JSON is acceptable for plugin config, sync payloads, catalog downloads, and evidence artifacts, but not as a replacement business SoT.

### Nexus SSR And Client State

Avoid hydration mismatches.

- Do not read `window`, `document`, localStorage, random numbers, or current time during SSR-rendered output.
- Browser-only state belongs behind `import.meta.client`, `ClientOnly`, or a client-only component.
- Route-local i18n/chunk state should follow the existing route locale helpers.

---

## Derived State

- Use `computed` for derived UI state inside components and composables.
- Use pure helper functions for display contracts that are shared with tests or scripts.
- Avoid duplicating derived state in both a store and a component unless the store owns the derived contract.
- Normalize incoming SDK/transport payloads at the boundary before storing them.

---

## When To Use Global State

Promote state to Pinia or a shared domain module only when:

- Multiple views need the same state.
- The data is fed by an SDK subscription or typed transport event.
- The state represents a renderer-wide application concept such as plugin list/status.
- The owner already has a store/module for that domain.

Keep state local when it is only view form state, animation state, open/closed UI, or one-shot feedback.

---

## Common Mistakes

- Treating a renderer cache as durable SoT.
- Adding global state for one dialog or one page.
- Storing secrets, provider keys, prompt/response content, or raw paths in ordinary UI state that can leak into logs or sync payloads.
- Updating several local branches from raw `kind` / `action` fields instead of normalizing the payload once.
- Letting Nexus client-only state influence SSR markup before hydration.
