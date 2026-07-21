# 修复搜索流 MessagePort 交付 — Design

## Root Cause Boundary

Electron main process 通过 `webContents.postMessage(..., [port])` 把 `MessagePort` 交给 preload 的 isolated world。现有 renderer transport 通过 `contextBridge` 暴露的 `electronAPI.ipcRenderer.on()` 直接读取 `event.ports[0]`；这把可转移端口跨 contextBridge 当作普通回调参数使用。主进程收到确认后选择 port-only 发送，但 renderer main world 没有一个可靠拥有该端口的监听端，因而没有 channel fallback，也没有 UI chunk。

## Port Handoff

1. CoreApp 与 trusted plugin-view preload 在 isolated world 订阅 typed `TransportEvents.port.confirm`。
2. preload 只提取确认 payload 与 `event.ports[0]`，通过固定 marker 的 `window.postMessage` transfer list 把端口转交给 renderer main world；不暴露原始 `IpcRendererEvent`。
3. renderer/plugin transport 订阅该 window message，验证 `source`、marker、payload 与单一 transferred port 后，进入既有 `handlePortConfirm`、ack、handle 和 stream 生命周期。
4. 非 DOM/非隔离测试运行时保留现有 `ipcRenderer.on` adapter；真实 context-isolated renderer 优先使用 window bridge。

共享 marker、payload guard、preload installer 与 renderer subscriber 由 transport package 单点拥有；两个 preload entry 只负责安装/销毁。

## Delivery Invariants

- 主进程只在 typed confirm ack 后把 port 标为 confirmed。
- stream start 仍携带精确 `__transportPortId`；不同 sender/stream 不共享交付所有权。
- 数据经 port 成功发送后不镜像 channel；port 不可用或关闭后的后续数据走既有 fallback。
- renderer 在端口 listener 安装后才发送 stream start，因此同步首批 `session`/`snapshot` 不丢失。
- cancel、terminal、transport destroy 和 window unload 的 cleanup 保持幂等。

## Security

- 页面看不到 Electron event、sender 或其它 privileged object。
- window bridge 只接受同 window source、固定 marker、合法字符串 `portId/channel` 和恰好一个 transferred port。
- 页面伪造无 transferable port 的消息会被忽略；主进程仍按 sender、scope、channel 和 port id 校验 typed ack。

## Compatibility And Rollback

- 不改变 transport event payload 或 public stream API。
- channel fallback 与 `TALEX_TRANSPORT_PORT_CHANNELS=""` rollback 保留。
- 不触碰 search engine/provider/indexing 代码。
