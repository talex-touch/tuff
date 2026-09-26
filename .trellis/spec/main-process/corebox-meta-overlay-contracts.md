# CoreBox ⌘K Action Panel (MetaOverlay) Contracts

The ⌘K panel spans main and two renderers. The CoreBox renderer builds the show request and runs
host actions; main sizes the CoreBox window, relays actions and owns the panel's lifecycle; the
overlay renderer (`#/meta-overlay`) draws the panel. The overlay is a full-window transparent
`WebContentsView` added last to the CoreBox window, so it can cover an attached plugin view — and
nothing it draws can leave the window: a panel that does not fit needs a taller window.

Not repeated here: the overlay's ready handshake, the `MetaOverlayEvents.ui.show` / `ui.hide`
request-response legs, and notification-vs-request delivery. All three are in
[channel-transport-contracts.md](channel-transport-contracts.md) ("main process notifies a
renderer"); the `panelState` and `itemAction` broadcasts below follow its notification rules.

Path prefixes: `utils/` = `packages/utils/`, `shared/` = `apps/core-app/src/shared/`, `main/` =
`apps/core-app/src/main/`, `core-box/` = `main/modules/box-tool/core-box/`, `renderer/` =
`apps/core-app/src/renderer/src/`.

## Scenario: The panel owns the window height only while it is open

### 1. Scope / Trigger

- Changing `MetaShowRequest`, `shared/meta-overlay-geometry.ts`, the `ui.show` handler
  (`core-box/ipc.ts`), `MetaOverlayManager` show / hide / destroy (`core-box/meta-overlay.ts`),
  `CoreBoxModule.applyLayoutUpdate` (`core-box/index.ts`), or `WindowManager.setHeight` and the
  bounds animation (`core-box/window.ts`, `core-box/bounds-controller.ts`).
- Cross-layer: the CoreBox renderer estimates, main resizes, the overlay CSS lays out — from one
  set of constants.

### 2. Signatures

```ts
// utils/transport/events/types/meta-overlay.ts — both new fields optional, appended only
type MetaPanelAnchor = 'footer' | 'corner'
interface MetaShowRequest {
  item: TuffItem
  builtinActions: MetaAction[]
  itemActions?: MetaAction[]
  pluginActions?: MetaAction[]  // overwritten by main with the registered actions
  anchor?: MetaPanelAnchor      // omitted = 'corner'
  desiredPanelHeight?: number   // CSS px, capped at META_PANEL_MAX_HEIGHT; omitted = window left alone
}

// shared/meta-overlay-geometry.ts — renderer estimate, main sizing and panel CSS read these
META_PANEL_MAX_HEIGHT = 420
META_PANEL_TOP_INSET = 64          // META_PANEL_HEADER_RESERVE 56 + META_PANEL_TOP_GAP 8
META_OVERLAY_MAX_WINDOW_HEIGHT = 600
resolveMetaPanelBottomInset(anchor): number   // 'footer' → 44 + 8 = 52, anything else → 12
estimateMetaPanelHeight({ rows, sections, titledSections }): number
  // header 40 + list (2 × 6 + max(rows, 1) × 32 + titled × 24 + (sections − 1) × 4) + filter 40, ≤ 420
extendMetaPanelHeightForPluginRows(height, pluginRows): number   // + 4 + 24 + rows × 32, ≤ 420
resolveMetaOverlayWindowHeight(req: Pick<MetaShowRequest, 'anchor' | 'desiredPanelHeight'>): number | null
  // min(600, ceil(64 + min(desiredPanelHeight, 420) + bottomInset)); null unless finite and > 0

// renderer/modules/box/adapter/hooks/useKeyboard.ts
buildCoreBoxMetaShowRequest(item, { footerShown: boolean }): MetaShowRequest

// core-box/meta-overlay.ts — MetaOverlayManager
show(request: MetaShowRequest): void
holdLayoutUpdate(replay: () => void): boolean   // true = held; the caller must not apply it
private restoreHeight: number | null            // height before the panel grew the window
private heldLayoutReplay: (() => void) | null   // latest CoreBox layout update held while open

// core-box/window.ts — WindowManager, over WindowBoundsController
getSettledHeight(target?): number | null   // an in-flight animation's target, else the current height
isResizing(target?): boolean                // an animated setHeight has not landed yet
setHeight(height, target?): void
```

### 3. Contracts

- **The renderer sizes, main decides.** `buildCoreBoxMetaShowRequest` builds the same
  `buildMetaActionModel` the overlay draws and sends
  `desiredPanelHeight = estimateMetaActionPanelHeight(model)`. `anchor` is `'footer'` only outside
  plugin UI mode with `.CoreBoxFooter-Sticky.display` in the DOM. The `ui.show` handler replaces
  `pluginActions` with `metaOverlayManager.getPluginActions()` and adds the enabled ones
  (`render.disabled !== true`, the model's own filter) through `extendMetaPanelHeightForPluginRows`:
  the renderer cannot see registered plugin actions.
- **No forced expand.** `ui.show` never calls `coreBoxManager.expand({ forceMax: true })`.
- **Grow only when the panel does not fit.** `fitParentToPanel` runs in `flushPendingShow` — after
  the ready handshake, before `setVisible(true)`, so the first visible frame has room. A `null`
  height leaves the window alone; otherwise the window grows to exactly the required height when
  `getSettledHeight()` is below it. Settled means the in-flight animation's target: a reopen during
  an animated shrink compares against where the window is going, not the current frame.
- **`restoreHeight` is recorded once per open** (`if (this.restoreHeight === null)`): a second
  `show` on a grown window must not record the grown height as the one to return to.
- **Hold while open.** `applyLayoutUpdate` calls
  `metaOverlayManager.holdLayoutUpdate(() => this.applyLayoutUpdate(payload, context))` after its
  quitting / UI-mode / no-window / hidden-window guards, so those updates are still dropped, never
  held. While `isVisible`, each call replaces `heldLayoutReplay`; only the latest survives. The
  hold keeps the call, not a height: the replay re-enters the whole guard chain.
- **Hand back on close.** `hide()` clears `isVisible` first, then `releaseHostLayout()` nulls both
  fields and runs the held replay if there is one — it wins over `restoreHeight`, because the
  results changed under the panel — else `setHeight(restoreHeight)` if the panel grew the window,
  else nothing. Main keeps the replay itself because the renderer will not resend: `useResize`
  drops a payload equal to the last one it sent.
- **CoreBox hides under the panel** (the parent window's `'hide'` listener → `dismissWithHost()`):
  drop the replay and `restoreHeight` without resizing a hidden window (CoreBox resets its size and
  re-sends its layout on the next show), leave focus alone, still send `ui.hide` so the retained
  renderer resets.
- **The overlay renderer dies under an open panel** (`destroyRenderer()`): the height is still
  handed back.
- **A hidden CoreBox refuses `show()`** (a ⌘K from a detached DivisionBox): a panel no one can see
  would hold CoreBox's layout until its next show.
- **The view follows the window.** Every `WindowBoundsController.setBounds()`, each animation frame
  included, calls `syncOverlayBounds` → `metaOverlayManager.updateBounds()`, open or closed;
  `HEIGHT_SYNC_DELAY_MS` (220 ms, the animation's upper bound) re-syncs once after a show.
- **The CSS reads the same numbers.** `renderer/views/meta/MetaOverlay.vue` binds the geometry as
  custom properties and caps the panel at `min(420px, 100vh - top - bottom)`. A window the work area
  clamps (`calculateCoreBoxBounds`, 12 px margin) still holds the panel; its list scrolls.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| `desiredPanelHeight` missing, `0`, negative, `NaN`, `Infinity` | `null`; window untouched on open and close |
| Settled height ≥ required | No `setHeight`, nothing recorded |
| Settled height < required | One `setHeight(required)`; `restoreHeight` = settled height |
| `desiredPanelHeight` above 420 | Sized as 420: footer 536, corner 496 (the 600 cap does not bind today) |
| Layout update while open | Held, latest wins, no `setHeight` |
| Layout update while open, in UI mode or with CoreBox hidden | Dropped by the earlier guards, not held |
| Close with a held update | Replay runs; `restoreHeight` ignored |
| Close without one, window grown | `setHeight(restoreHeight)` |
| CoreBox hides under the panel | No resize, no replay, no focus; `ui.hide` still sent; no hold left |
| Overlay renderer gone while open | Height handed back as on close |
| `show()` while CoreBox is hidden | Refused: not visible, nothing held, no `setHeight` |
| Work area shorter than required | Window clamped; the panel's `max-height` follows `100vh`, the list scrolls |

### 5. Good / Base / Bad Cases

- Good (real device, 2026-09-26): a layout update arrived under an open panel and was held; closing
  replayed it and the window went from 522 to 190 px. Applied while open, it would have shrunk the
  window under the panel; without the replay the window would have kept a height its results no
  longer filled.
- Base: a 480 px window, footer anchor, a 300 px panel (needs 416): no resize on open or close,
  `panelState` reports `grown: false`.
- Bad: the pre-2026-09-26 `expand({ forceMax: true })` in `ui.show` pushed every open to 600 px and
  nothing handed it back, leaving an empty strip under short result lists where the window material
  showed the desktop.

### 6. Tests Required

- `shared/meta-overlay-geometry.test.ts`: footer inset 52 and corner 12 (also for `undefined`); a
  300 px panel needs 416 / 376; 10 000 caps at `64 + 420 + 52`; 300.2 rounds up to 377;
  `undefined`, `0`, `-10`, `NaN`, `Infinity` → `null`; plugin rows add `4 + 24 + rows × 32`.
- `core-box/meta-overlay.test.ts` › "window height around the panel": 300 → 416 on open, back to 300
  on close; corner → 376; a 480 px window is never resized; 5 000 → 536; no height → no `setHeight`;
  two held updates → only the latest replays and no restoring `setHeight`; no hold while closed;
  CoreBox `'hide'` → no `setHeight`, no replay, no focus, only `ui.hide` sent, no hold left; a
  hidden CoreBox → not shown, nothing held.
- `core-box/ipc.test.ts`: `ui.show` never calls `expand`; two enabled plugin actions extend 200 →
  292, a disabled one does not count.
- `core-box/index.test.ts`: two layout updates while open → `holdLayoutUpdate` twice, `setHeight`
  never; the replay applies only the latest (260).
- `renderer/modules/box/adapter/hooks/useKeyboard.test.ts` › "⌘K request": a displayed footer →
  `anchor: 'footer'` and `desiredPanelHeight: 364` for an app item (5 rows, 5 sections, 4 titled);
  no footer → `'corner'`; plugin UI mode → `'corner'` even with a lingering footer element.
- Not pinned: `WindowBoundsController.getTargetHeight` / `isAnimating` have no direct test; the
  manager tests mock `getSettledHeight`. Add one before changing animation retargeting.

### 7. Wrong vs Correct

```ts
// Wrong: every open goes to 600, and nothing hands the height back.
transport.on(MetaOverlayEvents.ui.show, (request) => {
  coreBoxManager.expand({ forceMax: true })
  metaOverlayManager.show(request)
})

// Correct: grow only to what the panel needs, against the height the window is settling at.
const requiredHeight = resolveMetaOverlayWindowHeight(request)
const currentHeight = windowManager.getSettledHeight(hostWindow)
if (requiredHeight !== null && currentHeight !== null && currentHeight < requiredHeight) {
  if (this.restoreHeight === null) this.restoreHeight = currentHeight
  this.publishPanelState() // next scenario: say so before growing
  windowManager.setHeight(requiredHeight, hostWindow)
}
```

```ts
// Wrong: the replay re-enters holdLayoutUpdate while isVisible is still true, is held again, lost.
this.releaseHostLayout()
this.isVisible = false

// Correct: close first, then hand the height back.
this.isVisible = false
this.releaseHostLayout()
```

## Scenario: Paint the space a grown window adds (`panelState`)

### 1. Scope / Trigger

- Changing `CoreBoxEvents.metaOverlay.panelState`, `MetaOverlayManager.publishPanelState` or its
  hand-back watch, `useMetaPanelFill`, or the `CoreBox-Wrapper--meta-fill` rule.
- Why it exists: CoreBox has no opaque surface. Its only paint is the teleported `.CoreBox-Mask`
  (75% `--tx-fill-color`) over the window material (vibrancy on macOS, Mica on Windows), so space
  the panel adds under the results shows a blur of the desktop behind CoreBox, which the overlay's
  ~10% dim does not hide. Only main knows whether it grew the window.

### 2. Signatures

```ts
// utils/transport/events/index.ts — 'core-box:meta-overlay:panel-state'
CoreBoxEvents.metaOverlay.panelState  // define<CoreBoxMetaOverlayPanelStatePayload, void>()

// utils/transport/events/types/core-box.ts
interface CoreBoxMetaOverlayPanelStatePayload {
  visible: boolean // the panel is on screen
  grown: boolean   // the window is taller than CoreBox's own layout because of the panel
}

// core-box/meta-overlay.ts — MetaOverlayManager
private publishPanelState(): void  // grown = (isVisible && restoreHeight !== null) || handBackPending
private watchHandBack(): void      // HAND_BACK_POLL_MS = 32 until !isResizing(), cap HAND_BACK_MAX_WAIT_MS = 1_000
private publishedPanelState: CoreBoxMetaOverlayPanelStatePayload  // the last payload sent

// renderer/modules/box/meta-actions/meta-panel-fill.ts
useMetaPanelFill(): Readonly<Ref<boolean>>  // renderer/views/box/CoreBox.vue → 'CoreBox-Wrapper--meta-fill'
```

### 3. Contracts

- **A notification.** `broadcastToWindow(parentWindow.id, CoreBoxEvents.metaOverlay.panelState,
  next)` to the window hosting the overlay, never `sendTo`: nothing answers it. A synchronous throw
  (a destroyed window) is caught and logged.
- **On change only.** Compared with `publishedPanelState`; closing a panel that never opened sends
  nothing. With no live parent or runtime nothing is sent and nothing recorded, so the next change
  is still news.
- **Open: say so before growing.** `fitParentToPanel` sets `restoreHeight`, publishes
  `{ visible: true, grown: true }`, and only then calls `windowManager.setHeight`. A panel that fits
  publishes after `setVisible(true)`: `grown: false`, or `grown: true` while an earlier hand-back is
  still landing. A queued show publishes nothing until the renderer takes it.
- **Close: keep `grown` until the shrink lands.** When the panel grew the window and
  `windowManager.isResizing()` (`animation.coreBoxResize`, 120–220 ms), `hide()` starts
  `watchHandBack()`: `handBackPending` holds `{ visible: false, grown: true }` until a 32 ms poll
  sees the animation done, or 1 s passes. Without the animation the height has already landed and
  `grown` falls with `visible`. The watch runs whether the height comes back by restore or by a held
  replay.
- **Early end.** `dismissWithHost()` (CoreBox hid) and `destroyRenderer()` (overlay gone) clear the
  watch and publish `{ visible: false, grown: false }`; `destroyRenderer()` then resets
  `publishedPanelState`, so a rebuilt overlay's first grown open is sent again. A reopen during a
  hand-back keeps the watch: the paint does not blink between the two panels.
- **The renderer reads defensively.** `filled = typeof state?.visible === 'boolean' &&
  state.grown === true`; anything malformed reads as closed. The paint follows `grown`, not
  `visible`. The listener is disposed in `onBeforeUnmount`.
- **What is painted.** `.CoreBox-Wrapper.CoreBox-Wrapper--meta-fill::before` in
  `renderer/views/box/CoreBox.vue`: `inset: 56px 0 0` (where `div.CoreBoxRes` starts),
  `z-index: -1`, `--tx-fill-color` at full strength, bottom corners on
  `--corebox-container-radius`, `pointer-events: none` — over the mask, behind every row and the
  footer; the header keeps its material. A canvas layout (`CoreBox-Wrapper--canvas`) fills the
  whole launcher (`inset: 0`): its header sits on its own grid inside padding, so no fixed line
  marks where the results start.
- **Why not only the added strip.** The results area has no surface of its own either — the same
  75% mask over the material — so the rows above an opaque strip would still show the desktop. The
  payload also carries no geometry on purpose: only main knows the pre-open height, and during an
  animation the boundary moves every frame.
- **Host-only.** Not in `PLUGIN_FACING_EVENTS` (`utils/transport/security/plugin-facing-events.ts`),
  no plugin SDK wrapper, no main handler.

### 4. Validation & Error Matrix

| Event | Published |
| --- | --- |
| Open, window needs growth | `{ true, true }` before `setHeight` |
| Open, window fits | `{ true, false }` |
| Show queued before readiness | Nothing until `markRendererReady` |
| Repeated show, or hide of a closed panel | Nothing |
| Close, no animation | `{ false, false }` |
| Close, animated restore | `{ false, true }`, then `{ false, false }` on landing |
| Animated restore never settles | `{ false, false }` after 1 s |
| Close of a panel that never grew, window animating for another reason | `{ false, false }` at once, no watch |
| CoreBox hides or the overlay is destroyed during a hand-back | `{ false, false }`, timer cleared |
| Reopen during a hand-back that grows again | `{ true, true }`, `grown` held through the landing |
| Reopen during a hand-back that fits | `{ true, true }`, then `{ true, false }` on landing |
| Payload `undefined`, `null`, `{}`, `{ visible: 'yes', grown: 1 }`, `{ grown: true }` | Renderer: not filled |

(`{ a, b }` reads `{ visible: a, grown: b }`.)

### 5. Good / Base / Bad Cases

- Good: ⌘K on a short list grows 300 → 416; the added strip is `--tx-fill-color` from the first
  grown frame, and stays painted while `animation.coreBoxResize` carries the window back after Esc.
- Base: a window that already fits: `grown: false`, nothing painted, the launcher unchanged under
  the dim.
- Bad: `grown` tied to `visible` — the paint drops at Esc and the desktop shows through the
  shrinking strip for up to 220 ms. Bad: published after `setHeight` — the first grown frames show
  the desktop.

### 6. Tests Required

- `core-box/meta-overlay.test.ts` › "panel state for the CoreBox renderer": a grown open then close
  publishes exactly `[{ true, true }, { false, false }]` through `broadcastToWindow` to
  `parentWindow.id`, never through `sendTo`; a fitting open → `{ true, false }`; repeated show / hide
  publish changes only; a queued show publishes on `markRendererReady`; CoreBox `'hide'` and
  `destroy()` end at `{ false, false }` and a rebuilt overlay publishes again; the `setHeight` mock
  records what had been published when it ran: `[{ true, true }]`.
- Same file › "panel state while the window animates back" (fake timers, `isResizing` mocked):
  painted through 160 ms, `{ false, false }` at landing with no timers left; no watch for a window
  never grown; still `{ false, true }` at 900 ms, `{ false, false }` by 1 100 ms; CoreBox hide ends
  it; a reopen that grows stays `grown`; a reopen that fits drops to `{ true, false }` at landing.
- `renderer/modules/box/meta-actions/meta-panel-fill.test.ts`: fills only on `grown: true`; stays
  filled for `{ false, true }`; the five malformed payloads read as closed; no listener after
  unmount.
- `utils/__tests__/transport-domain-sdks.test.ts`: the event name. `utils/__tests__/plugin-facing-events.test.ts`
  › "lists exactly what the plugin SDK sends" keeps it off the allowlist (the list is derived from
  `utils/plugin/**`).
- The `::before` rule has no unit test (jsdom has no layout). Verify in a real window, both themes,
  `animation.coreBoxResize` off and on: ⌘K on a short list, then Esc — no desktop in the added strip
  at any point; a canvas layout fills whole.

### 7. Wrong vs Correct

```ts
// Wrong: the window grows first; its first frames at the new size show the desktop.
windowManager.setHeight(requiredHeight, hostWindow)
this.publishPanelState()

// Correct: tell CoreBox, then grow.
this.publishPanelState()
windowManager.setHeight(requiredHeight, hostWindow)
```

```ts
// Wrong: the fill drops at Esc while an animated restore is still shrinking the window.
grown: this.isVisible && this.restoreHeight !== null

// Correct: a pending hand-back holds it until the restore lands, or 1 s.
grown: (this.isVisible && this.restoreHeight !== null) || this.handBackPending
```

## Scenario: "Show in Finder" reveals, never opens

### 1. Scope / Trigger

- Changing `AppEvents.system.showInFolder`, `ShowInFolderRequest`, either SDK's `showInFolder`, or
  the handler in `main/channel/system-shell-handlers.ts`.
- Security boundary. The event is plugin-facing behind `system.shell`, and `shell.openPath`
  launches by OS association: opening a macOS package directory launches it. Without this rule a
  plugin holding `system.shell` could launch any `.app` by "showing" it — the class of #908
  (`openApp`) and #909 (`executeCommand`).

### 2. Signatures

```ts
// utils/transport/events/types/app.ts
interface ShowInFolderRequest {
  path: string
  reveal?: boolean // select even a directory in its parent instead of opening it
}
// utils/transport/events/app.ts — 'app:system:show-in-folder', define<ShowInFolderRequest, void>()

// utils/transport/sdk/domains/app.ts (host renderer)
showInFolder(path: string, options?: { reveal?: boolean }): Promise<void>
  // sends { path, reveal: true } only when options.reveal === true, else exactly { path }
// utils/plugin/sdk/system.ts (plugins): showInFolder(path) sends { path } only

// main/channel/system-shell-handlers.ts
registerSystemShellHandlers(transport, { …, platform?: NodeJS.Platform }) // tests pin platform
const MAC_PACKAGE_EXTENSIONS: ReadonlySet<string> // lower-case: '.app', '.appex', '.framework',
                                                  // '.prefpane', '.pkg', '.sparsebundle', '.photoslibrary', …
async function isMacPackageDirectory(target: string): Promise<boolean>
  // extension of target, then of fs.realpath(target); realpath failure → false
```

### 3. Contracts

- **Permission first.** `withPermission({ permissionId: 'system.shell', failClosedForPlugin: true,
  … })` wraps the handler: a plugin without the grant is rejected before `fs.stat` touches the
  path. The host renderer carries no plugin context and passes.
- **Decision, in order.** Empty path → `SYSTEM_SHELL_PATH_REQUIRED`; `fs.stat` fails →
  `SYSTEM_SHELL_PATH_UNAVAILABLE`. Then `shell.showItemInFolder(target)` when `reveal === true`, or
  the target is not a directory, or `platform === 'darwin'` and `isMacPackageDirectory(target)`.
  Only a plain folder reaches `shell.openPath(target)`; its non-empty result or a throw becomes
  `SYSTEM_SHELL_OPEN_PATH_FAILED`.
- **Package detection** is by extension, case-insensitively (`.APP`, `Safari.app/`), on the path as
  given and again after `fs.realpath`: a folder-named symlink to an `.app` launches it just the same.
  darwin only — an `.app`-named folder on Linux is a folder.
- **The package rule never depends on `reveal`.** The plugin SDK never sends it and a raw payload
  may omit it; `reveal` only extends selection to plain folders.
- **Callers say what they mean.** "Show in Finder / File Explorer / File Manager"
  (`reveal-in-finder` in `renderer/modules/box/adapter/hooks/useActionPanel.ts`) sends
  `{ reveal: true }`: it must select, never open a folder or launch an app. A provider's `open`-type
  action — a file's "Open Folder" (`open-folder`) — sends no flag, so a plain folder still opens.
- **Errors are codes.** No message carries the path; Electron's `openPath` error string is replaced
  by the code.
- **Known residual (accepted 2026-09-26):** a package recognised only by the Finder bundle bit, with
  no listed extension, is a plain directory here and is opened.

### 4. Validation & Error Matrix

| Request | Platform | Result |
| --- | --- | --- |
| Plugin without `system.shell`, any payload | any | `SYSTEM_SHELL_PERMISSION_DENIED` (`…_UNAVAILABLE` without a permission runtime); no `stat`, no shell call |
| `path` empty or whitespace | any | `SYSTEM_SHELL_PATH_REQUIRED` |
| Path missing, with or without `reveal` | any | `SYSTEM_SHELL_PATH_UNAVAILABLE`, no path in the message |
| A file | any | `showItemInFolder` |
| A directory, `reveal: true` | any | `showItemInFolder` |
| `.app`, `.APP`, `Safari.app/`, `.prefPane`, `.photoslibrary`, `.sparsebundle` directory, no `reveal` | darwin | `showItemInFolder` |
| Folder-named symlink to an `.app` | darwin | `showItemInFolder` |
| Plain folder, no `reveal` | any | `openPath`; failure → `SYSTEM_SHELL_OPEN_PATH_FAILED` |
| `notes.app` folder | linux | `openPath` |
| Package marked only by the bundle bit | darwin | `openPath` (known residual) |

### 5. Good / Base / Bad Cases

- Good: ⌘O on `/Applications/Calculator.app` selects it in Finder; a plugin sending
  `{ path: '/Applications/Calculator.app' }` gets the same selection.
- Base: "Open Folder" on a file opens its parent folder, as before.
- Bad: the earlier handler opened every directory with `shell.openPath`, so the host's own "Show in
  Finder" on an app item launched the app — and so could any plugin holding `system.shell`.

### 6. Tests Required

- `main/channel/system-shell-handlers.test.ts` › "showInFolder reveals instead of opening": a linux
  directory with `reveal` → `showItemInFolder`; darwin `Calculator.app` without `reveal` → no
  `openPath`; `it.each` over five package spellings; a `realpath` to an `.app` is followed; a darwin
  plain folder → `openPath`; a linux `notes.app` → `openPath`; a denied plugin with `reveal` rejects
  `SYSTEM_SHELL_PERMISSION_DENIED` before `fs.stat`; a missing path with `reveal` rejects exactly
  `SYSTEM_SHELL_PATH_UNAVAILABLE`. Pin `platform` through the handler option, not `process.platform`.
- Same file: files reveal, directories open, Electron open errors sanitized, the plugin gate on both
  events.
- `utils/__tests__/transport-domain-sdks.test.ts`: `showInFolder(p)` sends `{ path }`;
  `showInFolder(p, { reveal: true })` sends `{ path, reveal: true }`.
- `renderer/modules/box/adapter/hooks/useActionPanel.test.ts`: `reveal-in-finder` on an app calls
  `showInFolder(path, { reveal: true })`; `open-folder` calls it with the path only.
- `renderer/modules/box/meta-actions/meta-action-model.test.ts`: the reveal is named after the
  platform's file manager, never "Open"; it is offered only for an absolute path (none for a Windows
  Store `shell:AppsFolder` id).

### 7. Wrong vs Correct

```ts
// Wrong: any directory opens — an .app launches, from the host and from any plugin with system.shell.
if (stats.isDirectory()) {
  await shell.openPath(target)
  return
}
shell.showItemInFolder(target)

// Correct: only a plain folder opens, and the package check needs nothing from the caller.
if (
  payload?.reveal === true ||
  !stats.isDirectory() ||
  (platform === 'darwin' && (await isMacPackageDirectory(target)))
) {
  shell.showItemInFolder(target)
  return
}
const error = await shell.openPath(target)
if (error) throw new Error(SYSTEM_SHELL_OPEN_PATH_FAILED)
```

## Scenario: Keys, execution failures and feedback

### 1. Scope / Trigger

- Changing a ⌘K chord, `renderer/modules/box/meta-actions/meta-action-model.ts`,
  `renderer/modules/shortcuts/shortcut-chord.ts` / `shortcut-string.ts`, the key handler in
  `renderer/views/meta/MetaOverlay.vue`, the result-list shortcuts or Enter handling in
  `renderer/modules/box/adapter/hooks/useKeyboard.ts`, execution in `useActionPanel.ts`, or where
  CoreBox shows an action's outcome.
- Cross-layer: one key is resolved in two documents — the overlay with the panel open, CoreBox with
  it closed — against one model, and main moves focus between them while the key can still be down.

### 2. Signatures

```ts
// renderer/modules/shortcuts/shortcut-chord.ts
interface ShortcutChord { code: string; shift?: boolean; alt?: boolean } // code = KeyboardEvent.code
shortcutChordMatches(event, chord, isMac): boolean // macOS: ⌘ and not Ctrl; else Ctrl and not ⌘; code, shift, alt exact
shortcutChordLabel(chord, isMac): string            // '⌘⌥⇧C' or 'Ctrl+Alt+Shift+C'

// renderer/modules/shortcuts/shortcut-string.ts — provider / plugin strings ('⌘⇧S', 'CmdOrCtrl+C', 'Enter')
parseShortcutString(value): { kind: 'chord'; chord: ShortcutChord } | { kind: 'enter' } | null

// renderer/modules/box/meta-actions/meta-action-model.ts
META_SECONDARY_CHORD = { code: 'Enter' }        // Mod↵
isChordTakenByHost(chord): boolean               // RESERVED_CHORDS + HOST_ACTION_CHORDS
resolveMetaActionShortcut(model, event, { isMac, scope: 'panel' | 'list' }): MetaActionRow | null
isImeComposing(event): boolean                   // event.isComposing || event.keyCode === 229
COREBOX_META_ACTION_EVENT = 'corebox:meta-action' // window CustomEvent<{ actionId, item }>

// renderer/modules/box/meta-actions/footer-feedback.ts
showCoreBoxFooterFeedback(message, tone?: 'success' | 'error'): void // COREBOX_FOOTER_FEEDBACK_MS = 1200
```

Host chords (`BUILTIN_SPECS`, `PROVIDER_ACTION_SPECS`; Mod = ⌘ on macOS, Ctrl elsewhere):

| Row | Chord |
| --- | --- |
| `file-copy-path` | Mod⇧C |
| `copy-title` | Mod⌥C |
| `reveal-in-finder` | ModO |
| `toggle-pin` | macOS ⌘.; Windows / Linux Ctrl+Shift+. — `{ mac: { code: 'Period' }, other: { code: 'Period', shift: true } }` |
| The secondary row (the first own item action, else the reveal) | Mod↵ |
| `flow-transfer` | Mod⇧D, panel only: the result list already binds it |

### 3. Contracts

- **Physical keys only.** Every action chord goes through `shortcutChordMatches` on
  `KeyboardEvent.code` with the platform's command modifier. The string matcher it replaced matched
  no built-in chord on Windows / Linux and never matched ⌘⌥T, because Option rewrites `key` on macOS.
- **Pin is platform-split.** macOS ⌘.; Windows / Linux Ctrl+Shift+. — Microsoft Pinyin, Sogou and
  fcitx toggle punctuation width on Ctrl+., and with one of them on the page never sees the key.
  Ctrl+. is neither bound nor intercepted: `resolveMetaActionShortcut` returns `null`, so nothing
  calls `preventDefault`. The badge and the key are the same row's chord and move together.
- **Host keys are not available to declared shortcuts.** A provider or plugin chord is parsed by
  `parseShortcutString` and dropped — not bound, not badged — when `isChordTakenByHost`: editing
  keys (Mod+C stays copy, even for a declared `CmdOrCtrl+C`), ⌘K, ⌘D, ⌘1–0, arrows, Mod↵, app-menu
  roles, and every host action chord on every platform. Both ⌘. and ⌘⇧. are taken everywhere, so a
  key never changes meaning with the platform. Among the rest the first declarer wins, item actions
  before plugin actions.
- **AltGr never resolves** (`getModifierState('AltGraph')`): on Windows it is Ctrl+Alt and types
  characters.
- **Scope.** `'panel'` runs any enabled row. `'list'` (panel closed) runs only rows with
  `runsFromList`: never a plugin row (only main can reach the plugin), not `flow-transfer`.
  `runResultListActionShortcut` runs outside plugin UI mode and DivisionBox only, after plugin-view
  and widget forwarding, and not while `window.__coreboxHistoryVisible` or a `.FlowSelector` owns
  the keyboard.
- **A key that names nothing is left alone** — not prevented, not stopped. Mod↵ on an item without a
  secondary falls through to the ordinary Enter path.
- **Auto-repeat runs nothing.** A held chord runs once and its repeats are prevented. In the panel a
  held ⌘K does not toggle.
- **Held-Enter guard.** The overlay prevents every plain Enter and runs a row only when
  `!event.repeat`. Main then hides the panel and focuses CoreBox while the key can still be down, so
  CoreBox checks `swallowForeignEnterRepeat` right after F-key blocking, before every Enter consumer
  (result list, widget, plugin view): a non-repeat Enter sets `enterPressSeen`; a repeat without it
  is prevented and stopped; Enter `keyup`, window `blur` and window `focus` clear it. Before this,
  the repeats ran the selected result — opening the file whose path had just been copied — or
  reached a plugin view.
- **IME.** The overlay ignores every key while `isImeComposing(event)` or between
  `compositionstart` and `compositionend` on its filter (the committing Enter still arrives flagged);
  main's `before-input-event` Esc skips `input.isComposing`; list shortcuts skip composing keys; a
  fresh composing Enter is not the guard's (it is not a repeat) and CoreBox's Enter path ignores it.
- **The overlay never learns an outcome.** `MetaOverlayEvents.action.execute` (from the owning
  overlay renderer only) is answered `{ success: true }` once main has relayed: item and builtin
  actions as a `CoreBoxEvents.metaOverlay.itemAction` broadcast to the parent window, plugin actions
  through `sendToPlugin(CoreBoxEvents.metaOverlay.actionExecuted)`. Outcomes belong to the CoreBox
  renderer.
- **Failures are caught, shown, and logged as id + code.** Both CoreBox entry points — the
  `itemAction` listener and `COREBOX_META_ACTION_EVENT` — go through `runUnawaitedAction`
  (`useActionPanel.ts`): it logs `('Action failed', { actionId, code })`, `code` being a string
  `error.code` or `undefined`, never the error or its message, which can carry the item's path
  (frontend [quality-guidelines.md](../frontend/quality-guidelines.md), "Operational Error Privacy
  and SQLite Rebuild Recovery"); and it shows `corebox.actions.failed` with tone `'error'`.
- **Feedback placement.** No toast: CoreBox mounts no toast host. `showCoreBoxFooterFeedback` holds
  one message for 1 200 ms; a newer one replaces it and restarts the clock. `CoreBoxFooter.vue`
  draws it while the footer is on screen (it exposes `onScreen`: slid in, or a file index
  building). Otherwise the header status slot `.CoreBox-ActionFeedback` in `.CoreBox-Configure`
  (`renderer/views/box/CoreBox.vue`) draws it: no result area (plugin UI mode — a product decision,
  2026-09-26 — or no rows), or a footer parked out of view for an item that hides its hints. One
  announcer speaks wherever it shows: the always-mounted `.CoreBox-ActionFeedback-Live`
  (`role="status"`) on the wrapper, outside `.CoreBox`, which a DivisionBox can hide.

### 4. Validation & Error Matrix

| Key or event | Where | Result |
| --- | --- | --- |
| ⌘. (macOS), Ctrl+Shift+. (Windows / Linux) | panel, list | `toggle-pin`, prevented |
| Ctrl+. (Windows / Linux) | panel, list | Nothing, not prevented |
| ⌘⇧. (macOS) | panel, list | Nothing |
| A plugin declares `⌘.` or `⌘⇧.` | model | Chord `null`, no badge, on every platform |
| Mod+C in the filter or the input | panel, list | Text copy, no action |
| Mod⇧C on an item with no path | list | Nothing, not prevented |
| Mod↵ on an item without a secondary | list | Ordinary Enter path |
| AltGr+C (Ctrl+Alt+C) | panel, list | Nothing |
| A chord's auto-repeat | panel, list | Prevented, not run |
| Enter repeat, press began in the overlay | CoreBox | Prevented and stopped; not run, not forwarded |
| Enter repeat, press began in CoreBox | CoreBox | Runs as before |
| Enter or arrows while composing | panel | Left to the IME |
| Esc while composing | main | Left to the IME; the next plain Esc closes |
| An action rejects (e.g. `SYSTEM_SHELL_PATH_UNAVAILABLE`) | CoreBox | `corebox.actions.failed` shown; log `{ actionId, code }` only |
| Outcome with the footer off screen | CoreBox | Header slot draws it; announced once |

### 5. Good / Base / Bad Cases

- Good: ⌘⇧C on a selected file with the panel closed copies its path and the footer says "已复制";
  if the write is denied, the footer says "操作失败" and the log carries the code, not the path.
- Base: in the panel ↵ runs the primary row, Esc and ⌘K close it, ↑↓ scroll the active row into
  view instantly, and hover follows `pointermove`, so a panel opening under a resting cursor keeps ↵
  on the primary row.
- Bad: Enter held on "Copy Path" — the panel copies, main focuses CoreBox, the auto-repeats open the
  file. Bad: Ctrl+. bound on Windows — with Microsoft Pinyin on it never reaches the page, so the
  badge teaches a dead key.

### 6. Tests Required

- `renderer/modules/box/meta-actions/meta-action-model.test.ts` › "keys": the chord of each host
  row; pin `{ code: 'Period' }` badged `⌘.` on darwin, `{ code: 'Period', shift: true }` badged
  `Ctrl+Shift+.` on win32 and linux in both scopes, bare Ctrl+. → `null`, ⌘⇧. on macOS → `null`;
  `isChordTakenByHost` for both pin chords, and plugin `⌘.` / `⌘⇧.` → `null` on darwin and win32;
  the reveal is the Mod↵ secondary (`['⌘↵', '⌘O']` / `['Ctrl+↵', 'Ctrl+O']`); a declared
  `CmdOrCtrl+C` binds and shows nothing. › "resolveMetaActionShortcut": AltGr → `null`; plugin rows
  run in the panel only.
- `renderer/modules/box/adapter/hooks/useKeyboard.test.ts` › "action shortcuts on the selected
  result": the five chords dispatch `COREBOX_META_ACTION_EVENT` without `handleExecute`; `key: 'ç'`
  still matches `KeyC`; a key that does not apply is not prevented; Mod↵ falls through; composing
  keys are untouched; a held chord dispatches once and its repeat is prevented; bare Ctrl+. is
  untouched; UI mode forwards to the plugin view; Mod⇧D stays with Flow; the Flow picker and the
  calculation history block it.
- Same file › "Enter held over from the ⌘K panel": a foreign repeat is prevented and not run, then a
  fresh press runs; a local press repeats as before; a composing Enter is not prevented; `blur`,
  `focus` and Enter `keyup` forget the press; a held Mod↵ runs nothing and a UI-mode repeat is not
  forwarded.
- `renderer/views/meta/MetaOverlay.test.ts` › "MetaOverlay panel": Enter, Mod↵ and Mod⇧C dispatch the
  primary, the reveal and the copy path; bare Ctrl+. is not prevented, Ctrl+Shift+. pins; a repeated
  Enter is prevented and dispatches nothing; Ctrl+C stays with the filter; composition keeps arrows
  and Enter; hover only on pointer movement; Esc and Ctrl+K close; a held Ctrl+K stays open.
- `core-box/meta-overlay.test.ts`: "leaves Esc to the IME while it composes".
- `renderer/modules/box/adapter/hooks/useActionPanel.test.ts`: a rejected panel action and a rejected
  list shortcut both end in footer `{ tone: 'error', message: '操作失败' }`, log exactly
  `('Action failed', { actionId, code })`, and no logged call contains the path.
- `renderer/components/render/CoreBoxFooter.feedback.test.ts` and
  `renderer/views/box/CoreBox.search-status.test.ts` › "CoreBox action feedback" (and "… with the real
  footer"): the footer draws an outcome only while on screen; the header draws it in plugin UI
  mode, with no rows and behind a parked footer; one announcer, outside `.CoreBox`, speaks once and
  does not repeat when the message changes place.

### 7. Wrong vs Correct

```ts
// Wrong: a rejection surfaces as an unhandled rejection with nothing on screen…
void executeAction(data.actionId, data.item)
// …or a caught error goes into the log, path and all.
void executeAction(actionId, item).catch((error) => actionPanelLog.error('Action failed', error))

// Correct
void executeAction(actionId, targetItem).catch((error: unknown) => {
  actionPanelLog.error('Action failed', { actionId, code: resolveErrorCode(error) })
  showCoreBoxFooterFeedback(t('corebox.actions.failed', '操作失败'), 'error')
})
```

```ts
// Wrong: Ctrl+. on Windows / Linux — a Chinese IME takes it, so the badge teaches a dead key.
'toggle-pin': { …, chord: { code: 'Period' } }

// Correct: platform-split; Ctrl+. is left unbound and unintercepted.
'toggle-pin': { …, chord: { mac: { code: 'Period' }, other: { code: 'Period', shift: true } } }
```

```ts
// Wrong: CoreBox runs every Enter, including the repeats of a press that began in the overlay.
if (event.key === 'Enter') handleExecute(res.value[boxOptions.focus])

// Correct: first, before any Enter consumer.
if (swallowForeignEnterRepeat(event)) return
```
