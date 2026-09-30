# TxCodeStream content-driven mode + TxStreamCode alias

Child of `.trellis/tasks/09-29-stream-element` (read its `prd.md` for D1–D9 and the full R/AC list).

## Goal

Upgrade `TxCodeStream` in place (D5): a content-driven mode where a growing `code` plus `streaming` streams word by word through the shared pacer inside highlighted lines, with the family caret; `revealedLines` mode unchanged; `TxStreamCode` exported as an alias.

## Requirements

Parent requirements owned here: R7; the R10 docs share for `code-stream`; R14/R15 as they apply to code.

## Acceptance Criteria

- [x] AC6 existing `code-stream*.test.ts` pass unchanged; new tests cover content-driven streaming, fresh-word wrapping inside highlighted lines, caret placement, the `TxStreamCode` alias.
- [x] `code-stream.{zh,en}.mdc` document the new mode, caret and alias; `CodeStreamLiveDemo` registered; nexus docs suite green; demo verified in ego.

## Dependencies

Requires `stream-text-foundation` (pacer, presets, caret). `stream-element-core` renders its code parts with this mode.

## Out of Scope

Everything the parent lists as out of scope; other children's requirements.
