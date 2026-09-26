# Implement — CoreBox 搜索脉冲语义修正

## Checklist

1. [ ] `useSearch.ts`：新增 `hasFreshResults` / `awaitingFirstResults` / `searchSettling`，按 design.md 的转换表落点；导出。
2. [ ] `adapter/types.ts`（若声明 hook 返回接口）补两个字段。
3. [ ] `CoreBox.vue`：`showSearchProgress` 改绑 `awaitingFirstResults`；新增 `showSearchSettling`；状态文案分支 + `.CoreBox-SearchStatus--settling` 样式。
4. [ ] i18n：`zh-CN.json` / `en-US.json` 在 `"searching"` 行后各加一行 `"searchingMore"`，不动其他行。
5. [ ] 测试：在 `useSearch.core.test.ts` 旁新增 `useSearch.pulse.test.ts`，覆盖 prd 的三条断言。
6. [ ] 验证命令：
   - `pnpm -C apps/core-app exec vitest run src/renderer/src/modules/box/adapter/hooks/useSearch`
   - `pnpm -C apps/core-app run typecheck:web`
   - `git diff --check`
7. [ ] 真实 dev 应用目测（CDP 或人工）：应用上屏后光晕熄灭；弱提示出现于文件层补充期间。

## Review gates

- 变更不得触碰 `loading` 的赋值语义。
- lang JSON diff 必须恰好 +1 行 / 文件。

## Rollback

- 还原 `CoreBox.vue` 两处绑定即可恢复旧行为。
