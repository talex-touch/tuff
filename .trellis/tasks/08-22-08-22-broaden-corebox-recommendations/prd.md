# 扩展 CoreBox 推荐候选并排除 Tuff 自身

## Goal

推荐区不得展示当前 Tuff 应用自身，并应复用可安全重建的搜索结果类型，让主窗口菜单、系统操作、文件等稳定可执行项在获得真实使用信号后进入推荐。

## Requirements

- R1：应用候选同时按当前可执行路径与 Tuff 正式/开发 bundle id 排除自身，不依赖显示名或版本字符串。
- R2：文件搜索项不再被推荐引擎无条件过滤；原生文件 Provider 的 source id 归一到现有 file-provider 重建边界。
- R3：MainWindowProvider 与 SystemActionsProvider 提供按稳定 itemId 的安全重建；ItemRebuilder 接入两类。
- R4：仅重建脱离原查询仍安全、稳定、可执行的结果。依赖一次性 session、当前输入或临时预览的 ContextActions 不进入空查询推荐。
- R5：不得新增第二套执行或搜索实现；推荐继续消费既有 usage/newly-installed 信号与 Provider 项定义。

## Acceptance Criteria

- [x] 隔离 CoreBox 推荐区不再出现当前 Tuff 应用。
- [x] 已使用的主窗口菜单和系统操作可重建并进入推荐候选。
- [x] 文件候选不再被推荐引擎提前丢弃，原生文件 source 可归一重建。
- [x] 动态上下文操作仍不会被无上下文推荐错误重放。
- [x] 相关聚焦测试、node/web typecheck 与真实 CoreBox UI smoke 通过。
