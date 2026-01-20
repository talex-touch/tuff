# CoreBox Window Behavior & UI View Cache

## CoreBox height & resize

CoreBox height is driven by the renderer result list and applied in the main process.

- Window position stays fixed (only height changes).
- When window resize animation is enabled, bounds changes are animated in the main process.

**Related settings**

- `appSetting.animation.coreBoxResize`
  - `true`: animate CoreBox bounds changes
  - `false`: apply bounds immediately

## Recommendations on empty input

When input is empty and no providers are active, CoreBox requests recommendations from the main process.

To avoid “flash collapse” while recommendations are still in-flight, the renderer keeps a pending flag until a response arrives (or a short timeout).

## Plugin `attachUIView` cache

For `webcontent` features, CoreBox can attach a plugin UI via Electron `WebContentsView`.

**Goal**

Reuse recently-used views so reopening a feature does not reload its page every time.

**Cache config**

- `appSetting.viewCache.maxCachedViews`
  - `0`: disabled (always create/destroy views)
  - `> 0`: enable LRU cache

- `appSetting.viewCache.hotCacheDurationMs`
  - Used for stale cleanup.

**Notes**

- Cache key: `pluginName:featureId`.
- Cache is best-effort: destroyed views are dropped automatically.

**Resume event**

Whenever CoreBox attaches a plugin UI view, it emits `core-box:ui-resume` to the plugin process.

Payload:

- `source`: `attach` | `cache`
- `featureId`: optional feature id
- `url`: the attached URL
