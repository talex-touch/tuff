# Implement — CoreBox 下键跳到最后一个文件

## Checklist

1. [ ] R1：`useSearch.ts` 两处加 `boxOptions.focus > 0` 判断：`case 'update'` 里的 `focusedItemId`（原 :1110），以及 `executeSearch` 里的 `selectedItemId`（原 :1201-1203）。行号以当前文件为准，先读再改。
2. [ ] R4：`CoreBox.vue` 新增焦点可见性维护：
   - `res` 变化前（`flush: 'pre'`）记下当前选中行是否在视口内；
   - 更新后（`flush: 'post'`）分两种情况：
     - focus 因新查询重置为 0 → 立即滚回顶部；
     - focus 因重排跟随 id 换了下标，且重排前那一行在视口内 → 调用现有的 `scrollActiveItemIntoView()`（瞬时、最小滚动）。
   - 用户自己用滚轮把选中行滚出视口时不要把视图拽回来。
   - 键盘路径已经会滚动，不要重复触发平滑滚动。
3. [ ] 回归单测（老板已同意加）：
   - `useSearch.rank.test.ts`：
     - 默认第 0 行在后到批次超过它时保持 0；
     - 低分快层项不把默认选中拖到最后一行。
   - `useSearch.core.test.ts`：索引提交刷新（`preserveSelection`、focus 0）不改变 focus。现有 focus = 1 的 preserve 用例保持通过。
   - R4：在 `CoreBox.result-switch.test.ts` 的挂载框架里断言：
     - 结果替换且 focus 重置时会滚回顶部；
     - 被跟随的行重排前可见时会调用滚动，重排前不可见时不调用。
4. [ ] 验证（见下）。

## Validation

直接调二进制，不走 `pnpm run` / `pnpm check`：

```bash
cd apps/core-app
node_modules/.bin/vitest run src/renderer/src/modules/box/adapter/hooks/useSearch.rank.test.ts src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts src/renderer/src/modules/box/adapter/hooks/useKeyboard.test.ts src/renderer/src/views/box
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false
node_modules/.bin/eslint <changed files>
node_modules/.bin/prettier --check <changed files>
git diff --check -- <changed files>
```

- 复现对照：`/tmp/kbjump/`（调研留下的 harness，场景 A / B / F / G / H）改用仓库里的新代码再跑一遍。修复后 A / B / F / H 的 focus 保持 0，按 ↓ 变 1；G 跟随同一项。
- 真机：需要在 CoreBox 里输入，会干扰共享的 dev 实例，所以留给老板手动验证：⌘E 输入 `pdf`，等两批结果到齐，按 ↓ 应该到第 2 行。

## Notes

- `CoreBox.vue` 里已有搜索光效任务（`09-25-corebox-search-pulse-beam`）未提交的改动，不要动那些行；提交时两个任务分开暂存。
- 共享工作树：不要 `git add -A`，也不要跑 `pnpm install`。
