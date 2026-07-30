# Build macOS screenshot capture core

## Goal

在统一 native protocol 上建立 macOS ScreenCaptureKit-backed Rust capture core，并保留 Windows/Linux 的简单 xcap 框选后端，为上层截图工作流提供可版本化的显示器、窗口/UI 元素、区域、cursor 与连续帧能力。窗口识别必须适用于多显示器、不同尺寸/缩放、负原点、旋转和跨屏窗口，不能依赖标题或近似尺寸猜测身份。

## Confirmed Facts

- protocol v1 已提供独立 addon handshake、capability registry、unary/stream attachment、deadline/cancel、credit backpressure、health 和有界 dispose。
- 现有 `native-screenshot` 使用 xcap 0.9.4 同步枚举/捕获显示器并编码 PNG；macOS 路径基于旧 CGWindow capture，不能控制 self-exclusion、cursor 或可靠连续帧。
- 现有 CoreApp display pairing 会把 Electron global DIP bounds 整体乘以单块显示器 scale；该算法在负原点、混合 1x/2x 和不同行列布局下不成立。正确变换只能缩放 display-local delta。
- xcap 可继续承担 Windows/Linux 首期单屏 region capture；Linux 仅限 xcap 坐标合同可证明的 X11 session，Wayland 的全局 max-scale 模型必须 fail closed。其 macOS window list 只覆盖 on-screen/shareable 窗口，不足以支撑完整工具。
- Rust capture core 不创建 overlay/editor/pin 窗口，也不拥有调用方权限、剪贴板、文件或 `tfile` 策略。

## Requirements

- R1. macOS 以 ScreenCaptureKit shareable content 作为 capture eligibility 与 capture identity 的权威来源；需要额外窗口层级/排序信息时只能按系统 window ID 关联，不得以标题、owner name 或 bounds 猜测。
- R2. 每次 content refresh 产生 session/topology generation。Display descriptor 同时包含 session-scoped ID、native display ID、global DIP/point frame、oriented physical pixel size、per-axis scale、rotation 和 primary 标记；display ID 不承诺跨重启永久稳定。
- R3. Window descriptor 包含 session-scoped ID、native window ID、owner/app、PID、global DIP/point bounds、layer、on-screen/active/capturable/protected/minimized 推断和所覆盖 displays。窗口标题仅返回给已授权主进程调用，不写日志、错误或遥测。
- R4. 窗口识别/命中测试必须使用明确的 front-to-back order、可配置最小尺寸、layer/alpha/capture eligibility 和 point containment。默认忽略桌面、菜单栏、tooltip、透明/零面积窗口和 Tuff 自身工具窗口；普通跨屏窗口仍作为一个 window target。
- R5. macOS Accessibility 边界按 PID/window 关联 AX window 与可用子元素，返回 role/subrole、enabled/focused、global bounds 和 session-scoped element ID。无 Accessibility 权限、目标不暴露 AX hierarchy 或元素消失时稳定降级到 window-level，不阻断普通窗口截图。
- R6. 坐标模型明确区分 `GlobalDipRect`、`DisplayLocalPointRect`、`DisplayLocalPixelRect` 和 `OutputPixelRect`。变换使用 display-local offset 与显式 scale；覆盖负原点、屏幕位于主屏上/下/左/右、混合 1x/2x、非等尺寸、旋转和边界舍入。
- R7. 单屏 region 必须完全落在目标 display。跨屏 region 生成按 display intersection 切分的 capture plan，并以显式统一 output scale 合成；空洞区域透明，不能把一块屏幕的 scale 应用到另一块。跨屏 window 使用 ScreenCaptureKit desktop-independent window capture，不按显示器裁断。
- R8. 默认 self-exclusion 以当前 PID/bundle 与实时 Tuff window IDs 为依据；display/region capture 排除全部 Tuff windows，显式 capture-own-window 也必须继续排除 overlay/menu/editor/pin 等工具窗口。
- R9. Cursor policy 为显式 `hidden | system`，由 ScreenCaptureKit configuration 实现；不通过额外鼠标图层伪造。权限 probe 不主动弹系统提示，capture 时将拒绝、restricted/protected content 映射为稳定错误。
- R10. Static capture、PNG encode 和像素合成离开 Electron main。连续帧使用 protocol stream，sequence 有序、受 credit backpressure、支持 deadline/cancel，并只产生一个 terminal。
- R11. Windows/Linux 继续使用 xcap 或等价 backend 完成基础单屏 region PNG；window/UI-element/self-exclusion/cursor/stream 等高级 feature 必须在 handshake capability 中准确标为 unsupported/degraded。Linux Wayland 若不能证明 per-display `global-dip-v1` 必须在初始化时 unavailable，不能猜测坐标。
- R12. `native-screenshot` 只暴露 protocol v1 exports；五个同步 legacy screenshot exports、`./screenshot` package subpath、CoreApp raw-addon loader 和运行时 fallback 全部删除。所有生产调用必须经 `NapiCarrier -> NativeTransport`；carrier 缺失、env-disabled、旧二进制或 capability unavailable 时 fail closed，不得调用 xcap legacy facade。Windows/Linux xcap 仅作为同一 protocol capability 的 basic backend 存在。
- R13. 图片 bytes 只作为 Rust-to-main attachment；display/window/UI descriptors 不包含 bytes。图片、窗口标题、应用路径、AX 文本和值、原始系统/native exception 不进入日志或普通 JSON。
- R14. addon dispose、ScreenCaptureKit stream stop、AX references 和 callback token 必须有界释放；content refresh 后旧 generation 的 display/window/element ID fail closed，不能捕获复用 ID 指向的新对象。

## Acceptance Criteria

- [x] macOS 真实 smoke 经普通 addon/CoreApp transport 完成 display/window/region、cursor hidden/system、self-exclusion 与 own-window exception；本机为单显示器，未宣称跨屏硬件证据。
- [ ] Window list 在标准 AppKit、Electron 和浏览器窗口上提供稳定 owner/PID/bounds/layer/capturable 信息；窗口关闭、最小化、移屏、跨屏或 ID generation 过期时返回稳定结果，不误捕获另一窗口。
- [x] UI element 可选择本机真实标准控件并完成 element capture；AX failure categories/coherence tests 证明 denied/timeout/unsupported/unverified 时保留 window fallback。
- [x] 纯 Rust coordinate tests 覆盖：左侧负原点 1x + 主屏 2x、上方旋转屏、不同 point/pixel 尺寸、跨屏 region、跨屏 window、边界像素舍入和 DIP→local point→pixel round-trip。
- [x] Window hit-test tests 覆盖重叠窗口 front-to-back、layer、透明/零面积、桌面/菜单/tooltip、自身窗口排除和 capture eligibility。
- [x] 权限拒绝、protected content、未知/过期 display/window/element、零尺寸/越界 region、cancel、timeout 均映射稳定 protocol error；日志/control contract 不含标题、路径、content 或 raw native error。
- [x] 连续帧 stream 有序、受 credit 背压控制，cancel/dispose 后无迟到 frame，并只产生一个 terminal；deterministic 与真实 first-frame/stop integration 均通过。
- [ ] Windows/Linux 通过同一 protocol capability 完成基础单屏 region PNG，并准确声明高级能力不可用。
- [x] protocol-only addon、NativeTransport、Rust fmt/clippy/workspace tests/release build、focused main、package surface 与 renderer/plugin forbidden-import contracts 本地通过。

## Dependencies

- `07-28-rust-native-communication-protocol` 的 protocol v1、Rust core、N-API carrier 和 main adapter 已实现并通过本地 gate；该任务尚未 commit/archive，不影响当前工作树内依赖代码的使用。

## Out of Scope

- Overlay UI、窗口命中后的交互高亮、长图拼接、标注、贴图和产品历史。
- Windows/Linux 完整窗口/UI 元素/cursor/stream 体验。
- 以窗口标题或 app path 建立跨 session 永久 identity。
- 主动授予或绕过 Screen Recording/Accessibility 系统权限。
- 保留 legacy screenshot addon exports、`./screenshot` facade 或 CoreApp fallback。
