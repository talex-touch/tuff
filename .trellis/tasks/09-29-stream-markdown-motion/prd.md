# TxStreamMarkdown: shared reveal presets + logo caret + live gallery cell

Child of `.trellis/tasks/09-29-stream-element` (read its `prd.md` for D1–D9 and the full R/AC list).

## Goal

Align `TxStreamMarkdown` with the family look (D1, D2, D8) without changing its pipeline: shared reveal presets for fresh chunks and new blocks (optional `reveal` prop), the logo caret replacing the orb, a live replayable StreamMarkdown gallery cell, updated docs — and verify the production chat (HomePage) in the running app.

## Requirements

Parent requirements owned here: R9; the StreamMarkdown part of R12; the R10 docs share for `stream-markdown`.

## Acceptance Criteria

- [x] AC8 existing stream-markdown tests green; style-contract tests pin the preset classes, the removed orb and the caret position (inline and fence cases).
- [x] The StreamMarkdown gallery cell streams and replays on the specimen reset (verified in ego, dark + light).
- [x] HomePage in an isolated core-app dev instance streams, pauses and finishes with the new reveal and caret (parent `implement.md` §5); evidence recorded in this task.

## Dependencies

Requires `stream-text-foundation` (presets, tokens, caret). Independent of `code-stream-live`. Recommended before `stream-element-core` so delegated blocks already match.

## Out of Scope

Everything the parent lists as out of scope; other children's requirements.
