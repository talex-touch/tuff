# 执行计划：对话消息按流顺序渲染

## 前置

- 分支：`TalexDreamSoul/app-shell-v2`（工作树已有 39 处改动，**不得** stash / checkout / restore；需要基线对比时用 `git show HEAD:<path>`）
- 并发写入风险：本仓有其它 agent 并发写文件。遇到工作树与预期矛盾时停下取证上报，不要抢救式回滚。

## 步骤

### 1. 派生层：`chain-steps.ts`

- [ ] 抽出 `toReasoningStep(part, index, streaming)`，把现 `toChainSteps` 中 reasoning 分支的 `plainTitle` / `bodyFor` / 状态判定原样搬入
- [ ] 抽出 `toToolStep(part, streaming)`（若模板仍需 step 形态；否则跳过）
- [ ] 新增 `toMessageSegments(parts, streaming): MessageSegment[]`，导出 `MessageSegment` 类型
- [ ] 删除 `shouldUseChainView`
- [ ] `toChainSteps`：若重构后无人调用则删除，不留死代码

验证：`npx vitest run chain-steps` （在 `apps/core-app/`）

### 2. 测试先行：`chain-steps.test.ts`

- [ ] 移除 `shouldUseChainView` 相关用例
- [ ] 新增：`思考 → 工具 → 思考` → 3 段，顺序为 reasoning / tool / reasoning
- [ ] 新增：`思考 → 文本 → 思考` → 2 个 reasoning 段（文本被跳过但仍构成分界）
- [ ] 新增：段 id 稳定性 —— 对同一 parts 前缀追加新 part 后，已有段 id 不变
- [ ] 保留原有的标题截断、body 承接、流式/结算状态判定用例（改挂到 `toReasoningStep` 或新函数）

### 3. 组件：`TxChainOfThought.vue`

- [ ] `:119` 计数徽章加 `v-if="steps.length > 1"`
- [ ] 更新 `chain-of-thought.test.ts` 中断言计数存在的用例

验证：`packages/tuffex` 下 `npx vitest run chain-of-thought` + tuffex typecheck

### 4. 视图：`HomePage.vue`

- [ ] 新增 `segmentsOf(message)`，替换 `chainStepsOf`
- [ ] 删除 `soloToolOf`、`showChain`；简化 `toolCardsOf`
- [ ] 模板消息体改为按 segment 的 `v-for`，reasoning 走 `TxChainOfThought :steps="[segment.step]" :label="segment.step.title"`，tool 走原 widget / `TxToolCallCard` 分支
- [ ] `key="chain"` → `:key="segment.id"`
- [ ] `chainOpen` 的 key 由 `message.id` 改为 `segment.id`
- [ ] `TxThinkingOrb` 的条件改为 `!segmentsOf(message).length`
- [ ] 确认 dev-only raw payload 按钮（`showToolPayload`）随 widget 分支保留

### 5. 校验（逐条跑，不得只跑一条就报完成）

- [ ] `apps/core-app/` → `npm run typecheck`
- [ ] `packages/tuffex/` → typecheck（因第 3 步动了 tuffex 源码，两侧都要跑）
- [ ] `apps/core-app/` → `npx vitest run chain-steps`
- [ ] `pnpm lint`（用 CoreApp 包内配置；**判 delta 不判零**，禁止整文件 `--fix`）
- [ ] 真机验证：`pnpm core:dev`，发一条会触发多轮「思考→工具→思考」的消息，人工核对 PRD 的 8 条验收

### 6. 已知取舍需在 PR/提交信息中写明

「文本 → 再思考 → 再文本」时两段正文仍在底部合并，第二个思考块位于正文上方。这是选定方案 B 的固有限制（方案 C 才拆正文），不是遗漏。

## 回滚点

- 第 1-2 步完成后可独立提交（纯派生层 + 测试，不影响 UI）
- 第 3 步单独提交（tuffex 改动，便于独立回退）
- 第 4 步为 UI 切换，风险最高，单独提交

## 审查门

第 4 步完成后、跑第 5 步之前，先自查：现有的 widget 渲染、raw payload 入口、流式等待态、折叠持久化四项是否都还在 —— 这四项是重构中最容易被顺手删掉的。
