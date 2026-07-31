# 原生库集成策略（Native Protocol v1）

## Scope

- 定义 Electron main 与 Rust capability addon 的版本化通信协议。
- 明确 carrier、ABI、加载隔离、attachment、stream、取消和销毁边界。
- 约束 renderer/plugin 资源暴露与后续 screenshot capability 迁移。

## Summary

- 首个生产 carrier：N-API，只允许 Electron main 加载。
- 每个 capability 使用独立 addon，加载和降级互不影响。
- addon 共享不依赖 Electron/N-API 的 `native-core`；`native-napi` 只实现 carrier adapter。
- Sidecar 是未来可选 carrier，不是 v1 fallback，也不能绕过相同 wire contract。
- Rust 与 main 可交换有界 `Buffer[]` attachment；attachment 在 main 截止，renderer/plugin 只接收受控资源描述符。

## References

- `packages/tuff-native/protocol-contract.{js,d.ts}`
- `packages/tuff-native/protocol.{js,d.ts}`
- `packages/tuff-native/native-core/`
- `packages/tuff-native/native-napi/`
- `apps/core-app/src/main/modules/native-capabilities/native-transport.ts`
- `.trellis/spec/frontend/native-resource-protocols.md`
- `.trellis/tasks/07-28-rust-native-communication-protocol/design.md`
- `docs/script-native-build-distribution.md`
- `docs/script-native-capability-matrix.md`

---

## 1) 选型结论

当前优先级：

1. **N-API carrier**：首个生产实现，保留 Electron 进程身份，适合 TCC、屏幕录制、音频和系统集成能力。
2. **Sidecar carrier**：仅预留扩展；确有崩溃隔离或独立生命周期需求时再实现。
3. **FFI**：不进入生产协议路径。

N-API 的风险通过以下边界控制，而不是把所有能力合并进一个二进制：

- screenshot、audio 等 addon 独立构建、加载、handshake、health 和 dispose；
- 一个 addon 缺失、ABI/export mismatch 或 capability degraded 不影响其他 addon；
- `NativeTransport` 只根据成功 handshake 的 capability 建路由，冲突 capability fail closed；
- blocking 系统工作必须由 capability 自己的 OS queue/thread 或 Rust `spawn_blocking` 承担，不阻塞 Electron main。

## 2) Protocol v1 入口

N-API addon 必须完整提供六个版本化导出：

```text
nativeProtocolV1Handshake
nativeProtocolV1Invoke
nativeProtocolV1OpenStream
nativeProtocolV1Ack
nativeProtocolV1Cancel
nativeProtocolV1Dispose
```

低层 `NapiCarrier` 验证导出、编码/解码 control、复制 N-API Buffer 所有权并管理 addon-local stream callback。CoreApp 的唯一 `NativeTransport` 负责：

- 多 carrier 并行 handshake 与独立降级；
- capability discovery、冲突检测和路由；
- unary deadline/AbortSignal/cancel 与迟到结果抑制；
- `AsyncIterable` stream、credit ACK、单 terminal 和 iterator cleanup；
- carrier-scoped health；
- main 总预算内的并行 dispose。

`native.runtime/health` 是 carrier-scoped 保留操作，不进入聚合 capability route table。

## 3) ABI 与平台

| 平台 | 首期架构 | N-API v1 | Sidecar | 备注 |
| --- | --- | --- | --- | --- |
| Windows | x64 | 必须 | 未实现 | 独立 `.node` |
| macOS | arm64 | 必须 | 未实现 | 需要签名/公证和 TCC 一致性 |
| Linux | x64 | 必须 | 未实现 | 需要对应系统 native build dependencies |

- Rust workspace 使用 `packages/tuff-native/Cargo.toml` 和唯一根 `Cargo.lock`。
- napi-rs 工具链在 workspace 统一锁定。
- CI 在 macOS/Windows/Linux 运行 fmt、clippy、test、release build 和真实 fixture addon contracts。
- addon 导出或协议版本不完整时，loader 在 handshake 前失败，不能产生误导性的部分可用状态。

## 4) 控制面与 attachment

每个 packet 是“有界 JSON control + positional `Buffer[]`”：

- descriptor ID 唯一，index 连续，byteLength 与 Buffer 精确匹配；
- 输入 Buffer 在 `NativeTransport.invoke()` 第一个 `await` 前同步复制，并在 N-API 进入异步 Rust work 前再次取得 Rust 所有权；
- stream 使用逻辑 credit window，main 在 consumer 取走 chunk 后、resolve `next()` 前同步累计 ACK；
- terminal 不消耗 credit；Rust 保留固定上限的 completed-stream tombstone 处理 final-data ACK race；
- 图片、音频、OCR/QR 内容、窗口标题、敏感绝对路径、payload 和原始 native exception 不进入日志或普通 JSON。

Attachment 只允许存在于 Rust 与 Electron main 之间。Main 必须把跨层资源提升为受控本地资源或其他明确 owner，再通过 typed TuffTransport 返回 descriptor/`tfile://` URL。Renderer、plugin、preload 和 MessagePort 不得加载 raw addon 或 `NapiCarrier`。

## 5) 错误、取消与生命周期

- 对外只使用稳定 `{ code, category, message, retryable, details? }`；message 不携带原始 exception。
- lifecycle 为 `NEW -> INITIALIZING -> READY -> DISPOSING -> DISPOSED`。
- request/stream ID 使用随机 process nonce 加单调 BigInt counter，不复用。
- timeout、caller abort、native completion、iterator return 和 dispose 通过 state token 竞争唯一 terminal owner。
- stream producer 在 credit 为零时停住；published frame 不静默丢弃。
- 每个 carrier 有自身 dispose grace，CoreApp 对所有 carrier 并行 dispose 并施加总预算。

## 6) Screenshot protocol-only 状态

Screenshot 已完成 protocol-only hard cut：

- `tuff-native-screenshot.node` 只导出六个 `nativeProtocolV1*` 函数；不存在同步 legacy screenshot export、`./screenshot` package subpath 或 raw-addon facade。
- macOS 12.3+ 使用 ScreenCaptureKit 作为 capture eligibility 与 identity 权威来源；14+ 静态截图走 `SCScreenshotManager`，12.3-13 走短生命周期 `SCStream`，连续帧使用同一受控 stream bridge。
- `probe -> refresh -> hit_test -> capture -> frames` 使用 generation-scoped opaque descriptor；UI element 由独立 AX actor best-effort 增强，失败保留 window-level candidate。
- CoreApp 通过 `NapiCarrier -> NativeTransport` 调用。Rust attachment 在 main 重组并提升为 namespace-scoped `tfile://` resource；public request 不接受 output selector，public result 不包含 `dataUrl`、base64、raw path 或 attachment bytes。
- Windows/Linux 使用同一 protocol capability 的 xcap 基础 backend，只广告 display 与单屏 region；advanced target/stream 均 fail closed。
- Linux Wayland 因 xcap 使用全局最大 scale、无法满足 `global-dip-v1` 混合缩放合同而在初始化时报告 `wayland-unsupported`；无 `DISPLAY` 的 headless Linux 报告 `display-server-unavailable`。不进行坐标猜测或 runtime fallback。

Screenshot migration 禁止恢复以下路径：legacy facade、renderer/plugin `.node` 加载、`NapiCarrier` 暴露、global-origin scaling、display 猜配、普通 JSON 图片输出或运行时 fallback。

## 7) 回退策略

| 场景 | v1 行为 |
| --- | --- |
| addon 文件缺失 | 该 carrier 标记 unavailable；其他 carrier 继续工作 |
| 导出或 ABI mismatch | loader 返回稳定错误，不执行部分 handshake |
| 协议版本/feature 不兼容 | carrier 不注册 route |
| capability degraded | 保留 descriptor reason，由 main 决定是否路由 |
| stream protocol/backpressure 破坏 | 本地单 terminal、取消 source、抑制迟到 frame |
| main 销毁超时 | 记录稳定 `NATIVE_DISPOSE_TIMEOUT`，完成本地状态释放 |

Sidecar 不是自动回退。若未来实现，必须复用同一 control/attachment/credit/lifecycle contract，并单独处理进程身份、TCC、签名、公证和数据面所有权。
