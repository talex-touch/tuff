# 修复插件目录按钮无响应

## Goal

修复“已安装插件”页面底部文件夹按钮点击后无可见响应的问题，使其可靠打开插件根目录，并在操作失败时向用户提供明确反馈。

## Confirmed Facts

- 失效入口是 `apps/core-app/src/renderer/src/views/base/Plugin.vue:135` 的文件夹图标按钮。
- 按钮在 `apps/core-app/src/renderer/src/views/base/Plugin.vue:82` 解析插件根目录后调用 `appSdk.showInFolder(pluginPath)`。
- `apps/core-app/src/main/channel/system-shell-handlers.ts:43` 当前无条件调用 Electron `shell.showItemInFolder`；它适合定位文件项，但不等价于打开目录，且调用失败不可观察。
- 该入口在提交 `f86d4596c4` 前通过 `shell.openPath` 打开目录，SDK 迁移后改为 `showInFolder`，属于行为回归。
- 项目内插件详情页的“打开文件夹”入口仍通过 `shell.openPath` 打开具体插件目录，证明“打开目录”是现有产品语义。

## Requirements

- 插件页文件夹按钮必须打开启动信息中的 `pluginPath`，不得回退到语义不同的 `modulePath`，除非仓库运行时契约明确要求兼容旧数据。
- 目录目标必须通过 Electron 的目录打开能力处理；现有文件目标的“在文件夹中定位”行为不得回归。
- 空路径、不存在路径或 Electron 返回的打开错误必须沿 transport Promise 返回给 renderer，不得静默成功。
- renderer 必须记录失败并显示本地化错误提示；重复点击期间保持现有 loading/disabled 防抖行为。
- 修改保持在 App SDK/system shell handler 与插件页相关边界内，不重构无关的插件管理或 transport 代码。

## Acceptance Criteria

- [ ] 点击插件页文件夹按钮后，macOS Finder 能直接打开插件根目录。（待可启动的 Electron runtime 实机确认）
- [x] system shell handler 对目录调用 `shell.openPath`，并将非空错误字符串转换为 rejected Promise。
- [x] system shell handler 对普通文件继续调用 `shell.showItemInFolder`。
- [x] 路径缺失或不可访问时，插件页显示本地化错误提示，且按钮恢复可用状态。
- [x] 相关 Vitest 覆盖目录成功、目录打开失败、文件定位与无效路径分支并全部通过。

## Out of Scope

- 改造所有历史 `openApp` / `showInFolder` 调用点。
- 扩大插件文件系统权限或改变插件运行时信任边界。
- 调整插件列表、详情页或市场页面的其他交互和视觉样式。
