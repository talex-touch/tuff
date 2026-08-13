# 执行计划：TuffEx 骨架原语基座与存量收敛

命令一律在 `packages/tuffex/` 下执行，除非另行标注。

| 用途 | 命令 |
|---|---|
| 单测 | `pnpm --filter @talex-touch/tuffex test` |
| 类型 | `pnpm --filter @talex-touch/tuffex typecheck` |
| Lint | `pnpm --filter @talex-touch/tuffex lint` |
| 构建（体积门禁前置） | `pnpm --filter @talex-touch/tuffex build` |
| 体积审计（读 `dist/`，须先 build） | `pnpm --filter @talex-touch/tuffex audit:size` |
| 导出审计 | `pnpm --filter @talex-touch/tuffex audit:exports` |

---

## 阶段 0 · 基线固化 `[必做，先于一切改动]`

- [ ] 0.1 记录改动前基线：`test` / `typecheck` / `lint` 各跑一次，**把当前失败项记下来**。仓库已知存在先前就红的门禁（体积预算自 6 月起为红），不得把既有红误判为本次回归。
- [ ] 0.2 `git status` 确认工作区状态。本仓库存在多 agent 并发写入：**验证时严禁 `git stash` / `checkout` / `restore`**，需要对照原文件时用 `git show HEAD:<path> > <path>` 单文件取回。

**回滚点 R0**：此时尚无改动。

---

## 阶段 1 · 动画收敛与 reduced-motion `[风险最高，优先做]`

先做这一步是因为 design.md 第 3 节的 scoped keyframes 风险会决定后续实现方式；若留到最后才发现动画失效，`TxRowSkeleton` 可能要返工。

- [ ] 1.1 在 `packages/components/style/` 新增共享骨架样式片段：单一 `@keyframes tx-skeleton-shimmer` + 应用它的 mixin/placeholder，内含 `@media (prefers-reduced-motion: reduce) { animation: none }`。
- [ ] 1.2 **立刻验证 scoped 风险**：让 `TxCardSkeleton`（scoped）改用共享 keyframes，实际渲染确认动画仍生效。
  - 若引用被 scoped 重写导致失效 → 改用非 scoped 全局片段或组件内 `:deep`/全局块，**在此处记录实测结论**再继续。
  - 这是本任务最容易静默失效的点，不要靠推断，要看到动画真的在动。
- [ ] 1.3 四个组件（`TxSkeleton` / `TxCardSkeleton` / `TxListItemSkeleton` / `TxLayoutSkeleton`）全部改用共享动画，删除各自的 `tx-card-skeleton-shimmer`、`tx-skeleton-pulse` 定义，统一时长。
- [ ] 1.4 补 reduced-motion 单测：mock `matchMedia` 断言四个组件动画停止且**骨架本体仍渲染**（不得整体隐藏）。
- [ ] 1.5 验证：`grep -rn "@keyframes.*skeleton" packages/` 应只剩单一定义。
- [ ] 1.6 跑 `test` + `lint`，既有 `skeleton/__tests__`、`layout-skeleton/__tests__` 须全绿。

**审查门 G1**：动画单一来源 + reduced-motion 生效 + 既有测试无回归。未过不进阶段 2。
**回滚点 R1**：仅样式片段与四个组件的 style 块被改，可整体回退。

---

## 阶段 2 · `TxRowSkeleton` 原语

- [ ] 2.1 新建 `src/skeleton/src/TxRowSkeleton.vue`，实现 design.md §2.1 的 `RowSkeletonProps`（`rows` / `leading` / `description` / `trailing` / `titleWidth` / `descWidth`）。
- [ ] 2.2 宽度序列用**确定性**取模，不用随机数（随机会让快照测试不稳定）。
- [ ] 2.3 几何默认值对齐实测的 `SettingRow`：`padding: 12px 16px`、文本列 `gap: 3px`。令牌接口按 design.md §2.2 表格实现，全部带 `--tx-*` 回落。
- [ ] 2.4 **不渲染卡片 border/background**（外壳由 `SettingSection` 提供，避免双层卡片）。
- [ ] 2.5 保持 `aria-hidden`（与既有 `TxSkeleton` 一致）。
- [ ] 2.6 类型写进 `src/skeleton/src/types.ts`；`src/skeleton/index.ts` 补 `withInstall` 导出与类型导出。`src/components.ts` 已有 `export * from './skeleton/index'`，无需改。
- [ ] 2.7 评估是否需登记 `missing-export.contract.ts`：**仅当**新公开类型会被文档 advertise 才登记；照该文件自身的维护规则判断，不要无脑加。
- [ ] 2.8 单测：props 组合渲染、令牌覆盖生效、`rows` 行数正确、无卡片外壳。
- [ ] 2.9 跑 `test` + `typecheck` + `lint` + `audit:exports`。

**审查门 G2**：AC1 / AC2 达成，导出审计通过。
**回滚点 R2**：新增文件 + `skeleton/index.ts` 增量导出，删除即回退。

---

## 阶段 3 · `useDeferredLoading` 防闪烁

- [ ] 3.1 新建 `src/skeleton/src/use-deferred-loading.ts`（就近放置，同 `stream-markdown/src/use-block-stream.ts` 约定）。
- [ ] 3.2 实现 design.md §4 语义：`delay` 内结束则骨架从不显示；已显示则保持到 `minDuration`。默认 `delay: 150` / `minDuration: 400`。
- [ ] 3.3 组件卸载时清理定时器（`onScopeDispose` / `onUnmounted`），避免泄漏。
- [ ] 3.4 从 `src/skeleton/index.ts` 导出。
- [ ] 3.5 单测（vitest 假定时器）覆盖三条路径：① 快返回不显示 ② 慢返回显示 ③ 显示后提前结束仍保持最短时长。
- [ ] 3.6 跑 `test` + `typecheck`。

**审查门 G3**：AC7 达成，三条时序路径均有测试。
**回滚点 R3**：新增文件 + 一行导出。

---

## 阶段 4 · CoreApp 组合层与存量收敛

- [ ] 4.1 新建 `apps/core-app/src/renderer/src/components/settings/SettingSkeleton.vue`，按 design.md §2.3 接收 `groups` 声明，组合 `SettingSection` + `TxRowSkeleton`，注入 `--shell-*` 派生的令牌值。
- [ ] 4.2 **实测 AC3**：在 `SettingSection variant="card"` 内渲染，确认 ① 无双层边框 ② 行高与真实 `SettingRow` 一致。以单测断言或截图比对佐证，不接受肉眼「差不多」。
- [ ] 4.3 `StoreDetailSkeleton.vue` 内部改用共享原语，删除自有 `@keyframes`；**保留文件本身**（语义命名的组合层），不删除，避免波及消费方。
- [ ] 4.4 `CapabilitySkeleton.vue` 同上。
- [ ] 4.5 `ProviderSkeleton.vue` 同上（当前为纯手搓 div，连 tuffex 组件都未引用）。
- [ ] 4.6 验证三个文件内不再出现自定义 `@keyframes`。
- [ ] 4.7 CoreApp 侧跑 `npm run typecheck`（在 `apps/core-app/`）与根 `pnpm lint`。

**审查门 G4**：AC3 / AC6 达成。
**回滚点 R4**：四个 CoreApp 文件，逐文件可回退。

---

## 阶段 5 · 收尾验证

- [ ] 5.1 `pnpm --filter @talex-touch/tuffex build`，再跑 `audit:size`。对照阶段 0 基线，**只判定增量**——体积预算的既有红不算本次回归，但须在报告中说明。
- [ ] 5.2 若新原语涉及泛型或索引访问：用严格档位复核 `vue-tsc -p tsconfig.json --noUncheckedIndexedAccess`。TuffEx 自身的 vue-tsc 比 Nexus 宽松，跳过这步问题会漏到 Nexus 才暴露。
- [ ] 5.3 全量跑 `test` / `typecheck` / `lint`，逐条核对 prd.md 的 AC1–AC8。
- [ ] 5.4 对照 AC 清单如实报告：过了写过，没过写没过并附输出，不含糊。

---

## 交接给下游

完成后须向子任务 C（`08-05-skeleton-settings-pages`）与 D（`08-05-skeleton-other-async-pages`）交接：

- `TxRowSkeleton` 的最终 props 契约；
- `SettingSkeleton` 的 `groups` 声明格式；
- `useDeferredLoading` 的调用方式与默认时长；
- 阶段 1.2 的 scoped keyframes 实测结论。

子任务 A（`08-05-skeleton-spec-rule`）的 R4 要求 spec 文本回填真实原语名——本任务完成后须通知 A 回填 `TxRowSkeleton` / `SettingSkeleton` / `useDeferredLoading`，避免 spec 里出现幻影 API。
