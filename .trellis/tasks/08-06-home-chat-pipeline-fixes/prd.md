# Home chat pipeline & rendering fixes v2.5 (parent)

## Source requirements (user session 2026-08-06/07)

Diagnosed from two screenshots plus code/pipeline mapping (two Explore agents + inline diff review):

1. **Message pile-up**: chart card, form card and text messages render stacked on top of each
   other in the home chat. Root cause chain: `TxConversationStream` is a dynamic-height virtual
   list; per-message ids are per-conversation counters (`user-1`, `assistant-2`) shared across
   threads through one keep-alive'd stream instance whose height cache is never pruned; restore
   sets `messageSeq = restored.length`, which re-mints already-used ids after drops. Wrong/stale
   heights → 96px-estimate offsets → overlap.
2. **Thinking vanishes on completion**: `HomePage.showChain()` requires `status === 'streaming'`
   for single-step trails; reasoning data itself is intact and persisted.
3. **No web search**: never existed — no gateway tool, and installed pi 0.84.0 has no built-in
   web search (verified in its dist). Needs a new tool + backend decision.
4. **Wrong date ("2025-02-14")**: no layer injects the current date into the system prompt.
5. **Compaction not adapted**: pi emits `compaction_start/end` on stdout JSON; `parsePiCliLine`
   drops them. App replays full, uncapped history every spawn.
6. **Send/impact motion not smooth enough**: ~196ms pre-flight queue, per-frame `blur()`
   re-rasterization, `setTimeout` beat drift, restarted ease-out follow tweens during streaming.

## Child map

| Child | Scope | Priority |
|---|---|---|
| 08-06-stream-virtual-layout | ids, cache pruning, per-thread stream instance, range origin, tests | P0 |
| 08-06-chain-visibility | showChain rule, first-line body loss, duration display | P1 |
| 08-06-pi-context-adaptation | date injection, compaction events end-to-end, transcript budget | P1 |
| 08-06-web-search-tool | `tuff_web_search` gateway tool + pi forwarder; backend selection pending user | P2 |
| 08-06-send-motion-polish | overlay-clone flight, spring follower, beat unification, blur diet | P2 |

Children are independent except: send-motion-polish touches `use-stick-to-bottom.ts`, which
stream-virtual-layout leaves untouched (it edits `TxConversationStream.vue` + `use-position-cache.ts`);
land stream-virtual-layout first anyway since motion polish is easiest to judge on a correct layout.

## Cross-child acceptance

- [ ] Restored + switched conversations lay out correctly with mixed text/chart/form heights.
- [ ] A settled single-thinking-step turn still shows its (collapsed) trail after reload.
- [ ] "今天是几月几日?" answered with the correct current date (no web search required).
- [ ] Long threads keep working past the model context (oldest turns dropped with a visible
      marker; compaction activity surfaced when pi reports it).
- [ ] Send motion: no artificial pre-flight delay, no dropped-frame blur, beats can't drift.
- [ ] `pnpm --filter @talex-touch/tuffex` build+test green; core-app typecheck (node+web) green;
      touched vitest suites green. Working tree contains pre-existing WIP in the same files —
      verify per-file with `git show HEAD:path`, never stash/checkout (repo convention).

## Status (2026-08-07)

| Child | State |
|---|---|
| stream-virtual-layout | code-complete + tests; manual visual pass pending |
| chain-visibility | code-complete + tests (showChain rule, body truncation fix, durationMs render) |
| pi-context-adaptation | code-complete + tests (date, compaction end-to-end, 96k-char budget) |
| web-search-tool | blocked on backend decision (options table in its prd) |
| send-motion-polish | code-complete + tests; user feel pass pending |

Not committed: working tree carries unrelated pre-existing WIP in the same files. Three
pre-existing main-process AI test failures verified unrelated (HEAD-swap reproduction).
