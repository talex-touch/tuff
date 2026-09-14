# Technical design

## Scope and ownership

This slice owns the shared destination contract, the built-in destination search provider, one main-process navigation service, named caller migrations, localization, and focused verification. It does not implement the rest of the HapiGo backlog or a general image cache.

## Data flow

```text
CoreBox query
  -> AppDestinationProvider.onSearch
  -> resolveAppDestinationQuery(shared catalog)
  -> one TuffItem(destinationId + grouped execute actions)
  -> CoreBox item.execute(actionId?)
  -> AppDestinationProvider.onExecute
  -> AppDestinationNavigationService.open(destinationId)
  -> restore/show/focus primary BrowserWindow
  -> if route: broadcast AppEvents.window.navigate after renderer-ready handshake
  -> main renderer router.push(allowlisted catalog route)
```

Tray, Assistant, local-AI, and the privileged plugin capability enter at `AppDestinationNavigationService.open` and do not duplicate native-window sequencing.

## Shared catalog contract

Create `apps/core-app/src/shared/app-destinations.ts` as a pure module with no Electron, renderer, filesystem, or runtime-storage dependency.

Required exports:

```ts
export type AppDestinationId =
  | 'main-window'
  | 'home'
  | 'settings-overview'
  | 'settings-general'
  | 'settings-appearance'
  | 'settings-intelligence'
  | 'settings-channels'
  | 'settings-voice'
  | 'settings-plugins'
  | 'settings-file-index'
  | 'settings-network'
  | 'settings-update'
  | 'settings-about'

export interface AppDestinationDefinition {
  readonly id: AppDestinationId
  readonly route: string | null
  readonly titleKey: string
  readonly subtitleKey: string
  readonly icon: `i-${string}`
  readonly aliases: Readonly<{ en: readonly string[]; zh: readonly string[] }>
  readonly searchable: boolean
  readonly advanced: boolean
  readonly commonSetting: boolean
}

export const APP_DESTINATIONS: readonly AppDestinationDefinition[]
export const COMMON_SETTING_DESTINATION_IDS: readonly AppDestinationId[]
export const APP_DESTINATION_ICON_CLASSES: readonly string[]
export function getAppDestination(id: AppDestinationId): AppDestinationDefinition
export function isAppDestinationId(value: unknown): value is AppDestinationId
export function normalizeAppDestinationQuery(value: string): string
export function resolveAppDestinationQuery(value: string): AppDestinationDefinition | null
```

Implementation rules:

- Build the normalized alias map once at module evaluation; query lookup is O(1).
- Throw on duplicate normalized aliases during catalog construction; do not use last-writer-wins.
- Exclude bare generic/ambiguous aliases by construction.
- `COMMON_SETTING_DESTINATION_IDS` order is the visible action order and contains exactly general, appearance, channels, voice, plugins, file-index, network, update.
- Catalog definitions are immutable/read-only.

`apps/core-app/src/renderer/src/modules/settings/categories.ts` remains the renderer navigation source of truth. A cross-layer focused test compares every searchable `settings-*` catalog route against its registered category/child route; production main code must not import renderer modules.

## Provider contract

Cleanly replace:

- `main-window-provider.ts` -> `app-destination-provider.ts`
- `MainWindowProvider` -> `AppDestinationProvider`
- `mainWindowProvider` -> `appDestinationProvider`

Update SearchCore imports/registration, provider-count comments, and internal mocks. No compatibility file or re-export remains.

Provider behavior:

- text-only, fast provider, type `system`;
- exact O(1) catalog resolution;
- at most one item per query;
- `main-window` keeps item ID `main-window`; other IDs use `app-destination:<id>`;
- item kind is `command`, not `app`, so app-only reveal/open affordances do not appear;
- icon is `{ type: 'class', value: definition.icon }`;
- metadata contains only the destination ID, matched alias/highlight information, and bounded search tokens;
- Settings items include one primary execute action and secondary execute actions for the ordered common-settings group, excluding the current destination to avoid a duplicate;
- `onExecute` resolves `args.actionId` only through deterministic `open-destination:<id>` IDs; absent action ID uses the item metadata destination. Forged or unknown IDs do nothing and log no caller data;
- `rebuildRecommendationItems` accepts only exact deterministic destination item IDs and performs no I/O.

## Grouped action-panel delivery

The common-setting shortcuts use the existing MetaOverlay surface, but their execution path is explicit:

```text
MetaOverlay click
  -> renderer sends MetaOverlayEvents.action.execute
  -> MetaOverlayManager validates item/action ownership
  -> broadcastToWindow(attached parent CoreBox id, CoreBoxEvents.metaOverlay.itemAction)
  -> CoreBox useActionPanel sends CoreBoxEvents.item.execute with the allowlisted action id
  -> AppDestinationProvider -> AppDestinationNavigationService
```

The host always targets the alive BrowserWindow to which the MetaOverlay WebContentsView is attached. It neither trusts a caller-supplied sender nor uses `sendTo` for the void item-action notification. The MetaOverlay renderer stores the incoming `TuffItem` in a `shallowRef`, preserving a plain structured-cloneable transport object rather than sending a Vue proxy back over IPC. It hides and releases its per-click lock immediately after dispatch while observing the request Promise asynchronously; a legacy response arriving late cannot clear search text entered after the panel reopened.

MetaOverlay creation has a separate renderer lifecycle gate. `show(request)` replaces one pending request and keeps a newly created `WebContentsView` hidden. `MetaOverlay.vue` registers its show/hide/keyboard listeners, then sends `MetaOverlayEvents.ui.ready`; main derives the sender ID from `HandlerContext`, accepts only the manager's current WebContents, and releases the pending request once. Destruction and `render-process-gone` clear both pending state and renderer identity. Both CoreBox → main and main → MetaOverlay `ui.show` handlers return `{ accepted: true }`, avoiding the request transport's 60-second timeout without treating document load as listener readiness.

## Navigation service contract

Create `apps/core-app/src/main/modules/app-destination/app-destination-navigation.ts`.

Required public shape:

```ts
export type AppDestinationOpenStatus = 'opened' | 'queued' | 'unavailable'
export type AppDestinationUnavailableReason = 'window-unavailable' | 'renderer-unavailable' | 'destination-unavailable'

export interface AppDestinationOpenResult {
  readonly status: AppDestinationOpenStatus
  readonly destinationId: AppDestinationId
  readonly reason?: AppDestinationUnavailableReason
}

export class AppDestinationNavigationService {
  open(destinationId: AppDestinationId): AppDestinationOpenResult
  markPrimaryRendererReady(senderId: number): void
}

export function getAppDestinationNavigationService(runtime: AppDestinationRuntime): AppDestinationNavigationService
```

The runtime interface is structural and minimal: primary `BrowserWindow`, channel/key manager, and no `TouchApp` class import. A `WeakMap<object, AppDestinationNavigationService>` provides one service per runtime without a process-global mutable singleton or a reverse import into providers.

State machine:

```text
loading/reloaded --explicit rendererReady from primary sender--> ready
ready --primary cross-document navigation/render-process-gone--> loading
ready --subframe or same-document navigation--> ready
any --window destroyed--> unavailable + clear pending
loading + routed open -> show window, pendingRoute = latest, status queued
ready + routed open -> show window, broadcast route, status opened
```

Use `broadcastToWindow` for `AppEvents.window.navigate` because its response is `void`. Do not use `sendTo`/`await`; that creates the known 60-second timeout path. The preload `AppEvents.system.startup` invoke is metadata collection and occurs before the renderer router exists. The renderer therefore registers navigate/download listeners early, mounts the app, waits for `router.isReady()`, and only then sends the typed `AppEvents.window.rendererReady` event; main accepts it only from the host primary renderer. Readiness resets on `did-start-navigation` only when `isMainFrame && !isInPlace`, plus renderer-process loss—not on iframe/srcdoc or same-document activity.

## Caller migrations

- Provider: call `getAppDestinationNavigationService(context.touchApp).open(id)`.
- Tray Settings: open `settings-overview`; use no direct `sendTo`.
- Assistant intelligence recovery: open `settings-channels`; collapse the voice panel only for `opened` or `queued`.
- Local-AI recovery: open `settings-intelligence`, preserving its return-to-panel deadline state. The old `?section=local-ai-cli` query is not a registered redirect and is removed.
- Privileged plugin `open-main-window`: injected host service delegates to destination `main-window`; the external action ID and generation/abort authority checks remain unchanged.

Operating-system settings actions (`focus-settings`, `notification-settings`, `sound-settings`, `display-settings`) remain in the fixed platform executor and are not destination aliases.

## Localization and assets

Reuse existing keys where they exactly represent a destination title (`tray.showWindow`, `settingsNav.category.*`, router/home labels). Add only missing destination subtitles and `corebox.destinations.commonSettings` to both `zh-CN.json` and `en-US.json`.

Every destination icon is an existing icon class. The catalog exports its derived deduplicated class set; `uno.config.ts` imports it into `safelist` and watches the catalog through `configDeps`, because ordinary `.ts` modules are not template-scanned. The remote favicon literal is removed. No `TxIcon`, download, cache, `tfile`, plugin resource-policy, Clipboard image, or app-icon pipeline changes are required.

## Compatibility and risk

- Stable main-window usage rows rebuild through item ID `main-window`.
- Internal source ID changes from `main-window-provider` to `app-destination-provider`; stale usage rows for the old source may be omitted rather than preserved by a shim. The stable item is still available through new executions.
- Retaining the plugin action ID is external contract preservation, not an internal compatibility alias.
- Catalog aliases are intentionally conservative; adding a generic alias later requires collision-focused tests.
- The settings group exists as item actions, not multiple search rows or a new Settings UI component.

## Verification strategy

Permanent tests must defend observable contracts rather than source text:

- pure catalog matching, duplicate/collision negatives, common group order;
- provider one-result behavior, item/action shape, forged action rejection, recommendation rebuild;
- navigation service reveal vs route, restore order, latest-wins queue, explicit primary-renderer readiness, primary cross-document reset, subframe/same-document stability, failed-delivery retry, wrong-sender rejection and destroyed-window behavior;
- migrated caller behavior through injected service boundaries;
- renderer settings route parity and grouped action execution path;
- existing plugin generation/permission isolation remains green.

Runtime smoke: launch an isolated CoreApp profile, complete or reuse onboarding state, open CoreBox, search `主窗口`, `首页`, `设置`, `外观`, `网络设置`; confirm result count/title/icon, Enter destination, and grouped Meta+K actions. Disable network or intercept the old favicon host and confirm destination icons still render.
