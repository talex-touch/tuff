# Implement — CoreBox 搜索中棱镜光

前置：`09-25-tuffex-prism-glow` 的组件源码（`prism-glow/index.ts` 与 `src/TxPrismGlow.vue`）已落地。

## Checklist

1. [x] 门控、sr-only 状态、降级文字、`minDuration` 400（第一版已完成，并通过静态验证）
2. [ ] `CoreBox.vue`：
   - 删除 `import SearchPulse from './SearchPulse.vue'`，改为 `import { TxPrismGlow } from '@talex-touch/tuffex/prism-glow'`；
   - 模板里 `<SearchPulse :active="showSearchPulse" />` 换成 `<TxPrismGlow class="CoreBox-SearchGlow" :active="showSearchPulse" :intensity="…" />`；
   - 新增 `.CoreBox-SearchGlow` 定位样式。
3. [ ] 删除 `views/box/SearchPulse.vue`
4. [ ] 截帧调 `intensity`（暗色 / 亮色），标准是占位文字始终清晰
5. [ ] 验证（见下）；临时文件全部删除

## Validation

仍然直接调二进制，不走 `pnpm run` / `pnpm check`（原因见父任务说明：verify-deps 自动 install，`typecheck:web` 会重建共享的 tuffex dist）。

```bash
cd apps/core-app
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false
node_modules/.bin/eslint src/renderer/src/views/box/CoreBox.vue
node_modules/.bin/prettier --check src/renderer/src/views/box/CoreBox.vue
node_modules/.bin/vitest run src/renderer/src/views/box
cd ../.. && node scripts/check.mjs coreapp-ui-contract
git diff --check -- apps/core-app/src/renderer/src/views/box/CoreBox.vue
```

- **门控**：把 `/tmp/search-pulse-harness/search-pulse-gating.test.ts`（选择器改成 `.CoreBox-SearchGlow` / `.tx-prism-glow__field`）拷进 `apps/core-app/tmp/` 跑一次，跑完立即删除。
- **视觉**：harness 使用 CoreBox 头部结构和 `TxPrismGlow` 的编译产物，在 ego 截帧。
- **真机（可选）**：dev Electron 的 CDP 9333。附加前先告知 peer。

## Rollback points

只回退本任务在 CoreBox.vue 里的几处改动，不整文件覆盖。提交时只暂存本任务的文件。
