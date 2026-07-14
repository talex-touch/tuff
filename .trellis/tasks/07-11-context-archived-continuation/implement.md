# Archived Context Continuation Execution Plan

## Order

1. Add canonical metadata-only continuation types and mirror assertions.
2. Refactor host session resolution so inactive/missing continuation always uses a fresh generated session id and checkpoint metadata.
3. Resolve safe snapshot/legacy summaries and inject at most one summary item into the new ContextPackage.
4. Project continuation metadata through invoke/stream summaries and the official plugin widget.
5. Update focused tests, then run validation and synchronize R9.2 follow-up docs.

## Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/ai/intelligence-context-hygiene.test.ts" \
  "src/main/modules/ai/intelligence-context-execution.test.ts"
corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/transport-domain-sdks.test.ts" \
  "__tests__/intelligence-client-hard-cut.test.ts"
corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"
corepack pnpm -C "plugins/touch-intelligence" run build
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
```

Run focused ESLint on touched TypeScript/JavaScript/Vue files and task-slice `git diff --check`. Global diff failures from unrelated dirty paths must be recorded, not silently rewritten.

## Review Gates

- No source-session raw turn, MemoryItem, prompt, response, summary text, or secret in the continuation metadata contract/widget payload.
- No owner/actor bypass and no source-session mutation.
- CompressionSnapshot policy remains the single validator; no second permissive summary convention.
- Missing/blocked summary does not fail open into raw history.
- Unit/controlled evidence is not labeled packaged/real-profile.

## Completion Evidence

- `resolveSession()` 现在区分 active/fresh 与 archived/expired/idle/missing continuation；后四类使用生成的新 session id，checkpoint/session metadata 仅写 `continuedFromSessionId` 与 `continuationReason`，不修改 source session。
- `resolveContinuation()` 优先既有 policy-valid CompressionSnapshot，无 snapshot 时只接受 secret-free legacy summary；blocked/missing/read-failed 与 no-history/token-prune 均为 metadata-only excluded/unavailable，不回退 raw turns/Memory。
- `ContextContinuationSummary` 已由 `packages/utils` canonical type 定义并经 `packages/tuff-intelligence` re-export；invoke/stream 返回 source/reason/status/type/id metadata，不返回摘要正文。
- 官方 `touch-intelligence` 只 whitelist continuation/checkpoint 字段，widget 将 archived/expired/idle/missing reason 显示为可理解边界状态；canonical build 已同步到 CoreApp bundled seed。
- Focused validation：CoreApp 2 files / 59 tests、plugin facade 1 file / 42 tests、utils SDK 2 files / 46 tests、official plugin seed delivery 2 files / 8 tests passed。
- `touch-intelligence` production build、`typecheck:node`、`typecheck:web` passed；CoreApp/utils/tuff-intelligence/plugin focused ESLint `--quiet` 无 error；task-slice `git diff --check` passed。
- 未执行 SQLite schema/data migration；未采集新的 packaged Electron 或 real-profile evidence，相关层级保持 open。全局 `git diff --check` 的 Nexus 非本任务 whitespace 既有问题未改写。
