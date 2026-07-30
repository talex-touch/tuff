# Screenshot tool workflow design

## 1. Scope

This task delivers the standalone static screenshot workflow on top of `screenshot.capture@1.0.0`. It owns the product session, transparent overlays, free/object selection, frozen/live behavior, completion routing, copy/save actions, shortcut/tray/System/Assistant entry migration, permission enforcement, and a repeatable local demo video.

It does not implement scrolling stitch, annotation node internals, OCR/QR algorithms, persistent pin/history, or their durable stores. Their action buttons are rendered from capability state and stay disabled with stable reasons until the owning child task ships.

## 2. Hard boundaries

1. Rust/native owns display/window/UI identity, capture, crop/composition, pixel effects, PNG encoding, generation, and budgets.
2. Electron main owns the single active screenshot session, caller identity, permissions, overlay/editor windows, clipboard, save destinations, managed resources, and teardown.
3. Renderer owns transient pointer/keyboard presentation and never receives native transport, attachments, Buffer, raw path, native window ID, generation ID, title, owner path, or AX text.
4. Plugin/public SDK receives managed descriptors only. A visible overlay requires verified identity plus `window.capture`; background single-frame remains separate and is not granted by this task.
5. Existing Assistant selector is removed after migration. There is one workflow owner and no runtime/legacy fallback.

## 3. Data flow

```text
Shortcut / Tray / Assistant / System Action / verified plugin
                    |
           ScreenshotSessionManager
                    |
     NativeScreenshotService (main only)
       refresh / hitTest / captureTarget
       composeFrozenRegion / resource actions
                    |
 screenshot.capture@1.0.0 + Buffer attachments
                    |
  per-display ScreenshotOverlay BrowserWindows
                    |
 same-overlay edit/copy/save/done or return-resource result
```

Session start captures every display before showing overlays. Frozen overlays display only `tfile://` resources. Live mode hides frozen backgrounds and reveals the desktop while ScreenCaptureKit excludes Tuff windows. Once a selection exists, the same overlay becomes the editing surface. Copy/save lazily materialize from retained display snapshots in Rust and keep the overlay open; Done reuses the materialized resource and closes the session. A live completion invokes a fresh native region/window/UI capture.

## 4. Shared contracts

Shared types live with typed transport events under `packages/utils/transport/events/screenshot-session.ts`.

### Start

```ts
type ScreenshotSessionEntrypoint =
  | 'shortcut'
  | 'tray'
  | 'assistant'
  | 'system-action'
  | 'plugin'
  | 'demo'

type ScreenshotCompletionMode = 'editor' | 'return-resource' | 'direct-png'

interface ScreenshotSessionStartRequest {
  completionMode: ScreenshotCompletionMode
  delayMs?: 0 | 3000 | 5000
  initialTarget?: 'free-region' | 'display' | 'window' | 'ui-element'
}
```

Caller identity and entrypoint never come from this payload. Transport context or the main-process callsite injects them into the manager's internal start options.

### Renderer-safe state

```ts
interface ScreenshotOverlayState {
  sessionId: string
  phase: 'preparing' | 'selecting' | 'confirming' | 'tearing-down'
  mode: 'frozen' | 'live'
  display: {
    id: string
    bounds: Rect
    scaleFactor: number
    rotation: 0 | 90 | 180 | 270
    frozenTfileUrl?: string
  }
  selection?: Rect
  candidate?: { kind: 'display' | 'window' | 'ui-element'; bounds: Rect }
  options: {
    cursor: boolean
    cornerRadius: number
    border: boolean
    shadow: boolean
    aspectRatio?: number
  }
  capabilities: Record<string, { available: boolean; reason?: string }>
}
```

The manager binds each overlay `webContents.id` to one session. `ready`, `get-state`, `pointer`, and `command` handlers reject every unbound sender before service work. Renderer-supplied `sessionId` is correlation only, never authority. The old editor transport surface is compatibility-only and is not reachable from the current workflow.

## 5. State machine

```text
idle
 -> preparing-delay
 -> snapshotting
 -> selecting-frozen <-> selecting-live
 -> selection-inline-edit
 -> copy/save -> selection-inline-edit
 -> confirming -> completing -> completed
               \-> returning-resource -> completed
               \-> direct-png -> completed
 -> cancelling / failed
 -> tearing-down
 -> idle
```

Only one session is active. A duplicate start brings existing overlays forward and returns the existing session identity; it never creates another native generation/window set. Terminal ownership is first-wins across confirm, cancel, window destruction, display changes, timeout, caller abort, and module dispose.

Every terminal path removes listeners/timers, stops frame/pointer work, destroys all session windows, releases uncommitted resources, clears sender bindings, and settles each waiter once.

## 6. Overlay windows

Use one hardened `TouchWindow` per Electron display:

- exact display DIP bounds, including negative origins;
- transparent, frameless, skip taskbar, always on top, all workspaces;
- context isolation and sandbox from the existing host renderer profile;
- no raw preload/IPC expansion;
- `--touch-type=screenshot --screenshot-type=overlay` window role;
- hidden until frozen resources and sender bindings are ready.

Selection is one global-DIP rectangle in main-owned session state. Each overlay projects its intersecting segment. Free drag, eight resize handles, move, arrow-key nudge/resize, manual dimensions, aspect ratio, recent in-memory region, and object candidate selection dispatch normalized commands to the manager. Half-open global rect semantics match capture core.

The first slice supports selections on any individual display and correct negative origins. Cross-display region composition uses the existing Rust region planner; overlay updates are broadcast to all display windows.

## 7. Frozen composition and effects

Add an internal protocol operation `compose_frozen_region`:

- input: current generation, global selection, source descriptors, output/effect options, and positional PNG attachments loaded only in main from controlled screenshot resources;
- validation: source display IDs must belong to the current generation, PNG dimensions must equal descriptors, attachment correlation/limits must pass, and selection must intersect at least one source;
- processing: Rust decodes, uses existing local-first region planning, crops/composites segments, applies bounded rounded clip/border/shadow, encodes PNG, and returns normal attachment parts;
- output: same bounded capture metadata shape; no input/output bytes enter ordinary JSON/logs.

This operation is main-only and is not added to renderer/plugin/native public SDK. Live confirmation continues to use native `capture` against the current generation after a refresh if topology changed.

## 8. Object selection

Pointer hover asks main for `hitTest()` using global DIP. Main returns at most the sanitized candidate kind and bounds. It retains opaque native target identity internally for confirmation. Window title, application name/path, bundle ID, native ID, generation, and AX text are never sent to renderer.

Candidate cycling remains bounded and follows native z-order. AX denied/timeout/unverified preserves the window candidate and exposes only a stable fallback reason.

## 9. Inline editing and output actions

Standalone macOS never creates a secondary editor window. After pointer-up, the selection, resize handles, size controls, effects, copy, save, Done, and cancel remain on the current per-display overlay. Copy writes the main-owned managed resource and keeps the overlay open. Save binds the native dialog/sheet to the originating overlay and also keeps the selection open. Done reuses an unchanged materialized resource, settles the result, and tears down all overlays.

Save paths and clipboard bytes remain main-only. Selection, mode, target, candidate, or effect changes invalidate the cached final resource so the next action recomposes. Closing the native Save sheet with Escape is consumed for the save interaction and cannot cascade into session cancellation.

`return-resource` settles the authorized caller with a descriptor. Windows/Linux use `direct-png` after free-region confirmation. Unsupported completion/capability combinations fail before overlay/native work. The historical `editor` completion-mode spelling remains a compatibility label for standalone callers; it no longer implies a BrowserWindow handoff.

## 10. Entrypoints and permissions

- Global shortcut and tray call `ScreenshotSessionManager.start({ completionMode: 'editor' })`; this compatibility value now routes to same-overlay editing and never creates an editor window.
- Assistant region selection migrates to `startAndWait({ completionMode: 'return-resource' })`; the old selector window/events are deleted after tests move.
- System Action opens the tool rather than directly capturing/copying.
- Plugin visible start requires authoritative plugin context and `window.capture`; a result wait is owner-bound.
- Existing silent plugin `capture()` retains its current contract. `window.capture.background` is reserved for a separately versioned SDK marker and is not inferred from `window.capture`.
- Clipboard mutation additionally enforces `clipboard.write` for plugin-owned completion.

## 11. Shortcut, tray, and i18n

Reuse the existing shortcut module and tray menu builder. New copy lives in both renderer locale catalogs. No raw accelerator or duplicate event name is defined outside its owner. Shortcut registration failure degrades the shortcut entry only; tray/typed callers remain available.

## 12. UI visual contract

The overlay is a full-bleed frozen/live scene, not a page card. It uses restrained neutral masking, the project primary blue selection border, stable 8 px handles, one compact bottom toolbar, a size chip, and a small pixel magnifier. The mode control, toolbar, status, and magnifier remain inside work-area-derived safe insets while the native frame still covers the complete display. Controls use existing TuffEx/lucide-compatible icons, semantic buttons, keyboard focus, tooltips, and stable dimensions. No gradient/orb decoration, oversized headings, or explanatory in-app text.

The magnifier samples only the already displayed frozen resource through a local canvas and never serializes pixels or logs color context. Live mode disables sampling until the next freeze.

## 13. Demo/video evidence

The demo uses an isolated CoreApp profile and a controlled non-sensitive full-screen target (`Screenshot Test Canvas` shown by a separate local browser process). It starts the real tool, drives the overlay through CDP/system input, demonstrates object/free selection, frozen/live, cancel/reopen, selection adjustment, copy, an overlay-parented Save sheet cancelled with Escape, and Done. CDP page-count checks prove no `960x640` editor target appears.

Output is converted to H.264 MP4 and validated with `ffprobe` for duration, dimensions, codec, and non-zero frames. Raw desktop recordings, profiles, screenshots, terminal history, signed URLs, personal paths, and complete logs stay under `/tmp` and are not added to source control.

## 14. Compatibility, rollout, rollback

The public single-frame `NativeEvents.screenshot` descriptor-only hard cut remains unchanged. New session events are additive. Assistant/System callers migrate only after manager tests pass. Rollback may unregister the new entrypoints and leave capability unavailable; it must not restore `ScreenshotRegionSelector`, raw addon access, data URL output, or a parallel Assistant state machine.

## 15. Evidence boundaries

Local unit/interaction/video evidence proves the current macOS development build and controlled hardware only. It does not prove mixed-DPI hardware, Windows/Linux runtime, signed packaging, notarization, or released artifacts. Those remain owned by the packaged-evidence child task.
