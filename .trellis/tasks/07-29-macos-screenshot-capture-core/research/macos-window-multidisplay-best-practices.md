# macOS capture-core research: window identity and multi-display geometry

Date: 2026-07-29

## Scope

This research narrows the macOS backend for `07-29-macos-screenshot-capture-core`. It covers ScreenCaptureKit availability, window identity/order, display coordinate spaces, Accessibility hit testing, self-exclusion, and Rust binding choice. It does not design overlay/editor UI.

## Evidence

### ScreenCaptureKit is the capture-eligibility authority

- Apple `SCShareableContent` represents the displays, apps, and windows the process can capture and is available from macOS 12.3: <https://developer.apple.com/documentation/screencapturekit/scshareablecontent>.
- `SCWindow.windowID` is the Core Graphics window identifier; `SCWindow` also exposes owner, frame, layer, and WindowServer on-screen state: <https://developer.apple.com/documentation/screencapturekit/scwindow>.
- A single window should use `SCContentFilter(desktopIndependentWindow:)`, which captures the specified window without clipping it to one display: <https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(desktopindependentwindow:)>.
- A display filter can exclude applications and then except specific windows. Apple’s sample uses this to exclude the current app: <https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(display:excludingapplications:exceptingwindows:)>.
- `sourceRect` is in the display’s logical point space and is not used for a single-window filter: <https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/sourcerect>.

Conclusion: enumerate/capture only objects present in the current `SCShareableContent`; never promote a Core Graphics-only window to capturable. Use the exact numeric `CGWindowID` to join supplemental metadata.

### Z-order needs Core Graphics, joined by exact window ID

- The SDK header `CoreGraphics.framework/Headers/CGWindow.h` states that `.optionOnScreenOnly` returns windows ordered front-to-back.
- `CGWindowListCopyWindowInfo` supplies window ID, PID, bounds, layer, alpha, sharing state, and on-screen state: <https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo(_:_:)>.
- `SCShareableContent.windows` does not document array order as a z-order contract.

Conclusion: build hit-test candidates by iterating the Core Graphics front-to-back list and joining `kCGWindowNumber` to `SCWindow.windowID`. A missing ScreenCaptureKit match is ineligible. Titles, owner names, and approximate bounds are never identity keys.

### Display points and capture pixels are different measurements

Apple headers establish:

- `CGDisplayBounds` is the display origin/size in global coordinates.
- `SCDisplay.frame`, `SCDisplay.width`, and `SCDisplay.height` are in points.
- `CGDisplayModeGetWidth/Height` are points; `CGDisplayModeGetPixelWidth/PixelHeight` are pixels.
- `SCContentFilter.pointPixelScale`, available on macOS 14+, translates screen points to pixels.
- ScreenCaptureKit frame attachment `scaleFactor` is the display pixel-to-point scale and is expected in `[1, 4]`.

Local probe on the current Retina display:

```text
CGDisplayBounds           2056 x 1329 points
SCDisplay                 2056 x 1329 points
CGDisplayPixelsWide/High  2056 x 1329 (not backing pixels here)
CGDisplayMode             2056 x 1329 points
CGDisplayMode pixels      4112 x 2658 pixels
NSScreen backingScale     2.0
```

Conclusion: do not use `CGDisplayPixelsWide/High` as physical capture size. Derive the oriented pixel size from the current display mode, account for 90/270-degree rotation, and calculate `scaleX/scaleY` from oriented pixels divided by the display’s global point frame.

### Coordinate spaces use a top-left global point basis

- The SDK header for `kAXPositionAttribute` states: global top-left position, origin at the screen containing the menu bar, x right, y down, units in points.
- Core Graphics window dictionaries and `SCWindow.frame` observed locally use the same top-left global point basis.
- Electron `Display.bounds` is in DIP points and exposes `scaleFactor`/`rotation`: <https://www.electronjs.org/docs/latest/api/structures/display>.

The safe point-to-pixel transform for a display is local-first:

```text
localPoint.x = globalPoint.x - display.globalFrame.x
localPoint.y = globalPoint.y - display.globalFrame.y
localPixel.x = localPoint.x * display.scaleX
localPixel.y = localPoint.y * display.scaleY
```

Scaling `globalFrame.x/y` is incorrect for negative-origin or mixed-scale layouts. Half-open rectangles, floor for source min edges, and ceil for source max edges preserve all selected pixels.

### Cross-display regions need a capture plan

- `SCScreenshotManager` provides single-frame capture starting on macOS 14: <https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager>.
- `captureImageInRect` is display-agnostic and supports multiple displays, but the SDK marks it macOS 15.2+.
- On macOS 12.3–13, static capture must use a short-lived `SCStream`; on 14–15.1, `SCScreenshotManager` still requires one display filter/source rect per segment for portable behavior.

Conclusion:

1. Intersect a global region with each display frame.
2. Convert every intersection through that display’s local point/pixel transform.
3. Capture segments with per-display filters and self-exclusion.
4. Composite onto a transparent output canvas at a documented output scale (default: maximum participating scale).
5. On 15.2+, permit direct display-agnostic region capture only after parity tests prove identical coordinates/self-exclusion; keep the segmented planner as the reference implementation.

A cross-display window is not segmented: capture its `SCWindow` through a desktop-independent window filter.

### Accessibility is a best-effort point hit test, not window identity

- `AXIsProcessTrusted()` probes Accessibility without prompting. Prompting variants are not used by native probes.
- `AXUIElementCopyElementAtPosition` finds an Accessibility element at global point coordinates.
- Public AX attributes provide role/subrole, children, global top-left position, point size, enabled/focused state, and top-level UI element.
- Public Accessibility headers do not expose a stable Core Graphics window number. Correlating AX windows to `SCWindow` by undocumented attributes is not acceptable.

Conclusion: first resolve the authoritative frontmost capturable `SCWindow` using Core Graphics z-order + exact ScreenCaptureKit ID. Then query the owning PID’s AX application at the point, walk to its top-level AX window, and verify containment/overlap with the selected window. If verification fails, the AX call times out, permission is absent, or the app exposes no useful hierarchy, return the window candidate unchanged. AX element IDs are generation-scoped retained handles; role/subrole/bounds are allowed, text/value/title are not.

### Permissions must separate probe from request

- `CGPreflightScreenCaptureAccess()` checks Screen Recording access; `CGRequestScreenCaptureAccess()` is the prompting API: <https://developer.apple.com/documentation/coregraphics/cgpreflightscreencaptureaccess()>.
- `AXIsProcessTrusted()` checks Accessibility trust; `AXIsProcessTrustedWithOptions` can prompt.

Conclusion: `probe` uses only non-prompting calls. User-initiated capture may cause ScreenCaptureKit/system behavior, but the Rust API never invokes explicit request/prompt functions. CoreApp’s permission service remains the owner of user-facing permission UX.

### Stream buffering must align with protocol credit

Apple’s capture sample and `SCStreamConfiguration.queueDepth` documentation say larger queues use more memory and queue depth must not exceed 8: <https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/queuedepth>.

Conclusion: native ScreenCaptureKit queue depth is `min(protocol initialCredit + 1, 8)` with a minimum of 3. Only `SCFrameStatus.complete` produces a protocol data frame. A bounded adapter queue sits between the WindowServer callback and protocol publisher; overflow is a protocol backpressure fault, never an unbounded byte buffer.

### Rust binding spike

Two candidates were tested on this workspace’s macOS environment:

1. `screencapturekit = 8.0.1` compiled through `cargo check`, but final linking failed with Command Line Tools because its Swift bridge required unavailable Swift compatibility libraries. Bridge objects were also built with a macOS 13 minimum while Cargo linked at macOS 11.
2. `objc2 = 0.6.4` plus `objc2-screen-capture-kit = 0.3.2` compiled, linked, and loaded `SCShareableContent` successfully using the same CLT environment. xcap 0.9.4 already resolves the same objc2 family in the current dependency graph.

Conclusion: use exact-pinned objc2 framework crates behind `cfg(target_os = "macos")`. Contain Objective-C unsafe calls, blocks, retained references, and OS availability checks in `backend/macos/system.rs`. Do not add a Swift bridge or a custom Objective-C/Swift side target.

## Window candidate rules

Default candidate filter, applied after exact SC/CG join:

- current topology generation;
- `SCWindow.isOnScreen == true`;
- Core Graphics on-screen flag true when present;
- sharing state is not `None`;
- finite positive bounds and alpha greater than a small constant;
- minimum interactive area (default 8×8 points);
- not desktop/menu bar/Dock/tooltip/popup class by default policy;
- not a self PID/bundle/window unless explicitly selected under the self-capture exception rule.

Sorting is the Core Graphics front-to-back index. Layer is metadata/filter input, not a replacement for z-order. The hit test returns all candidates containing the point in ordered form so the later workflow can support candidate cycling.

## Security and logging

Allowed structured logs:

- operation/capability name;
- target kind;
- display/window counts;
- dimensions and byte counts after limit checks;
- elapsed time;
- stable error code;
- permission/support state.

Forbidden logs/ordinary JSON:

- image bytes or pixel samples;
- window titles;
- AX labels, values, descriptions, or text;
- bundle/application paths;
- raw NSError/native exception messages.

## Remaining real-device evidence

Automated geometry fixtures can prove transforms, but the following require hardware/manual smoke before completion:

- at least one 1x + 2x mixed display topology with a negative origin;
- a 90/270-degree rotated display;
- a window straddling different-scale displays;
- self-exclusion with overlay/editor/menu/pin window classes;
- standard AppKit, Electron, and browser AX hit testing;
- Screen Recording denied and Accessibility denied states;
- macOS 12.3–13 stream-based static fallback if those OS versions remain supported.
