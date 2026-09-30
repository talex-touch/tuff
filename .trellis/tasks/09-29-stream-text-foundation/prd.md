# StreamText foundation: presets, tokens, segmenter, pacer, logo caret, TxStreamText

Child of `.trellis/tasks/09-29-stream-element` (read its `prd.md` for D1–D9 and the full R/AC list).

## Goal

Ship the shared foundation of the StreamElement family and its text primitive: reveal presets and tokens, word segmentation, the pacer, the Tuff-logo caret, and `TxStreamText`, with its docs page, demos and gallery cell.

## Requirements

Parent requirements owned here: R1 reveal presets + tokens, R2 word units, R3 pacer, R4 caret, R5 state + slots, R6 `TxStreamText`; the R10 registration/docs share for `stream-text`; the R12 `TxStreamText` gallery cell; R14/R15 as they apply to text.

## Acceptance Criteria

- [x] AC1 presets, tokens (light/dark/high-contrast), code variant, reduced-motion finished frame, second-keyframe replay — pinned by tests. *Replay restarts by remounting the words instead of a second keyframe name — `design.md`.*
- [x] AC2 segmenter: Chinese, English, mixed, emoji, punctuation, whitespace, no-`Intl.Segmenter` fallback.
- [x] AC3 pacer with fake clock/rAF: cadence, lag ≤ `maxLagMs`, drain ≤ `drainMs`, paused detection, `replay`, `skip`, reduced motion, server.
- [x] AC4 caret: zero inline size, `aria-hidden`, retract on done, still frame under reduced motion; `caret` slot receives `{ state }`; `state-change` sequence asserted.
- [x] AC5 `TxStreamText`: only new words mount animated, settled words collapse to text, rewrites animate only the changed suffix, SSR output has no animated spans.
- [x] `stream-text` registration chain complete; nexus docs suite (coverage contract) green; the page and gallery cell verified in ego (dark + light, presets, pause, retract).

## Dependencies

None. Children `code-stream-live`, `stream-markdown-motion` and `stream-element-core` build on this one.

## Out of Scope

Everything the parent lists as out of scope; other children's requirements.
