# Implement — TxTransfer 面板内部滚动与双侧搜索

## 执行顺序

### 1. TuffEx 组件（原语先落地）

- [ ] `packages/tuffex/packages/components/src/transfer/src/types.ts`
      新增 `maxHeight`、`orderable`、`moveUpAriaLabel`、`moveDownAriaLabel`；`emptyText` 放宽为 `string | [string, string]`。
- [ ] `packages/tuffex/packages/components/src/transfer/src/TxTransfer.vue`
      - 本地 `toCssUnit` + 根节点内联 `--tx-transfer-max-height`；
      - `targetItems` 在 `orderable` 时按 `modelValue` 顺序；
      - `resolveOrder` 在 `orderable` 时短路；
      - `moveTarget(key, direction)` 基于完整目标序列，emit `update:modelValue` + `change`；
      - 目标行加 `.tx-transfer__row` + 序号 + 上移/下移按钮（仅 `orderable`）；
      - `sourceEmptyText` / `targetEmptyText` computed；
      - 样式：面板 `max-height` 兜底 320px、`align-items: stretch`、header/filter `flex: none`、list `min-height: 0`。
- [ ] `packages/tuffex/packages/components/src/transfer/__tests__/transfer.test.ts`
      - `orderable` 渲染序号、首项禁用上移、末项禁用下移；
      - 点击下移 emit 出的顺序确实变化（**负控制**：`targetOrder` 保持默认 `'original'` 时也不能被重排回去）；
      - 搜索状态下序号与边界仍按完整列表判定；
      - `emptyText` 元组分别渲染到两侧；
      - `maxHeight` 写入根节点 CSS 变量。

**验证：** `pnpm -C packages/tuffex test -- transfer`
（若 pnpm 包装器触发全量 install 或 .bin 失效，改用 `node packages/tuffex/node_modules/vitest/vitest.mjs run transfer`；见 memory `stale-bin-shims-after-repo-move` / `pnpm-script-wrapper-wipes-root-bin`。）

### 2. CoreApp 弹窗

- [ ] `apps/core-app/src/renderer/src/modules/lang/zh-CN.json` + `en-US.json`：按 design.md 的表成对新增 7 个 key。
- [ ] `CapabilityModelTransfer.vue` 改为 `TxTransfer` 包装层，保留 props/emits、`seenModels`、`scopeKey` 重置、自定义模型输入（移到穿梭框下方）。
- [ ] `IntelligenceModelConfig.vue`：传 `:max-height` 与 aria-label，清理 `:deep()` 高度覆盖。

**验证：**
- `cd apps/core-app && npm run typecheck`
- `node apps/core-app/node_modules/vitest/vitest.mjs run AISDKCapabilityDetails`（确认存根路径未变）
- `apps/core-app` 的 `translation-coverage.test.ts`（zh/en 成对）

### 3. Nexus 文档与 demo（同提交）

- [ ] `apps/nexus/app/components/content/demos/TransferOrderableDemo.vue`
- [ ] `apps/nexus/app/components/content/demo-registry.ts` 按字母序注册
- [ ] `transfer.zh.mdc` / `transfer.en.mdc`：demo 小节、props 表 4 行 + `emptyText` 类型、最佳实践、审阅说明覆盖行
- [ ] 确认 `<TuffDocSourceLink />` 之后没有新增正文（memory `nexus-docs-content-after-source-link-drops`）

**验证：** `pnpm -C apps/nexus check:mdc-fences`（或仓库现行 docs 门禁命令）

### 4. 视觉验证

- [ ] `pnpm core:dev` 起应用，进入 设置 → 能力 → 任一能力 → 模型优先级：确认双侧搜索、内部滚动、序号与上下移。
- [ ] 设置 → 模型渠道 → DashScope → 管理模型：确认左右两个面板都完整可见、内部滚动。

## 回滚点

- 步骤 1 单独可回滚（组件为纯增量 API，删除新增 prop 与样式即回到原状）。
- 步骤 2 若发现 `TxTransfer` 不足以承载优先级语义，回滚点是保留原 `CapabilityModelTransfer` 实现，仅接受步骤 1 的滚动修复。

## 完成判定

PRD 的全部 Acceptance Criteria 勾选完成，且 `git diff --check` 干净。
