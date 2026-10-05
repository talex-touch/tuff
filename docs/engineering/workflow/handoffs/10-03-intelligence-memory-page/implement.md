# Implement — 记忆独立子页

## 清单

1. [ ] `memory-scope.ts` + 单测（五种情况）。
2. [ ] 从 `IntelligenceMemoryReview.vue` 拆出 `MemoryEditor.vue`（逻辑原样），再写 `MemoryList.vue`、`MemoryDetail.vue`。
3. [ ] `IntelligenceMemoryPage.vue`：split 编排、防抖搜索、筛选、分页、选中、删除确认（`TxBottomDialog`）。
4. [ ] 注册：`categories.ts`（位置按 D5 与兄弟任务当时状态）、`router.ts` `childLoaders`、`uno.config.ts` safelist。
5. [ ] 文案：hub / router / 页面键，中英同步；「记忆审核」「记忆复核」统一为「记忆」。
6. [ ] 测试迁移：`IntelligenceMemoryReview.test.ts` 的用例逐条迁到新组件测试，补删除确认、替换后选中、冲突、`onActivated` 刷新；删除旧组件与旧测试。
7. [ ] 从审计页移除记忆复核块。若审计页子任务尚未开始，只删 `IntelligenceAuditPage.vue:66-75` 那一块并核对引用。
8. [ ] 真机：侧栏顺序与高亮、图标、直链、删除流程，截图存 `evidence/`。

## 验证

```bash
pnpm -C "apps/core-app" run typecheck:web
pnpm -C "apps/core-app" exec vitest run \
  "src/renderer/src/components/intelligence/memory" \
  "src/renderer/src/modules/settings/categories.smoke.test.ts" \
  "src/renderer/src/views/base/settings/categories/SettingIntelligencePage.test.ts" \
  "src/renderer/src/components/shell/ShellSidebar.test.ts" \
  "src/renderer/src/modules/lang/translation-coverage.test.ts"
pnpm check coreapp-ui-contract
rg -n "IntelligenceMemoryReview" apps/core-app/src   # 期望 0
git diff --check
```

- `router.ts` 的 `childLoaders` 漏加会让 renderer 启动即抛错且无测试覆盖：真机启动一次 dev 实例并进入页面，作为这一项的唯一证据。

## 回滚

revert 即可，记忆复核回到审计页（审计页子任务未落地时）。若审计页已重做，revert 后记忆只能经旧组件恢复，届时需一并 revert 审计页的移除。
