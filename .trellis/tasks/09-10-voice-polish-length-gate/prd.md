# Voice polish length gate and content-free telemetry

## Goal

Stop spending an AI pass on dictation too short to benefit from one, cap mid-length editing to the
scope it can actually honour, and start recording the numbers needed to re-tune both — without
recording anything a user said.

## Confirmed facts

- `VoiceService.polish()` is the single choke point every polish caller goes through: the streaming
  final path, the one-shot `dictate`/`stopSession` path, and the retained-audio retry
  (`apps/core-app/src/main/modules/voice/voice-service.ts`).
- Measured on this machine's configured route (`siliconflow-default` /
  `Qwen/Qwen3-VL-32B-Instruct`, strength `structured`): 7 chars → 667 ms producing 3 chars;
  11 chars → 834 ms producing an identical 11 chars; 24 chars → 878 ms; 64 chars → 1601 ms;
  95 chars → 6157 ms. The provider call *is* the polish latency — `Polish pass elapsedMs` equals
  `[Intelligence] text.chat latency` to the millisecond.
- The polish system prompt is 2646 characters (~900 tokens), against a mean dictated session of
  19.9 characters on this machine (`voice_insights_state`: 26 sessions, 518 characters, 217.05 s).
  Fixed prompt cost therefore dominates every short pass.
- Market practice is light-always-on plus heavy-rewrite-by-explicit-request, with exactly one hard
  length number published anywhere: Wispr Flow requires 10 words for iOS Polish (see `research.md`).

## Requirements

1. Below the gate the pass must not run at all: no provider request, no added stop-to-delivery
   latency, raw transcript delivered with `polished: false`.
2. The gate is a property of the transcript and is applied at `polish()`, so a one-shot, streaming
   final, or retry capture all obey the same rule.
3. Mid-length transcripts are capped to the `natural` editing directive regardless of the saved
   strength; at or above the full threshold the saved strength applies unchanged.
4. `live` delivery and caller-disabled cleanup keep skipping polish entirely; retry of such a
   capture must not gain a request.
5. Every tidy-up decision — including the skipped one — writes one content-free telemetry row:
   tier, units, character counts, effective and requested scope, outcome, latency. No transcript,
   no polished text, no audio path, no active-app identity, no provider credential.
6. Telemetry is user-deletable through the existing clear path and expires with the existing
   retention window; it is not exported as user content, and no row may survive a clear.
7. The tuning numbers must be readable as an aggregate (`summarizePolishTelemetry`) ready to be
   reported anonymously later: tier and outcome counts, capped-pass count, character percentiles,
   latency average/percentile/max.

## Acceptance criteria

- [ ] A transcript below the gate performs no intelligence call and delivers the raw text.
- [ ] A light-tier transcript requests the `natural` prompt even when the session strength is
      `deep`; a full-tier transcript requests the configured strength.
- [ ] Retry of a below-gate capture performs no polish request.
- [ ] Skipped, applied, unchanged, empty, timeout and failed decisions each produce exactly one
      telemetry row, and the row provably contains no dictated content.
- [ ] `clearInsights` removes telemetry rows; `summarizePolishTelemetry` returns zero afterwards and
      ignores rows outside its window or from a superseded generation.
- [ ] Migration `0045_voice_polish_telemetry` applies on top of the full chain and the table exists
      with the expected columns on both the migrated and the legacy-DDL path.
- [ ] Focused voice and database suites pass; CoreApp node typecheck passes.

## Out of scope

- Changing the 8s polish budget or the `text.chat` model choice (measured as the larger latency
  lever; tracked in `research.md` as the next measurement).
- Per-app or per-scenario polish modes beyond the strength the user picked.
- Any network upload of the telemetry: this task only guarantees the data exists, is content-free
  and is aggregatable. Wire-format and endpoint belong to the reporting work.
