# 对话消息按流顺序渲染

父任务：`08-07-home-chain-and-native-search`

## Goal

首页对话的助手消息体，按 `parts` 的真实流顺序渲染：每段 reasoning 各自成块，工具调用一律作为独立卡片，不再被整轮折叠进单个「思考过程」。

## 现状

`chain-steps.ts:42` 的 `toChainSteps()` 把整轮消息的**所有** `reasoning` 与 `tool-call` 拍平成一个数组，`HomePage.vue:1197` 再把整个数组塞进单个 `TxChainOfThought`。文本被显式排除（`chain-steps.ts:38-41`），最后由 `HomePage.vue:1256` 用 `message.content`（全轮文本拼接）单独渲染。

结果：无论模型实际经历几轮「思考 → 工具 → 思考」，UI 恒定呈现为「一个思考块 → 全部工具 → 一坨文本」。截图中 6 个步骤被压进一个块即由此而来。

流顺序信息并未丢失 —— `useHomeConversation.ts` 按到达顺序 push `parts`（`:296-320`、`:346-369`），reasoning / tool-call / text 是交错的。问题纯在渲染层的拍平。

## Requirements

- R1 每一段 reasoning 渲染为**独立的**可折叠块；块头显示该段的标题与耗时，而非通用的「思考过程 + 计数」。
- R2 工具调用**全部**移出思考块，作为独立卡片渲染。
- R3 reasoning 块与工具卡片按 `parts` 的流顺序排列。
- R4 已有的工具卡片能力不得回退：widget 工具（`formSpecOf` / `chartSpecOf`）仍渲染为 `ToolFormCard` / `ToolChartCard`，其余走 `TxToolCallCard`；dev 构建下的 raw payload 入口保留。
- R5 流式期间的活跃态、以及回合结束后未 `done` 的 reasoning 判定为「中断而非进行中」的现有语义（`chain-steps.ts:58-60`）保留。
- R6 折叠状态按块持久化，且必须扛住流式重渲染 —— 现有 `chainOpen` 存在 HomePage 而非组件内，正是为此（`HomePage.vue:554-559`），新结构下每块需要各自稳定的 key。
- R7 首 token 之前的 `TxThinkingOrb` 等待态保留（`HomePage.vue:1263-1270`）。
- R8 **（2026-08-08 升级为方案 C）** 回复正文同样按流顺序分段：每个 text part 就地渲染，「文本 → 再思考 → 再文本」时第二个思考块落在两段正文**之间**，而非全部正文之上。
  - 渲染源改为 text 段后，正文只能来自 segments 或 `message.content` 之一，**不得两者都渲染**（parts 模式下二者内容相同，同时渲染会把回答显示两遍）。从未进入 parts 模式的纯文本回合仍走 `message.content`。
  - 连带约束：持久化不得截断 text part。`content` 存全量而 parts 截断到 8KB，改用 parts 渲染后会让超长回答重载时被裁断。

## 非目标

- 不改累加器（`useHomeConversation.ts`）的 parts 生成顺序与内容，只改渲染层消费方式与持久化的截断范围。

## Acceptance Criteria

- [ ] 单轮内多段 reasoning 时，渲染出对应数量的独立思考块，而非一个计数为 N 的块
- [ ] 任何工具调用都不出现在思考块内部
- [ ] reasoning 块、工具卡片与正文段的先后顺序与 `parts` 顺序一致
- [ ] 「文本 → 思考 → 文本」时第二个思考块位于两段正文之间
- [ ] 回答不出现重复渲染；纯文本回合（无 parts）正文照常显示
- [ ] 超长回答（>8KB）重载后完整，不被截断
- [ ] 只有回合尾部的正文段处于 streaming 态，先前段落不残留流式样式
- [ ] widget 工具（form / chart）仍渲染为其真实形态，非 JSON 日志行
- [ ] 流式过程中展开/折叠某块后，后续 delta 不会重置该状态
- [ ] `chain-steps.test.ts` 相应更新且通过；新分段逻辑有覆盖「思考→工具→思考」与「思考→文本→思考」的用例
- [ ] CoreApp typecheck（`npm run typecheck`）通过；`pnpm lint` 无新增告警（判 delta 不判零）
- [ ] 若改动触及 `packages/tuffex`，须同时跑 tuffex 与 CoreApp 两侧 typecheck

## 约束

- tuffex 的 vue-tsc 严格度弱于两个下游，改 tuffex 源码后必须回跑下游 typecheck。
- CoreApp 的 lint 配置与根配置规则相反（尾逗号等），用包内配置，禁止整文件 `--fix`。
