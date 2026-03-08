# Pilot × Intelligence API / 事件契约（V1）

> 更新时间：2026-03-08  
> 适用范围：`apps/pilot`、`packages/tuff-intelligence`

## 1. 目标与范围

- V1 定位：Chat-first（类似 ChatGPT Web），不开放写操作工具执行。
- 运行模型：SSE + checkpoint/replay，优先保障长对话与断线恢复。
- 协议基线：内部事件以 `aep/1` 为核心，服务端流式层做最小包装。

## 2. 存储模型（D1/R2）

- D1 SoT（会话/消息/trace/checkpoint/附件元数据）
  - `pilot_chat_sessions`
  - `pilot_chat_messages`
  - `pilot_chat_trace`
  - `pilot_chat_checkpoints`
  - `pilot_chat_attachments`
- R2：附件二进制对象。
- 规则：业务明文不通过 JSON 文件落地同步，遵循 SoT 约束。

## 3. HTTP API

### 3.1 会话

- `POST /api/pilot/chat/sessions`
  - 入参：`{ sessionId?: string }`
  - 出参：`{ session }`

- `GET /api/pilot/chat/sessions?limit=`
  - 出参：`{ sessions }`

### 3.2 消息与追踪

- `GET /api/pilot/chat/sessions/:sessionId/messages`
  - 出参：`{ messages, attachments }`

- `GET /api/pilot/chat/sessions/:sessionId/trace?fromSeq=&limit=`
  - 出参：`{ traces }`

### 3.3 附件

- `POST /api/pilot/chat/sessions/:sessionId/uploads`
  - 入参：`{ name, mimeType, size, contentBase64? }`
  - 出参：
    - `attachment`（D1 元数据）
    - `upload`（签名 URL 元信息）
    - `directUploaded`（是否直接写入 R2）

### 3.4 会话控制

- `POST /api/pilot/chat/sessions/:sessionId/pause`
  - 入参：`{ reason }`
  - `reason`：`client_disconnect | heartbeat_timeout | manual_pause | system_preempted`

### 3.5 流式

- `POST /api/pilot/chat/sessions/:sessionId/stream`
  - Header：`Accept: text/event-stream`
  - 入参：
    - 发起新轮次：`{ message, attachments?, metadata? }`
    - 仅补播：`{ fromSeq }`

### 3.6 Core-App IPC 推流（兼容新增）

- 旧接口保留：`intelligence:agent:session:stream`
  - 语义：一次性查询 trace（数组返回），用于兼容已有调用方。
- 新接口新增：`intelligence:agent:session:subscribe`
  - 语义：基于 Transport `stream/onStream` 的实时订阅。
  - 入参：`{ sessionId, fromSeq?, limit?, level?, type? }`
  - 行为：
    - 首帧 `stream.started`
    - 若传入 `fromSeq`，先下发 `replay.started -> replay events(replay=true) -> replay.finished`
    - 然后进入实时 trace 推送
    - keepalive 事件：`stream.heartbeat`（10s）
    - 客户端断开时会话写入 `paused_disconnect`

## 4. SSE 事件契约

每个 SSE `data:` 行是 JSON 对象，核心字段：

- `type: string`
- `sessionId: string`
- `turnId?: string`
- `seq?: number`
- `timestamp: number`

### 4.1 事件类型（V1）

- `stream.started`
  - 字段：`payload.hasMessage`、`payload.fromSeq`、`payload.keepaliveMs`
- `stream.heartbeat`
  - 字段：`payload.ts`
- `planning.started`
  - 字段：`payload.strategy`
- `planning.updated`
  - 字段：`payload.todos`
- `planning.finished`
  - 字段：`payload.todoCount`
- `turn.started`
  - 字段：`payload.messageChars`、`payload.attachmentCount`
- `turn.finished`
  - 字段：`payload.durationMs`
- `replay.started`
  - 字段：`payload.fromSeq`、`payload.limit`
- `replay.finished`
  - 字段：`payload.replayCount`
- `assistant.delta`
  - 字段：`delta`
- `assistant.final`
  - 字段：`message`
- `run.audit`
  - 字段：`payload.auditType`（如 `upstream.request` / `upstream.response` / `upstream.network_error` / `upstream.response_error`）
- `run.metrics`
  - 字段：`payload.eventType`、`payload.envelopeSeq`
- `session.paused`
  - 字段：`reason`
- `error`
  - 字段：`message`、`detail`
- `done`
  - 流式结束标记

### 4.2 replay 语义

- 调用 `stream` 且携带 `fromSeq` 时，服务端会先回放 `seq >= fromSeq` 的 trace。
- 回放事件包含 `replay: true`。
- 前端应按 `seq` 去重并更新本地游标。
- 当请求仅包含 `fromSeq`（无 `message`）时，服务端按只读补播处理，不会新增 trace `seq` 记录。

## 5. 状态机

- `idle`
- `planning`
- `executing`
- `paused_disconnect`
- `completed`
- `failed`

状态转移关键点：

- 新消息进入 `executing`
- 客户端断开或内部保活中断进入 `paused_disconnect`
- 正常完成进入 `completed`
- 异常进入 `failed`

## 6. 时序（断线恢复）

```mermaid
sequenceDiagram
  participant UI as Pilot UI
  participant API as Pilot API
  participant RT as Agent Runtime
  participant D1 as D1 Store

  UI->>API: POST /stream (message)
  API->>RT: onMessage()
  RT->>D1: appendTrace(seq++) + checkpoint
  API-->>UI: SSE assistant.delta/final
  API-->>UI: SSE stream.heartbeat (interval)

  UI-x API: network disconnect
  API->>D1: pauseSession(client_disconnect)

  UI->>API: POST /stream ({fromSeq:lastSeq+1})
  API->>D1: listTrace(fromSeq)
  API-->>UI: SSE replay events (replay=true)
  API-->>UI: SSE done
```

## 7. 错误码建议（服务端）

- `400`：参数缺失或格式非法（如 `message/fromSeq` 同时为空）
- `401`：未认证
- `404`：会话不存在（可选，当前实现会自动创建）
- `408/499`：客户端断开（由 `session.paused` 语义体现）
- `500`：运行时内部错误

## 8. 默认模型配置（V1 当前默认）

- `runtimeConfig.pilot.upstreamResponsesModel = "gpt-5.4"`
- 当未显式覆盖模型时，Pilot runtime fallback 同步使用 `gpt-5.4`

## 9. 幂等建议（V1.1）

当前 V1 已保留策略位，建议在后续版本统一引入幂等键：

- `idempotencyKey = sessionId + turnId + actionId`
- 适用范围：写操作 capability、附件写入、外部副作用调用

## 10. 与 `tuff-intelligence` 的边界

- `packages/tuff-intelligence`：Protocol/Runtime/Registry/Policy/Store 抽象与默认实现。
- DeepAgent 最小实现（LangChain engine + Responses 调用 + 审计/错误类型）统一由 `packages/tuff-intelligence/src/adapters/deepagent-engine.ts` 提供。
- `apps/pilot`：HTTP 入口、SSE 桥接、页面交互、Edge 运行时适配。
- 约束：业务层禁止直接依赖 OpenAI/Anthropic 原始响应格式，统一通过 DecisionAdapter 归一化。

## 11. 统一事件契约（Pilot/Nexus/Core）

- 生命周期事件统一：`stream.started` / `stream.heartbeat` / `replay.started` / `replay.finished` / `error` / `done`
- 业务事件统一：沿用 trace `type` 原样透传（如 `session.started`、`plan.created`、`execution.*`、`tool.*`、`reflection.completed`、`state.snapshot`）
- 核心字段统一：
  - `sessionId: string`
  - `timestamp: number`
  - `seq?: number`（单调递增，用于 `fromSeq` 恢复）
  - `replay?: boolean`
  - `payload?: object`

## 12. Legacy 兼容清单（当前保留项）

| 层级 | 兼容项 | 当前策略 | 清理前置条件 |
| --- | --- | --- | --- |
| Core IPC | `intelligence:agent:session:stream` | 保留旧查询语义（数组返回） | 全量调用方迁移至 `...:subscribe` |
| Core IPC | `intelligence:agent:session:subscribe` | 新增实时推流主通道 | 无（目标主通道） |
| Trace 存储 | 老 trace 无 `seq` | 运行时加载时自动补齐 `seq` | 历史会话完成离线迁移并验证 |
| SDK | `agentSessionStream(payload)` | 继续暴露兼容入口 | SDK major 升级窗口 |
| SDK | `agentSessionSubscribe(payload, options)` | 新增 stream 入口 | 无（推荐默认） |
| Runtime | `engine.run()` | 作为 `runStream()` 不可用时的回退路径 | DeepAgent/引擎流式覆盖率稳定 |
| Pilot 前端 | `assistant.final` 全量消息 | 保留并补充去重拼接，兼容“仅 final”与“delta+final”两种后端 | 后端统一为 delta-first 且 final 仅标记 |

补充说明：
- 兼容策略遵循“新增不破坏旧接口”：先双写/双读，再按调用覆盖率下线旧路径。
- 下线顺序建议：调用方迁移完成率 > 95% 且连续两个迭代周期无回退。
