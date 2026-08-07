# Design — stream virtual layout fixes

## D1. Message id generation (core-app)

`useHomeConversation.ts`: `createMessage` mints `` `${role}-${crypto.randomUUID()}` ``; delete
`messageSeq` and the restore-time reseed. Role prefix kept purely for debuggability. Ids are
still strings end-to-end (DB `meta` path unchanged); old stored ids restore as-is.

Rejected: reseeding `messageSeq = max(existing)+1` — still collides across threads through the
shared cache; uuid removes the whole class.

## D2. Height-cache pruning (tuffex)

`use-position-cache.ts`: `syncKeys(next, retain?)` — after replacing the key order, drop every
`heights` entry not in `next ∪ {retain}`. `TxConversationStream.vue` passes `liveKey.value` as
`retain` (the live row's height is recorded before its key ever appears in `virtualKeys`; pruning
it would send a migrating row back to the 96px estimate).

Prune happens only on key-set changes (thread switch, append, drop) — never per-delta.

## D3. Per-thread stream instance (core-app)

HomePage keys the stream by the active conversation identity: `:key="conversationKey"` where
`conversationKey` is the loaded conversation id or `'draft'` for a fresh `/home`. This makes the
remaining cross-thread sharing (old threads with legacy counter ids) structurally impossible and
resets scroll anchoring per thread. The keep-alive'd component itself stays cached — only the
stream subtree remounts on switch.

## D4. Spacer origin measurement (tuffex)

Replace `topZoneHeight` in range/compensation/scrollToIndex math with a measured
`spacerTop` = the spacer's layout offset inside the scroller (`spacerEl.offsetTop` relative to
the scroller content origin, captured in the RO handler when the scroller or top zone resizes,
and on mount). The top-zone-collapse scroll compensation keeps its delta semantics (delta of
`spacerTop` instead of delta of top-zone height).

`offsetTop` is layout-space (scroll-invariant), so one measurement per relayout is enough; no
per-scroll reads.

## D5. Tests

- `use-position-cache` (tuffex): prune drops stale keys, keeps `retain`; offsets after prune.
- `conversation-stream.test.ts` (tuffex): instrument the RO stub to record `observe()` targets —
  every rendered window item must be observed (kills the "never measured" blind spot); range
  honors a mocked non-zero spacer origin.
- `useHomeConversation.test.ts` (core-app): after `restore()` of N messages then a drop and a
  send, all ids in `messages` are unique; ids differ across two composable instances.

## Compatibility

`syncKeys` gains an optional second parameter — additive, no tuffex consumer breaks. The stream's
public props/expose surface is unchanged. Per repo memory, run both tuffex vue-tsc and core-app
typecheck after touching tuffex source.
