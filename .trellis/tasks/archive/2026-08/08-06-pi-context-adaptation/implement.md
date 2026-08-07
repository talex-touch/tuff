# Implement — pi context adaptation

- [x] 1. Types: add `compaction-start/end` to `IntelligencePartEvent` in tuff-intelligence and
       utils mirrors; check exhaustive switches downstream (add ignore-default where needed).
- [x] 2. `pi-cli-runtime.ts`: date line in `buildPiPrompt` (injectable `now`); transcript budget
       + omission marker; parse `compaction_start/end`.
- [x] 3. `pi-cli-provider.ts`: pass `now` implicitly (no change if computed inside buildPiPrompt);
       confirm pass-through of new kinds (should be zero-change).
- [x] 4. `useHomeConversation.ts`: handle new kinds (count + transient compacting flag; do not
       set `received`).
- [x] 5. `HomePage.vue`: compacting status row; `home.compacting` in zh-CN/en-US lang files.
- [x] 6. Side panel meta row for `compactions` (if the meta table pattern makes it a one-liner;
       else defer with a code comment).
- [x] 7. Tests: pi-cli-runtime (date/budget/parse); renderer handler unit.
- [x] 8. Build/typecheck: tuff-intelligence + utils packages build if they have build steps;
       core-app typecheck node+web; targeted vitest.

Rollback: per-file `git show HEAD:path` restores; steps 1-2 are independent of 4-6.

## Outcome (2026-08-07)

All steps done, including the side-panel compactions row. pi-cli-runtime 47 tests green
(date line, budget ×3, compaction parse); typecheck node+web green. Known: 3 pre-existing
failures elsewhere in src/main/modules/ai (ai-cli-import-service timeout, quota-boundary,
registry-coverage timeouts) — verified pre-existing by swapping HEAD's pi-cli-runtime.ts back
in and reproducing identically; unrelated to this task.

## Addendum — prompt-cache stability rework (2026-08-07, user-reported)

The first budget implementation was cache-hostile: a newest-anchored window slid one turn per
send and the omission marker carried a live count — together they rewrote the transcript head
every turn, evicting the provider's byte-exact prefix cache for the whole thread. Reworked:

- Chunk-quantized cut (`PI_CLI_TRANSCRIPT_DROP_CHUNK = 24_000`): dropped prefix is a pure
  function of turn sizes and quantized excess — byte-stable until the next 24k boundary
  (one miss per chunk, not per send).
- Marker de-counted: fixed string, no per-send churn.
- Date line moved to the system prompt's tail — the only volatile line invalidates only itself
  at the day flip (it is date-only, so within a day it is byte-stable by construction).
- Bonus hole found in the same audit: threads persisted under the old counter ids can carry
  real duplicates; `useConversationHistory.load()` now repairs them on the way in (+test).

Evidence: new `holds the over-budget cut point still across sends` prefix-stability test;
124 conversation+runtime tests green; tsc node + vue-tsc web clean (tuffex-build pre-step
bypassed — broken by an unrelated concurrent worktree install resolving vite into
`talex-touch-worktrees/tx`; dist from the 00:36 build is current for all tuffex edits).
