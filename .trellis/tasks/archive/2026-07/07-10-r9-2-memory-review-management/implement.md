# Memory Review Management Execution

## Order

1. 扩展 typed list query 与 host SQLite search/filter；补 service tests。
2. 定义 host-only replace contract，执行 evaluate fingerprint/expected version 与原子 save+tombstone。
3. 扩展 Memory Review 搜索、筛选、来源 metadata 和编辑态。
4. 确保任意编辑都会失效旧 evaluation；仅 suggested + unchanged 暴露替换确认。
5. 补 conflict、重复点击、rejected/needs_review 和替换失败回滚 tests。
6. 同步 i18n、PRD/TODO 与 evidence 状态。

## Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-context-hygiene.test.ts" "src/renderer/src/components/intelligence/audit/IntelligenceMemoryReview.test.ts"
corepack pnpm -C "apps/core-app" exec eslint "src/renderer/src/components/intelligence/audit/IntelligenceMemoryReview.vue" "src/renderer/src/components/intelligence/audit/IntelligenceMemoryReview.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:web
corepack pnpm -C "apps/core-app" run typecheck:node
git diff --check
```

## Review Gates

- UI 不得直接拼两个调用模拟原子替换。
- 来源审计不得读取完整历史 turn/prompt/response。
- `needs_review` 在本任务仍是阻断状态，不新增敏感记忆审批流。

## Completion Evidence

- `ListMemoriesInput` 已完成 query/type/scope/status/offset/limit contract；SQLite 以稳定 `updated_at DESC, id ASC` 排序并用 limit+1 返回 `hasMore`。
- `contextReplaceMemory` 已贯通 shared SDK、tuff-intelligence mirror、CoreApp host handler 与 renderer；插件 facade 保持 host-only hard-cut。
- 替换在 `BEGIN IMMEDIATE` 事务内复核 `expectedUpdatedAt`，保存新项后禁用并 tombstone 旧项；fingerprint 不匹配、版本冲突或写入失败均 fail-closed/rollback。
- 替换关系持久化为旧 tombstone 的 `replaced-by:<newId>` reason，并在列表查询中安全派生新项的 `replacesMemoryId`；未执行 schema/data migration。
- Memory Review 已支持搜索筛选、分页、content/summary/tags/type/scope 编辑、来源 session/turn 与时间审计、任意字段修改后的 evaluation 失效、冲突刷新及重复确认 gate。
- CoreApp focused suites：3 files / 47 tests passed（service 28、renderer 13、host boundary 6）。
- Utils SDK suites：2 files / 44 tests passed；tuff-intelligence event suite：1 file / 2 tests passed。
- `typecheck:web` 与 `typecheck:node` passed；focused ESLint completed；中英文 locale JSON parse 与新增 key checks passed。
