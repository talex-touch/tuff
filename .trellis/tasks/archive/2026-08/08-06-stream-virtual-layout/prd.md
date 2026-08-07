# Conversation stream virtual layout fixes

## Problem

Messages overlap in the home chat (chart/form/text stacked near the top). The virtual list
places every non-live row at `translateY(prefix-sum-of-heights)`; heights are keyed by message
id. Three id/cache defects corrupt those heights:

1. Ids are per-conversation counters (`${role}-${messageSeq}`, `useHomeConversation.ts:155-162`),
   so every thread has a `user-1`, `assistant-2`, …
2. One keep-alive'd `TxConversationStream` instance serves all threads (`/home` and `/home/c/:id`
   share a component; `router.ts:36,176-209`), and `PositionCache.heights` is never pruned
   (`use-position-cache.ts:32,50-53`) — thread B inherits thread A's measured heights by key.
3. `restore()` sets `messageSeq = restored.length` (`useHomeConversation.ts:582-587`); after any
   drop (cancel-empty, retry discard) later sends re-mint existing ids → duplicate `v-for` keys →
   Vue keyed-diff UB + shared height slot.

Secondary: visible-range math treats `scrollTop` as spacer-relative while HomePage pads the
scroller by 28px (`TxConversationStream.vue:74-78` vs `HomePage.vue:1582-1585`) — constant range
error near the top. Test blind spot: the ResizeObserver stub's `observe()` is a no-op, so "never
measured" cannot fail a test.

## Requirements

- R1: New message ids are globally unique (survive restore, drops, thread switches). Stored ids
  from old threads keep working (no migration).
- R2: The stream's height cache cannot leak heights across key sets: prune on `syncKeys`,
  retaining the live key.
- R3: HomePage recreates the stream state per conversation identity (`:key`), so old stored
  threads with colliding ids can't cross-poison each other.
- R4: Range/scroll math tolerates host padding/margins above the spacer (measure the spacer's
  content offset instead of assuming top-zone-only).
- R5: Regression tests: cache pruning w/ retained live key; unique-id generation after
  restore+drop; range with a non-zero spacer origin.

## Acceptance Criteria

- [ ] Restore a stored thread with chart+form+text rows → no overlap; switching between two
      stored threads → no overlap; retry-after-fail then send → no duplicate-key warning.
- [ ] tuffex conversation-stream + position-cache suites green; core-app typecheck node+web green.
- [ ] No behavior change to stick-to-bottom or the live zone contract.
