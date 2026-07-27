# Native Resource Protocol and App Icon Contract

## 1. Scope / Trigger

Apply this contract when native or main-process code produces an image, screenshot, audio stream, video, document, or other resource whose bytes are consumed by a renderer, plugin view, worker, or another process boundary.

This contract also applies when changing macOS application-icon extraction, the `tfile`/`atom`/`stream` Electron schemes, typed transport streams, native callback payloads, or resource cache paths.

The invariant is:

```text
resource bytes = filesystem/protocol data plane
IPC/MessagePort/native callback = bounded control metadata only
```

## 2. Signatures

Darwin application icons use the package-owned native path writer:

```ts
export interface DarwinAppIconWriteOptions {
  sourcePath: string;
  outputPath: string;
  size: number;
}

export interface DarwinAppIconWriteResult {
  path: string;
  width: number;
  height: number;
}

export declare function writeDarwinAppIcon(
  options: DarwinAppIconWriteOptions,
): Promise<DarwinAppIconWriteResult>;
```

The caller supplies an absolute application path, an absolute deterministic cache target, and an integer size in the supported range `16..1024`. The production app-icon target is currently 256 px.

Renderer-facing local resources use the existing URL projection:

```ts
toTfileUrl(absolutePath: string): `tfile://${string}`
```

The `tfile` handler validates the canonical path and allowlist, then forwards to Electron's built-in file handler:

```ts
net.fetch(pathToFileURL(absolutePath).toString(), {
  bypassCustomProtocolHandlers: true,
});
```

## 3. Contracts

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
| Visible result needs refresh                                                       | Send metadata-only invalidation or wait for the next query; never send the PNG or rewrite FTS for the icon |

## 5. Good / Base / Bad Cases

- Good: an asset-catalog-only `.app` is resolved by `NSWorkspace`, atomically written to the versioned cache, completed as `{ path, width, height }`, mapped to `tfile://`, and streamed by the renderer with zero image-byte IPC copies.
- Good: a bundle with standalone `.icns` uses `sips`, persists the same deterministic cache pointer, and follows the same `tfile` consumer path.
- Base: no icon can be resolved; the app remains searchable and uses `i-ri-apps-line` without retry storms.
- Base: a small transport event carries `{ appPath, cacheVersion }` to invalidate a view; the view re-resolves the `tfile` URL.
- Bad: native code returns a PNG `Buffer`, a worker posts that Buffer, preload forwards it, and renderer creates a data URL.
- Bad: `app.getFileIcon(..., { size: 'large' })` is used on macOS or a Darwin cache miss is sprayed across Chromium/libuv worker threads.
- Bad: a new resource consumer uses `atom:` or invents `stream:` semantics instead of the allowlisted `tfile` owner.
- Bad: icon hydration calls `publishAppRuntimeUpsert` even though the search-index mapping drops icon data.

## 6. Tests Required

- Native boundary tests cover missing/relative paths, invalid sizes, unsupported platforms, no-icon results, rasterization failure, write failure, atomic success, and descriptor-only completion.
- Darwin integration asserts the JS callback yields one event-loop turn, the native binding rejects non-main-thread use, AppKit runs inside an autorelease pool, and failure leaves no temporary/partial target.
- IconService tests cover cache reuse, `.icns -> sips`, AppKit fallback, single-flight, serial distinct requests, class fallback, and the absence of Darwin Electron `large` calls.
- Protocol tests cover canonical Darwin/Windows/UNC paths, repeated encoding, HTTP 400/403/404, allowlisted success, `bypassCustomProtocolHandlers: true`, and a streaming response body.
- AppProvider tests assert 200 icon-only hydration results produce bounded icon persistence and zero search-index `applyDelta` calls.
- Static/transport assertions verify Darwin native results and worker/IPC messages contain no `Buffer`, `ArrayBuffer`, base64, or image byte field.
- Real smoke uses at least 125 cache misses and five consecutive cold starts; it asserts no new `.ips`, `SIGTRAP`, or `EXC_BREAKPOINT`, one extraction per cache key, and later requests served through `tfile`.

## 7. Wrong vs Correct

### Wrong

```ts
const image = await app.getFileIcon(appPath, { size: "large" });
const png = image.toPNG({ scaleFactor: 2 });
worker.postMessage({ appPath, png });
ipcMain.handle("app-icon", () => png);
```

This uses an unsupported macOS enum and copies resource bytes through native, worker, and IPC boundaries.

### Correct

```ts
const result = await writeDarwinAppIcon({
  sourcePath: appPath,
  outputPath: cachePath,
  size: 256,
});

return {
  type: "url",
  value: toTfileUrl(result.path),
  colorful: true,
};
```

Native code owns AppKit and atomic persistence. TypeScript owns cache identity and bounded metadata. The protocol owns byte streaming.
