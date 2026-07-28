# Fix packaged workflow structured clone

## Goal

Make packaged Intelligence Workflow execution cross the renderer transport and persist a fresh built-in workflow clone without Vue proxy or step-primary-key failures.

## Requirements

- `buildWorkflowDefinition()` must return an Electron structured-cloneable `WorkflowDefinition`; no Vue proxy may escape through `toolSources` or another outbound field.
- Packaged workflow save/run dispatch must preserve the selected tool-source values and existing workflow schema.
- New or built-in-derived workflows must receive workflow-scoped step IDs before persistence; `previousStep` input references must follow regenerated IDs.
- The fix must not add a transport/channel/schema compatibility layer.

## Acceptance Criteria

- [x] A workflow definition produced from the reactive editor draft passes `structuredClone()` and preserves `toolSources` values.
- [x] Focused workflow editor tests pass.
- [x] A fresh-profile packaged built-in workflow run no longer fails with `An object could not be cloned` or an `intelligence_workflow_steps.id` conflict; it reaches a terminal workflow status or a provider/domain availability result after persistence.

## Notes

- Lightweight bug fix; PRD-only execution is sufficient.
- Reproduction: packaged `v2.4.13-beta.4` Workflow page → built-in `文本批处理` → `运行` emitted `[TuffTransport] Failed to send "intelligence:workflow:run": An object could not be cloned.`
- Follow-up reproduction after the clone fix: the request reached main, then built-in `process-text-batch` collided with the globally keyed `intelligence_workflow_steps.id` row during clone persistence.

## Completion Evidence

- `useWorkflowEditor.test.ts`: 12/12 passed, including structured-clone and workflow-scoped step/reference regressions.
- CoreApp renderer web typecheck and focused ESLint passed.
- `electron-vite build` and isolated macOS arm64 `electron-builder --dir` package passed; afterPack verified both official plugin seeds.
- Fresh isolated packaged profile ran built-in `文本批处理` through persistence to terminal `failed` with explicit `[Intelligence] No enabled providers for text.chat`; clone and step insert errors were absent.
- Evidence boundary: this closes generic Workflow transport/persistence execution only, not provider success or Workflow owner/scope context packaged evidence.
