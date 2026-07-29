# Plugin Prelude Isolation Migration Guide

This guide applies to plugin Preludes running in CoreApp's isolated plugin runtime.
Each activation now owns one Electron utility process. There is no main-process VM or
legacy bridge fallback.

## Required Migration

1. Bundle the Prelude into the canonical artifact declared by `manifest.main` or
   `manifest.build.index.entry`.
2. Remove direct imports of Electron, filesystem APIs, SQLite, `child_process`,
   `worker_threads`, native addons, mutable `process`, and raw network clients.
3. Declare every required and optional permission in the manifest.
4. Use only the facade methods projected for the activation's fixed capability IDs.
5. Await every host operation and lifecycle cleanup.

Unsupported or stale artifacts fail activation with a stable error. CoreApp never retries
such code in the main process.

## Async Host Calls

Host operations are asynchronous across the process boundary.

```js
// Wrong: assumes a synchronous host mutation.
plugin.feature.clearItems()
plugin.feature.pushItems(items)

// Correct: preserves mutation ordering.
await plugin.feature.clearItems()
await plugin.feature.pushItems(items)
```

This rule applies to storage, clipboard, HTTP, open URL, feature registration/items,
process/system actions, Voice, Intelligence, and teardown operations.

## Capability And Permission Boundary

A host call is admitted only when all of these are true:

- the fixed capability ID is present in the activation manifest;
- the permission is declared by the plugin manifest;
- the permission is currently granted;
- the plugin activation, host generation, and lifecycle state are current;
- the request passes the exact bounded DTO validator.

The child cannot provide caller identity, activation keys, host generations, filesystem
paths, SQL, executable paths, credentials, provider endpoints, or other host authority.
Use opaque tokens and purpose-built facades when a workflow needs host-owned resources.

## Data Contract

Only bounded JSON-like DTOs cross the wire. Supported special values are the runtime's
explicit undefined, error, typed-array, callback, cancellation, and resource handles.
Do not send class instances, functions outside declared callback fields, accessors,
cycles, `BigInt`, `Map`, `Set`, native handles, host paths, or secret values.

All plugin-visible results are detached child-realm values. Do not depend on object
identity or host prototypes.

## Cancellation And Resources

Lifecycle work observes the request-scoped `AbortSignal`. Long-lived callbacks, streams,
and disposers are owner-bound resources.

```js
const stream = await plugin.voice.startDictation({ onEvent })
try {
  await waitForCompletion(stream)
} finally {
  await stream.cancel()
}
```

Cancellation and disposal must be idempotent. After disable, reload, permission revoke,
crash, or generation rotation, late callbacks and results are rejected. Do not detach host
work with `void`; await it while the lifecycle scope is authoritative.

## Safe Child-Local APIs

The runtime exposes immutable platform/locale/manifest snapshots, timers, text encoding,
bounded crypto helpers, logging, and explicitly projected plugin facades. It does not
expose `require`, `process`, `Buffer`, Electron, raw IPC, filesystem, SQLite, process, or
network globals.

## Validation

Before publishing a migrated plugin:

```bash
pnpm plugins:validate
```

Run plugin-local tests for enable, feature/action triggers, cancellation, permission denial
and revoke, disable, and a second activation generation. Official plugin changes must also
pass the CoreApp production build and Electron isolation smoke.
