# PixPin and ScrollSnap Feature Audit

Date: 2026-07-28

## Purpose

Define the evidence-backed product surface for the macOS screenshot tool and identify which parts can reuse the current Rust/xcap implementation versus requiring a macOS ScreenCaptureKit path.

## Sources

- PixPin official documentation sitemap and generated VitePress pages: <https://pixpin.cn/docs/>
- PixPin static capture: <https://pixpin.cn/docs/capture/static-capture>
- PixPin long capture: <https://pixpin.cn/docs/capture/long-capture>
- PixPin pin and annotation sections: <https://pixpin.cn/docs/pin/base-use>, <https://pixpin.cn/docs/mark/base-use>
- PixPin membership boundary: <https://pixpin.cn/docs/start/pro-features>
- ScrollSnap repository: <https://github.com/Brkgng/ScrollSnap>, inspected at commit `05bc06e721dd73a82176cfb43bd39f538f43b75d` (2026-07-19).
- Bundled screenshot backend: `xcap 0.9.4`, downloaded from the exact crate version locked by `packages/tuff-native/native-screenshot/Cargo.toml`.

Only public behavior and architecture are used as references. PixPin implementation is proprietary and is not copied. ScrollSnap is MIT-licensed, but this task should still reimplement only the mechanisms needed by Tuff's architecture.

## PixPin Public Feature Inventory

### 1. Static screenshot baseline

PixPin's official page calls static screenshot a basic feature and documents:

- Trigger from configurable global shortcut or tray menu.
- Custom region and delayed capture, including reusable region/delay presets.
- Screen/window/UI-element detection; macOS includes accessibility-backed child elements and parent/child traversal.
- OCR to clipboard and automatic QR-code detection with copy/open actions.
- Pixel magnifier and color picker with RGB/HEX/HSV/HSL formats.
- Mouse selection, pixel-level keyboard movement/resizing, manual dimensions, fixed aspect ratio, and resize handles.
- Rounded clipping, shadow/border effects, and optional cursor inclusion.
- Post-capture pin, save, and clipboard actions.
- PNG/JPG/BMP/WebP/AVIF/PDF exports with quality settings.
- Screenshot history and capture-region history.

### 2. Long/scrolling screenshot

The non-membership long-capture surface includes:

- Vertical and horizontal stitching.
- Manual scrolling while the capture overlay remains active.
- Start/stop/cancel, constrained selection movement, direction switching, manual head/tail crop, live thumbnail, and match-success indication.
- Pin, save, quick-save, and clipboard output.
- Explicit failure guidance for dynamic content, fixed overlays, large static bands, repeated content, multiple scroll areas, excessive speed, and output dimension/memory limits.

PixPin documents reverse-scroll automatic crop as a membership feature. That behavior is excluded unless separately approved.

### 3. Annotation

The public docs expose a complete annotation editor:

- Rectangle/ellipse, straight/polyline, arrow, serial number, pencil, highlighter, mosaic/blur, text, eraser, spotlight, watermark, and magnifier.
- Undo/redo, palette/custom colors, opacity, thickness/size, selection, deletion, and secondary editing.
- Shape-specific behavior including square/circle constraints, rotation, rounded corners, arc/sector, endpoints/joins, and constrained angles.
- Customizable primary/secondary toolbar and keyboard shortcuts.

Membership-only carve-outs include smart erase, arrow comment text, and some automatic text-range selection. Basic mosaic/blur remains in the public surface.

### 4. Pin-to-screen

PixPin treats pinning as a core feature rather than a preview-only action:

- Create pins from screenshot, clipboard image/text, files, colors, and LaTeX.
- Move, keyboard nudge, zoom, opacity, lock, annotate, shadow, always-on-top, close/history, drag to another app, destroy, and mouse passthrough.
- Color picking, thumbnail/crop view, window title, pin groups, batch save/hide/close/destroy, and history restore.
- Image operations include OCR, QR, crop, rotate/flip and other processing; table/formula recognition and translation include membership-gated paths.

The current Tuff image-translation pin window is not a general implementation of this surface.

### 5. Screen recording

PixPin's quick-start and capture navigation list screen recording alongside screenshot, annotation, OCR, and long capture. The public recording page documents GIF/WebP/MP4, normal/quick recording, recording UI, playback, and shortcuts.

Membership-only recording features include keyboard/mouse action visualization, camera picture-in-picture, and post-record trimming.

Whether base recording belongs to this task remains a product-scope decision because the original request is a screenshot tool.

### 6. Membership/Pro exclusions

The official membership page identifies these as non-basic for this task unless separately approved:

- Image/text translation.
- Table recognition and LaTeX formula recognition.
- Recording keyboard/mouse visualization, camera picture-in-picture, and post-record trimming.
- Reverse-scroll long-shot auto-crop.
- Smart erase.
- Save encoding preview/PDF pagination.
- Multi-language OCR selection, industrial barcode recognition, and cloud settings sync.
- Arrow comment text and pin-image text-range auto-selection.

Tuff may already have independent translation/OCR capabilities; that does not automatically pull the PixPin membership workflow into the screenshot MVP.

## Existing Tuff Coverage

### Present

- Rust/xcap support probe, display listing, display/cursor-display/region capture, PNG Buffer.
- Main-process DIP/physical mapping, clipboard write, save dialog, temporary file and `tfile` output.
- Renderer region selector with cancel and size display.
- Assistant display/region selection, copy, save, screenshot translation and preview.
- A specialized image-translation pin window with always-on-top, zoom, opacity and clipboard actions.
- Native OCR on macOS/Windows through a separate addon.

### Missing or not general-purpose

- Dedicated screenshot-tool workflow and configurable global shortcut/tray action.
- Window/UI-child detection and selection UI.
- Cursor composition.
- Delay/presets, precision keyboard editing, manual dimensions/aspect ratio.
- Magnifier/color picker and QR detection.
- Rounded/shadow/border processing and multi-format export.
- Screenshot/region history.
- Long/scroll capture and stitching.
- General annotation document/editor.
- General image pin manager/history/groups.
- Base screen recording.

## ScrollSnap Findings

### Useful mechanisms

- Uses ScreenCaptureKit and excludes the current application from capture (`ScreenshotUtilities.swift:17-48`).
- Converts AppKit screen coordinates to ScreenCaptureKit local top-left coordinates and applies `pointPixelScale` (`ScreenshotUtilities.swift:24-40`, `143-150`).
- Keeps overlays on all screens and temporarily passes mouse input through during scrolling capture (`OverlayManager.swift:236-251`).
- Captures one frame every 250 ms with a single in-flight guard (`OverlayManager.swift:254-260`).
- Serializes stitching away from the main thread (`StitchingManager.swift:11-16`, `25-26`).
- Compares five horizontal bands and requires 75% offset agreement within three points (`StitchingManager.swift:124-165`).
- Supports downward append and upward crop (`StitchingManager.swift:45-70`).
- Separates selection overlay, floating menu, stitching state, thumbnail preview, and save destinations.

### Limitations not to copy

- Each accepted frame reallocates and redraws the complete accumulated image (`StitchingManager.swift:188-213`), causing growth toward quadratic copy cost.
- No explicit pixel, byte, duration, frame-count, or output-dimension budget is enforced.
- Fixed 250 ms sampling is not adaptive to scroll speed or matching confidence.
- Unmatched frames are silently dropped; there is no user-visible confidence/degraded state.
- Comparison assumes equal frame dimensions and translational motion; dynamic/sticky content remains fragile.
- Stitching uses macOS Vision registration and AppKit images directly, so it is a reference for behavior, not a reusable cross-platform Rust core.

## xcap 0.9.4 Findings

- Public API supports `Monitor::all`, display/region capture, `Window::all`, window metadata, window capture, and experimental recorder APIs.
- macOS window enumeration is based on `CGWindowListCopyWindowInfo` and only returns on-screen, shareable windows.
- macOS capture uses `CGWindowListCreateImage`, not ScreenCaptureKit.
- The current monitor/window APIs do not expose self-application exclusion or cursor configuration.
- Minimized macOS windows cannot reliably be represented because enumeration is on-screen-only.
- Linux Wayland support is explicitly marked incomplete by xcap.

Conclusion: keep xcap as the simple Windows/Linux region backend and possibly as a compatibility fallback. The macOS full tool should use a ScreenCaptureKit-backed Rust capability/bridge so self-exclusion, windows, cursor policy, streaming frames and permission semantics are controlled explicitly.

## Recommended Product Decomposition

The newly requested product surface is larger than one screenshot implementation child. After scope confirmation, split it into independently verifiable slices:

1. Rust native protocol and stream runtime.
2. macOS ScreenCaptureKit capture core plus Windows/Linux simple region fallback.
3. Screenshot overlay and static-capture workflow.
4. Long-capture session and bounded stitching engine.
5. Annotation document/editor and image effects/export.
6. Pin/history workflow if included in the agreed screenshot-suite scope.
7. OCR/QR/color and UI-element detection integration.
8. Screen recording only if explicitly included.
9. Build, signing, packaged evidence and cross-platform degraded contracts remain acceptance gates across the owning slices.

## Product Boundary Decision

Confirmed by the user:

- Include the screenshot suite: static capture, display/window/UI-element selection, cursor, delay/presets, precision selection, color picker, OCR, QR, long capture, basic annotation, image pin, screenshot/region history, multi-format save and clipboard.
- Exclude screen recording.
- Exclude general text/file/color/LaTeX pin types.
- Exclude PixPin membership/Pro functionality.
- Deliver the full screenshot suite on macOS. Windows/Linux only require simple region capture in the first release, while sharing the same protocol and capability architecture.
- Build the screenshot flow as a standalone system tool owned by a main-process `ScreenshotSessionManager`. Global shortcut, tray/menu, Assistant, System Actions and plugin SDK all invoke this single-active-session manager; Assistant does not retain a parallel selector state machine.
- Screenshot history is non-destructive: one original resource plus the serializable annotation operation document/cursor. Reopening supports undo/redo; flat outputs are rendered on demand rather than stored as duplicate final rasters. Selection confirmation creates a session draft, first copy/save/pin/explicit complete commits it, and cancel before any completion deletes it.
- macOS standalone selection always enters the editor; there is no default copy-and-close path. The workflow slice owns the editor preview/action shell and session handoff, while the annotation slice owns full tools. Typed Assistant/plugin callers may explicitly request `return-resource`; Windows/Linux baseline region capture returns PNG without requiring the macOS editor.
- New plugin SDK markers may request silent single-frame capture only with a separate high-risk `window.capture.background` permission and verified caller identity. Visible overlay uses `window.capture`; silent streams, history, OCR/QR and pin management remain host-only. The legacy facade keeps only its current display/cursor-display/region shape during migration and gains no new capabilities.
- Active image pins restore across normal app restarts. Quit marks them suspended; startup restores only validated active resources after screen readiness. Manually closed pins remain recoverable but do not reopen automatically; destroyed/cleaned resources never restore.
- Screenshot image history defaults on with three simultaneous limits: 100 images, 30 days and 1 GiB; any exceeded limit evicts oldest resources first. Region history stores 20 metadata-only geometry/display entries. Disable stops new writes, while explicit clear owns index/resource deletion and retryable partial-cleanup evidence.
- Static selection defaults to snapshot-first frozen display frames and also offers an explicit live mode. Entering live reveals the current desktop with Tuff excluded; pausing again captures a new frozen frame; confirmation uses the current mode's frame and releases transient resources.
- Use Electron/Vue transparent overlays, editor and pin windows for product UI. Rust/ScreenCaptureKit owns capture, stream, stitching and low-level pixel processing behind NativeTransport/local-resource boundaries.
