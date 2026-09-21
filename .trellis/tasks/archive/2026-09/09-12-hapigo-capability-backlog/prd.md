# HapiGo capability parity backlog

## Goal

Preserve the high-value capability and scene gaps identified from HapiGo as a product backlog for Tuff. This is a planning record only: it neither authorizes implementation nor changes the current release and search-stability execution order.

The target is not feature-for-feature cloning. Tuff remains cross-platform, local-first, permission-gated and plugin-extensible; each later child must deliver a concrete high-frequency workflow that HapiGo currently makes faster.

## Evidence and confirmed facts

- HapiGo’s current public product page states macOS 10.15+ compatibility and version `v2.22.1` dated 2026-07-27. It advertises direct integrations for Apple Notes, Craft, Dash, FileMaker recents, Bear, 1Password, DEVONthink and Zotero; live search/switching for Safari, Chrome and Edge tabs; a file action dock; QR recognition; multi-format Quick Look; clipboard batch operations; and launch usage charts. Its public GitHub release archive stops in 2022 and is not used as proof of the current product set.
- Tuff already has full/initial pinyin search for applications, files and plugin features; manual quick links plus opt-in Chromium bookmarks/history; snippets; translation with provider aggregation and TTS; clipboard history, favorites, notes/tags, image Quick Look and one-item apply-to-active-app; window management; QuickOps; terminal; calculator/conversion; and QR generation.
- Tuff’s current browser data source is read-only Chrome/Edge/Brave/Arc local bookmarks and recent history, not Safari or live tabs: `plugins/touch-browser-data/manifest.json:12-53`.
- Default file-result actions are open, open folder and path-copy variants; they do not expose move/copy-to/trash/cd actions: `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts:217-304`.
- Clipboard image records already retain bounded image resources and may carry OCR metadata; the Clipboard History surface uses record IDs rather than arbitrary filesystem paths for preview: `apps/core-app/src/main/modules/clipboard.ts:183-255`, `plugins/clipboard-history/src/views/ClipboardManagerView.vue:465-489`.
- The existing screenshot child `07-29-screenshot-ocr-qr-color` owns a shared typed OCR/QR/color service and QR URL-policy requirements. Clipboard QR must reuse that service, never create a second decoder or a raw plugin channel.
- The current `MainWindowProvider` is an exact-token special case: it conflates generic actions (`show`, `open`) and objects (`window`, `home`) into one result, always reveals the current window, and uses the network URL `https://tuff.tagzxia.com/favicon.ico`: `apps/core-app/src/main/modules/box-tool/addon/system/main-window-provider.ts:16-98`, `apps/core-app/src/main/modules/box-tool/addon/system/main-window-provider.ts:149-198`.
- Main-window restore/show/focus and route navigation are currently repeated across the provider, tray, Assistant, local-AI recovery and plugin system capabilities, while Settings routes already have a renderer-owned source of truth in `SETTING_CATEGORIES`: `apps/core-app/src/main/modules/tray/tray-menu-builder.ts:179-199`, `apps/core-app/src/main/modules/assistant/module.ts:1105-1125`, `apps/core-app/src/main/modules/local-ai-cli/index.ts:230-241`, `apps/core-app/src/renderer/src/modules/settings/categories.ts:58-203`.
- Image caching is partial rather than absent: native application icons have a versioned persistent cache, indexed file icons/thumbnails are persisted, and remote SVG icons use an in-flight-deduplicated seven-day disk cache. Addressable raster URLs rendered by `TxIcon`, including the current main-window favicon, otherwise rely on Chromium/network behavior: `apps/core-app/src/main/modules/box-tool/addon/apps/app-icon-cache.ts:7-89`, `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts:21-26`, `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts:316-415`, `packages/tuffex/packages/components/src/icon/src/TxIcon.vue:332-350`.

## Backlog requirements

### R1 — External content-source adapters · P1

Provide a typed, permission-gated external-content-source contract for search, bounded preview and declared actions. Each source result must use a stable source ID plus opaque external item ID; action dispatch must reopen the source or invoke only the source’s declared safe action.

- First candidates: Apple Notes, Dash and Zotero.
- Follow-up candidates: Craft, FileMaker/iWork/MindNode recent documents, Bear and DEVONthink.
- 1Password is separate and lower priority: search may expose only user-approved metadata and a deep-link/open action. Passwords, secret fields, vault exports and raw vault identifiers must never enter the Tuff index, AI context, logs or telemetry.

**Scene:** find a note, API document or paper by title/body keywords; read a bounded preview; then open the original document or copy its canonical deep link.

### R2 — Live browser tab source · P1

Add an explicitly enabled macOS live-tab source for Safari plus Chromium browsers. It must enumerate current tabs and activate the selected existing tab; it must not quietly fall back to scanning browser profiles, histories or cloud sessions.

**Scene:** while many docs, issues and consoles are open, type a title/URL fragment and switch directly to the already-open page.

### R3 — Expanded file-action dock · P2

Extend the selected-file action model with copy-to, move-to, move-to-trash, open terminal at directory, and platform-appropriate metadata/share actions. Destructive or overwriting actions require a user-visible confirmation; all actions must retain platform capability/degraded reasons.

**Scene:** locate an asset once, then stage it into a project folder, reveal it, copy a shell path or open its containing directory in a terminal without manually navigating Finder.

### R4 — Clipboard History QR adaptation · P1

For an image clipboard record, expose an on-demand QR recognition action that calls the shared host-owned QR service by **clipboard record ID**. The result is transient UI state; raw QR payloads must not be persisted into clipboard metadata, search indexes, logs, telemetry, AI context or ordinary error text.

- Support zero, one and multiple QR results with stable empty/failed/cancelled/timeout states.
- Show only the selected result on explicit user action; copy is always explicit.
- An `http`/`https` URL may offer **Open** only after the shared URL policy accepts it. Other payloads (Wi-Fi, vCard, deep link, arbitrary text) are display/copy-only until a separately reviewed action exists.
- Do not accept a caller-supplied path, `tfile:` URL or arbitrary image blob in the plugin surface. The host resolves the persisted image from the record ID and validates ownership/existence.

**Scene:** copy or screenshot a QR image, inspect it from Clipboard History, then safely copy or open its decoded destination without uploading the image.

### R5 — Recent-document sources · P2

Add a source-adapter category for the recent documents of opted-in macOS apps, beginning with formats that can safely yield an existing local path and an application open action. Do not hard-code arbitrary third-party database paths into CoreBox.

**Scene:** reopen the recently edited presentation, mind map or document when its filename is forgotten.

### R6 — Clipboard batch workflows · P2

Evaluate ordered paste, multi-select merge and explicit text editing against platform automation permissions and clear rollback/error states. Retain current single-record apply behavior; do not broaden clipboard reads or automate input without an explicit user gesture.

**Scene:** compose multiple copied fragments into a form or message in a defined order.

### R7 — Broader document-preview coverage · P2

Define a supported preview matrix for search results and clipboard-attached files, with native Quick Look where available and explicit unsupported/too-large/password-protected states elsewhere. This must converge with the existing Clipboard file-preview and screenshot work, not introduce a parallel renderer or filesystem bypass.

**Scene:** inspect a matching source/PDF/office/archive/code file before deciding whether to open its full application.

### R8 — User-facing usage insights · P3

Validate user demand before exposing aggregated launch/search usage. If shipped, it must be local-only, opt-in, comprehensible, and separate from ranking internals; raw query text, document titles and content cannot appear in the chart.

**Scene:** understand recurring launcher habits and decide which shortcuts or sources deserve pinning.

### R9 — Unified app destination catalog and aliases · P1

Replace the single-purpose `MainWindowProvider` result with a host-owned, typed destination catalog. A destination has a stable ID, canonical internal route (or reveal-only behavior), localized title/subtitle, local icon, structured Chinese/English/static-pinyin aliases, and an availability/advanced flag. CoreBox search must return the destination item that matched and execute it through one window-navigation service.

The first destination set is:

- **Main window** — reveal the existing main window without unexpectedly changing the current page. Aliases include `主窗口`, `主界面`, `主页面`, `打开 Tuff`, `显示 Tuff`, `main window`, `mainwindow`, `tuff window`, `open tuff`, `show tuff`.
- **Home** — reveal/focus the main window and navigate to `/home`. Aliases include `首页`, `主页`, `home`, `homepage`, `home page`, `dashboard`.
- **Settings hub** — navigate to `/setting/overview`. Aliases include `设置`, `应用设置`, `偏好设置`, `选项`, `settings`, `preferences`, `options`, `config`, `configuration`.
- **Settings categories** — expose exact destination aliases for `通用/常规` → `/setting/general`, `外观/主题` → `/setting/appearance`, `智能/AI/模型` → `/setting/intelligence`, `插件/扩展` → `/setting/plugins`, `文件索引/文件搜索` → `/setting/file-index`, `网络/代理` → `/setting/network`, `更新` → `/setting/update`, and `关于` → `/setting/about`, plus their English equivalents.
- **Later destinations** — downloads, storage usage, Store, Clipboard/Details and other routes only after their existing developer-mode, dashboard and permission guards are represented in the catalog.

Common configuration must not flood CoreBox with one row per settings page. A query matching `设置` returns one Settings item whose action panel groups **General, Appearance, Model Channels, Voice Input, Plugins & Tools, File Index, Network, and Update** under `常用设置 / Common settings`. A direct category query such as `外观`, `模型渠道` or `网络设置` still returns exactly one destination item and makes that category the Enter/default target while retaining the other grouped shortcuts. About remains directly searchable but is not a configuration shortcut; advanced/developer-only pages remain excluded.

Matching is exact after stable whitespace/case normalization, with phrase-aware Chinese, English, full-pinyin and deliberate pinyin-initial aliases plus collision tests. Standalone generic verbs such as `打开`, `show`, `window` and `窗口` must not manufacture a destination result; ambiguous bare `AI`, `model`, `proxy`, and `theme` remain excluded. Canonical category titles such as `网络` / `network` and `更新` / `update` are searchable. App settings must remain distinct from the existing `focus-settings` system action, which opens the operating system’s Focus/quiet-hours settings.

The shared navigation service must restore a minimized window, show and focus a live window, queue or reject navigation while the renderer is unavailable with a stable result, and be idempotent under repeated calls. CoreBox, tray, Assistant, local-AI recovery and the plugin system action boundary must use this service rather than maintaining separate show/focus/navigation sequences. Existing external plugin action IDs remain compatibility contracts but delegate to the same destination implementation; arbitrary caller-supplied paths are not accepted by the catalog.

**Scenes:** type `设置`, `外观`, `网络`, `主窗口` or `首页` in CoreBox and reach the intended Tuff surface without guessing a command spelling; invoke the same destinations from tray, Assistant or a plugin and get identical restore/focus behavior.

### R10 — First-party asset delivery and image-cache policy · P1

Make image delivery intentional instead of relying on an external URL or the browser’s incidental cache. The current app already has persistent native app-icon caches, file thumbnail/icon persistence and a disk-backed remote-SVG path; this requirement closes the remaining inconsistent surfaces rather than creating a second cache in every component.

- **Static system and first-party UI:** use an icon class/builtin icon or a Vite-packaged, hashed asset. The main-window destination must not load `https://tuff.tagzxia.com/favicon.ico`; its default icon must render offline. A branded Tuff logo may use the existing bundled renderer asset, not a network URL or a large data URL.
- **Bundled/plugin assets:** keep `assets/logo.svg` and other declared resources inside the packaged/runtime resource boundary and resolve them through the existing controlled local-file path (`tfile` where required). Missing or denied assets fall back to a class icon without retry storms.
- **Dynamic Store/plugin/remote assets:** reuse one host/resource-cache path with normalized URL/version keys, in-flight deduplication, bounded memory/disk size, expiry or version invalidation, and a deterministic fallback. Existing `useSvgContent`/download infrastructure is the starting point; per-component ad-hoc caches are prohibited.
- **User and Clipboard images:** continue using record-ID or controlled local-resource resolution. Do not place arbitrary clipboard/user images into a global icon cache, ordinary logs, search metadata or telemetry merely to improve repaint speed.
- **Cache failures:** a stale or unavailable image must never block the result row or navigation action; it must degrade to the existing placeholder/class icon and expose only a non-sensitive status.

**Scenes:** the main-window/settings results render immediately while offline; reopening a plugin or Store surface does not redownload the same stable icon repeatedly; clipboard images remain private while QR/OCR work operates on the existing record/resource boundary.

## Delivery map and order

No item starts until the current release/runtime and search-stability lanes permit new product work. When scheduled, split into independently verifiable child tasks in this order:

1. Unified destination catalog and shared show/focus/navigation service.
2. Static first-party icon/bundled-asset cutover; audit dynamic image surfaces and add only the bounded shared cache they actually need.
3. Clipboard History QR adaptation, after a reusable host QR decoder/URL-policy contract is available from `07-29-screenshot-ocr-qr-color`.
4. Live browser tab source.
5. External content-source adapter foundation plus one secret-free source (Apple Notes, Dash or Zotero).
6. Additional source adapters and recent-document category.
7. Expanded file-action dock.
8. Preview coverage matrix and Clipboard batch workflows.
9. Usage insights only after demand validation.

## Acceptance criteria for this planning task

- [x] Each HapiGo-derived gap is recorded as a distinct requirement with user scenario, priority and intended product boundary.
- [x] Existing Tuff coverage is distinguished from genuine gaps; no generic duplicate work is added for pinyin search, snippets, translation/TTS, clipboard history, QuickOps, terminal, window management or QR generation.
- [x] Clipboard QR is a first-class requirement with record-ID-only access, on-demand decode, no raw-payload persistence and shared screenshot-service reuse.
- [x] Main-window reveal, home navigation, settings-hub navigation and settings-category navigation are separated into typed destinations with concrete aliases and collision boundaries.
- [x] All current show/focus/navigation entry points are identified for later consolidation; app Settings is not confused with the operating system `focus-settings` action.
- [x] Static first-party icons are required to be bundled/class-based and offline-capable; dynamic remote assets have one bounded cache policy; user/clipboard images are excluded from that global cache.
- [x] Every future macOS-only capability has an explicit cross-platform unsupported/degraded requirement rather than a hidden platform fork.
- [x] The delivery order preserves the active global stability priorities, puts destination/asset foundations first, and identifies the screenshot QR task as a dependency instead of duplicating it.

## Out of scope

- Implementing, enabling or releasing any capability in this task.
- Importing third-party content into an AI provider, cloud service or unbounded global index.
- Password retrieval/autofill, 1Password secret export, QR auto-open, background QR scanning, or automatic batch paste without an explicit user gesture.
- Caching every image indiscriminately, caching sensitive Clipboard/user media globally, or replacing the existing native app/file/remote-SVG cache implementations with parallel component-local caches.
- Accepting arbitrary internal router paths or turning a generic `show/open/window` token into an unscoped navigation command.
- Replacing the existing plugin permission model, FileProvider security boundary or screenshot-session ownership.

## Open product decisions for child-task intake

- Choose the first secret-free external source after verifying its official data-access API and user permission model.
- Choose an interoperable browser-tab access method for Safari and Chromium without silently inspecting profiles or weakening browser security.
- Confirm whether users want a usage dashboard before committing UI/data-retention surface.
- The default asset decision is settled for child-task intake: static first-party actions use class/bundled assets; only dynamic remote assets may use the bounded shared cache, and clipboard/user images remain outside it.
