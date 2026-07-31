# Unify Rust native protocol and screenshot runtime

## Goal

建立主进程到 `@talex-touch/tuff-native` 的统一、可版本化通信契约，并以 Rust 屏幕截图能力完成首个端到端生产化落地，消除当前按 addon 手写加载、调用、错误与构建链路的分裂。

## Background

- Renderer / plugin 到主进程已经通过 `NativeEvents`、`NativeSdk` 和 `NativeCapabilitiesModule` 形成 typed transport、调用方身份与权限边界。
- 主进程到 native package 仍由 `screenshot.js`、`audio.js`、`index.js` 分别加载 N-API 导出并直接调用，没有统一握手、协议版本、请求关联、错误模型、deadline、取消和生命周期。
- Rust screenshot 与 audio 是两个独立 crate、独立 Cargo lockfile 和独立手动构建脚本，尚未形成共享 Rust 基座。
- 现有 Rust screenshot 已支持显示器枚举、整屏/指定屏/指针所在屏、区域截图和 PNG Buffer；主进程已提供坐标映射、剪贴板、临时文件、`tfile`、Data URL 与保存流程。
- Rust screenshot 当前同步执行屏幕捕获与 PNG 编码，可能阻塞 Electron 主线程。
- 主打包门禁只验证 OCR 和 Windows Everything addon；Rust screenshot/audio 未被构建和 packaged artifact 校验覆盖，对应跨平台审计 R1 仍为 open。
- 较新的 Rust runtime 迁移决策要求 screenshot/OCR 默认保留 N-API 进程身份；sidecar 会增加 macOS TCC、签名和公证复杂度。

## Requirements

- R1. 父任务维护统一需求、子任务顺序、跨子任务验收与最终集成复核，不直接承载实现。
- R2. 子任务 `07-28-rust-native-communication-protocol` 先交付共享 Rust native 协议基座和主进程 adapter。
- R3. Protocol v1 首批必须同时支持 unary request/response 与 native-to-main stream/event，并统一 deadline、cancel、backpressure、terminal result 和 dispose 生命周期。
- R4. 子任务 `07-28-rust-screenshot-mvp` 依赖协议子任务：macOS 交付截图套件，包括静态截图、窗口/UI 元素、指针、延时/预设、精细选区、取色、OCR、二维码、长截图、基础标注、图像贴图、截图/区域历史、多格式保存和剪贴板；Windows/Linux 首期只交付最简单的框选截图，但共享同一协议和可扩展 capability 边界。
- R5. UI 架构采用 Electron/Vue overlay + Rust/ScreenCaptureKit core：Rust 负责 capture/stream/stitch/底层像素处理，Electron 负责选区、工具栏、标注、贴图和历史；两层只通过 NativeTransport 与本地资源边界通信。
- R6. 截图是主进程拥有的独立系统工具：`ScreenshotSessionManager` 统一管理单活 session、overlay 生命周期、权限和取消；全局快捷键、托盘、Assistant、System Actions 与 plugin SDK 只作为携带 caller context 的入口。插件的可见 overlay 使用现有高风险 `window.capture`；新 SDK 的静默单帧使用独立高风险 `window.capture.background`，禁止静默 stream 和历史/识别/贴图管理。
- R7. 现有 renderer/plugin `NativeEvents`、`NativeSdk`、插件身份和权限策略保持兼容；不得让 renderer 或 plugin 直接加载 native addon。
- R8. native 协议必须区分控制面与二进制数据面；截图原始字节不得进入普通 JSON、日志、遥测或无界 Data URL 链路。
- R9. N-API 是首个生产 carrier；首批交付不得以 sidecar 替代 screenshot 默认路径，也不得阻塞未来增加 sidecar adapter。
- R10. 构建、测试、CI、打包产物校验和 packaged runtime evidence 必须与代码交付同时闭环。
- R11. 迁移需保留明确 rollback：协议或新 screenshot 路径不可用时可诊断、可禁用，且不制造 fake success。

## Delivery Map

本父任务不直接承载生产实现，按以下两个可独立验收的子任务推进：

| Order | Task | Responsibility | Start condition |
| --- | --- | --- | --- |
| 1 | `07-28-rust-native-communication-protocol` | Protocol v1、Rust workspace/core、N-API carrier、main `NativeTransport`、unary/stream/attachment/lifecycle contract | 规划评审后单独启动 |
| 2 | `07-28-rust-screenshot-mvp` | 基于已验收协议交付 macOS 截图套件、Windows/Linux 基础框选和 packaged evidence | 协议任务完成后；内部继续按子任务拆分 |

父任务只在两个子任务均完成、跨任务兼容验证通过且 audit evidence 更新后验收。

## Acceptance Criteria

- [ ] 两个子任务均完成各自 acceptance criteria，并按协议基座在前、screenshot 在后的顺序交付。
- [ ] Renderer/plugin 到 main、main 到 native、Rust capability、二进制资源输出的完整数据流有一致契约和回归测试。
- [ ] macOS 完整截图工具覆盖经用户确认的 PixPin 基础功能清单，并完成真实 packaged runtime evidence。
- [ ] Windows/Linux 通过同一协议完成最简单的框选截图；未实现的高级能力由 capability discovery 明确返回 unsupported/degraded，不影响基础截图。
- [ ] Screenshot capture 不在 Electron 主线程同步执行屏幕捕获和 PNG 编码。
- [ ] Rust screenshot addon 在支持的平台 CI/build 流程中构建，并被主打包前置校验和 packaged artifact 校验覆盖。
- [ ] macOS、Windows、Linux 对可用、权限拒绝、无显示器、addon 缺失或平台降级返回稳定且可诊断的结果。
- [ ] `.trellis/tasks/07-13-search-crossplatform-audit/prd.md` 的 R1 在真实 packaged evidence 完成后更新状态和证据。
- [ ] 现有 screenshot UI、复制、保存、翻译和插件 SDK 兼容回归通过。

## Out of Scope

- 屏幕录制和录制后编辑。
- 文本、文件、颜色和 LaTeX 通用贴图。
- PixPin 会员/Pro 功能，包括翻译、表格/公式识别、长截图自动裁剪、智能擦除、多语言 OCR 选择、工业条码、云同步和付费编辑增强。
- 一次性迁移或重写全部 C++ OCR、Everything 与 app-icon native 实现。
- 默认引入 sidecar、独立 CLI 或 renderer 直连 native。
- 与本任务无关的 TuffTransport、搜索系统或插件权限重构。
