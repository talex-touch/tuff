# 修复搜索流 MessagePort 交付

## Goal

修复 beta.16 中默认 MessagePort 搜索流完成但结果未送达渲染端的回归，并完成真实 Electron 验证。

## Confirmed Failure

- `v2.4.13-beta.16` 在默认 MessagePort allowlist 下会完成搜索引擎执行，但 CoreBox 渲染端保持 0 条结果。
- 同一构建设置 `TALEX_TRANSPORT_PORT_CHANNELS=""` 后，既有 channel fallback 能正常显示结果；索引数据库与搜索 provider 不是故障源。
- 当前 renderer stream 测试直接 mock `openPort()`，没有覆盖 context-isolated preload 到 renderer main world 的真实端口转交。

## Requirements

- 在 context isolation 开启时，由 preload 持有 Electron `IpcRendererEvent.ports`，再通过受约束的 window message bridge 将真实 `MessagePort` 转交给 renderer main world；不得把原始 Electron event 暴露给页面。
- renderer 与受信插件视图使用同一端口确认协议；非 Electron、无端口和端口故障路径继续使用现有 channel fallback。
- 保持 search stream 的 `session -> snapshot -> update* -> complete/end` 顺序、请求级取消、单 terminal 和不重复交付不变量。
- 不修改搜索、索引、排序、provider 或结果合并语义；修复位于 transport/preload 边界。
- 端口监听器、转交失败端口及窗口销毁路径必须可释放，不遗留 main-process port registry 记录。

## Acceptance Criteria

- [x] 回归测试覆盖 context-isolated preload 转交端口，并证明 renderer 使用真实转交端口接收首批数据和 terminal，而不是 mock `openPort()` 返回值。
- [x] MessagePort 路径每个 chunk 只交付一次；确认失败、端口关闭和显式禁用时仍能走 channel fallback。
- [x] renderer 与 plugin transport 的确认、关闭和错误行为保持一致。
- [x] 聚焦 transport/CoreBox 测试、CoreApp typecheck 和生产构建通过。
- [x] 默认 MessagePort allowlist、无 `TALEX_TRANSPORT_PORT_CHANNELS=""` 的真实 Electron 构建中，CoreBox 搜索能显示已索引结果。

## Non-goals

- 不重新设计双向 MessagePort RPC，不迁移 `CoreBoxEvents.layout.update`。
- 不调整 search session、索引数据或 provider 生命周期。

## Rollback

- 紧急回滚仍可设置空 `TALEX_TRANSPORT_PORT_CHANNELS`，强制使用现有 channel 路径。
