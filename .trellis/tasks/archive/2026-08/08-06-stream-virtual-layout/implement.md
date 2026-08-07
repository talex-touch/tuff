# Implement — stream virtual layout fixes

Order matters only within each package; tuffex first (core-app consumes it).

## tuffex (packages/tuffex/packages/components/src/conversation-stream)

- [x] 1. `use-position-cache.ts`: `syncKeys(next, retain?)` + prune `heights`.
- [x] 2. `TxConversationStream.vue`: pass `liveKey.value` to `syncKeys`; add `spacerRef`;
       track `spacerTop`; use it in `range`, RO compensation, `scrollToIndex`.
- [x] 3. Tests: position-cache prune cases; RO-observe coverage assertion; spacer-origin range.
- [x] 4. `pnpm --filter @talex-touch/tuffex build` (audit:size reads dist) + vitest for the
       component; tuffex vue-tsc.

## core-app

- [x] 5. `useHomeConversation.ts`: uuid ids; remove `messageSeq`; restore stops reseeding.
- [x] 6. `HomePage.vue`: `:key="conversationKey"` on `TxConversationStream` (conversation id or
       `'draft'`).
- [x] 7. `useHomeConversation.test.ts`: id-uniqueness regressions.
- [x] 8. `npm run typecheck` (node + web) in apps/core-app; targeted vitest suites.

## Validation

- [ ] 9. Manual: restore stored thread w/ chart+form; switch threads; retry+send. No overlap, no
       duplicate-key warning in console.

## Rollback

Each numbered step is a self-contained edit; revert per file with `git show HEAD:path` (repo
rule: never stash/checkout for verification on this dirty tree).

## Outcome (2026-08-07)

Code-complete. tuffex conversation-stream 37 tests green (4 new: prune ×2, observe coverage,
spacer origin); core-app conversation suites 72+ green incl. two new id-uniqueness regressions;
tuffex vue-tsc + core-app typecheck (node+web) green; eslint clean. Step 9 (manual visual pass
on restored/switched threads) awaits the user. Not committed — the working tree carries
pre-existing WIP in the same files; commit decision surfaced to the user.
