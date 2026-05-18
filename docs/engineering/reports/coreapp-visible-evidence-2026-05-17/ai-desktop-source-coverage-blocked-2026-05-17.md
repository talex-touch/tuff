# AI Desktop Source Coverage Blocker

> Date: 2026-05-17
> Scope: CoreBox AI Ask, OmniPanel Writing Tools, Workflow Use Model Review Queue.
> Status: blocked, source/UI-helper coverage only.

This artifact records source-level progress for the AI desktop entry surfaces. It is not a screenshot, recording, packaged Electron DOM capture, or real workflow/provider run. It must not be used to mark the visible-experience surfaces as passed.

## Source Coverage

- CoreBox AI Ask preview source now shows status tone, pending/ready/error hints, provider metadata, copy failure visibility, and metadata-pending fallback.
- OmniPanel Writing Tools preview source now shows selected-context preview, running/ready/failed/confirming status details, labeled capability/provider/model/latency metadata chips, inline clipboard action failures, retry, copy, replace, and replace confirmation.
- Workflow Review Queue source now shows pending/copied/clipboard-replaced/failed filters, copy/replace confirmation, retry labels, clear-failure recovery, and labeled capability/provider/model/trace/latency/token/risk/failure metadata chips.

## Focused Verification

```bash
pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts" "src/renderer/src/views/omni-panel/ai-actions.test.ts" "src/renderer/src/views/omni-panel/selection-recovery.test.ts" "src/renderer/src/components/render/custom/core-intelligence-answer.test.ts" "src/renderer/src/modules/intelligence/ai-error-recovery.test.ts"
pnpm -C "apps/core-app" exec eslint "src/renderer/src/modules/hooks/useWorkflowEditor.ts" "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts" "src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue" "src/renderer/src/views/omni-panel/OmniPanel.vue" "src/renderer/src/views/omni-panel/ai-actions.ts" "src/renderer/src/views/omni-panel/ai-actions.test.ts" "src/renderer/src/components/render/custom/CoreIntelligenceAnswer.vue" "src/renderer/src/components/render/custom/core-intelligence-answer.ts" "src/renderer/src/components/render/custom/core-intelligence-answer.test.ts"
```

Latest local result: focused tests and file-level ESLint passed on 2026-05-17.

## Blocking Evidence Gap

- CoreBox AI Ask still lacks a packaged Electron answer preview capture with provider/model/latency/trace/input metadata and a recoverable failure state.
- OmniPanel Writing Tools still lacks a packaged Electron capture showing selected text context, available writing actions, AI result preview, copy/replace/retry actions, and replace confirmation.
- Workflow Use Model / Review Queue still lacks a packaged Electron workflow run capture showing Use Model output entering Review Queue, status filters, runtime cost signals, failed copy/replace recovery, and clear-failure action.

## Required Follow-Up

Rebuild or otherwise run a packaged artifact that contains the source changes, capture these three surfaces through packaged Electron CDP or an equivalent real desktop UI path, then replace this blocker with real visual artifacts and DOM evidence.
