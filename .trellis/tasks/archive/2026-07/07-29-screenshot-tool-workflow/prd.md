# Build screenshot tool workflow

## Goal

在 capture core 上使用 Electron/Vue transparent overlays 建立由主进程独立 `ScreenshotSessionManager` 拥有的 macOS 完整静态截图工作流，并为 Windows/Linux 提供最简单的跨平台框选界面。全局快捷键、托盘、Assistant、System Actions 与 plugin SDK 都只作为启动入口。

## Requirements

- 提供全局快捷键和托盘入口，进入截图后隐藏/排除 Tuff 自身非必要窗口。
- 第三方 plugin 的可见交互入口要求 verified context + `window.capture`；新 SDK 的静默单帧要求独立高风险 `window.capture.background`。静默调用只返回受控本地资源 descriptor，不开放连续 stream、history、OCR/QR 或 pin 管理。
- macOS 默认为 snapshot-first：overlay 出现前捕获每个显示器并显示冻结帧；同时提供显式 frozen/live 模式切换。切到 live 时透出当前桌面并保持 Tuff self-exclusion，切回 frozen 时重新捕获当前帧，确认结果使用当前模式对应的帧。
- macOS 支持显示器、窗口、UI 元素、自由选区和最近区域选择；Windows/Linux 只要求自由框选。
- 选区支持八方向 resize、拖动、像素级键盘移动/缩放、手动宽高、固定比例、跨屏约束和尺寸标签。
- 支持延时截图、常用区域/延时预设和显式取消。
- macOS 支持放大镜取色、cursor 开关、圆角、阴影/边框预览。
- macOS 独立入口采用“选区即编辑”：鼠标松开形成选区后，当前 overlay 立即提供移动、缩放、效果、复制、保存和完成操作，不创建独立 editor BrowserWindow。完整标注工具仍由 annotation 子任务实现。
- Assistant/plugin 等 typed caller 可显式请求 `return-resource`，用户确认后把受控资源返回原 caller；该模式不改变权限和历史策略。
- Windows/Linux 首期不要求 editor，确认基础框选后直接输出 PNG。
- 选区操作栏提供复制、保存和完成；图像贴图、长截图、标注、OCR/QR 入口按 capability 禁用，不以点击后失败伪装为已实现。
- 保存和预览默认使用 `tfile`/本地资源，不在 renderer 长期持有大 Data URL。
- 所有键盘/鼠标状态、窗口 teardown、屏幕变化和权限恢复均清理完整。
- 提供隔离 profile 的真实 Electron 演示路径，使用仓库内/临时生成的非敏感测试画面展示启动、选择、精细调整、frozen/live、取消和至少一个成功输出动作；录屏产物需经媒体探测验证可播放，不得以静态 mock 或设计稿代替真实工作流。

## Acceptance Criteria

- [ ] macOS 从快捷键/托盘进入后可完成对象选择、精细调整、延时、预设、复制和保存。
- [x] macOS standalone 在当前 overlay 内直接编辑、复制、保存和完成；真实流程与 CDP target 计数证明未创建独立 editor preview。
- [x] `return-resource` caller 和 standalone 流程按明确 completion mode 返回；不会错误创建 editor BrowserWindow。
- [ ] 默认冻结帧、实时桌面、实时再冻结和两种模式下确认均使用正确帧；切换/结束后无遗留临时图像、stream 或 overlay。
- [ ] Windows/Linux 可完成框选、取消和 PNG 输出。
- [ ] 多屏/负坐标/Retina 下选区与实际捕获像素一致。
- [ ] Overlay 和 Tuff 自身窗口不出现在结果中。
- [x] Escape、窗口销毁和重复触发不残留 overlay/listener/session；Save sheet 关闭后的 Escape 传播竞态由保存期间及关闭后 300 ms 的抑制窗口处理。屏幕热插拔仍需多屏硬件证据。
- [ ] Plugin 权限矩阵覆盖未验证 caller、仅 `window.capture`、仅 `window.capture.background`、两者、旧/新 SDK marker；拒绝发生在 session/native 调用前。
- [ ] 新静默单帧只返回 metadata/resource descriptor，无法打开 stream 或读取 history/recognition/pin surface。
- [ ] Renderer interaction、main lifecycle、visual screenshot 和 packaged workflow tests 通过。
- [x] 已生成并通过 `ffprobe` 验证真实 Electron 基础流程演示视频；隔离 profile 和 synthetic `Screenshot Test Canvas` 不包含个人窗口标题、OCR/QR 内容或真实用户数据。

## Dependencies

- `07-29-macos-screenshot-capture-core` 提供 capture descriptors、capture API 与 capability status。

## Out of Scope

- 长图拼接算法、标注编辑器内部实现、通用图像贴图管理和 OCR/QR 算法。
