# 修复 CoreBox 隐藏时窗口唤醒

## Goal

在快捷键关闭 CoreBox 时，避免因 CoreBox 的原生窗口焦点链路将 Tuff 的其他窗口意外带到前台；保留快捷键打开后可立即输入的行为。

## Confirmed Facts

- `core.box.toggle` 在 CoreBox 可见且位于同一屏幕时调用 `coreBoxManager.trigger(false)`。
- 快捷键打开路径在 `WindowManager.show(true)` 中调用 `app.focus({ steal: true })`、`BrowserWindow.show()` 和 `BrowserWindow.focus()`；移除 `app.focus` 会让 CoreBox 无法展示。
- macOS 的 `app.hide()` 会隐藏整个应用的全部窗口，可让系统把前台交还给此前应用。
- 关闭路径只广播隐藏状态，并在 100ms 后调用 `BrowserWindow.hide()`；没有恢复先前窗口的逻辑。
- 前台应用快照仅用于搜索推荐，不具备恢复焦点的职责。
- 项目已有插件窗口管理的跨平台窗口激活实现，但其权限域不应被 CoreBox 直接依赖。

## Requirements

- 保留快捷键打开时的 `app.focus({ steal: true })`，确保 CoreBox 在后台应用上可可靠展示并接收输入。
- 仅在 macOS 且 CoreBox 由 Tuff 外部唤起、再通过同一快捷键关闭时隐藏整个 Tuff 应用；自动失焦和其他关闭路径不得隐藏主窗口。
- 保持快捷键打开后 CoreBox 可接收键盘输入，保留现有防止短时间重复快捷键误关的保护。
- 不为此问题引入跨应用焦点恢复、辅助功能权限、AppleScript 或 Windows 原生窗口枚举。
- 为快捷键打开与关闭的焦点行为补充主进程单元测试。

## Acceptance Criteria

- [ ] 快捷键打开 CoreBox 仍调用 `app.focus({ steal: true })`，并可接收键盘输入。
- [ ] macOS 从外部应用快捷键打开后再次按键关闭时，Tuff 主窗口不会接替前台。
- [ ] 在 Tuff 内打开或因自动失焦关闭 CoreBox 时，不隐藏 Tuff 主窗口。
- [ ] 同一屏幕再次按快捷键仍关闭 CoreBox，跨屏按键仍只移动 CoreBox。
- [ ] CoreBox 相关单元测试通过，主进程类型检查通过。

## Out Of Scope

- 跨应用精确恢复关闭前的前台窗口。
- 修改 CoreBox 渲染层、搜索推荐或插件窗口管理权限模型。
