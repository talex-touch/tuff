# Design — pi context adaptation

## D1. Date injection (`pi-cli-runtime.ts`)

`buildPiPrompt(messages, options?: { toolsGranted?: boolean; now?: Date })` prepends to the
chosen base prompt one line, before caller-supplied system parts:

`Current date: Thursday 2026-08-07, timezone Asia/Shanghai (UTC+08:00). Trust this over any
internal assumption about the date.`

Rendered from `options.now ?? new Date()` via `Intl.DateTimeFormat` (en-US weekday, ISO date,
resolved timeZone + numeric offset). English on purpose — the system prompt is already English;
the model answers in the user's language regardless. Injecting here (not `buildHomeInjection`)
survives Auto Context being off — providers other than pi are out of scope by construction.

## D2. Compaction part events

Union extension in BOTH mirrors (`packages/tuff-intelligence/src/types/intelligence.ts`,
`packages/utils/types/intelligence.ts`):

```ts
| { kind: "compaction-start"; reason?: string }
| { kind: "compaction-end" }
```

- `parsePiCliLine`: `compaction_start` → `{ partEvent: { kind: 'compaction-start', reason } }`;
  `compaction_end` → `{ partEvent: { kind: 'compaction-end' } }`. `summarization_retry_*` stays
  unparsed (rare; logged at debug by the existing fall-through).
- Provider: the existing `partEvents` pass-through already forwards unknown kinds untouched.
- Renderer (`useHomeConversation.ts`): `compaction-start` → `meta.compactions = (n ?? 0) + 1`
  and a reactive `compacting` flag on the message (transient field, excluded from persistence by
  virtue of living in a module ref keyed off the active assistant — NOT stored on the message);
  `compaction-end` and `conclude()` clear it. These events do not flip `received` (a compaction
  with zero deltas must not disable the non-streaming fallback).
- HomePage: while the active assistant is compacting, render a quiet status row (same visual
  weight as the thinking orb label): `home.compacting` = "正在压缩上下文…" / "Compacting context…".
- Side panel: show `meta.compactions` when > 0 (existing meta table pattern).

## D3. Transcript budget (`buildPiPrompt`)

`PI_CLI_TRANSCRIPT_CHAR_BUDGET = 96_000` (~24k tokens at 4 chars/token — roomy for chat, far
under every routed model's window; compaction inside pi still covers the tool-loop blowup case).

Walk `turns` newest→oldest accumulating `content.length`; stop before the turn that overflows.
The newest turn is always kept even if it alone exceeds budget. If anything was dropped, prepend
to the transcript: `[Earlier context: N older turns omitted to fit the context window.]` — and
keep the system prompt untouched. Attachments unaffected (they ride only the newest turn today).

## D4. Tests

`pi-cli-runtime.test.ts`: fixed `now` → exact date line; budget: 0-drop, drop-some (marker + count),
single-giant-turn kept; parse: both compaction lines (+reason), unknown compaction-ish types
still null. Renderer: part-event handler unit — count increments, flag clears on end/conclude.

## Compatibility

New union members are additive; `partEvent` consumers switch on `kind` and ignore unknowns
(verify the two switch sites: useHomeConversation `handlePartEvent`, tool-gateway session
consumer if it switches exhaustively — add default no-ops if a `never` check would break).
