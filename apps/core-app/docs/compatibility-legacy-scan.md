# 兼容性/老旧代码扫描报告

本报告用于跟踪 core-app 中的兼容性、老旧与 deprecated/legacy 相关实现，按统一口径输出分类清单与复核记录。

## 扫描口径

- A. Deprecated/不推荐但仍在使用：显式标注 deprecated、legacy、obsolete 或类似说明，但仍在执行路径中。
- B. 兼容性/过渡性代码：用于版本门控、平台差异、旧协议/旧结构兼容或退路逻辑（fallback/shim/polyfill）。
- C. 其他老旧或风险项：不直接标注 deprecated/legacy，但呈现明显历史包袱或迁移残留的实现。

## 关键词清单（初版）

- deprecated
- legacy
- compat / compatibility
- shim
- fallback
- polyfill
- migration
- obsolete

## 搜索范围与原则

- 范围：`src/`、`resources/`、`scripts/`、`public/`、`docs/` 及相关配置文件。
- 形式：注释、JSDoc/TS 注解（含 `@deprecated`）、配置与脚本说明。
- 规则：关键词大小写不敏感；命中后需结合上下文判断归类。

## 2026-04-26 复核结论

### 已收口

- Flow Transfer 不再存在“未适配 target 假投递成功”：`flow-bus.ts` 会在目标插件未注册 delivery handler 时返回 `TARGET_OFFLINE`，真实投递异常也会保留为失败结果。
- 平台 capability 清单不再把条件型能力写成完全 supported：Flow Transfer、DivisionBox Flow trigger、macOS/Windows active-app 均显式标注为 `best_effort` 并带 `issueCode/reason/limitations`；过度乐观且已无生产调用的 `isActiveAppCapabilityAvailable()` 已删除。
- macOS notification 检查不再把 `Notification.isSupported()` 解释为系统权限已授予；当前只能确认原生通知运行时可用，因此返回 `notDetermined + canRequest`。
- OmniPanel 键盘快捷键默认值已统一为关闭；主进程 settings snapshot、首次设置页、工具设置页与 `app-settings` 默认值保持一致，右键长按时长也有明确持久化配置。
- 已删除无引用的 Bluetooth/USB 旧实验注释文件、renderer layout 的 `useLayout` legacy alias，以及 File Provider 中旧主线程内容解析/索引 helper 的空调用保活路径；文件内容解析与索引统一走 worker 管线。
- Preview Provider / Preview Registry / Terminal / Protocol Handler / ServiceCenter 的 raw console、死协议注释、stale no-op 文案和敏感预览值日志已收口；ServiceCenter 无读取方的注册快照伪持久化路径已删除，后续日志只记录结构化元数据，不再输出搜索表达式、预览结果值或原始 service payload。
- 已删除无引用且全文件仅剩注释的 screen-capture 主进程占位文件，并移除 renderer 中无人发送的 `@screen-capture` 注册函数；OfficialPluginService、FileWatchService、TuffIconImpl 的 raw console 调试输出也已切到结构化 logger。

### 仍保留的兼容边界

- Linux selection capture / active-app / auto-paste 仍依赖 `xdotool` 与桌面环境，属于 documented best-effort，不是待删除假实现。
- 数据/启动迁移仍保留在升级窗口内，包括 permission JSON -> SQLite、dev data root、renderer legacy auth/theme、download old db/config；清理前需要确认历史版本升级窗口。
- 插件 SDK hard-cut 已阻断旧插件运行；`enforcePermissions` 等字段仅作为 blocked 状态表达保留，不再代表旧 SDK bypass。
