# Templates page: AI answer (multi-turn in TxConversationStream)

Child of `.trellis/tasks/09-29-stream-element` (read its `prd.md` for D1–D9 and the full R/AC list).

## Goal

Add a Templates (Blocks) page "AI answer" (D6-3): a multi-turn Q&A where each assistant turn streams through `TxStreamElement` inside a real `TxConversationStream`, following the templates contract.

## Requirements

Parent requirements owned here: R13.

## Acceptance Criteria

- [x] `template-ai-answer.{zh,en}.mdc` + `TemplateAiAnswerDemo.vue` complete the registration chain and page contract of `nexus-docs-templates.md` §2–§3; globally unique item keys; streaming starts on `@enter`.
- [x] Verification per `nexus-docs-templates.md` §8 in ego, dark + light; nexus docs suite and gates green.

## Dependencies

Requires `stream-element-core`.

## Out of Scope

Everything the parent lists as out of scope; other children's requirements.
