# Productionize Rust screenshot MVP

## Goal

将现有 Rust screenshot 能力迁入统一 native protocol；在 macOS 上交付静态截图、长截图、基础标注、图像贴图与历史组成的完整截图套件，在 Windows/Linux 上提供最简单的框选截图和可扩展架构，同时闭环异步执行、稳定错误、构建、打包与真实应用验收。

## Confirmed Facts

- Rust addon 已支持 support probe、显示器枚举、默认/指定显示器、指针坐标选屏、区域截图、PNG 编码和区域边界校验。
- 主进程 `NativeScreenshotService` 已处理 Electron DIP 与 physical pixel 映射、显示器匹配、剪贴板、临时文件、`tfile` 和 Data URL。
- Renderer 已有区域选择器；Assistant 已提供选择显示器、选区、截图并复制、保存截图和截图翻译流程。
- 当前 Rust capture 与 PNG encode 为同步 N-API 调用，即使 TypeScript service 声明为 `async` 也会阻塞主线程。
- support probe 和 capture 的底层错误仍主要依赖 xcap/raw message，尚未形成稳定权限与失败分类。
- `build:screenshot` 是独立脚本，主 CI/install/build-target/package verification 不保证产出或装入 `tuff_native_screenshot.node`。

## Requirements

- R1. Screenshot 必须通过 `07-28-rust-native-communication-protocol` 提供的 main adapter、N-API carrier 和 Rust capability registry 执行。
- R2. 平台能力分层：macOS 交付完整截图套件；Windows/Linux 首期只要求最简单的框选截图，但共享 protocol、request types、capability discovery 和 adapter，不创建不可迁移的特例。
- R3. macOS capture backend 必须支持显示器、窗口/UI 元素、区域、self-exclusion、cursor policy 和连续帧；现有 xcap 可作为兼容 fallback，但不得限制 ScreenCaptureKit 能力或继续依赖 `CGWindowListCreateImage` 作为完整工具的唯一主路径。
- R4. 产品 UI 采用 Electron/Vue transparent overlays、editor 和 pin windows；Rust 不创建产品窗口，Electron 不直接实现 native capture/stitch。大图只通过本地资源、tile/chunk 或 bounded attachment 进入 renderer。
- R5. 截图是独立系统工具，不归属 Assistant view。主进程 `ScreenshotSessionManager` 统一管理单活 session、入口身份、权限、overlay windows、cancel/dispose 和结果路由；全局快捷键、托盘、Assistant、System Actions 与 plugin SDK 均调用该 manager。第三方插件启动可见 overlay 需 `window.capture`；新 SDK marker 下静默单帧需单独声明并获批高风险 `window.capture.background`。
- R6. macOS 静态截图工作流包括：全局快捷键/托盘入口、显示器/窗口/UI 父子元素检测、自由选区、延时与区域预设、鼠标与键盘像素级移动/缩放、手动尺寸、固定比例、放大镜取色、光标开关、圆角、阴影/边框、复制、保存和图像贴图。独立入口确认后固定进入 editor；typed caller 可显式使用 `return-resource`，Windows/Linux 基础框选仍直接输出 PNG。
- R7. 静态选区默认先捕获各显示器并显示冻结帧，同时提供显式实时模式；冻结→实时透出当前桌面并保持 Tuff self-exclusion，实时→冻结重新捕获当前帧。确认时必须使用当前模式对应的帧，切换和结束时释放非历史临时资源。
- R8. macOS 长截图包括：纵向/横向、手动滚动、start/stop/cancel、选区移动与尺寸调整、方向切换、头尾手动裁剪、实时缩略图与匹配状态、贴图/保存/快速保存/复制，以及明确的动态内容、固定元素、重复内容和多滚动区失败提示。
- R9. 长截图 session 必须通过 protocol stream 实现有序帧、背压、取消和单 terminal；拼接引擎必须设置 duration、frame、pixel、dimension 和 memory budget，不得采用每帧复制完整累计图像的无界实现。
- R10. macOS 基础标注包括：矩形/椭圆、直线/折线、箭头、序列号、铅笔、荧光笔、马赛克/模糊、文字、橡皮擦、聚光灯、水印和放大镜，以及 undo/redo、颜色/透明度、粗细、选择、删除和二次编辑。
- R11. OCR、二维码和取色复用项目已有本地能力或稳定依赖：选区 OCR 可复制文本；二维码可显示、复制并安全打开 URL；取色支持 RGB/HEX，并为 HSV/HSL 留出一致输出契约。
- R12. 图像贴图只覆盖截图套件所需的 image pin：移动、键盘微调、缩放、透明度、锁定、标注、阴影、置顶、关闭/恢复、拖拽导出、销毁、鼠标穿透、取色和缩略显示；活动 pin 默认跨应用重启恢复，正常退出只挂起，手动 close 不自动重开，destroy/资源清理后不可恢复。不扩展到文本/文件/颜色/LaTeX 通用贴图。
- R13. 截图历史默认开启，并同时受 100 张、30 天和 1 GiB 三重上限约束，任一先到即 oldest-first 清理；用户可关闭或一键清空。历史项以非破坏性 document 保存一份原图、annotation operations 和 history cursor，重开后仍可 undo/redo，扁平输出按需渲染而不永久复制。选区确认只创建 session draft；第一次复制/保存/贴图/显式完成时原子提交，从未完成即取消则删除 draft。区域历史默认保留最近 20 条，只存几何/显示器稳定身份，不含图像、窗口标题或应用路径。
- R14. 保存支持 PNG、JPG、BMP、WebP、AVIF 和 PDF，按格式处理透明度与质量；同时支持系统剪贴板和现有 `tfile` 资源面。
- R15. ScrollSnap (`https://github.com/Brkgng/ScrollSnap`, inspected commit `05bc06e721dd73a82176cfb43bd39f538f43b75d`) 只作为 ScreenCaptureKit self-exclusion、overlay passthrough、重叠检测和交互分层参考，不复制其无界累计图像和固定 250ms 采样限制。
- R16. Windows/Linux 首期提供用户可完成的基础框选截图、PNG 输出和取消；窗口、指针、滚动、标注、贴图等未实现能力必须通过 capability status 明确降级。
- R17. 屏幕捕获、拼接、图像处理和编码必须离开 Electron 主线程；调用方获得 Promise/stream，并遵守 protocol deadline/cancel/backpressure/terminal-result 规则。
- R18. Rust 边界负责 display/window/region 的物理像素校验、原生捕获、拼接与底层图像处理；主进程负责 DIP 坐标、调用方权限、产品 session、剪贴板、文件选择和 `tfile`。
- R19. 默认数据面为 Rust Buffer/stream attachment 到主进程本地资源；Data URL 仅保留现有兼容调用，必须有明确尺寸边界，不得写入日志或遥测。
- R20. 统一映射 disabled、addon unavailable、protocol mismatch、platform unsupported、no display、display/window/UI element not found、invalid region、permission denied、protected content、capture/match/stitch/process/encode failed、budget exceeded、timeout 和 cancelled。
- R21. capability/support 状态必须按平台暴露 engine、features、available/degraded、permission/reason，不得把 macOS 截图套件能力虚报给 Windows/Linux。
- R22. 现有 `NativeEvents.screenshot`、NativeSdk、Assistant、System Actions 和 plugin facade 保持兼容；新增截图套件 surface 必须走 typed events/SDK，不新增 raw IPC。Assistant 现有 selector 必须迁移为新 manager 的调用方，不保留并行工作流。旧 SDK 的现有 plugin capture facade 只保留当前 display/cursor-display/region 单帧能力和迁移提示；不得借兼容路径获得 window/UI-element、连续 stream、history、OCR/QR 或 pin 管理。
- R23. 窗口标题、应用路径、截图内容、OCR 文本、二维码内容和历史图片不得进入日志、遥测或错误 message；诊断只允许稳定 ID、计数、平台、engine、尺寸和错误 code。
- R24. 构建流程必须使用统一 Rust workspace/build entry，覆盖开发构建、CI matrix、Electron target、asar unpack、签名/公证范围与 packaged artifact verification。
- R25. macOS packaged smoke 是截图套件的 release blocker；Windows/Linux 首期阻断 build/load/protocol/基础框选契约，其他 capability 允许明确 unsupported/degraded。
- R26. 完成后更新 search/cross-platform audit R1，附构建与 packaged runtime 证据。

## Child Delivery Map

本产品父任务不直接承载生产实现。`07-28-rust-native-communication-protocol` 是所有截图子任务的外部前置；截图内部交付顺序如下：

| Wave | Task | Responsibility | Dependencies |
| --- | --- | --- | --- |
| 1 | `07-29-macos-screenshot-capture-core` | Rust capture runtime、macOS ScreenCaptureKit、跨平台基础 capture、descriptor/permission/stream primitives | native protocol |
| 2 | `07-29-screenshot-tool-workflow` | 独立主进程 session manager、Electron/Vue overlays、多入口、静态选区/窗口/UI 元素工作流、基础跨平台框选 | capture core |
| 3A | `07-29-screenshot-long-capture` | 连续帧采样、匹配/拼接、预算、长截图交互 | capture core + tool workflow |
| 3B | `07-29-screenshot-annotation-editor` | Electron/Vue annotation document、工具、undo/redo、导出 | tool workflow |
| 3C | `07-29-screenshot-ocr-qr-color` | OCR、QR、安全 URL 动作与取色 | tool workflow |
| 4 | `07-29-screenshot-image-pin-history` | image pin windows、截图/区域历史、有界本地资源生命周期 | tool workflow + annotation editor |
| 5 | `07-29-screenshot-packaged-evidence` | build/asar/signing/notarization 校验、macOS packaged smoke、Windows/Linux 基础契约证据、audit closure | 所有前述截图子任务 |

Wave 3A/3B/3C 可在共同依赖通过后并行；packaged evidence 只收集已实现能力，不在最后一波补业务功能。

## Acceptance Criteria

- [ ] macOS capture core 可列出/捕获真实显示器、窗口和 UI 元素，支持 self-exclusion 与可选 cursor，并完成主屏、指定屏、选区和指定对象实际捕获。
- [ ] macOS 静态截图工作流覆盖快捷入口、延时/预设、自由与精细选区、手动尺寸/比例、取色放大镜、圆角/阴影/边框、复制、保存和贴图。
- [ ] macOS 长截图可完成纵向与横向滚动、实时预览、匹配状态、手动裁剪、取消和输出；动态/固定/重复内容失败可诊断，超预算会受控终止。
- [ ] 基础标注的 12 类工具和 undo/redo、样式、选择、删除、二次编辑均有 document-model 与 renderer interaction 回归。
- [ ] OCR、二维码、取色、图像贴图、截图历史和区域历史均具备端到端用户工作流。
- [ ] PNG/JPG/BMP/WebP/AVIF/PDF 导出与剪贴板通过格式、透明度、质量和实际可打开性验证。
- [ ] Windows/Linux 可通过同一 NativeSdk 完成框选、取消和 PNG 输出；请求 macOS-only capability 时返回准确 unsupported/degraded。
- [ ] 零尺寸、越界、未知对象、权限拒绝、protected content、匹配失败和 budget exceeded 均返回稳定错误 code，且不会崩溃主进程。
- [ ] Capture/stitch/process/encode 不阻塞主进程事件循环；stream 背压有效，timeout/cancel 后迟到 frame/result 不会交付。
- [ ] 输出资源 metadata 与实际文件一致；renderer/plugin 默认数据面不包含原始 Buffer，历史和贴图资源遵守保留/销毁语义。
- [ ] 现有 Assistant copy/save/translate、System Actions、NativeSdk 和 plugin screenshot 兼容回归通过。
- [ ] Rust fmt/clippy/unit tests、native release build、JS contract、CoreApp node/web typecheck 和各截图套件 focused tests 通过。
- [ ] 三平台主打包前后均校验 screenshot addon；macOS 完整 packaged evidence 阻断交付，Windows/Linux 基础框选与显式降级契约阻断交付。
- [ ] Packaged evidence 与日志检查确认没有图片、OCR/QR、窗口标题、应用路径或历史内容泄漏。
- [ ] `.trellis/tasks/07-13-search-crossplatform-audit/prd.md` 的 R1 被勾选并注明验证证据。

## Dependencies

- `07-28-rust-native-communication-protocol` 的 protocol v1、Rust core 和 main adapter 已完成并通过审查。

## Out of Scope

- 屏幕录制和录制后编辑。
- 文本、文件、颜色和 LaTeX 通用贴图，以及贴图分组/跨类型批量管理。
- PixPin 会员/Pro 能力：翻译、表格/公式识别、长截图自动裁剪、智能擦除、付费录制增强、编码预览/PDF 分页、多语言 OCR 选择、工业条码、云同步、箭头评论和贴图文本范围自动选择。
- Windows/Linux 的窗口、指针、滚动、标注、贴图等完整工具体验；首期只要求基础框选截图。
- 将 screenshot 改为 sidecar 或允许 renderer 直接加载 addon。
