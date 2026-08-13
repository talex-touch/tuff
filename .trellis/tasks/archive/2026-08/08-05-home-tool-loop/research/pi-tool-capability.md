# pi CLI 工具能力实测 · 2026-08-05

- pi 自带 read/bash/edit/write 内置工具，`--tools` 白名单 / `--exclude-tools` 黑名单 / `--no-builtin-tools`（保留 extension/custom 工具）
- **extension 机制**：`pi install <source>` 可装扩展（自定义工具）→ 关键设计岔路：
  - 方案 A：写一个 tuff pi-extension，把 tuff 插件 feature/搜索/文件操作暴露成 pi 自定义工具，agent loop 由 pi 承担，NDJSON 事件已含 tool 调用流（待验证事件形状）
  - 方案 B：tuff 自建 agent loop（provider 只做单轮补全 + tool_call 协议），控制权全在应用侧
- R1.5 现状：`--no-tools` 硬编码在 buildPiArgs；权限门（哪些工具允许）是先决设计
- **类型层已有底子**：packages/utils/types/intelligence.ts 已有 WorkflowStepKind("prompt"|"tool"|"agent"|"model")、toolId/ToolSource、role:"tool" —— 工具/工作流模型不是从零开始
- 渲染侧就绪：AiToolCallPart 四态 + TxToolCallCard result 槽（arrow-js widget 宿主）已落地（③）；交互式报表 = 工具返回 widget spec → 宿主经 widget-registry 沙箱渲染

## 事件形状实测（2026-08-05，pi 0.83.0）

- `--mcp-config <path>` 原生支持；本机已装 pi-mcp-adapter@2.9.0 扩展（npm 包形态 → tuff pi-extension 路线可行性确认）
- 完整事件链（`--mode json`）：
  - `message_update.assistantMessageEvent.type`: `thinking_start/thinking_end`（推理，可喂 TxReasoningDisclosure）、`toolcall_start`、`toolcall_delta`（流式入参 JSON 片段）、`toolcall_end`（content 内 `{type:'toolCall', id, name, arguments}` 完整入参）
  - `message_start/end role='toolResult'`：`{toolCallId, toolName, content:[{type:'text',text}], isError}`
- 映射:AiToolCallPart —— name/id ← toolCall;input ← arguments;logs/output ← toolResult.content;status: toolcall_start→running / toolResult→done|error
- 架构结论(design 定案依据):agent loop 由 pi 承担;tuff 控制面 = --tools 白名单 + tuff pi-extension(暴露插件/搜索/widget 工具) + --mcp-config(C 任务产出);runtime 增量 = 解析上述事件 → parts 流
