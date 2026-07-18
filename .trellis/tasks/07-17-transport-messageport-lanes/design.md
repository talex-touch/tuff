# Transport MessagePort Lanes — Design

## Lane inventory

| Lane | Events | Delivery |
|---|---|---|
| Clipboard | `ClipboardEvents.change` | server stream → port when confirmed, channel fallback |
| File index | `AppEvents.fileIndex.progress` | throttled server stream → port/channel |
| Search | `CoreBoxEvents.search.session`, `CoreBoxEvents.search.indexCommitted` | request-scoped stream → port/channel |

`CoreBoxEvents.search.update/end/noResults` are removed from the port allowlist because the session stream owns their former update/terminal semantics.

## Lifecycle

Each stream controller owns its port handle and channel fallback listeners. Event listeners share a `(transport, channel)` port subscription with reference counting.

Close conditions:

1. last handler/controller release;
2. cancellation;
3. port `close` or `messageerror`;
4. sender `destroyed`;
5. transport `destroy()`;
6. open completes after the subscription was marked closing.

Cleanup removes listeners before closing the handle and deletes map/cache/timeout entries exactly once. A close after cleanup is idempotent.

## Delivery rule

A server emission selects exactly one route. If a confirmed matching port exists and `postMessage` succeeds, do not mirror through channel. If there is no port or `postMessage` fails before delivery, send through channel. After a port close, subsequent stream chunks use the already-registered channel fallback; delivered chunks are not replayed.

## Layout carve-out

`CoreBoxEvents.layout.update` is high-frequency but renderer→main and response-bearing (`Promise<void>` means handler failure remains observable). The existing 16ms `latest` batch already coalesces it. Wave A does not add ambiguous retry or fire-and-forget behavior; bidirectional port RPC requires a separate protocol design.
