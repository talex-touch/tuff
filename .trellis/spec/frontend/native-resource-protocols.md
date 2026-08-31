# Native Resource Protocol and App Icon Contract

## 1. Scope / Trigger

Apply this contract when native or main-process code produces an image, screenshot, audio stream, video, document, or other resource whose bytes are consumed by a renderer, plugin view, worker, or another process boundary.

This contract also applies when changing macOS application-icon extraction, the `tfile`/`atom`/`stream` Electron schemes, typed transport streams, native callback payloads, or resource cache paths.

The boundary invariants are:

```text
Rust addon -> Electron main = bounded JSON control + validated Buffer[] attachments
Electron main -> renderer/plugin/worker/process = bounded control metadata + resource descriptors only
```

The attachment exception ends inside Electron main. Main must materialize or promote bytes to an owned local resource before any renderer, plugin view, worker, preload, MessagePort, TuffTransport, or process boundary. No public SDK exposes a native addon binding or raw carrier.

## 2. Signatures

Darwin application icons use the package-owned native path writer:

```ts
export interface DarwinAppIconWriteOptions {
  sourcePath: string
  outputPath: string
  size: number
}

export interface DarwinAppIconWriteResult {
  path: string
  width: number
  height: number
}

export declare function writeDarwinAppIcon(options: DarwinAppIconWriteOptions): Promise<DarwinAppIconWriteResult>
```

The caller supplies an absolute application path, an absolute deterministic cache target, and an integer size in the supported range `16..1024`. The production app-icon target is currently 256 px.

Renderer-facing local resources use the existing URL projection:

```ts
toTfileUrl(absolutePath: string): `tfile://${string}`
```

The local-file policy must expose the current generated icon root without reopening the user's
home directory: `getAllowedLocalFileRoots()` includes exactly
`path.join(app.getPath('cache'), 'app-icons')` alongside its existing user-data/temp roots.
Electron's current type declaration omits the runtime-supported `cache` name, so this call uses
the same narrow cast as the cache-path owner rather than deriving a different directory.

The `tfile` handler validates the canonical path and allowlist, then forwards to Electron's built-in file handler:

```ts
net.fetch(pathToFileURL(absolutePath).toString(), {
  bypassCustomProtocolHandlers: true,
})
```

## 3. Contracts

### Rust NativeTransport boundary

- `@talex-touch/tuff-native/protocol-contract` owns protocol v1 control validation. `@talex-touch/tuff-native/protocol` owns the low-level N-API carrier. Electron main owns the single `NativeTransport` that aggregates independently loaded capability addons.
- Each addon must expose the complete versioned v1 export set and complete handshake before becoming routable. Missing, mismatched, unhealthy, or conflicting addons degrade independently; carrier health is not inserted into the capability route table.
- Every packet contains bounded JSON control plus a positional `Buffer[]`. Descriptor IDs are unique, indices are contiguous, byte lengths match, and count/per-attachment/packet limits are checked before capability work or queueing.
- `NativeTransport.invoke()` copies input Buffer ownership synchronously before its first `await`. The N-API adapter copies again into Rust-owned memory before async work. Output attachments remain main-process-owned and are never forwarded unchanged.
- Stream data is credit bounded. Main ACKs one cumulative contiguous sequence synchronously when `AsyncIterator.next()` removes the chunk, before resolving that iterator result. Rust retains only a fixed-size completed-stream tombstone so the final data ACK remains valid after terminal publication; duplicate/regressive/ahead ACK validation remains active.
- Request and stream IDs use a process nonce plus monotonic counter and are never reused. Timeout, caller abort, native terminal, iterator return, and dispose race through one state token; only the first terminal owner completes.
- Disposal rejects new work, locally terminates requests/streams, disposes carriers in parallel, and obeys a main-process total timeout. No timer, callback, waiter, in-flight entry, completed-stream tombstone, or carrier reference may survive disposal.
- Protocol errors and logs contain only stable codes and bounded safe metadata. Image/audio/OCR/QR bytes, recognized text, window titles, sensitive absolute paths, request payloads, and raw native exceptions are forbidden.
- Renderer and plugin code must not import `protocol`, `protocol-contract`, `NapiCarrier`, or a raw addon. Caller identity, permission checks, clipboard/file policy, and `tfile` promotion remain main-process responsibilities.

### Native/AppKit boundary

- Darwin app hydration first reuses the deterministic cache, then attempts `.icns -> sips`, then calls `writeDarwinAppIcon` for unresolved bundles.
- The public Promise yields with `setImmediate`; its private synchronous N-API binding asserts `[NSThread isMainThread]`, then invokes `NSWorkspace.sharedWorkspace iconForFile:` inside one `@autoreleasepool`. It does not use `Napi::AsyncWorker` or dispatch AppKit work from a background thread.
- Native code rasterizes the `NSImage`, writes PNG data atomically to `outputPath`, and releases `NSImage`, bitmap, `CGImageRef`, and `NSData` before JavaScript completion.
- Completion contains only `path`, `width`, and `height`. It never contains `Buffer`, `ArrayBuffer`, base64, PNG bytes, `NSImage *`, or another native pointer.
- TypeScript retains identity-key single-flight and serializes distinct Darwin native cache misses. AppKit/libuv queues must not receive one native operation per app concurrently.
- Darwin app hydration never calls Electron `app.getFileIcon(..., { size: 'large' })`. Once the AppKit helper is available, it does not use Electron/Chromium as the Darwin app-icon fallback.

### Three Electron schemes

| Scheme   | Contract                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tfile`  | Canonical allowlisted data plane for new local resource consumers. Registered as standard, secure, Fetch-capable, and streaming. The handler returns the built-in `file:` response body without reading the file into a JS Buffer. |
| `atom`   | Legacy direct-file forwarding. No new consumer may be added; do not treat its current behavior as the security contract for new code.                                                                                              |
| `stream` | A privileged scheme is registered, but the current source has no resource handler. It is reserved until a separate explicit owner and URL contract are approved; it must not become an undocumented blob tunnel.                   |

`packages/utils/transport/sdk/stream/protocol.ts` is a typed transport protocol, not the `stream:` resource scheme. It may carry stream IDs, cancellation, status, and bounded structured chunks. It must not carry image/audio/video/file bytes.

### Provider and renderer boundary

- Producers materialize resource bytes once under an allowlisted cache/temp root and return a typed path descriptor.
- AppProvider persists the icon pointer in a bounded batch. Icon-only hydration does not publish `IndexedSourceDelta` because the search-index projection has no icon field.
- A lightweight control-plane invalidation MAY tell a visible consumer to re-resolve its item. It must not include the resource bytes and must not mutate FTS solely to refresh an icon.
- Search/recommendation mapping resolves a valid path to `tfile://`; renderer code displays that URL and never reads the native path or database directly.
- `tfile` path normalization and allowlist validation remain the authorization boundary. Adding a native producer does not broaden renderer filesystem access.
- The current generated application-icon root is `path.join(app.getPath('cache'), 'app-icons')`.
  Any security narrowing of `tfile` roots must preserve that exact directory while continuing to
  deny the rest of the user's home. Allowing only scan roots or `userData` makes every valid
  current-cache icon fail with HTTP 403 and drives `TxIcon` to `EmptyAppPlaceholder.svg`.

## 4. Validation & Error Matrix

| Condition                                                                          | Required result                                                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `sourcePath`/`outputPath` missing, non-string, empty, or non-absolute              | Reject with `ERR_DARWIN_APP_ICON_INVALID_ARGUMENT` before AppKit work                                      |
| `size` not an integer in `16..1024`                                                | Reject with `ERR_DARWIN_APP_ICON_INVALID_SIZE`                                                             |
| Platform is not Darwin                                                             | Reject with `ERR_DARWIN_APP_ICON_UNSUPPORTED`                                                              |
| Native binding called from a Node/libuv worker instead of the Electron main thread | Reject with `ERR_DARWIN_APP_ICON_WRONG_THREAD` before AppKit work                                          |
| `NSWorkspace iconForFile:` returns nil/empty                                       | Reject with `ERR_DARWIN_APP_ICON_UNAVAILABLE`; caller uses class fallback                                  |
| Bitmap context/rasterization/PNG representation fails                              | Reject with `ERR_DARWIN_APP_ICON_RASTERIZE_FAILED`                                                         |
| Atomic cache write fails                                                           | Reject with `ERR_DARWIN_APP_ICON_WRITE_FAILED`; no partial target is considered valid                      |
| Duplicate cache-key request                                                        | Reuse the existing Promise; perform one native extraction                                                  |
| Distinct Darwin cache misses                                                       | Execute serially; each completion schedules the next request                                               |
| Non-canonical `tfile` URL                                                          | Return HTTP 400                                                                                            |
| Canonical path outside allowlist                                                   | Return HTTP 403 without opening the file                                                                   |
| Allowed file missing/read failure                                                  | Return HTTP 404                                                                                            |
| Allowed file exists                                                                | Return Electron's streaming built-in `file:` response                                                      |
| Native/cache persistence succeeds but DB pointer write is busy                     | Keep the derived cache usable; retry bounded persistence without retransmitting bytes                      |
| Current `app.getPath('cache')/app-icons` file                                      | Admit it through `tfile`; the renderer image completes with non-zero natural dimensions                    |
| Arbitrary sibling under the cache directory or another home path                   | Return HTTP 403; adding the icon root must not widen access to the whole cache/home                        |
| Visible result needs refresh                                                       | Send metadata-only invalidation or wait for the next query; never send the PNG or rewrite FTS for the icon |

## 5. Good / Base / Bad Cases

- Good: a screenshot addon returns PNG as a validated Rust-to-main attachment; main writes/promotes it to an allowlisted owned resource and returns only its typed descriptor or `tfile://` URL across TuffTransport.
- Good: a credit-window-1 stream publishes one data frame, stalls, resumes after consumer ACK, publishes one terminal, and accepts the final data ACK through a bounded completed-stream tombstone.
- Good: an asset-catalog-only `.app` is resolved by `NSWorkspace`, atomically written to the versioned cache, completed as `{ path, width, height }`, mapped to `tfile://`, and streamed by the renderer with zero image-byte IPC copies.
- Good: a security hardening removes the broad home root, keeps only the exact current
  `cache/app-icons` directory, and CoreBox loads distinct 256 px application images with zero
  `TxIcon` empty fallbacks.
- Good: a bundle with standalone `.icns` uses `sips`, persists the same deterministic cache pointer, and follows the same `tfile` consumer path.
- Base: no icon can be resolved; the app remains searchable and uses `i-ri-apps-line` without retry storms.
- Base: a small transport event carries `{ appPath, cacheVersion }` to invalidate a view; the view re-resolves the `tfile` URL.
- Bad: renderer/plugin/preload imports `@talex-touch/tuff-native/protocol`, loads a `.node` addon, or receives a Rust attachment Buffer through TuffTransport/MessagePort.
- Bad: native code returns a PNG `Buffer`, a worker posts that Buffer, preload forwards it, and renderer creates a data URL.
- Bad: `app.getFileIcon(..., { size: 'large' })` is used on macOS or a Darwin cache miss is sprayed across Chromium/libuv worker threads.
- Bad: a new resource consumer uses `atom:` or invents `stream:` semantics instead of the allowlisted `tfile` owner.
- Bad: `IconService` writes under Electron's cache path while `getAllowedLocalFileRoots()` only
  retains application scan roots, `userData`, and temp; files exist and recommendation mapping
  emits `tfile`, but every renderer request receives 403 and all cards display the same placeholder.
- Bad: icon hydration calls `publishAppRuntimeUpsert` even though the search-index mapping drops icon data.

## 6. Tests Required

- NativeTransport contract tests cover handshake/version/features, independent carrier failure, conflicts, unary success/error, Buffer ownership, attachment mismatch, request correlation, deadline/AbortSignal races, state-token late delivery, carrier-scoped health, and bounded parallel dispose.
- Real fixture-addon tests cover stream acceptance/rejection, early frame delivery, contiguous sequence, queue bounds, zero-credit stall, immediate per-consumption ACK, final-data ACK after terminal publication, duplicate/regressive/ahead ACK, iterator return, cancel/error/end single terminal, and dispose without late frames.
- Static import and package-surface tests verify renderer/plugin/preload code cannot resolve or import raw protocol carriers and packaged files exclude fixtures and Cargo target directories.
- Native boundary tests cover missing/relative paths, invalid sizes, unsupported platforms, no-icon results, rasterization failure, write failure, atomic success, and descriptor-only completion.
- Darwin integration asserts the JS callback yields one event-loop turn, the native binding rejects non-main-thread use, AppKit runs inside an autorelease pool, and failure leaves no temporary/partial target.
- IconService tests cover cache reuse, `.icns -> sips`, AppKit fallback, single-flight, serial distinct requests, class fallback, and the absence of Darwin Electron `large` calls.
- Protocol tests cover canonical Darwin/Windows/UNC paths, repeated encoding, HTTP 400/403/404, allowlisted success, `bypassCustomProtocolHandlers: true`, and a streaming response body.
- Local-file policy coverage must mock Electron `home`, `userData`, `temp`, and `cache`; assert the
  exact `cache/app-icons/<platform>/<hash>.png` path is admitted while `.ssh`, `.aws`, Documents,
  cache siblings, and root-prefix siblings remain denied.
- A CoreBox runtime smoke must inspect rendered application cards: every current-cache `tfile`
  image completes with `naturalWidth > 0`, and `.tuff-icon__empty` count is zero.
- AppProvider tests assert 200 icon-only hydration results produce bounded icon persistence and zero search-index `applyDelta` calls.
- Static/transport assertions verify Darwin native results and worker/IPC messages contain no `Buffer`, `ArrayBuffer`, base64, or image byte field.
- Real smoke uses at least 125 cache misses and five consecutive cold starts; it asserts no new `.ips`, `SIGTRAP`, or `EXC_BREAKPOINT`, one extraction per cache key, and later requests served through `tfile`.

## 7. Screenshot Descriptor-Only Contract

### 1. Scope / Trigger

Apply this subsection to `NativeScreenshotService`, `NativeEvents.screenshot.*`, Assistant screenshot events, plugin `ScreenshotSDK`, and Windows/Linux/macOS screenshot backends.

### 2. Signatures

```ts
interface NativeScreenshotCaptureRequest {
  target?: 'cursor-display' | 'display' | 'region'
  displayId?: string
  cursorPoint?: { x: number; y: number }
  region?: { x: number; y: number; width: number; height: number }
  writeClipboard?: boolean
}

interface NativeScreenshotCaptureResult {
  tfileUrl: string // required managed resource
  mimeType: string
  width: number
  height: number
  sizeBytes: number
  wroteClipboard: boolean
  // bounded display/geometry/duration metadata only
}
```

There is no public output selector and no public `path`, `dataUrl`, base64, Buffer, attachment descriptor, native window ID, or generation ID.

### 3. Contracts

- Rust capture emits PNG only as validated protocol attachment parts. `NativeScreenshotService` reassembles the parts, writes one file under `native/screenshots`, and returns a `tfile://` URL.
- Main-only consumers may call `readCaptureResource()` or `copyCaptureResource()`. Both require a `tfile://` URL that resolves inside the temp base and specifically inside the screenshot namespace.
- Plugin screenshot calls require verified identity plus `window.capture`. `writeClipboard: true` additionally requires `clipboard.write`; internal CoreApp callers have no plugin permission branch.
- macOS advertises only implemented ScreenCaptureKit/AX features. Windows/Linux xcap advertises only `display` and `region`, rejects cross-display regions, and returns `SCREENSHOT_UNSUPPORTED` for window/UI/cursor-system/self-exclusion/frames.
- `TUFF_SCREENSHOT_PROTOCOL_TEST_BACKEND=1` is build-time deterministic integration only. Production packages must be rebuilt without it.

### 4. Validation & Error Matrix

| Condition                                                                      | Required result                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Legacy `output` property is present                                            | `ERR_NATIVE_SCREENSHOT_OUTPUT_UNSUPPORTED`                     |
| Resource is not `tfile://`, escapes temp base, or escapes `native/screenshots` | `ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID`                       |
| Plugin lacks verified identity / `window.capture`                              | Reject before service invocation                               |
| Plugin requests clipboard mutation without `clipboard.write`                   | Reject before service invocation                               |
| Generation/display/element is stale or unknown                                 | Stable screenshot protocol error; never capture another target |
| xcap region intersects zero or multiple displays                               | `SCREENSHOT_INVALID_REGION`                                    |
| Backend does not implement requested advanced feature                          | `SCREENSHOT_UNSUPPORTED` and feature omitted from handshake    |

### 5. Good / Base / Bad Cases

- Good: renderer assigns `capture.tfileUrl` directly to `<img src>`; Assistant save asks main to copy the same managed resource.
- Base: AX fails for one target; hit-test keeps its window candidate and an allowlisted fallback reason.
- Bad: plugin asks for `output: "data-url"`, main returns a raw temp path, or a handler checks only `window.capture` before writing the clipboard.

### 6. Tests Required

- Public type/SDK tests prove `tfileUrl` is required and `output`/`path`/`dataUrl` do not exist.
- Service tests reject legacy output, malformed attachment correlation, and namespace escape; they verify controlled read/copy.
- Permission tests assert `window.capture` then `clipboard:write` for plugin clipboard mutation and no plugin checks for internal calls.
- Real macOS opt-in integration runs carrier handshake, probe, refresh, display/window/UI capture, cursor-system, frames, self exclusion, cancel, and dispose without printing or persisting image content.
- Fake-xcap tests cover negative origin, local-first scale, display/region PNG, cross-display rejection, stale generation, cancel, and every unsupported advanced operation. Three-platform CI builds and dlopens the production addon.

### 8. App Icon Wrong vs Correct

```ts
// Wrong: binary JSON and a clipboard permission bypass.
await screenshot.capture({ output: 'data-url', writeClipboard: true })

// Correct: host-owned resource; clipboard mutation has its own grant.
const capture = await screenshot.capture({
  target: 'display',
  displayId,
  writeClipboard: hasClipboardWriteGrant,
})
preview.src = capture.tfileUrl
```

### Wrong

```ts
const image = await app.getFileIcon(appPath, { size: 'large' })
const png = image.toPNG({ scaleFactor: 2 })
worker.postMessage({ appPath, png })
ipcMain.handle('app-icon', () => png)
```

This uses an unsupported macOS enum and copies resource bytes through native, worker, and IPC boundaries.

### Correct

```ts
const result = await writeDarwinAppIcon({
  sourcePath: appPath,
  outputPath: cachePath,
  size: 256,
})

return {
  type: 'url',
  value: toTfileUrl(result.path),
  colorful: true,
}
```

Native code owns AppKit and atomic persistence. TypeScript owns cache identity and bounded metadata. The protocol owns byte streaming.

## 8. Permission-Gated Plugin Resources And Application Projection

### 1. Scope / Trigger

Apply this contract when a plugin-owned `WebContentsView` renders a host `tfile:` resource or resolves an installed application from an opaque clipboard/search/provider identifier.

### 2. Signatures

```ts
interface ResolveApplicationRequest {
  identifier: string
  _sdkapi?: number
}

interface ResolvedApplication {
  identifier: string
  displayName: string
  icon: string | null // null or a host-safe tfile URL
}

system.resolveApplication(identifier: string): Promise<ResolvedApplication | null>
```

### 3. Contracts

- A plugin manifest declares and receives `fs.tfile` before its view may request any `tfile:` URL. `isPluginViewResourceAllowed()` checks the current plugin id/sdkapi grant on every request; a grant captured only when the view is created is stale after revocation.
- Every isolated plugin `WebContentsView` session installs the same bounded `tfile:` protocol handler before loading resources and unregisters it when the owning view is destroyed. Session registration reuses the main protocol's canonical parsing and configured managed-temp roots; it never creates a second path policy.
- The view policy is only the control-plane gate. The `tfile` protocol still canonicalizes the path and applies `getAllowedLocalFileRoots()`; permission never widens the protocol allowlist.
- Installed-application lookup requires `sdkapi >= 260817`, verified plugin identity, and `system.applications`. The handler accepts one trimmed exact identifier of at most 512 characters and delegates to AppProvider's exact path/bundle-id lookup.
- AppProvider owns icon cache repair and hydration. The response contains only bounded `identifier`, `displayName`, and `icon`; it never includes executable/native paths, file records, Buffer/base64 data, launch arguments, or search-index internals.
- A plugin resolves only the selected item's source app, caches by exact source id for the view lifetime, and degrades to the raw id when the SDK is unavailable, denied, invalid, or not found.
- Image details use the original `tfile:` URL when available and fall back to the already persisted thumbnail on `<img>` load failure. A blocked or missing original must not leave an empty preview.

### 4. Validation & Error Matrix

| Condition                                                                            | Required result                                                                           |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Plugin view has no permission scope or current `fs.tfile` grant                      | Reject `tfile:` before the request leaves the plugin session                              |
| Current `fs.tfile` grant exists but canonical path is outside the protocol allowlist | Protocol returns HTTP 403                                                                 |
| Plugin manifest uses `sdkapi < 260817` or the host does not support `260817`         | Package/runtime compatibility rejects activation before application lookup                |
| Caller identity is unverified or `system.applications` is denied                     | `APPLICATION_RESOLUTION_PERMISSION_DENIED`; AppProvider is not called                     |
| Permission runtime is unavailable                                                    | `APPLICATION_RESOLUTION_PERMISSION_UNAVAILABLE`; fail closed                              |
| Identifier is empty or longer than 512 characters                                    | `SYSTEM_APPLICATION_IDENTIFIER_INVALID`; AppProvider is not called                        |
| Exact application is absent                                                          | Return `null`; plugin keeps the raw source id                                             |
| Icon hydration or pointer persistence fails                                          | Return the application with `icon: null`; never fail identity display solely for the icon |
| SDK response contains a native icon path or malformed fields                         | Plugin SDK rejects the response as invalid                                                |
| Original clipboard image fails to load                                               | Render the persisted thumbnail and label it as a thumbnail preview                        |

### 5. Good / Base / Bad Cases

- Good: a Clipboard History view with live `fs.tfile` and `system.applications` grants loads an allowlisted original image and displays `{ displayName, tfile icon }` from an exact bundle id.
- Base: the app record or icon is unavailable; clipboard content remains usable, the raw source id remains visible, and the image thumbnail remains visible.
- Bad: permit all custom schemes once a plugin declares `fs.tfile`, return an executable path as the icon, query the fuzzy search engine for an exact id, or copy icon/image bytes through the SDK.

### 6. Tests Required

- Plugin-window policy tests toggle the live permission result for the same policy and prove `tfile:` changes from denied to allowed while other custom schemes remain denied.
- Protocol tests continue to prove 400/403/404 and allowlisted streaming behavior independently from the plugin permission test.
- Protected-handler tests cover unverified caller, unavailable runtime, denial, SDK mismatch, invalid id, not-found, and bounded success without invoking AppProvider on rejected input.
- Plugin SDK tests keep the typed event name, trim the exact id, strip undeclared fields, and reject native icon paths.
- Plugin view tests cover CoreBox-input debounce/stale isolation, source-app name/icon/raw-id fallback, original-image failure, and thumbnail rendering.
- A real UI smoke confirms the CoreBox input reaches the database query and the visible detail contains image content plus the source app identity.

### 7. Wrong vs Correct

```ts
// Wrong: declaration-only scheme trust and an unbounded app record.
if (manifest.permissions.required.includes('fs.tfile')) allowEveryTfileRequest()
return dbApp

// Correct: live control-plane permission + existing data-plane allowlist + bounded DTO.
if (!permissionModule.checkPermission(pluginId, 'fs.tfile', sdkapi).allowed) deny()
const response = await fetchThroughCanonicalTfileAllowlist(url)
return { identifier, displayName, icon: toTfileUrl(iconCachePath) }
```
