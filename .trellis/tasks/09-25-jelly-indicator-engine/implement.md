# Implement — 共享果冻指示器引擎

## 前置

- 读 `.trellis/spec/frontend/hook-guidelines.md`（composable / 生命周期）、`tuffex-design-rules.md` Motion 节、`quality-guidelines.md`。
- 调研：`../09-25-indicator-family-jelly/research/indicator-family.md` 第 6、7 节（Radio 结构与测试、reduced-motion 契约）。

## 步骤

1. [x] `utils/animation/jelly.ts`
   - `JellyScaleInput.travelAxis?: JellyAxis`；`'y'` 时转置行进形变。
   - `JELLY` 追加 design.md 表中的键（只追加，不改已有值）。
   - `JELLY_REFERENCE_MS = 350`、`jellySpring(durationMs)`。
   - `utils/__tests__/jelly.test.ts` 追加：`travelAxis: 'y'` 是 `'x'` 的转置；`jellySpring()` 默认等于 110 / 12、时长减半刚度 ×4 阻尼 ×2、非法值回落默认。已有断言不动。
2. [x] `utils/use-jelly-indicator.ts`：按 design.md 实现；`utils/index.ts` 导出。
3. [x] `utils/__tests__/use-jelly-indicator.test.ts`：用 `defineComponent` 宿主 + `vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','performance'] })`，覆盖 PRD 验收里列的每一条；`matchMedia` 用 stub 切换 reduced-motion。
4. [x] `radio/src/radio-group-indicator.ts` 迁移到引擎（返回值名字与形状不变）；`TxRadioGroup.vue` 仅在必要时改解构。
5. [x] 验证（在 `packages/tuffex` 内）：
   - `pnpm exec vitest run packages/utils/__tests__/jelly.test.ts packages/utils/__tests__/use-jelly-indicator.test.ts packages/components/src/radio packages/components/src/slider`
   - `pnpm exec eslint packages/utils/animation/jelly.ts packages/utils/use-jelly-indicator.ts packages/utils/index.ts packages/components/src/radio/src/radio-group-indicator.ts packages/utils/__tests__/use-jelly-indicator.test.ts packages/utils/__tests__/jelly.test.ts`
   - `pnpm exec vue-tsc --noEmit -p tsconfig.json`，只看改动文件相关报错（仓库基线已有无关报错时如实记录）。
   - `git diff --check`
6. [x] 重建 dist（`mkdir /tmp/tuffex-build.lock` 成功才构建，结束 `rmdir`；占用则等待）：`node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`。
7. [x] ego 浏览器（TaskSpace 31）：Radio 文档页 + base-suite 画廊 Radio 格子，四种指示器点击 / 拖拽 / 键盘切换，CDP `Animation.setPlaybackRate` 放慢录帧，与迁移前逐帧对比；控制台无新增报错。

## 回滚点

- 步骤 1–3 独立可回滚（纯新增 + 追加）。
- 步骤 4 单文件回滚：还原 `radio-group-indicator.ts`。

## Review gate

步骤 5 全绿、步骤 7 观感一致后，才开始 `09-25-tabs-indicator-redo` / `09-25-indicator-family-jelly` 的实现。

## 验证记录（2026-09-26）

- 单测：jelly / use-jelly-indicator / radio / slider 65 例（检查阶段后），连同 tabs 共 186 例全绿；vue-tsc 0 错误；eslint、`git diff --check` 通过。
- 检查 agent 在 jsdom 里对 HEAD 版 Radio 做了 36 个场景的逐帧对比（solid / outline / glass / blur / rigid / 高刚度 × 点击 / 途中改目标 / 键盘 / 拖拽）：translate / width / height 全部逐帧一致，34 个场景完整样式一致，其余 2 个差异来自已修的 settle 竞态。
- ego（TaskSpace 31）：画廊 Radio 点击切换逐帧录制，位置 / 宽度序列与迁移前逐帧相同，迁移后完整出现起步 1.145 → 行进 `scale(0.904, 1.557)` / `(0.814, 1.401)` → 越过落点挤压 → sink → 静止（迁移前那次因竞态整趟无拉伸）；拖拽到末项选中 "Month"、拖动中 `scale(0.672, 1.78)`；文档页 blur / glass 行进中截图正常（`/tmp/jelly-baseline/radio-*.png`）。
