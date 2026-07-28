# Transport MessagePort Lanes

## Goal

按 clipboard、file-index、search 三条高频 lane 完成 MessagePort-first / channel-fallback 迁移验证，清退已经失活的 search legacy push 端口项，并把订阅关闭条件收敛为可证明的生命周期不变量。

## Confirmed Facts

- 默认端口清单当前包含 7 个 event；活跃高频 lane 为 `ClipboardEvents.change`、`AppEvents.fileIndex.progress`、`CoreBoxEvents.search.session`、`CoreBoxEvents.search.indexCommitted`。
- `CoreBoxEvents.search.update/end/noResults` 已被 request-scoped `search.session` stream 取代，但仍在默认端口清单。
- renderer/plugin stream 都支持端口不可用与中途关闭后的 channel fallback；renderer 测试尚未覆盖 mid-stream close 和完整资源释放。
- 普通 `on()` 为 allowlisted event 同时注册 port 与 channel；main 端发送选择 port 或 channel 之一。
- renderer→main `CoreBoxEvents.layout.update` 仍是 16ms latest-batched typed request；现有 MessagePort 协议没有保持 request/response 完成语义的反向 RPC。

## Requirements

- 保留四个活跃高频通道的默认 MessagePort allowlist；删除三个失活 search push event。
- 对 clipboard、file-index、search 分 lane 验证 port-first、open failure fallback、mid-stream close fallback、cancel、sender destroy 与 transport destroy。
- 同一 chunk/event 不得同时经 port 和 channel 交付。
- 最后一个 handler/controller 释放时关闭对应端口；open 尚未完成时释放也必须在 handle 返回后立即关闭。
- renderer 与 plugin 的事件订阅关闭条件必须一致；如保留重复实现，行为矩阵必须相同。
- 不把 `layout.update` 机械改成 fire-and-forget；保持其 batch 和失败语义，并留下明确 carve-out。

## Non-goals

- 不修改业务 payload、search session 所有权或 provider 并发模型。
- 不在本子任务处理 sendSync、CoreBox raw event 或 legacy alias hard-cut。
- 不新增通用双向 MessagePort RPC。

## Acceptance Criteria

- [x] 默认 allowlist 只包含四个活跃高频 push/stream events。
- [x] renderer 与 plugin 对 port success、port unavailable、mid-stream close、cancel/destroy 的行为一致。
- [x] last handler、close-before-open、messageerror、sender destroyed、transport destroy 均无遗留 port/listener/timeout/cache entry。
- [x] CoreBox 两个 search stream 在两个 sender 下互不串流，取消只影响 owner，terminal 至多一次。
- [x] `layout.update` 继续 16ms latest batching 且 handler 完成/失败语义不变。
- [x] focused port-policy、renderer/plugin stream、CoreBox search transport 测试及 CoreApp typecheck 通过。

## Rollback

- 设置空 `TALEX_TRANSPORT_PORT_CHANNELS` 可关闭全部端口升级并回到 channel。
- 端口 lane 修改按 lane 回退；不得只恢复失活 search push allowlist 项而不恢复其完整 producer/consumer contract。
