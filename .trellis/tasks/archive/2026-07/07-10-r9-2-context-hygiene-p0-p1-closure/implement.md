# R9.2 ContextHygiene P0/P1 Execution Plan

## Order

1. Complete and verify `r9-2-memory-governance-scope`.
2. Complete `r9-2-context-execution-corebox` on top of the safe governance boundary.
3. Complete `r9-2-memory-review-management` and `r9-2-compression-snapshot`; these may proceed independently after task 1.
4. Complete `r9-2-entrypoints-evidence` after tasks 2-4.
5. Run parent-level completion audit against every acceptance criterion.

## Gates

- Before any Memory scope schema/data migration: present AGENTS dangerous-operation confirmation with affected tables, existing-row policy and rollback plan.
- Do not start R9.3/R9.4 or R8 Phase 3 in this task tree.
- Do not mark P0/P1 complete from focused tests alone when packaged/real evidence is required.

## Parent Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-context-hygiene.test.ts" "src/renderer/src/components/intelligence/audit/IntelligenceMemoryReview.test.ts" "src/renderer/src/components/intelligence/audit/context-package-log-summary.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts" "__tests__/intelligence-client-hard-cut.test.ts"
corepack pnpm -C "packages/tuff-intelligence" exec vitest run "src/transport/event/builder.test.ts"
corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:web
corepack pnpm -C "apps/core-app" run typecheck:node
git diff --check
```

Add entrypoint-, compression- and evidence-specific commands in child tasks as those files are selected.

## Review Checklist

- No prompt/response, secret or sensitive content in logs/evidence/package logs.
- No raw IPC or plugin host-memory bypass.
- ContextPackage content affects model input only through the host-owned assembler.
- Scope filters are exact and fail closed.
- Automatic long-term memory remains off.
- Documentation distinguishes partial, controlled evidence and packaged completion.

## Completion Evidence

- 6/6 child tasks completed：memory governance/scope、host context execution/CoreBox、Memory Review、CompressionSnapshot、multi-entrypoint/evidence、CoreBox AI dispatch idempotency。
- Parent focused CoreApp validation：9 files / 128 tests passed；utils SDK mirror：2 files / 46 tests passed；plugin facade：1 file / 42 tests passed；tuff-intelligence typed event builder：1 file / 2 tests passed。
- CoreApp `typecheck:node` 与 `typecheck:web` passed；entrypoint task 12 个 TS/TSX 文件 focused ESLint 0 errors / 0 warnings；parent/task slice `git diff --check` passed。
- 全局 `git diff --check` 仍仅报告 Nexus 既有、非本任务的 blank-line/trailing-whitespace 变更；按 dirty-worktree 边界未改写用户工作。
- Entrypoint evidence verifier：7 cases / 6 passed / 1 real-profile open；unit、controlled、packaged 均有 passed case，packaged entrypoints 为 CoreBox + Assistant + Workflow + OmniPanel，privacy scan passed。
- macOS arm64 packaged Electron isolated profiles 证明 CoreBox `new / retrieval`、Assistant/OmniPanel `new / light` 与 Workflow per-run `new / session`；受控操作均保持单次 Provider dispatch。真实用户 profile 未采集，不宣称 production completion。
- 未执行 SQLite schema/data migration；workspace/project memory 缺失 `scopeRef` 继续 fail-closed，自动长期 memory 继续关闭。
