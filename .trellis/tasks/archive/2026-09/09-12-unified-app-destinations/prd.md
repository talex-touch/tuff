# Unified Tuff destinations and common settings

## Goal

Replace the special-case `Show Main Window` search result with a typed, host-owned destination system that can reveal Tuff, navigate to a known Tuff surface, and expose common settings together without flooding search results. First-party destination icons must work offline.

This child implements only the destination/navigation/first-party-icon foundation from the parent HapiGo backlog. Browser tabs, external content sources, Clipboard QR, file actions, preview expansion, batch paste, and usage insights remain separate parent backlog deliverables.

## Confirmed current behavior

- `main-window-provider.ts` matches exact aliases but conflates bare actions (`show`, `open`) and objects (`window`, `home`) into one reveal-only result.
- The result is typed as an app and downloads `https://tuff.tagzxia.com/favicon.ico` even though Tuff already ships local logo and icon-class assets.
- Restore/show/focus plus route navigation is repeated in the provider, tray Settings action, Assistant intelligence recovery, local-AI settings recovery, and the privileged plugin `open-main-window` boundary.
- The renderer already owns valid settings routes in `SETTING_CATEGORIES`; `AppEvents.window.navigate` is a typed main-to-renderer notification and must be broadcast, not awaited as request/response.
- The preload `AppEvents.system.startup` invoke runs before renderer code and is metadata-only; destination readiness requires a separate primary-renderer announcement after route listeners are registered and the router's initial navigation has resolved.

## Requirements

### R1 — Shared destination catalog

Create one pure shared catalog for the destinations used by main and renderer-facing tests. Every entry has a stable ID, canonical route or reveal-only behavior, icon class, localized title/subtitle keys, structured English/Chinese/pinyin aliases, searchable/advanced flags, and optional common-settings membership.

Initial destinations:

- `main-window`: reveal/focus only; preserve the current route.
- `home`: `/home`.
- `settings-overview`: `/setting/overview`.
- `settings-general`: `/setting/general`.
- `settings-appearance`: `/setting/appearance`.
- `settings-intelligence`: `/setting/intelligence`.
- `settings-channels`: `/setting/intelligence/channels`.
- `settings-voice`: `/setting/intelligence/voice`.
- `settings-plugins`: `/setting/plugins`.
- `settings-file-index`: `/setting/file-index`.
- `settings-network`: `/setting/network`.
- `settings-update`: `/setting/update`.
- `settings-about`: `/setting/about`.

Catalog route values must agree with the renderer settings route source of truth. Advanced/developer-only settings are not searchable in this slice.

### R2 — Alias matching without generic-result pollution

Normalize case plus whitespace, `_`, and `-`, then require an exact catalog alias. Support natural Chinese, canonical English, full pinyin, and deliberate pinyin-initial phrases for every destination family, including `主窗口` / `main window` / `zhuchuangkou` / `zck`, `设置` / `settings` / `shezhi` / `sz`, and the common settings categories.

Bare generic verbs or nouns such as `打开`, `open`, `show`, `window`, and `窗口` must return no destination result. Ambiguous category words such as bare `AI`, `模型`, `model`, `proxy`, and `theme` must not steal ordinary app search. Canonical titles such as `智能`, `intelligence`, `网络`, `network`, `更新`, and `update` are explicit destination aliases.

Each query returns at most one destination item.

### R3 — Group common settings in one item

A `设置`/Settings query returns one `settings-overview` item. Its action panel groups these destinations under `常用设置 / Common settings`:

1. General
2. Appearance
3. Model Channels
4. Voice Input
5. Plugins & Tools
6. File Index
7. Network
8. Update

A direct category query still returns one stable item for that destination, makes that destination the Enter/default target, and exposes the remaining common settings as secondary `execute` actions. It must not emit eight separate rows. About remains directly searchable but is not in the common-settings action group.

Grouped actions must complete through the real MetaOverlay path: the host relays item-action notifications only to the alive parent CoreBox window, never a caller-supplied sender, and uses fire-and-forget delivery rather than a void request that times out. The overlay must keep the transport item shallow/raw so the action payload remains structured-cloneable; Vue reactive proxies may not cross IPC. A delayed legacy action response must not keep a reopened panel inert or erase its newer search text.

A freshly created MetaOverlay renderer stays hidden until that exact WebContents announces a typed ready event after mounting its listeners. Main retains only the latest pending show request, rejects stale sender IDs, and clears readiness on hide or renderer loss; both show-transport legs acknowledge receipt so opening the panel does not create a 60-second timeout.

### R4 — Host-owned navigation service

Create one service responsible for main-window restore/show/focus and allowlisted destination navigation.

- Only destination IDs from the shared catalog are accepted; callers cannot supply an arbitrary route.
- Reveal-only destinations never change the current renderer route.
- Routed destinations broadcast `AppEvents.window.navigate` to the primary renderer after it is ready.
- Before the primary renderer announces `AppEvents.window.rendererReady`, retain only the latest requested route and deliver it after readiness; still reveal the native window immediately.
- A destroyed/missing main window or destroyed renderer returns a stable unavailable result without throwing sensitive paths.
- Repeated requests are idempotent; only primary-frame cross-document navigation or renderer loss resets readiness. Subframe and same-document loads do not. A later explicit renderer-ready announcement restores delivery.

### R5 — Consolidate existing callers

Use the shared service from:

- the CoreBox destination provider;
- tray Settings;
- Assistant’s intelligence-channel recovery;
- local-AI settings recovery;
- the privileged plugin `open-main-window` implementation.

Keep the external plugin action ID `open-main-window` because it is an established plugin contract, but delegate its behavior to the shared service. Do not change operating-system `focus-settings`, notification, sound, or display actions.

### R6 — Offline first-party icons

All destination items use icon classes or packaged hashed assets. Remove the remote Tuff favicon from the destination path. Because the catalog is a plain TypeScript module outside UnoCSS template extraction, its derived icon-class set must be watched and spread into the production safelist. No destination search or execution may require the network, and a missing icon may not block navigation.

Do not create a new cache for Clipboard/user images or replace existing application/file/remote-SVG caches in this slice.

### R7 — Recommendation and compatibility behavior

- Preserve `main-window` as the stable item ID for existing usage rows.
- New destinations have deterministic IDs and rebuild from the catalog without I/O.
- Only destination items that remain meaningful without query context may rebuild for recommendations.
- Rename the internal provider from main-window semantics to destination semantics and update every internal registration/mock/reference; do not leave a second provider or compatibility re-export.

### R8 — Localization

Destination titles, subtitles, and the common-settings action group must resolve through the existing English and Chinese message catalogs. No new user-facing hard-coded copy in provider code.

## Acceptance criteria

- [x] `主窗口` reveals Tuff and preserves the current page; `首页` navigates to `/home`.
- [x] `设置` returns one Settings item with eight grouped common-setting actions, not eight result rows.
- [x] Direct Chinese, English, full-pinyin, and pinyin-initial aliases navigate to the intended allowlisted route, including canonical `general`, `intelligence`, `network`, and `update` titles.
- [x] Bare `open`, `show`, `window`, `窗口`, `AI`, `model`, `proxy`, `theme`, and unknown text return no destination result.
- [x] Enter/default execution and a selected grouped action both use the same host navigation service.
- [x] A grouped common-setting click travels MetaOverlay → parent CoreBox → destination provider with a structured-cloneable item payload, and a pending/late transport response cannot block the next reopened-panel action or clear newer panel input.
- [x] After MetaOverlay is destroyed and recreated, its first show waits for the new renderer handshake and renders the queued actions instead of a blank panel; stale renderers cannot release the queue.
- [x] Requests before renderer readiness use latest-route-wins delivery only after the explicit primary-renderer `rendererReady` announcement; preload metadata, subframes and same-document navigation cannot release or strand the route.
- [x] Tray, Assistant, local-AI, and privileged plugin main-window paths no longer implement their own restore/show/focus/navigation sequences.
- [x] No production destination code references `https://tuff.tagzxia.com/favicon.ico`; every catalog icon resolves from the installed icon collection and is present in the UnoCSS safelist/config dependency chain.
- [x] Catalog paths match the renderer route/category definitions and advanced settings stay excluded.
- [x] Focused provider, catalog, navigation, caller-integration, renderer-action, typecheck, lint, and real Electron smoke checks pass.

## Out of scope

- HapiGo external sources, live browser tabs, Clipboard QR, expanded file actions, recent-document adapters, preview formats, Clipboard batch automation, or usage insights.
- A general remote-raster cache, changes to `TxIcon`, or changes to native app/file icon extraction.
- Arbitrary internal-route navigation from plugins or search-result payloads.
- Redesigning the Settings pages or changing their navigation hierarchy.
