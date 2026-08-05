# ② TxConversationStream 会话流（动态高度虚拟滚动 + 触顶历史加载）

父任务：`.trellis/tasks/08-05-tuffex-ai-suite`
依赖：无（tuffex 内独立交付，验收用假数据）。

## 背景

`TxVirtualList` 仅支持固定 `itemHeight`，聊天消息高度动态且流式期间还会持续增高，不可用。`HomePage.vue` 现为全量渲染 + 手写 stick-to-bottom（阈值 80px），消息多了必然卡。触顶加载历史（用户语「上拉刷新」）需要 prepend 时视口锚定，否则列表跳动。

## Goal

在 tuffex 新增 L3 会话容器 `TxConversationStream`：动态高度虚拟滚动、stick-to-bottom 跟流、触顶异步加载更旧消息且视口不跳，承载任意消息渲染（item 插槽），不绑定具体消息组件。

## Requirements

### 虚拟化

- 动态高度：不要求消费方提供行高；以估算高度 + 实测（ResizeObserver）修正的位置缓存实现，滚动条长度随实测收敛。
- 正在流式的**最后一条消息不虚拟化**：始终挂载、随内容增长实时更新；仅对已沉淀的历史做虚拟化。
- DOM 节点数有界：500+ 消息时挂载节点数 = 可视区 + overscan，量级恒定。
- 虚拟化对 item 内部状态友好：滚出再滚回的消息，展开态等内部状态丢失可接受（PRD 层面不承诺 keep-alive），但**不得**出现 key 错乱导致的内容串位。

### 滚动行为

- stick-to-bottom：位于底部（阈值内）时新内容自动跟随；用户上滚后停止跟随，不回拽。
- 回底悬浮钮：离底超过阈值出现「回到底部」浮钮，点击平滑滚底并恢复跟随；流式中离底时浮钮附带新内容提示态。
- 原生滚动（不接管指针/滚轮）：与 macOS 惯性滚动、触控板手势自然兼容。触顶加载采用「顶部 sentinel + scroll anchoring」方案——better-scroll pull-down 与虚拟化冲突，仅当 design 阶段证实锚定方案不可行时才重议（父任务开放决策 1）。

### 触顶历史加载

- Props 提供异步 loader：形如 `loadOlder?: () => Promise<{ items: T[], hasMore: boolean }>`（签名由 design 定案），滚动接近顶部时触发，加载中显示顶部 loading 指示，`hasMore=false` 后不再触发。
- prepend 视口锚定：旧消息插入后，用户当前所见消息在视口中的位置偏移 < 1px（无跳动）。
- loader 并发保护：加载中不重复触发；失败暴露重试态（事件或插槽），不静默吞错。

### API 形态

- 泛型 items + `item` 插槽渲染（对齐 TxVirtualList 的插槽惯例），消息组件由消费方决定（后续 ④ 传入 TxAiMessage 系）。
- 暴露命令式方法：`scrollToBottom()`、`scrollToIndex()`；暴露 `atBottom` 状态（事件或 expose）。
- 空态插槽。

## Acceptance Criteria

- [ ] 注入 500 条随机高度消息：挂载 DOM 节点数有界（单测断言）、滚动无空白闪区
- [ ] 模拟流式追加（末条内容持续增长）：stick-to-bottom 生效；上滚后不再回拽；回底浮钮出现且点击恢复跟随
- [ ] 触顶触发 `loadOlder`，prepend 50 条后视口内容无跳动（位置断言）；`hasMore=false` 后不再触发；加载中重复触顶不并发
- [ ] loader reject 时呈现可重试的失败态，不静默
- [ ] `scrollToBottom` / `scrollToIndex` / 空态插槽可用
- [ ] 新组件单测齐备，tuffex build 通过，`pnpm lint` 通过

## Notes

- 复杂任务：`design.md`（位置缓存结构、锚定实现、与流式末条的分区策略）与 `implement.md` 齐备后方可 `task.py start`。
- 本件不含数据层：历史分页数据源由 08-04 R2 的 conversation transport 提供，本件验收全部用内存假数据。
- 不修改 TxVirtualList / TxScroll 既有行为。
