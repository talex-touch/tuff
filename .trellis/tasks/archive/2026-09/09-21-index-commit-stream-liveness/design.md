# Design — index-committed 流变聋修复

## 1. 协议事实

- 主进程 `server-runtime.ts sendWithFallback`：先 `sendPortMessage`，返回 false（无 port 适配器 / 记录缺失 / 未确认 / postMessage 抛错）才 `sendFallback` 走 `@main-process-message`。每条信封恰好一条路径。
- 渲染端 `client-runtime.ts startClientStream`：port 消息处理器把 `portActive = true`；channel 的 data/end/error 处理器开头以 `portActive` 丢弃。

结论：`portActive` 丢弃只在「主进程双发」的假设下才有意义，而协议不双发；它真正的效果是把主进程的 channel 回退全部丢掉。

## 2. 改动

`packages/utils/transport/sdk/stream/client-runtime.ts`（渲染端与插件端共用）：

- channel data/end/error 三个处理器的守卫改为 `if (cancelled || cleaned) return`。
- `portActive` 仅保留给 `fallbackToChannel` 的状态与日志；不再决定交付。
- 首次在 `portActive` 为 true 时从 channel 收到信封，记录一次 `adapter.logPortFallback?.(eventName, 'channel_delivery_while_port_active')`，便于日后从渲染端 console 看到主进程已回退（只记一次，避免刷屏）。

不改主进程、不改 `port-policy`、不改 CoreBox。

## 3. 测试

- `packages/utils/__tests__/renderer-transport-stream.test.ts`：
  - 现有「receives session and snapshot once…」把注入的 `channel-duplicate` 改成断言交付（改名为 delivers a channel chunk even while the port is active）。
  - 新增：port 投递 1 条 → channel 投递 1 条 + `end` → 两条都到、`onEnd` 一次、`streamControllers` 清空。
- `packages/utils/__tests__/plugin-transport-stream.test.ts` 同步同一处断言。

## 4. 风险

- 若未来主进程改为双发，需要在渲染端按 streamId+序号去重，届时应在协议层加序号而不是恢复 `portActive` 丢弃。
