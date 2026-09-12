# Design: length gate and content-free polish telemetry

## Where the gate lives

`VoiceService.polish()` is the only place every polish caller converges:

```
streamDictation (final)  ─┐
finalizeCapture (one-shot/dictate, stopSession) ─┼─→ polish(transcript, strength, signal, caller)
retryLastFailure         ─┘
```

Putting the gate there rather than in each caller is what makes "a short utterance costs no provider
call anywhere" true by construction, including the retained-audio retry path that was added later.
It also keeps the existing invariant that cleanup-disabled and live captures never reach polish:
the gate is a second reason to skip, not a replacement for the first.

Why the decision cannot live in the stream log: `Voice stream tidy-up decision` is emitted before
capture even opens, when no transcript exists. That log keeps its `skippedBecause` values
(`not-skipped` / `live-delivery` / `caller-disabled`); the transcript-dependent reason is recorded
by `polish()` itself.

## Tier resolution

```ts
countPolishUnits(text) = CJK characters + Latin words   // language-neutral, punctuation-free
resolvePolishTier(text) = units < 12 ? 'short' : units < 60 ? 'light' : 'full'
```

- One pair of thresholds holds for Chinese and English; a word-count-only rule mis-sizes Chinese and
  a character-count-only rule mis-sizes English ("I'll ship it Monday" is 4 units, 18 characters).
- Both numbers are documented against evidence in `research.md` §3 rather than being taste.
- Boundary behaviour is asserted (11/12/59/60), because an off-by-one here silently changes cost
  and perceived quality at the most common input size.

Effective scope:

```ts
const effectiveStrength = tier === 'light' ? 'natural' : strength
```

`full` never upgrades a user who chose `natural`; `light` caps a user who chose `deep`. The saved
preference and its session freeze are untouched — this is a scope cap inside the pass, not a new
policy authority, and nothing is written back to settings.

## Telemetry

New table `voice_polish_telemetry` (aux DB), one row per decision **including skips**:

| column | meaning | content-free because |
|---|---|---|
| `id` | opaque per-decision id | monotonic counter, not a capture id |
| `day`, `captured_at` | retention + windowing | timestamps, no locale or app |
| `tier` | short / light / full | derived from size |
| `units`, `characters` | sizes | counts, not text |
| `outcome` | skipped-short / applied / unchanged / empty / timeout / failed | enumerated state |
| `strength`, `requested_strength` | effective vs requested scope | enum, reveals gate downgrades |
| `latency_ms`, `polished_characters` | provider cost, output size | numbers |

Read side: `VoiceInsightsStore.summarizePolishTelemetry(windowDays = 30)` returns counts by tier and
outcome, `cappedSessions`, character p50/p90/max, latency count/avg/p95/max — the aggregate that can
be reported anonymously, without any endpoint being invented here.

Write side: `scheduleAuxWrite('voice-polish-telemetry.record', …)` with the same in-memory +
durable generation fence as `recordSuccess`, `onConflictDoNothing` on `id`, and a 365-day trim
matching the insights window. `clearInsights()` deletes telemetry rows and advances the durable
generation, and reads filter on that generation, so a delayed write cannot survive a user clear.

Failure behaviour: telemetry persistence is wrapped in try/catch and can only log. A telemetry
failure must never change what the user hears, the same rule `recordInsightSuccess` already follows.

## Registration points (all updated)

| Site | Why it must know about the table |
|---|---|
| `src/main/db/schema.ts` | drizzle table definition |
| `resources/db/migrations/0045_voice_polish_telemetry.sql` + journal idx 45 | schema authority for existing installs |
| `modules/database/index.ts` `AUX_COPY_TABLES` | aux copy/compaction must carry the table |
| `modules/database/index.ts` legacy DDL block | pre-migration installs create tables from this list |
| `utils/storage-usage.ts` `TABLE_CATALOG` | storage usage view labels every table |
| `voice-insights-store.ts` `clearInsights` | user-visible delete must clear it |
| privacy owner | deletes via `clearInsights`; telemetry is **not** exported as user content (it holds none) |

## Wrong vs correct

- Wrong: gate inside `streamDictation` only. Correct: gate inside `polish()`.
- Wrong: a settings knob for the threshold. Correct: constants with measured rationale; a user-facing
  "polish length" control is a second decision nobody asked for.
- Wrong: store the transcript to "analyse later". Correct: sizes, tier, outcome, latency — the gate
  question is a distribution question, not a text question.
- Wrong: emit the skip decision only to the log. Correct: log for operators, row for the numbers.

## Verification

- `vitest run src/main/modules/voice` — gate boundaries, no-provider-call on short input, `light`
  → natural prompt, retry parity, telemetry rows per outcome, no content in rows.
- `vitest run src/main/modules/database` — migration 0045 applies on top of the chain; `pragma_table_info`
  exposes the columns.
- `tsc --noEmit -p tsconfig.node.json --composite false` in `apps/core-app`.
- Real-data check (manual, no test): after a day of use, `summarizePolishTelemetry(30)` must show a
  non-zero `skipped-short` count whose character sizes match the gate, and `latencyMs.ran` must equal
  the number of sessions that actually called the provider in the logs.
