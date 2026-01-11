# TuffTransport Port 抽象方案 260111

## 结论先行
TuffTransport 需要从 “具体 IPC 实现” 中抽离出统一的传输协议层，并新增 “子 port” 概念作为多路复用通道。上层只依赖 `postMessage/onMessage` 与协议封装，具体实现由不同 port adapter 负责。

## 现状审查（严格）
### 依赖关系
- TuffTransport 当前直接依赖 TouchChannel（`regChannel/send`）。
- stream 通过事件后缀 + `streamId` 模拟，不是真正的端口流。
- 批处理只在 renderer 侧进行，缺乏全局调度与背压。

### 序列号策略（当前）
- 请求关联：`sync.id`（`Date.now + Math.random`）用于 request/reply 匹配。
- stream：仅 `streamId`，没有 chunk 序列号。
- 没有统一的 `seq` 递增逻辑，也没有重排/重试语义。

### 大小策略（当前）
- 无显式 payload size 管控或 chunking。
- 序列化使用 `structuredStrictStringify`，大 payload 会失败并抛错。
- 没有 backpressure：大 payload 或频繁发送容易堵塞 event loop。

### 风险点
- 大消息导致序列化失败或 IPC 堵塞。
- stream 数据包无序/丢包时无法纠正。
- 事件命名/后缀式 “伪流” 可维护性差。

## 目标协议形态
### 统一抽象：TuffTransportPort
```ts
interface ITuffTransportPort {
  postMessage(message: TuffTransportMessage): void
  onMessage(handler: (message: TuffTransportMessage) => void): () => void
  close(): void
  readonly portId: string
}
```

### 子 port（多路复用）
- `transport.openPort('file-index')` 返回子 port。
- 子 port 共享底层传输，但拥有独立的序列号与队列。
- 支持模块级隔离与统计。

## 协议封装（建议）
### Message Envelope
```ts
type TuffTransportMessage = {
  port: string
  kind: 'request' | 'response' | 'stream' | 'chunk' | 'event'
  seq: number
  streamId?: string
  chunk?: { index: number; count: number; totalBytes?: number }
  payload?: unknown
  error?: { code: string; message: string }
  traceId?: string
}
```

### 序列号策略（建议）
- `seq`：每个 port 递增（uint32），用于 request/response 关联。
- `streamId + seq`：用于 stream 分片顺序。
- 支持 out-of-order 重排（可选），异常时回退降级。

### 大小策略（建议）
- `maxPayloadBytes` 软阈值（如 1~2MB）。
- 超阈值自动 chunk：
  - `chunk.index / chunk.count / totalBytes`
  - 重组后再进入 handler
- chunk 发送遵循 backpressure（队列限流）。

## Port Adapter 设计
### Electron IPC Adapter
- `ElectronIpcPort`：使用 `ipcMain/ipcRenderer` 发送与监听。
- 负责序列化与反序列化（含 chunk 组装）。

### MessagePort Adapter
- 未来可接入 `MessagePort` 或 `worker_threads`。
- 复用同一协议，不改上层。

### Plugin Adapter
- `PluginPort`：保留 keyManager 安全握手，嵌入 header。

## 迁移路径（不破坏现有 API）
1. 新增 `transport/port` 目录与 `TuffTransportCore`（协议层）。
2. `TuffRendererTransport` / `TuffMainTransport` 改为封装 port。
3. 保留 `send/on/stream` API；内部通过 `seq/port` 路由。
4. 逐步替换 stream 后缀事件为协议化流。

## 对当前问题的直接收益
- 统一序列号与大小策略，降低大 payload 崩溃风险。
- stream 有明确顺序与 chunk 语义。
- 子 port 支持模块隔离与调度（为 TaskScheduler 打底）。
