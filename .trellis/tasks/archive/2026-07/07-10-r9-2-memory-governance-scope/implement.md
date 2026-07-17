# Memory Governance And Scope Execution

## Order

1. 补 disabled/tombstoned/expired/privacy/scope mismatch 的 service regression tests。
2. 将 usable-memory 过滤集中到单一 helper，并增加 invoke 前最终复核。
3. 拆分 plugin-facing 与 host-only Intelligence capability，补 SDK mirror/permission tests。
4. 先落 workspace/project fail-closed，不改 schema。
5. 如确需 `scopeRef` schema/data migration，提交 preflight、旧数据策略与 rollback，并等待老板显式确认后再执行。
6. 更新 R9.2 文档状态和 child acceptance evidence。

## Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-context-hygiene.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts" "__tests__/intelligence-client-hard-cut.test.ts"
corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
git diff --check
```

## Review Gates

- 不能通过扩大 `intelligence.basic` 或把 Memory 原文交给插件来解决兼容问题。
- schema/data migration 前必须暂停并请求危险操作确认。
- 回归必须覆盖 delete-vs-prepare/invoke 竞态，而不只覆盖列表隐藏。

## Completion Evidence

- CoreApp memory filtering/tombstone/scope suite: 23/23 tests passed.
- Utils typed SDK and hard-cut boundary suites: 44/44 tests passed across 2 files.
- Plugin-facing intelligence boundary suite: 41/41 tests passed.
- CoreApp node typecheck passed.
- No schema/data migration was executed; the explicit preflight/rollback/confirmation gate remains intact.
