# Chain-of-thought completion visibility (lightweight)

## Problem

1. `HomePage.showChain()` (`HomePage.vue:553-557`) hides single-step trails unless
   `status === 'streaming'` → a turn with exactly one reasoning span loses its whole trail the
   moment it completes, and permanently after reload (restored messages are `complete`), even
   though parts are persisted in SQLite.
2. `chain-steps.ts` titles truncate the first line at 48 chars and the body starts after the
   first `\n` — the truncated remainder of line 1 is rendered nowhere (display-layer data loss).
3. `reasoning-end` carries `durationMs` and the store keeps it, but `AiChainStep` has no duration
   field, so "thought for Ns" cannot render.

Out of scope (deliberate): `retry()` clearing `parts` is regeneration semantics, not a bug —
the new attempt streams fresh parts. `:default-open="false"` auto-collapse on settle stays (it
is the designed behavior; the bug is unmount, not collapse).

## Requirements

- R1: A settled turn whose only step is a thinking step keeps its trail (collapsed by default,
  expandable). A lone tool-call step keeps current behavior (solo card, no trail).
- R2: When the first line is truncated for the title, the body must contain the full text
  (title becomes a preview, nothing is lost).
- R3: `AiChainStep` gains `durationMs?`; `toChainSteps` forwards it; `TxChainOfThought` renders a
  quiet `· N.Ns` suffix on thinking steps that carry it (locale-neutral, tuffex no-i18n rule).

## Acceptance Criteria

- [ ] Plain question with thinking → after the answer lands, a collapsed trail header remains,
      expands to full reasoning, and survives app reload.
- [ ] chain-steps + chain-of-thought suites updated and green; both typechecks green.
