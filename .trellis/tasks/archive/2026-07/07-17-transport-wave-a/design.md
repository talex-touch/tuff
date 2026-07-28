# Transport Wave A — Technical Design

## 1. Boundary map

```text
main producer ── typed event ──┬─ confirmed MessagePort ── renderer/plugin stream consumer
                              └─ channel fallback ─────── renderer/plugin stream consumer

renderer/plugin request ── typed invoke/channel ── main handler

legacy raw name ── tombstone registry/audit only; never registered or sent
```

Transport ownership remains in `packages/utils/transport`. CoreApp modules own business handlers; they do not open raw ports or raw Electron IPC.

## 2. Channel-by-channel MessagePort plan

| Lane | Canonical event | Current state | Wave A decision | Verification |
|---|---|---|---|---|
| Clipboard | `ClipboardEvents.change` | stream + port fallback | retain and harden | port-first, unavailable fallback, close fallback, cancel cleanup |
| File index | `AppEvents.fileIndex.progress` | stream + throttled producer | retain and harden | ordered progress, terminal delivery, cancel cleanup |
| Search request | `CoreBoxEvents.search.session` | request-scoped stream | retain | two senders isolated, cancel exact session, one terminal |
| Search index | `CoreBoxEvents.search.indexCommitted` | stream | retain | reconnect/fallback and no duplicate refresh |
| Search legacy push | `search.update/end/noResults` | allowlisted raw compatibility events | remove | no producer/consumer and absent from allowlist |
| CoreBox layout | `CoreBoxEvents.layout.update` | renderer→main batched request | keep channel batching | 16ms latest merge and handler error semantics unchanged |

The Wave A line is semantic, not popularity-based: the existing port protocol safely transports main→renderer event data and streams. It does not provide a response/ambiguity protocol for renderer→main side effects. `layout.update` therefore stays on typed channel batching rather than accepting an exactly-once regression.

## 3. Port lifecycle invariant

A port event subscription is owned by `(transport instance, channel)` and has a handler reference count.

- Open only for an allowlisted channel and only on the first handler/stream.
- Keep channel listener registered during the port lifetime as fallback.
- Main sends through exactly one route: confirmed port when available; otherwise channel.
- A client that successfully posted/received through a port never mirrors that same message through channel.
- Last handler release sets `closing`, removes port listeners, closes the handle with `no_handlers`, and removes the subscription.
- Open completion after `closing` closes the newly returned handle immediately.
- Port `close`/`messageerror`, sender destroy, and transport destroy remove listeners, timeouts, cached handles, and registry entries.
- Mid-stream close switches subsequent chunks to channel; already delivered chunks are not replayed.

Renderer and plugin implementations currently duplicate this lifecycle. Wave A extracts or shares the lifecycle only if doing so reduces code without changing public APIs; otherwise both implementations must be kept behaviorally identical and covered by the same matrix.

## 4. Event ownership cutover

`CoreBoxEvents` becomes the only canonical CoreBox event owner. `core-box-retained.ts` is removed after its typed canonical definitions are moved into the canonical event module.

Migration sequence:

1. Define each canonical event with `defineEvent(namespace).module(module).event(action).define<Req, Res>()`.
2. Preserve the canonical event name and batch/stream metadata.
3. Move imports to `CoreBoxEvents` / owning family.
4. Update producer and consumer as one slice.
5. Run the slice's focused checks.
6. Remove the raw alias and dual listener only after evidence gate passes.

Active CoreBox raw definitions (`query`, `cancel`, `update`, `end`, `noResults`, `indexingDiagnostics`, `input.change`, `item.*`, `clipboard.change`) are converted to typed builder names. Where a raw name differs from the canonical builder name, the canonical name is the builder name; the old raw name is treated as a legacy alias and removed by the same gate.

## 5. `sendSync` clean cut

The current thrown-error implementation still advertises a callable method and ships dead code. Remove:

- `ITouchClientChannel.sendSync`;
- `TouchChannel.sendSync` and its removed-error helper;
- Prelude `$channel.sendSync` source;
- renderer/global declarations and source-contract assertions that preserve the tombstone.

No replacement is introduced. Callers use typed async `send` / domain SDKs.

## 6. Alias tombstone registry and evidence

Add a data-only registry under the transport owner. A tombstone contains:

```ts
interface RemovedLegacyAlias {
  family: 'core-box' | 'auth' | 'account' | 'sync' | 'terminal' | 'opener'
  legacyEvent: string
  canonicalEvent: string
  direction: 'renderer-to-main' | 'main-to-renderer' | 'main-to-plugin'
  sourceModule: string
  removedIn: string
}
```

It is not an alias resolver and exports no `TuffEvent` for old names. Its only consumers are the source audit/evidence builder and strict verifier.

`legacy-alias-evidence/v1` includes:

- repository revision/version metadata;
- one result per tombstone;
- production producer/listener/export counts and anchors;
- test/fixture counts kept separate;
- optional aggregate runtime observation (`windowStart`, `windowEnd`, `hitCount`, `source`);
- `decision: 'explicit-hard-cut'` for this user-directed cutover;
- gate failures/warnings.

The verifier fails on any production hit, missing mapping, duplicate legacy/canonical mapping, missing decision, payload-shaped fields, or incomplete alias coverage. Missing runtime telemetry is represented as `not-collected`; it cannot be reported as zero.

## 7. Dual-listener closure

An alias may move from observed compatibility to tombstone only when:

1. canonical producer and consumer exist;
2. internal legacy producers/listeners/exports are zero;
3. all affected focused regressions pass on canonical events;
4. evidence covers the alias and records the operator decision;
5. optional runtime telemetry, when supplied, has been aggregated without payload data.

After cutover, runtime code contains no dual-listener switch. The registry is prevention/evidence, not a compatibility path.

## 8. Rollback

- Runtime port issues: set `TALEX_TRANSPORT_PORT_CHANNELS` to blank to disable upgrades and use channel fallback.
- Event/alias issues: revert the complete event-family slice. Do not restore one legacy listener without its producer, tests, and evidence mapping.
- `sendSync`: no runtime fallback. Reverting the hard cut is a release rollback because restoring sync IPC would reintroduce renderer blocking and incompatible semantics.
