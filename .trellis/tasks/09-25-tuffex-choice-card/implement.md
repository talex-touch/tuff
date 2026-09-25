# 实施计划：TxChoiceCard

## 步骤

1. `choice-card/src/types.ts`、`TxChoiceCard.vue`、`index.ts`（`withInstall`）。
2. 单测 + 样式契约测试（PRD 验收列表）。
3. 注册链：`components.ts`、`ai/index.ts`（字母位置）、`README.md` / `README_ZHCN.md` 清单与计数。
4. 构建 tuffex dist（`/tmp/tuffex-build.lock`，关闭 verify-deps；与 `09-25-tuffex-fusion-surface` 串行，不并发构建）。
5. nexus：`choice-card.{zh,en}.mdc`、三个 demo、`demo-registry.ts`、侧边栏 / 分类脚本 / 画廊格。
6. ego-browser（父任务同一个 TaskSpace）验证文档页亮 / 暗主题、键盘操作、分步切换动画。

## 验证命令

```bash
cd packages/tuffex
pnpm exec vitest run packages/components/src/choice-card packages/components/src/__tests__/suite-barrels.test.ts
pnpm typecheck && pnpm audit:readme && pnpm audit:cursor
pnpm exec eslint packages/components/src/choice-card

cd apps/nexus
node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs && node build/check-demo-registry-orphans.mjs
node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run test/docs/tuffex-component-docs-coverage.test.ts
```

## 风险

- 图标传类名时 nexus 侧不扫描 tuffex dist：demo 里只用 nexus 已安装的集合（carbon 等），并用 tuffex-docs-sync 里的脚本核对图标名存在。
- 与 fusion-surface 同时改 `components.ts` / README：两个子任务按顺序落地，第二个开工前先拉最新并重读这两个文件。
