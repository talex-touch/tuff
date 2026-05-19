# Tuff v2.4.11-beta.2 更新说明

## 本次更新

- 新增 Translation 图片翻译链路：`touch-translation` 可读取剪贴板图片，调用本地 Intelligence 中配置的图片翻译适配能力，并通过 DivisionBox 打开独立结果窗口。
- 修复 DivisionBox 打开失败链路，并补齐隐藏 header、隐藏输入框等窗口布局选项，便于插件创建轻量工具窗口。
- App Index 管理页支持扫描应用条目：扫描应用可在设置中查看、诊断、启用/禁用；禁用条目会从 CoreBox 索引和推荐映射中移除，扫描条目保持不可删除。
- Everything 增加自定义 `es.exe` CLI 路径配置，并在返回结果进入 CoreBox 前经过 File Index watch-root 过滤；诊断 evidence 增加 CLI path 与 path filtering 状态。
- 新增 `touch-browser-data` 与 `touch-emoji-symbols` 官方插件首版，并为 `touch-snippets` 增加 `{{uuid}}` 占位符。
- CoreBox PreviewSDK 支持 `calc`、`calculator`、`calculate`、`计算`、`换算` 显式计算入口；ActionPanel 可展示普通结果项的 actions。
- 更新 Nexus 插件 SDK 工作流文档和 TuffEx CommandPalette 场景化 demo，补充 Raycast/uTools 能力差距矩阵。
- 稳定 CoreBox 滚动 fallback，降低原生滚动条 fallback 对结果区布局的影响。

## 已验证

- 已通过 `plugins/touch-snippets`、`touch-emoji-symbols`、`touch-browser-data` focused Node tests。
- 已通过 CoreApp Preview、App Index、Everything focused Vitest 覆盖。
- 已通过 `pnpm -C "apps/core-app" run typecheck:node` 与 `pnpm -C "apps/core-app" run typecheck:web`。
- `git diff --check` 与各批次 `git diff --cached --check` 均通过。

## 已知限制

- 该版本是 `2.4.11` beta 测试包，不代表正式 release gate 已完成。
- Everything/App Launcher 的 Windows 真机 evidence、性能基线与 Nexus Release Evidence 仍需后续补齐。
- `typecheck:web` 过程中 TuffEx dts 构建仍会打印 `TouchScroll` 入口导出告警，但当前未阻断 CoreApp 类型检查。
