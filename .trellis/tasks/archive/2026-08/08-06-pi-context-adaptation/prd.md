# pi context adaptation: date, compaction, history budget

## Problem

The home chat spawns `pi` per turn (`--no-session`, full transcript replayed):

1. **No date anywhere** in the system prompt chain → "今天是几月几日" answered from training
   prior ("2025-02-14"). Auto-Context injection is user-toggleable, so it is the wrong home.
2. **Compaction events dropped**: pi 0.84 auto-compaction is on by default and emits
   `compaction_start` (`reason: manual|threshold|overflow`) / `compaction_end` on stdout JSON;
   `parsePiCliLine` returns null for them. The user cannot see that the model's context was
   squeezed mid-turn.
3. **Unbounded history replay**: `buildPiPrompt` flattens every settled turn with no cap; pi
   compaction is per-spawn (in-memory state dies with the process), so nothing protects long
   threads across turns — they grow until the upstream model rejects the prompt.

## Requirements

- R1: Every spawn's system prompt states the current date, weekday and timezone (injected at
  `buildPiPrompt`, independent of Auto Context; clock injectable for tests).
- R2: `parsePiCliLine` maps `compaction_start/end` to new `IntelligencePartEvent` kinds;
  provider passes them through; the renderer surfaces "compacting context" while active and
  records a per-turn compaction count in message meta. i18n zh-CN + en-US.
- R3: Transcript replay is budgeted: whole oldest turns drop first, newest turn never drops; a
  dropped-prefix marker line tells the model context was omitted. Budget is a named constant
  with rationale (chars ≈ 4/token heuristic).
- R4: Unit tests for all three in `pi-cli-runtime.test.ts` (+ renderer part-event handling).

## Non-goals

LLM summarization of dropped turns (follow-up); `/compact` slash command in the composer;
per-model dynamic budgets.

## Acceptance Criteria

- [ ] "今天是几月几日?" → correct date, offline.
- [ ] Simulated `compaction_start/end` lines produce part events end-to-end (unit level) and the
      status line appears/disappears.
- [ ] A synthetic 300-turn history builds a prompt under budget with the newest turns intact and
      a visible omission marker.
