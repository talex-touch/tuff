# TxStreamElement: markdown subset, delegation, citations, one clock, slots + hero showcase

Child of `.trellis/tasks/09-29-stream-element` (read its `prd.md` for D1–D9 and the full R/AC list).

## Goal

Build `TxStreamElement` (D1, D3, D4, D9): markdown or structured parts, the native subset rendered word by word, other spans delegated to `TxStreamMarkdown`, `[n]` citations as chips, one pacer across parts, `reserve` + `replay`, slots and state; plus its docs page opening with the AI answer showcase and its gallery cell.

## Requirements

Parent requirements owned here: R8, R11, the `TxStreamElement` gallery cell of R12, the R10 docs share for `stream-element`, R14, R15.

## Acceptance Criteria

- [ ] AC7 each D4 element renders natively; table / math / mermaid / html / image spans delegate; `[n]` becomes a chip only in text; one clock across parts; `reserve` + `replay`; every slot renders with state; `cite` emits the source.
- [ ] AC10 (hero + cell) verified in ego, dark + light: streaming, pause, done, replay, preset switch, chip → source; actions (thumbs via slot), sources stack, follow-ups appear only on done.
- [ ] AC11 budget measured in a real browser: concurrent animating words, per-tick scripting time for a 5,000-character answer, no layout shift in a `reserve` replay.
- [ ] AC12 `aria-busy` toggles, reserve layer hidden from the accessibility tree, chips focusable with names, copy yields the full answer.

## Dependencies

Requires `stream-text-foundation` and `code-stream-live`. `stream-markdown-motion` recommended first. `ai-answer-template` builds on this one.

## Out of Scope

Everything the parent lists as out of scope; other children's requirements.
