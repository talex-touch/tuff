# B. 首页工具调用链路 技术设计

PRD：`./prd.md`。事件实测：`research/pi-tool-capability.md`。

## 0. 定案

| 决策 | 结论 | 理由 |
|---|---|---|
| agent loop 归属 | **pi 承担**（方案 A） | 事件链实测完备；自建 loop 要重造调度/重试/上下文管理 |
| 协议通道 | 类型化 `IntelligencePartEvent` + `IntelligenceStreamOptions.onPartEvent?`（新增可选回调） | 强类型可演进；不塞 onMetadata 弱类型通道；云 provider 未来发同一事件族 |
| 确认门位置 | **tuff extension 工具内置确认回调**；pi 内置工具白名单只放只读（`read`）免确认；MCP 工具 V1 不进白名单 | pi 进程内执行的内置工具无法被 tuff 拦截——把需要确认的能力全部收进 extension 桥，桥就是天然确认点 |
| extension ↔ tuff 桥 | **loopback HTTP + bearer token**：主进程起「工具网关」（127.0.0.1 随机端口），spawn pi 时注入 `TUFF_TOOL_GATEWAY_URL/TOKEN` env，extension 工具实现全部转发网关 | 最低摩擦跨进程方案；token 随会话轮换；网关只听 loopback |
| 报表 widget 形态 | **两档**：结构化图表 spec → 内置 echarts 卡片（catalog 已有 echarts ^6.1.0）；插件 feature 返回的 widget → 既有 arrow-js 沙箱 | 「数据→报表」不该给模型任意代码执行面；受限 spec 更安全且够用 |
| 文件搜索工具 | 走 extension `tuff_search_files`（接主进程既有搜索 provider），不用 pi 内置 bash/glob | bash 是执行类，永不下发 |

## 1. 事件 → parts 协议层

### 1.1 类型（packages/utils/types/intelligence.ts，全部新增可选）

```ts
export type IntelligencePartEvent =
  | { kind: 'reasoning-start' }
  | { kind: 'reasoning-delta', delta: string }
  | { kind: 'reasoning-end', durationMs?: number }
  | { kind: 'tool-start', callId: string, name: string }
  | { kind: 'tool-input-delta', callId: string, delta: string }
  | { kind: 'tool-input-end', callId: string, input: unknown }
  | { kind: 'tool-result', callId: string, name: string, output: string, isError: boolean }

// IntelligenceStreamOptions 增：onPartEvent?: (event: IntelligencePartEvent, streamEvent) => void
// IntelligenceStreamChunk 增：partEvent?: IntelligencePartEvent（通道透传用）
```

### 1.2 pi runtime 映射（pi-cli-runtime.ts 扩展 parsePiCliLine）

| pi NDJSON | IntelligencePartEvent |
|---|---|
| `thinking_start` / 增量 / `thinking_end` | reasoning-start / reasoning-delta / reasoning-end |
| `toolcall_start` | tool-start（name 从 partial.content[contentIndex] 取） |
| `toolcall_delta` | tool-input-delta |
| `toolcall_end`（content 内 toolCall.arguments） | tool-input-end |
| `message_* role=toolResult` | tool-result（content text 拼接 + isError） |

- 现有 `{delta}/{usage}/{done}` 返回形状不动（向后兼容）；PiCliEvent 增 `partEvent?` 字段
- buildPiArgs：`--no-tools` 改为条件——工具关（默认）维持 `--no-tools`；工具开 → `--tools read,<extension 工具名>` + `--no-builtin-tools` 以外的内置全排除（`--tools` 即白名单语义，实测为准）

### 1.3 useHomeConversation parts 装配

- `ConversationMessage.parts?: AiMessagePart[]` 装配状态机：
  - reasoning-*：尾部 AiReasoningPart 累积（start 新建，delta 追加，end 补 durationMs+done）
  - tool-start：新建 AiToolCallPart(status running)；tool-input-delta 累积 `logs`（流式入参观感）；tool-input-end 定 `input`（JSON.stringify 摘要）
  - tool-result：按 callId 配对 → done/error + output
  - onDelta 文本：尾部 AiTextPart 累积（与 content 并行维护，content 仍是纯文本拼接 = 摘要/回退/持久化用）
- 持久化：parts **落库**（ConversationSaveRequest.messages[].meta 塞不下——扩 transport？V1：parts 序列化进 meta.parts（Record 里合法 JSON），toRaw 深拷贝；恢复时读回。风险：meta 体积——工具输出截断至 8KB/则）

## 2. 工具网关（主进程新模块 tool-gateway/）

- `POST /invoke {tool, args, callToken}`：入队 → renderer 确认（`conversation:tool:confirm` 事件，携 tool/args 摘要/risk）→ 用户 approve/deny（TxToolConfirmation，remember=本会话跳过同工具）→ 执行 → 返回 `{output, isError}`
- 工具实现（主进程侧）：`tuff_search_files`（搜索 provider）、`tuff_read_file`（大小限制 + 文本类白名单）、`tuff_open_path`（shell.openPath，risk=execute 恒确认）、`tuff_list_features` / `tuff_invoke_feature`（插件系统调用面）、`tuff_render_chart`（校验 spec → 直接以 tool-result 特殊标记回传，renderer 渲染 echarts 卡）
- 安全：token 每会话随机；网关随会话起停；deny → `{isError:true, output:'User denied …'}` 回给模型

## 3. tuff pi-extension（新 package `packages/pi-extension-tuff/`）

- pi extension 形态（对齐 pi-mcp-adapter 的包结构，design 期读其源码定 API）：注册上述工具名+schema，实现即「读 env → POST 网关 → 返回结果」薄壳
- 开发期以本地路径 `pi install`；后续 npm 发布另议

## 4. Renderer 装配（HomePage / useHomeConversation）

- 确认流：transport 事件 → 会话流内插 TxToolConfirmation（伪消息行，不入 messages 持久化）→ 应答回网关；remember 存会话级 Map
- ChainOfThought：assistant 消息的 parts 派生 steps（reasoning 段+tool 调用），parts >1 步时用 TxChainOfThought 包裹渲染，单步退化为现有平铺
- 图表卡：tool-result 标记 chart 的 → AiToolCallPart.output 存 spec JSON → TxToolCallCard result 槽渲染 EchartsCard（core-app 侧小组件，echarts 按需 import）
- 工具开关：设置页「智能」增总开关（appSetting.tools.agentTools 默认 false）+ composer Auto Context 邻位状态提示

## 5. 分阶段（implement 分段即阶段）

V1 里程碑 = 内置只读三工具（search/read/open）+ 确认门 + parts 全链流式渲染；V2 = feature 调用 + 图表卡；MCP 挂载在 C 落地后接（白名单+确认策略同 extension 桥）。

## 6. 回滚

协议层全部可选字段；工具关=行为回到今日（`--no-tools`）；extension 包与网关模块独立目录。
