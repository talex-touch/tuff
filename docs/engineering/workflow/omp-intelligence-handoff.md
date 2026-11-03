# OMP 运行时与 HomePage / UIKit 对接交付手册

## 1. 当前已就绪的底层产物（由当前 Agent 完成并验证）

### 1.1 `@talex-touch/tuff-intelligence/omp`
- **`OmpAcpClient`**：已导出并在 live 真实 `omp 18.14.2` 进程下通过烟雾验证。
- **协议**：ACP (Agent Client Protocol) JSON-RPC 2.0，基于 stdio 双工管道通信。
- **核心能力**：
  - `client.initialize()`：自动协商能力与版本。
  - `client.createSession({ cwd, model })`：创建隔离会话。
  - `session.promptStream(prompt)`：标准异步迭代器，产出统一事件：
    - `type: 'thinking'`：深度思考/推理增量（带 delta）。
    - `type: 'delta'`：主文本输出增量。
    - `type: 'usage'`：Token 与费用（inputTokens, outputTokens, totalTokens）。
    - `type: 'status'`：ACP 状态变更通知。

### 1.2 `apps/core-app/src/main/modules/ai/omp`
- **`OmpAgentRuntimeHost`**：封装为符合 Tuff 主进程调度规范的 Host。
  - `execute(payload)`：接入主进程流式 IPC（`onEvent: 'reasoning' | 'text'`, `onRecord`）。
  - `cancel(runId)`：跨轮次取消并优雅终止。
  - 测试全部通过：`src/main/modules/ai/omp/omp-agent-runtime-host.test.ts` (2/2 passed)。

---

## 2. 另一位 Agent 正在进行的工作（目标：瘦身与解耦 HomePage）
- **当前任务**：`HOME: 优化 HomePage 并接入 Intelligence UIKit · #2162`
- **当前进度**：
  - 已将 `HomePage.vue` 从 4433 行拆分出多个 composables：
    - `usePassageSelection.ts`
    - `useThinkingTicker.ts`
    - `useTurnError.ts`
    - `useHomeOpening.ts`
    - `useConversationTitle.ts`
  - 代码量已由 4433 行减少至 3763 行，类型与测试正常。

---

## 3. 下一步交付与对接规划（可直接交接给另一位 Agent 执行）

### Phase A: 消息流渲染层接入 `@talex-touch/intelligence-uikit`
1. **替换原生 `v-html` / `marked` 渲染**：
   - 引入 `TxAiMarkdown`（位于 `@talex-touch/intelligence-uikit`）。
   - 解决当前每来一个 chunk 全量销毁重建、整体淡出淡入（`opacity: 1 -> 0`）闪烁的问题。
2. **接入思考链折叠组件**：
   - 使用 `TxAiThinking` 承接 `thinking` / `reasoning` 流，避免纯文本混杂在正文区。

### Phase B: 视图与事件流无缝对接 ACP
1. **渲染进程流式事件归一化**：
   - 监听来自 `OmpAgentRuntimeHost` 的统一事件（`reasoning` -> `TxAiThinking`，`text` -> `TxAiMarkdown`）。
2. **保持 `useHomeConversation` 与 `useAgentWorkspace` 状态对齐**：
   - 彻底移除对旧 `@earendil-works/pi-agent-core` 私有数据结构的耦合，全部消费 `@talex-touch/tuff-intelligence` 暴露的标准事件。
