# 实施计划

1. 在现有前台应用身份工具中集中实现 Tuff 自身 executable/bundle 识别，并在应用重建时过滤。
2. 删除推荐引擎对 file 候选的无条件排除，补原生文件 source 到 file-provider 的归一映射。
3. 为 MainWindowProvider、SystemActionsProvider 增加按稳定 itemId 重建方法，接入 ItemRebuilder。
4. 运行 foreground-app-snapshot、item-rebuilder、recommendation-engine、main-window-provider、system-actions-provider 聚焦测试与 node/web typecheck。
5. 用隔离 CoreBox 验证推荐区无 Tuff 自身，且主窗口/系统操作可见且可执行。

## 执行结果（2026-08-22）

- `system/self-app-identity.ts` 统一按当前 executable 与 `com.tagzxia.app.tuff` / `.dev` 排除 Tuff 自身；前台快照与 ItemRebuilder 共用该边界。
- RecommendationEngine 不再无条件丢弃文件候选；ItemRebuilder 归一 `file`、`files`、`everything-provider`、`macos-spotlight-provider`、`linux-native-file-provider`，并复用 canonical split-search 数据库。
- MainWindowProvider、SystemActionsProvider、WindowsShellProvider 均提供稳定 `rebuildItem`；ContextActions 因依赖瞬时上下文而继续 fail closed。
- 4 个聚焦测试文件共 77 tests 通过；node/web typecheck、TuffEx build 与 scoped ESLint 通过。
- 隔离 CoreBox 实测显示 `Capture and Copy Screenshot`、`Show Main Window`、`tuff-recommendation-proof`；更高权重的 Tuff 自身项与陈旧 ContextActions 均未出现。
- 临时 profile、进程与 seeded 数据已清理，仅保留用户原有 WeChat DevTools Electron。
