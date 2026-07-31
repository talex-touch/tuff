# Build Rust native communication protocol

## Goal

为 Electron 主进程与 `@talex-touch/tuff-native` 建立统一、可版本化、可测试的通信协议和调用入口，使 Rust capability 不再各自定义加载、调用、错误与生命周期语义。

## Confirmed Facts

- 外层 TuffTransport 已拥有 typed event、request/response、stream、cancel、MessagePort fallback 和 plugin identity，但这些能力只覆盖 renderer/plugin 与 main 的边界。
- `packages/tuff-native/native-loader.js` 只负责固定路径加载和导出函数存在性检查，不提供协议握手或运行时能力注册。
- screenshot、audio 和 C++ OCR wrapper 对 unavailable、disabled、best-effort 与错误码的处理方式不同。
- screenshot/audio Rust crate 使用相同 napi-rs 主版本和几乎相同的 build script，但没有 Cargo workspace 或共享 crate。
- 主进程是唯一允许加载 native addon 的产品边界；插件授权仍由 `NativeCapabilitiesModule` 负责。

## Requirements

- R1. 定义一个由 main adapter 与 Rust runtime 共同遵守的 protocol v1，包含协议版本、请求 ID、capability、operation、payload、可选 deadline 和二进制 attachment 描述。
- R2. 定义统一响应结果，包含请求关联、成功 payload 或结构化错误，以及有界运行元数据；错误至少包含稳定 code、category、message 和 retryable。
- R3. 提供握手与 capability discovery，能识别协议不兼容、addon 构建信息、平台/架构、engine、feature 与 degraded reason。
- R4. 提供真实 deadline/cancel 语义：主进程超时后不得继续向调用方发布迟到结果；Rust 可取消阶段必须收到取消信号，不可中断的系统调用必须明确 best-effort 行为。
- R5. Protocol v1 首批实现 native-to-main stream/event：必须定义 stream ID、sequence、data/error/end frame、backpressure、cancel、单 terminal、订阅释放和 transport dispose 行为。
- R6. 协议必须支持 Buffer attachment，不得要求二进制内容经过 JSON/base64；unary response 与 stream frame 均只能引用有界 attachment metadata。attachment 只存在于 Rust 与主进程之间，主进程必须消费或提升为受控本地资源，不得继续转发到 renderer/plugin TuffTransport、MessagePort 或 preload。
- R7. 建立唯一主进程 `NativeTransport` 入口，统一 loader、握手、invoke、subscribe/stream、错误映射、timeout/cancel、health 和 dispose；迁移后的业务服务不得直接调用 addon 导出。
- R8. 建立共享 Rust workspace/core，集中拥有协议模型、错误分类、capability descriptor、请求/stream 关联与生命周期不变量；各 capability addon 保持故障隔离。
- R9. N-API adapter 是 v1 的生产 carrier；协议模型不得绑定 Electron API，并应允许后续 sidecar 使用同一控制契约。
- R10. 保持 `@talex-touch/tuff-native` 现有公开 facade 可兼容迁移，避免一次性破坏 screenshot/audio/OCR 调用方。
- R11. 插件身份、权限、剪贴板、临时文件和 `tfile` 策略不得下沉到 Rust；native runtime 只处理已经过主进程策略校验的请求。
- R12. 协议实现和测试不得记录截图、音频、OCR 原文、绝对敏感路径或 secret attachment。

## Acceptance Criteria

- [x] Rust 与 JS/TS 对同一组 protocol v1 golden fixtures 完成成功、失败、未知 operation、版本不兼容和 attachment round-trip 验证。
- [x] Main adapter 能完成 handshake、capability discovery、invoke、stream/subscribe、deadline/cancel、health 和 dispose，并在 addon 缺失或 export/protocol mismatch 时返回稳定错误。
- [x] Synthetic stream capability 通过真实 `fixture .node -> NapiCarrier -> NativeTransport -> AsyncIterable` 链路证明有序 sequence、受控背压、逐消费 ACK、cancel、error/end 单 terminal、unsubscribe 和 dispose 后无迟到 frame。
- [x] 至少一个测试 capability 通过同一真实链路和统一 registry 完成 unary Buffer round-trip；screenshot 的真实迁移由依赖子任务承接。
- [x] 同一 unary request 或 stream 只产生一个 terminal result；cancel、timeout、dispose 与迟到 native completion 不会重复完成或泄漏 in-flight state。
- [x] 主进程迁移代码不再自行拼接 capability 私有错误字符串或直接访问 N-API 导出。
- [x] Cargo workspace 的 format、clippy、unit test、release build 和 JS contract test 均通过。
- [x] 未迁移的 audio/OCR/Everything/screenshot facade 在 binding present、absent 和支持 env-disable 的矩阵下继续工作，或返回与基线一致的明确 degraded/错误结果。

## Dependencies

- 无实现前置依赖；本任务必须先于 `07-28-rust-screenshot-mvp` 完成。

## Out of Scope

- 本子任务不迁移 screenshot 之外的真实业务 capability。
- 不实现生产 sidecar carrier、跨进程重启或崩溃恢复。
- 不复制 TuffTransport 的 batching、cache、窗口路由、plugin identity 或 MessagePort 策略。
- 不重写外层 `NativeEvents` / `NativeSdk`。
