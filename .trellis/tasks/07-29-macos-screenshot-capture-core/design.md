# macOS Screenshot Capture Core - Design

## 1. Scope and invariants

This task adds the first production capability on protocol v1. It owns native capture descriptors, target detection, static capture, frame streaming, and bounded pixel composition. It does not own overlay/editor windows, permissions UX, clipboard, temporary files, `tfile`, plugin identity, or public SDK authorization.

Non-negotiable invariants:

1. ScreenCaptureKit decides whether a macOS display/window can be captured.
2. Window identity is an exact system ID join. Titles, owner names, and approximate bounds are never identity keys.
3. Every coordinate value declares its space. A global origin is never multiplied by a display scale.
4. Each opaque display/window/element ID belongs to one content generation. Stale IDs fail closed.
5. Display/region capture excludes Tuff by default. An explicit own-window capture does not include other Tuff tool windows.
6. Static images and frame bytes cross Rust-to-main only as protocol attachments.
7. No image, title, AX text/value, path, raw NSError, or raw native exception enters logs or control errors.
8. Callback and frame queues are bounded; cancellation/dispose produce one terminal and suppress late publication.
9. Screenshot is protocol-only. Missing, disabled, unavailable, unhealthy, or conflicting carriers fail closed; no code path loads a raw screenshot addon or silently falls back to a legacy facade.
10. Windows/Linux advertise and implement only their basic xcap feature set through the protocol capability.

## 2. Architecture

```text
renderer/plugin typed screenshot API
            |
            | descriptor/resource only
            v
NativeCapabilitiesModule / NativeScreenshotService
  - caller permission and identity
  - Electron cursor/window IDs
  - attachment -> Buffer -> clipboard/temp/tfile
  - protocol-only capability; unavailable state is explicit
            |
            v
NativeTransport -> NapiCarrier(screenshot)
            |
            v
native-screenshot protocol registry
  - payload validation and stable errors
  - capability budgets
  - cancellation/deadline bridge
            |
            +------------------------------+
            |                              |
            v                              v
MacScreenActor                       MacAxActor
  - SCK retained snapshot              - non-prompt trust probe
  - CG display/window metadata         - point hit test
  - SCScreenshotManager/SCStream       - bounded messaging timeout
  - self-exclusion filters             - retained generation handles
  - pixel extraction/composition       - role/subrole/bounds only

Windows/Linux XcapBackend
  - display snapshot
  - basic single-display region capture
```

`native-core` and `native-napi` remain unchanged protocol infrastructure. Screenshot business models and backends live in `native-screenshot`.

## 3. Package layout

```text
packages/tuff-native/native-screenshot/src/
  lib.rs                       # six protocol-v1 exports only
  capability.rs                # descriptor/registry/handlers
  model.rs                     # serde request/response contracts
  error.rs                     # screenshot error taxonomy and sanitization
  limits.rs                    # one capability budget source
  geometry.rs                  # pure coordinate types/transforms
  region_plan.rs               # pure multi-display split/output plan
  window_candidates.rs         # pure exact-join/filter/hit-test rules
  backend/mod.rs               # backend trait and support matrix
  backend/xcap.rs              # Windows/Linux X11 basic backend
  backend/macos/mod.rs         # macOS runtime facade
  backend/macos/actor.rs       # serialized ScreenCaptureKit actor
  backend/macos/ax_actor.rs    # bounded Accessibility actor
  backend/macos/system.rs      # objc2/FFI boundary
  backend/macos/system/ax.rs   # allowlisted AX reads/coherence
  backend/macos/system/stream.rs # SCStream callback bridge
```

Main-process additions:

```text
packages/tuff-native/screenshot-protocol.{js,d.ts}
apps/core-app/src/main/modules/native-capabilities/
  native-transport.ts          # aggregate protocol carrier lifecycle
  screenshot-protocol.ts       # TS contracts + runtime validators
  screenshot-service.ts        # protocol adapter and main-owned resource policy
```

`./screenshot-protocol` has only Node/require export conditions, like `./protocol`. It is not re-exported from package root, preload, renderer transport, or plugin SDK.

## 4. Binding and build decision

macOS target-specific dependencies are exact-pinned:

- `objc2 = =0.6.4`
- `objc2-screen-capture-kit = =0.3.2`
- `objc2-core-graphics = =0.3.2`
- `objc2-core-foundation = =0.3.2`
- `objc2-core-media = =0.3.2`
- `objc2-core-video = =0.3.2`
- `objc2-application-services = =0.3.2`
- `objc2-foundation = =0.3.2`
- `block2 = =0.6.2`
- `dispatch2 = =0.3.1`

Only required crate features are enabled. Windows/Linux do not compile or link Apple frameworks.

The rejected `screencapturekit 8.0.1` spike is recorded in research: its Swift bridge did not link in the project’s Command Line Tools environment and introduced a macOS 13 bridge deployment floor. Direct objc2 bindings link in the same environment and align with xcap’s existing dependency family.

All APIs newer than the declared macOS baseline use `objc2::available!` before selector invocation:

- base shareable content/filter/stream: macOS 12.3;
- `SCScreenshotManager` and filter point-pixel scale: macOS 14.0;
- direct display-agnostic `captureImageInRect`: macOS 15.2.

The addon handshake is `unavailable` below macOS 12.3. Packaging must declare and test a compatible minimum macOS version rather than relying on an accidental linker default.

## 5. Capability contract

Capability descriptor:

```ts
{
  id: 'screenshot.capture',
  version: '1.1.0',
  engine: 'screen-capture-kit' | 'xcap',
  state: 'available' | 'degraded' | 'unavailable',
  reason?: 'unsupported-os' | 'basic-backend-only' | 'disabled-by-env',
  features: [
    'display', 'region',
    'window', 'window-hit-test', 'ui-element-hit-test',
    'cross-display-region', 'cursor-system', 'self-exclusion', 'frames'
  ],
  operations: [
    { name: 'probe', mode: 'unary', cancellation: 'none' },
    { name: 'refresh', mode: 'unary', cancellation: 'cooperative' },
    { name: 'hit_test', mode: 'unary', cancellation: 'cooperative' },
    { name: 'capture', mode: 'unary', cancellation: 'cooperative', emitsAttachments: true },
    { name: 'frames', mode: 'stream', cancellation: 'cooperative', emitsAttachments: true }
  ]
}
```

Unsupported features are omitted. macOS may be `available` while Accessibility is denied because AX is an optional enhancement; `probe.accessibility` describes that degradation. Windows and Linux X11 are `degraded` with reason `basic-backend-only` while `display` and single-display `region` remain routable. Linux Wayland is `unavailable/wayland-unsupported`: xcap 0.9.4 applies a global maximum scale and cannot satisfy mixed-display `global-dip-v1`, so the backend does not guess coordinates. Linux without an X11 display reports `unavailable/display-server-unavailable`.

### 5.1 Probe

Input is `{}`. Output is bounded, non-prompting, and contains no titles:

```ts
interface ScreenshotProbeResult {
  platform: string
  engine: 'screen-capture-kit' | 'xcap'
  osVersion?: { major: number; minor: number; patch: number }
  screenRecording: 'granted' | 'denied' | 'unknown' | 'not-required'
  accessibility: 'granted' | 'denied' | 'unknown' | 'unsupported'
  features: string[]
  limits: ScreenshotLimitsPublic
}
```

`probe` calls `CGPreflightScreenCaptureAccess` and `AXIsProcessTrusted` only. It never calls the prompting APIs.

### 5.2 Refresh content

Input:

```ts
interface RefreshInput {
  includeWindowTitles?: boolean // false by default; main-only policy
  self: {
    processIds: number[]
    bundleIds: string[]
    nativeWindowIds: string[]
  }
}
```

Output:

```ts
interface ContentSnapshot {
  generation: string
  coordinateSpace: 'global-dip-v1'
  capturedAtUnixMs: number
  displays: DisplayDescriptor[]
  windows: WindowDescriptor[]
  accessibility: 'granted' | 'denied' | 'unknown' | 'unsupported'
}
```

Only the latest generation is retained. Refresh atomically swaps the snapshot after the new snapshot passes all limits/validation; failure leaves the previous generation valid. A successful refresh invalidates all previous opaque IDs.

### 5.3 Hit test

Input:

```ts
interface HitTestInput {
  generation: string
  point: GlobalDipPoint
  granularity: 'window' | 'ui-element'
  includePanels?: boolean
  maxCandidates?: number // clamped to 16
}
```

Output:

```ts
interface HitTestResult {
  generation: string
  point: GlobalDipPoint
  candidates: Array<{
    window: WindowDescriptor
    element?: UiElementDescriptor
  }>
  accessibilityFallback?: 'permission-denied' | 'timeout' | 'unsupported' | 'unverified-window'
}
```

Window candidates remain useful if AX fails. The first item is the default target; remaining items support later candidate cycling.

### 5.4 Capture

Input target is a tagged union:

```ts
type CaptureTarget =
  | { kind: 'display'; generation: string; displayId: string }
  | { kind: 'window'; generation: string; windowId: string }
  | { kind: 'region'; generation: string; rect: GlobalDipRect }
  | { kind: 'ui-element'; generation: string; elementId: string }

interface CaptureInput {
  target: CaptureTarget
  cursor: 'hidden' | 'system'
  includeSelfWindowId?: string
  output: { format: 'png'; scale: 'native-max' | number }
}
```

`scale: number` is clamped to `[0.25, 4]`. MVP callers use `native-max`. Response control contains dimensions/geometry/parts only; PNG bytes are one or more ordered attachments:

```ts
interface CaptureOutput {
  generation: string
  targetKind: CaptureTarget['kind']
  mimeType: 'image/png'
  width: number
  height: number
  outputScale: { x: number; y: number }
  globalRect: GlobalDipRect
  byteLength: number
  imageParts: Array<{ attachmentId: string; offset: number; byteLength: number }>
}
```

Parts are contiguous and individually at most the protocol attachment limit. Total output is at most the protocol packet-attachment limit. Main revalidates part order/length and concatenates before clipboard/temp-file handling.

### 5.5 Frames

The stream input is the same target/cursor policy plus:

```ts
interface FramesInput {
  target: CaptureTarget
  cursor: 'hidden' | 'system'
  framesPerSecond: number // 1..30
  pixelFormat: 'bgra8-premultiplied'
  maxFrameBytes: number
}
```

Each data frame contains:

```ts
interface FrameOutput {
  width: number
  height: number
  stride: number
  pixelFormat: 'bgra8-premultiplied'
  globalRect: GlobalDipRect
  timestampUnixMs: number
  droppedSourceFrames: number
  frameParts: Array<{ attachmentId: string; offset: number; byteLength: number }>
}
```

Raw frame bytes are never ordinary JSON. The final stream-end payload includes emitted/dropped counts only.

## 6. Descriptor model

```ts
interface GlobalDipPoint { x: number; y: number }
interface GlobalDipRect { x: number; y: number; width: number; height: number }
interface PixelSize { width: number; height: number }
interface AxisScale { x: number; y: number }

interface DisplayDescriptor {
  id: string                 // opaque generation-scoped ID
  nativeId: string           // CGDirectDisplayID string, main-only
  name: string
  globalFrame: GlobalDipRect
  pixelSize: PixelSize       // oriented backing pixels
  scale: AxisScale
  rotation: 0 | 90 | 180 | 270
  isPrimary: boolean
}

interface WindowDescriptor {
  id: string                 // opaque generation-scoped ID
  nativeId: string           // CGWindowID string, main-only
  owner: { processId: number; bundleId?: string; applicationName?: string }
  title?: string             // only when refresh explicitly authorizes it
  globalFrame: GlobalDipRect
  layer: number
  zIndex: number             // 0 = frontmost CG list item
  kind: 'normal' | 'panel' | 'transient' | 'system' | 'unknown'
  onScreen: boolean
  active: boolean | null
  capturable: boolean
  minimized: boolean | null
  coveredDisplayIds: string[]
  self: boolean
}

interface UiElementDescriptor {
  id: string
  windowId: string
  role: string
  subrole?: string
  globalFrame: GlobalDipRect
  enabled?: boolean
  focused?: boolean
}
```

Strings and arrays are bounded. Application path, AX title/description/value/text, and generic AX attributes are not represented.

## 7. Generation and retained identity

A successful macOS refresh creates `MacContentGeneration` on `MacScreenActor`:

```text
generation nonce
SCShareableContent retained object
opaque display ID -> retained SCDisplay + plain descriptor
opaque window ID  -> retained SCWindow  + plain descriptor
CG front-to-back metadata joined by exact CGWindowID
self process/bundle/window policy snapshot
topology fingerprint
```

Opaque IDs combine a process nonce, generation counter, target kind, and local counter. Native IDs are output metadata only; capture lookup uses the opaque map and retained object, never reconstructs a target from caller-supplied native ID.

Display topology fingerprint includes sorted native display ID, frame, current display-mode point/pixel size, and rotation. Before a display/region capture, the actor compares the live fingerprint. A mismatch returns `SCREENSHOT_TOPOLOGY_CHANGED`; it does not reinterpret the old geometry.

A closed/moved window may invalidate between refresh and capture. The actor captures through the retained `SCWindow`; if ScreenCaptureKit rejects or produces no complete frame, it returns `SCREENSHOT_WINDOW_NOT_FOUND`/`SCREENSHOT_FRAME_UNAVAILABLE`. It never resolves a replacement window by title/bounds.

## 8. Display geometry and region planning

All public macOS geometry is top-left global points, identical in orientation to Electron DIP and AX position:

- origin: top-left of primary/menu-bar display;
- x grows right;
- y grows down;
- displays left/above primary have negative coordinates;
- rectangles are finite, positive, half-open `[left,right) × [top,bottom)`.

For each display:

1. Read `SCDisplay.frame` and verify it matches `CGDisplayBounds(nativeId)` within an exact small numeric tolerance.
2. Read current `CGDisplayMode` point and backing-pixel size.
3. Normalize 90/270-degree oriented pixel width/height.
4. Calculate `scaleX = orientedPixelWidth / frame.width`, `scaleY = orientedPixelHeight / frame.height`.
5. Reject non-finite/out-of-range scale (`0 < scale <= 4`) and inconsistent dimensions.

Global-to-local conversion:

```text
localPoint = globalPoint - display.globalFrame.origin
localPixelMin = floor(localPointMin * display.scale)
localPixelMax = ceil(localPointMax * display.scale)
```

### 8.1 Single-display region

The planner identifies exactly one containing display, converts to a display-local point source rect, configures output dimensions in pixels, and captures with that display filter.

### 8.2 Cross-display region

The reference planner:

1. Intersects the requested global rect with every display frame.
2. Sorts segments by display ID for deterministic execution.
3. Chooses output scale per axis as the maximum participating scale for `native-max`.
4. Converts shared destination edges with one global relative edge function so adjacent segments meet at the same output pixel.
5. Captures each display-local source rect independently.
6. Resamples each BGRA segment to its exact destination rect.
7. Composites onto a transparent canvas; desktop topology holes remain transparent.
8. Encodes PNG and chunks attachments.

No display’s scale is applied to another display’s origin or segment. The planner rejects an empty intersection, dimensions over limits, or working-set estimate over budget before capture.

On macOS 15.2+, direct `captureImageInRect` is an optional optimized path only after golden geometry/self-exclusion parity tests. It does not replace the reference planner in the first implementation.

### 8.3 Cross-display window

A window intersecting multiple displays records all `coveredDisplayIds` and selects the maximum intersected scale for requested output dimensions. Capture uses one desktop-independent window filter. It is never split into display segments.

## 9. Window detection

Refresh builds a map of ScreenCaptureKit `windowID -> retained SCWindow`. It then walks `CGWindowListCopyWindowInfo(.optionOnScreenOnly | .excludeDesktopElements)` in documented front-to-back order.

For each Core Graphics entry:

1. Parse allowlisted numeric fields only: window ID, PID, bounds, layer, alpha, sharing state, on-screen.
2. Join exact window ID to the ScreenCaptureKit map.
3. Verify PID/layer/bounds are coherent; disagreement marks the item non-capturable rather than guessing.
4. Join the `SCWindow.owningApplication` by retained object/PID to bundle/app metadata.
5. Classify and filter.

Default selectable candidate rules:

- exact SCK/CG join;
- SCK and CG on-screen;
- sharing state not `none`;
- finite positive bounds, alpha > 0.01, at least 8×8 points;
- normal application window (`layer == 0`), unless `includePanels` requests bounded panel candidates;
- not system desktop/Dock/menu/UI bundle classes;
- not self according to PID, bundle, or explicit native window ID.

Core Graphics z-index is authoritative. Layer is classification/filter metadata, not a sort substitute. A point hit returns every eligible containing rect in z-order, bounded to 16. This intentionally cannot detect transparent holes inside a shaped window; candidate cycling is the recovery path.

`isOnScreen == false` is not equated with `minimized == true`; minimized remains `null` unless a public system signal proves it. Off-screen/minimized windows are excluded from the default snapshot.

## 10. Accessibility hit testing

AX never determines capture identity.

For `granularity: ui-element`:

1. Resolve the frontmost SCK/CG window first.
2. Submit PID, window bounds, and global point to `MacAxActor`.
3. `MacAxActor` checks `AXIsProcessTrusted()` without prompting.
4. Create the PID application AX element and set a 200 ms messaging timeout.
5. Call `AXUIElementCopyElementAtPosition`.
6. Read only role, subrole, position, size, enabled, focused, parent, and top-level UI element.
7. Walk parents with depth <= 64 and cycle detection.
8. Verify the top-level AX window bounds coherently overlap/contain the selected SCK window and the returned element contains the point.
9. Store the retained element behind a generation-scoped opaque ID and return the plain descriptor.

Failure returns the window candidate plus an `accessibilityFallback`; it does not fail the hit-test operation. AX requests are serialized on their own actor so an unresponsive target cannot delay ScreenCaptureKit capture. The element map is capped at 512 entries and cleared on generation refresh.

A `ui-element` capture resolves to its stored global rect and uses the region planner. It does not use undocumented AX window-number APIs or attempt to crop a desktop-independent window with `sourceRect` (which ScreenCaptureKit ignores for single-window filters).

## 11. Self-exclusion

The refresh input supplies current process IDs, product bundle IDs, and live native window IDs. CoreApp collects native IDs from main-only `BrowserWindow.getMediaSourceId()` values and a validated `__CFBundleIdentifier`; macOS Rust also includes `std::process::id()` unconditionally. Numeric native IDs are accepted only inside the main-to-Rust refresh request and are never returned by renderer/plugin/public SDK contracts.

Display/region/frame filter:

- exclude matching `SCRunningApplication` objects;
- additionally exclude explicit matching `SCWindow` objects;
- no caller option can disable all self-exclusion accidentally.

Explicit own-window capture:

- target must be an opaque retained window from the current generation;
- desktop-independent filter captures only that target;
- display/region capture with `includeSelfWindowId` uses excluding-applications plus that one excepted window;
- all other Tuff windows remain excluded.

`includeSelfWindowId` must equal the capture target or belong to the same current generation; arbitrary native IDs are rejected.

## 12. Static capture paths

### macOS 14+

Use `SCScreenshotManager.captureImage(filter, configuration)`. Configuration sets explicit width/height, BGRA/SDR behavior, source rect for display segments, and `showsCursor` from the request.

### macOS 12.3–13

Use a short-lived `SCStream` with the same filter/configuration:

1. add a screen output on a dedicated serial dispatch queue;
2. start capture;
3. ignore invalid/non-complete frames;
4. retain the first `SCFrameStatus.complete` sample;
5. stop capture and remove output;
6. extract BGRA pixels;
7. honor deadline/cancel while waiting and perform bounded stop cleanup.

### Pixel output

- static result is PNG;
- frame stream is premultiplied BGRA8 with explicit stride;
- conversion/encode/composite runs off the N-API/JS thread;
- image part chunks are <= 32 MiB and total packet bytes <= 128 MiB;
- dimensions, `width * height`, stride, allocation, and encoded size are checked before allocation/publication.

## 13. Frame stream and backpressure

One protocol stream owns one native `SCStream` and one latest-frame slot:

```text
WindowServer callback
  -> validate complete/BGRA/dimensions
  -> overwrite one bounded latest-frame slot
  -> increment droppedSourceFrames if replaced

protocol handler
  -> take latest frame
  -> await StreamContext.emit (credit)
  -> repeat or cancel/terminal
```

The callback never blocks a ScreenCaptureKit queue and never allocates an unbounded list. Protocol credit bounds published packets; the latest-frame slot bounds unpublished capture state.

`SCStreamConfiguration.queueDepth = clamp(initialCredit + 1, 3, 8)`. FPS is 1–30. A frame over `maxFrameBytes` terminates with `SCREENSHOT_OUTPUT_TOO_LARGE`; it is not partially published without descriptors.

Cancellation/deadline/dispose selects against frame wait, marks the source closed, asks `MacScreenActor` to stop, waits within the protocol dispose budget, and then emits/permits exactly one terminal. A drop guard sends best-effort stop if the async handler exits unexpectedly. Callback tokens check an atomic closed flag before touching queues.

The AX actor does not walk an arbitrary parent hierarchy. It resolves the system-wide element at the requested point, reads the allowlisted `AXWindow`, verifies element PID plus top-level window frame against the authoritative SCK/CG candidate, and then reads only role/subrole/position/size/enabled/focused. This removes cycle/depth behavior entirely. Element bounds must remain inside the verified window and contain the hit point; every failure returns the unchanged window candidate plus an allowlisted fallback reason.

## 14. Errors


Stable capability codes:

| Code | Category | Retryable | Meaning |
| --- | --- | ---: | --- |
| `SCREENSHOT_UNSUPPORTED` | availability | false | OS/backend feature unavailable |
| `SCREENSHOT_PERMISSION_DENIED` | permission | false | Screen Recording denied |
| `SCREENSHOT_STALE_GENERATION` | validation | true | opaque ID belongs to old generation |
| `SCREENSHOT_TOPOLOGY_CHANGED` | availability | true | display topology changed after refresh |
| `SCREENSHOT_DISPLAY_NOT_FOUND` | not_found | true | display no longer exists |
| `SCREENSHOT_WINDOW_NOT_FOUND` | not_found | true | retained window closed/unavailable |
| `SCREENSHOT_ELEMENT_NOT_FOUND` | not_found | true | AX element invalidated |
| `SCREENSHOT_INVALID_REGION` | validation | false | non-finite/empty/out-of-policy rect |
| `SCREENSHOT_PROTECTED_CONTENT` | permission | false | system explicitly reports non-shareable content |
| `SCREENSHOT_FRAME_UNAVAILABLE` | availability | true | no complete frame before deadline |
| `SCREENSHOT_OUTPUT_TOO_LARGE` | resource | false | pixel/working/attachment budget exceeded |
| `SCREENSHOT_BACKEND_BUSY` | resource | true | actor/admission limit reached |
| `SCREENSHOT_BACKEND_FAILED` | internal | true | sanitized unexpected system failure |

Core protocol cancellation/deadline/dispose codes remain canonical. Backend mapping uses known NSError domain/code and enum values only. Error messages are fixed safe text; raw localized descriptions are discarded.

Protected content is returned only when a public API/error/sharing state provides evidence. A black image heuristic is not used because valid dark content would be misclassified.

## 15. Limits

Initial capability limits, defined once in `limits.rs`:

- displays: 32;
- shareable windows: 2048;
- returned window candidates: 16;
- retained AX elements: 512;
- AX call timeout: 200 ms;
- static output pixels: 64 million;
- static estimated raw working set: 512 MiB;
- encoded packet attachments: protocol maximum 128 MiB;
- attachment part size: 32 MiB;
- stream raw frame bytes: 32 MiB by default, never above 64 MiB;
- frame rate: 1–30 fps;
- native queue depth: 3–8;
- title length when explicitly included: 512 Unicode scalar values;
- app/bundle strings: 256/512 bytes after UTF-8 encoding.

Limits are validated before system work and repeated before allocation/publication.

## 16. Main-process migration

Initialization sequence:

1. `NativeCapabilitiesModule` loads the Node-only `@talex-touch/tuff-native/screenshot-protocol` carrier; env-disable or missing/export-mismatch yields a sanitized diagnostic and no route.
2. `NativeTransport` initializes all available carriers independently.
3. `NativeScreenshotService` receives that transport, validates the aggregate snapshot, invokes `probe` then `refresh`, and caches support/displays.
4. Missing, disabled, unavailable, unhealthy, or conflicting screenshot capability leaves the service explicitly unavailable; typed handlers remain registered so callers receive stable fail-closed errors.
5. Module destroy disposes the aggregate transport exactly once.

Public behavior:

- `getSupport()` and `listDisplays()` remain synchronous by returning initialized cache.
- `capture()` translates existing `cursor-display | display | region` requests to generation-scoped protocol targets; global DIP rects go directly to Rust.
- Every successful public capture has a required `tfileUrl`. The request has no output selector; a runtime legacy `output` property is rejected. Public response/event/SDK types contain no image `dataUrl`, base64, raw path, Buffer, attachment descriptor, native window ID, or generation ID.
- Main reassembles protocol attachments once, writes the `native/screenshots` temp namespace, and exposes namespace- and canonical-path-validated `readCaptureResource()` / `copyCaptureResource()` only to main-process consumers.
- Plugin capture requires verified identity plus `window.capture`; `writeClipboard: true` additionally enforces `clipboard.write` in main.
- Main never computes physical global bounds or multiplies global origins. Protocol runtime failures propagate as mapped stable errors; there is no xcap retry outside the protocol backend.

Internal async `refresh()`, `hitTest()`, and `openFrames()` support later main-owned screenshot workflows without exposing raw protocol transport to renderer/plugin.

## 17. Protocol-only hard cut

`native-screenshot` exports only the six versioned protocol functions from `NapiRuntimeAdapter`. The five synchronous screenshot exports, `packages/tuff-native/screenshot.{js,d.ts}`, `./screenshot` package export, CoreApp `native-screenshot-addon.ts`, display-pairing/global-origin scaling helpers, and every runtime fallback are deleted.

`TUFF_DISABLE_NATIVE_SCREENSHOT=1` suppresses carrier creation. Missing or old binaries fail with sanitized unavailable/export-mismatch diagnostics. Windows/Linux xcap remains an internal `ScreenshotBackend` selected by the protocol registry; it is never exposed as a direct facade. Linux Wayland is rejected before advertising basic capture because its xcap coordinate model cannot prove this protocol's per-display scaling contract.

Rollback may disable or remove screenshot carrier initialization, leaving the typed capability unavailable. Rollback must not restore raw-addon calls or legacy exports.

## 18. Test strategy

### Pure Rust

- geometry finite/positive validation and half-open intersection;
- global -> local point -> local pixel round trips;
- mixed 1x/2x with negative left display;
- display above primary and topology holes;
- 90/270 rotation normalization;
- cross-display segment destination shared edges and no gaps;
- output/working-set limits and attachment chunking;
- exact SC/CG window-ID join and z-order;
- alpha/sharing/layer/system/self filtering;
- overlapping candidate order and bounded cycling;
- stale generation and opaque-ID rejection;
- sanitized error mapping.

### Mock backend registry

- capability descriptor differs correctly for macOS/full and xcap/basic;
- `probe`, `refresh`, `hit_test`, `capture`, and `frames` payload validation;
- PNG attachments and multi-part reconstruction metadata;
- permission denied/protected/not found/topology changed errors;
- stream credit, dropped latest-frame count, cancel, deadline, dispose, and one terminal;
- no late frame after cancel/dispose.

### Real addon / Node

- screenshot addon exposes exactly six protocol functions and no synchronous screenshot facade;
- CommonJS `screenshot-protocol` returns a valid `NapiCarrier` only for a full binding;
- `.node -> NapiCarrier -> NativeTransport` runs refresh/capture/frame fixtures;
- Buffer mutation after call cannot change Rust-owned input; attachment lengths correlate;
- env-disable, incomplete/old binding, absent binding, and full protocol binding matrix;
- package surface excludes `./screenshot`, Rust target/fixtures, and protocol subpath is Node-only.

### CoreApp

- carrier absence/unavailability is explicit and never changes execution mode;
- protocol display cache preserves current typed display shape;
- cursor/display/region requests use global DIP without global-origin scaling;
- mixed-DPI/negative-origin descriptors round-trip unchanged;
- attachment parts validate/reassemble before clipboard/temp-file handling;
- protocol error -> existing public screenshot error mapping;
- permission/plugin/resource boundaries unchanged;
- module lifecycle initializes service after transport and detaches/disposes once.

### Real macOS smoke

A non-CI, explicit smoke tool records sanitized JSON only:

- permission/support state and counts;
- display point/pixel/scale/rotation descriptors;
- window IDs/PIDs/bounds/layer/capturable without titles;
- capture dimensions/hash/byte length, never bytes;
- self-exclusion result;
- cursor hidden/system result;
- frame count/cancel result.

Required completion evidence includes mixed scale + negative origin, rotated display, cross-display window, AppKit/Electron/browser hit test, and denied permission states. Hardware not present locally remains an explicit packaged-evidence dependency rather than a fabricated pass.

## 19. Rollback

Rollback disables or removes screenshot carrier initialization and reports the typed capability unavailable. The shared protocol/runtime and other independent carriers remain in place. Restoring legacy exports, `./screenshot`, raw-addon loading, or fallback logic is not an allowed rollback.
