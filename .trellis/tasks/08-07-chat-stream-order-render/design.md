# 技术设计：对话消息按流顺序渲染

## 边界

| 层 | 文件 | 改动性质 |
|---|---|---|
| 派生逻辑 | `apps/core-app/src/renderer/src/modules/conversation/chain-steps.ts` | 新增分段函数；`toChainSteps` 语义收窄 |
| 视图 | `apps/core-app/src/renderer/src/views/base/home/HomePage.vue` | 消息体模板重构 + 相关 helper 重写 |
| 组件 | `packages/tuffex/.../chain-of-thought/src/TxChainOfThought.vue` | 计数徽章条件渲染（小改，见下） |
| 测试 | `chain-steps.test.ts`、`chain-of-thought.test.ts` | 随语义更新 |

`TxChainOfThought` 的**唯一**下游是 HomePage.vue（另两处是它自己的 `index.ts` 与测试），改动爆炸半径可控；但按惯例仍须跑 tuffex + CoreApp 双侧 typecheck。

## 数据流

`useHomeConversation.ts` 已按到达顺序 push `parts`（`:296-320` 文本、`:346-350` reasoning、`:369` tool-call），reasoning / tool-call / text 天然交错。本设计只在渲染层消费这个顺序，**不改累加器**。

## 契约：新的分段函数

```ts
export type MessageSegment =
  | { kind: 'reasoning'; id: string; step: AiChainStep }
  | { kind: 'tool'; id: string; part: AiToolCallPart }
  | { kind: 'text'; id: string; text: string; streaming: boolean }

export function toMessageSegments(
  parts: AiMessagePart[] | undefined,
  streaming: boolean,
  labels?: SegmentLabels
): MessageSegment[]
```

> 2026-08-08：方案升级为 C —— 正文也进入分段。下文凡称「text 跳过」处以此为准。

规则：

- 每个 `reasoning` part → 一个 `reasoning` 段。累加器一个 span 只建一个 part（`useHomeConversation.ts:346-350` 起 span，其后 delta 追加到 last），因此 part 与「一段思考」一一对应，无需再做游程合并。
- 每个 `tool-call` part → 一个 `tool` 段。
- 每个非空 `text` part → 一个 `text` 段，就地渲染。空 text part（回滚残留）跳过。
- `text` 段的 `streaming` 仅在「回合流式中 **且** 该 part 是最后一个」时为真。否则先前段落会永久停在流式渐显样式里。
- 段的 `id` 直接沿用现有取值：reasoning 用 `reasoning-${index}`，tool 用 `part.id`。**索引基于原始 parts 数组**，保证流式追加时既有段的 key 不漂移（R6 依赖此点）。

`toChainSteps` 内部的 `plainTitle` / `bodyFor` / 状态判定逻辑（含 `chain-steps.ts:58-60` 的「未 done + 非流式 = 中断」语义）原样复用，抽成 `toReasoningStep(part, index, streaming)` 供新函数调用，避免两套判定漂移。

`shouldUseChainView` 失去意义（不再有「一条 vs 多条」的整轮判断），随之删除；其测试同步移除。

## 视图重构

现模板的三段式（chain → toolCards → markdown）替换为：

```
v-for segment of segmentsOf(message)
  ├ reasoning → TxChainOfThought :steps="[segment.step]" :label="segment.step.title"
  ├ text      → TxStreamMarkdown :content="segment.text" :streaming="segment.streaming"
  └ tool      → widget 分支（form / chart）或 TxToolCallCard
TxStreamMarkdown (message.content)   ← 仅 !message.parts 时，即从未进入 parts 模式的纯文本回合
TxThinkingOrb                        ← 流式 且 无 content 且 无 segment
```

**分支顺序有硬约束**：`text` 分支必须排在 widget 分支之前。widget 分支的条件读 `segment.part`，而 text 段没有该字段 —— 顺序颠倒会让 `formSpecOf(undefined)` 在运行时抛。

**正文只能有一个来源**：parts 模式下 text 段拼接恒等于 `message.content`（`onDelta` 同时写 `content` 与 `appendTextPart`，`rollbackParts` 同步截断两者），两处都渲染会把回答显示两遍。回退分支因此判 `!message.parts` 而非判段数 —— 判段数会让「parts 全是工具调用」的回合把正文再放一遍。

## 持久化连带改动

`useConversationHistory.ts` 的 `toStoredParts` 原先把 `text` 一并截到 8KB，而 `content` 存全量。渲染源改为 parts 后，这会让超长回答重载时被裁断。改为：`type === 'text'` 的 part 不截断，reasoning 与工具载荷（`output`/`logs`/`input`/`error`）保持上限。

代价是正文在存储里出现两份（`content` 与 text part）。可接受：体量与回答本身同阶，且 `content` 仍是纯文本回合与复制按钮的来源。

被删除/重写的 helper：

- `soloToolOf` —— 删除。它存在的理由是「单个工具已有自己的卡片，再进 trail 会说两遍」；新结构下工具恒定是独立卡片，该特例消失。
- `toolCardsOf` —— 简化为「所有 tool-call」，不再区分 widget 与否（widget 分支下沉到模板的 `v-if`，与现状一致）。
- `showChain` —— 删除。每个 reasoning 段恒定显示，不再有「单步是否值得成 trail」的判断。
- `chainStepsOf` —— 仅测试/orb 判定还需要时保留为 `segmentsOf`，否则删除。

## 组件改动：计数徽章

`TxChainOfThought.vue:119` 恒定渲染 `{{ steps.length }}`。单步块显示「1」是噪声，且 label 已换成该段标题。

改为 `v-if="steps.length > 1"`。这是普适改进（任何场景下计数为 1 都无信息量），不新增 prop，避免给唯一下游加配置面。

耗时展示保持现状（在步骤行内），不上提到块头 —— 上提需要动 header 布局与样式，收益不抵风险；块头已由标题承载辨识度。

## 折叠状态（R6）

`chainOpen` 现以 `message.id` 为 key（`HomePage.vue:559`）。一条消息现在有多个块，key 必须降到段粒度：改用 `segment.id`（全局唯一：reasoning 段含 index，tool 段用 part.id）。

模板上 `key="chain"` 的写死 key（`HomePage.vue:1199`，注释说明是防流式重渲染时组件被重建）改为 `:key="segment.id"`，同样是稳定值，保住原意图。

## 兼容性

- `parts` 为空的历史消息：`toMessageSegments` 返回空数组，正文照常渲染，与现状一致。
- 纯文本回合（从不进 parts 模式）：`message.parts` 为 undefined，行为不变。
- 已持久化的会话：只改渲染，不改存储结构，旧会话重载后按新版式呈现。

## 回滚

改动集中在三个文件，无数据迁移、无存储结构变更，`git revert` 即可完全回退。
