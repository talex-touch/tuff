# B. 首页工具调用链路与交互式 UI 工具

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。事件实测与架构结论见 `research/pi-tool-capability.md`。

## Goal

首页对话获得真实工具能力：模型可搜索文件、打开/读取文件、整理文档、调用 tuff 插件 feature、生成交互式 widget（数据→报表），全程流式呈现且过安全确认门。agent loop 由 pi 承担（首个 provider 实现），事件协议层不锁死 pi。

## Requirements

### 事件 → parts 协议层

- pi runtime 扩展解析：`thinking_*` → AiReasoningPart、`toolcall_start/delta/end` → AiToolCallPart（running + 流式入参）、`toolResult` → done/error + 结果
- useHomeConversation 消息升级为 parts 流水线（沿 ③ 模型），HomePage 装配 TxChainOfThought/TxToolCallCard/TxReasoningDisclosure（A 产出）
- stop 语义扩展：杀 pi 子进程 = 终止整个工具循环，无孤儿进程（沿 R1.5 验收）

### 工具面

- **内置工具白名单**（应用侧显式下发 `--tools`）：文件搜索（接 app-provider/native search）、读取文件、打开文件/目录、文档整理（读+汇总，无写）
- **tuff pi-extension**（npm 包，仓内新 package）：暴露 `tuff_search_features`（列插件 feature）、`tuff_invoke_feature`（调用插件 feature）、`tuff_render_widget`（提交 widget spec → 会话卡片沙箱渲染）——extension 与 tuff 主进程的桥接方式 design 定案
- **交互式 UI 工具**：`tuff_render_widget` 接收数据+图表描述 → arrow-js widget spec → TxToolCallCard result 槽内沙箱渲染（复用 widget-registry）
- MCP：`--mcp-config` 直接消费 C 任务产出的配置文件（C 未落地前该入口留空）

### 安全门

- 工具开关：设置页总开关（默认关）+ 会话内 Auto Context 邻位入口
- 逐调用确认：TxToolConfirmation（A 产出）；只读工具可「本会话记住」，写/执行类每次确认；拒绝 → 该调用以 error(denied) 回给模型，会话继续
- pi 拉起参数从 `--no-tools` 改为显式 `--tools <白名单>`，白名单由用户配置推导，永不裸放全量

## Acceptance Criteria

- [ ] 「找出 /tmp 下最大的三个文件并整理成表格」：确认 → search/read 工具卡四态流式 → 表格结果（真 pi 端到端）
- [ ] 给 CSV 要报表：widget 工具返回交互图表卡片，沙箱渲染，尺寸受控
- [ ] 调用一个 tuff 插件 feature（如翻译）经 extension 桥成功往返
- [ ] 拒绝确认 → denied 回传、会话不中断；stop → 循环终止无孤儿
- [ ] 工具开关关闭时行为与今日完全一致（`--no-tools`）
- [ ] 组合式与 runtime 单测覆盖新事件解析；typecheck/lint 全绿

## Notes

- 复杂任务：design.md（extension 桥接、白名单推导、确认流状态机、widget spec 契约）+ implement.md 过审后 start。
- 云 provider 工具协议不在本件（父任务明确不做）。
