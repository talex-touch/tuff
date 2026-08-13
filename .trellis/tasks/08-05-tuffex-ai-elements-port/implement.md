# A. AI Elements P0 执行计划

前置：design.md 过审。工作目录 `packages/tuffex`。零新依赖。

## 顺序清单

### S1 类型扩展 + TxSources（parts 一员，先行打通分派）
- [x] types.ts：AiSourceItem/AiSourcesPart/AiSuggestion/AiChainStep；AiMessagePart 联合扩员
- [x] sources/ 组件 + 单测；TxAiMessage 增 sources 分派分支 + 分派测试（既有 ai-elements 测试全绿）
- 验证：`pnpm vitest run packages/components/src/sources packages/components/src/ai-elements`

### S2 TxToolConfirmation + TxSuggestionChips
- [x] tool-confirmation/：三险级、remember、approve/deny + 单测
- [x] suggestion-chips/：滚动 + select + 单测
- 验证：vitest 过滤两目录

### S3 TxContextIndicator + TxChainOfThought
- [x] context-indicator/：环 + 阈值色 + formatter + 单测
- [x] chain-of-thought/：步骤时间线 + 流式 active + 折叠 + 单测
- 验证：vitest 过滤两目录

### S4 注册与全量
- [x] components.ts ×5（字母序）；各 index withInstall
- [x] `pnpm test && pnpm typecheck && pnpm build && pnpm lint`
- 【review 门】mock demo 手感（B 集成时一并真验）

## 回滚点
逐 S 段独立；全件 = 删五目录 + types 扩展段 + 注册行。
