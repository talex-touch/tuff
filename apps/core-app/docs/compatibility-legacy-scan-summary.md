# 兼容性/老旧代码分类清单（当前汇总）

更新时间：2026-04-28

本文件是 `compatibility-legacy-scan.md` 的短汇总，用于避免历史扫描清单继续把已删除或已硬切的路径标为未处理风险。详细证据和分轮记录以 `compatibility-legacy-scan.md` 为准。

风险等级说明：low（影响有限/可控）、medium（可能影响兼容或数据）、high（可能引发破坏性行为）。

## 当前结论

- high：当前 CoreApp 生产路径未发现新的 silent success、假命令、伪持久化、旧 storage 业务消费或全局 i18n 入口回潮。
- medium：跨平台能力仍有真实不对称，Windows/macOS 是 2.5.0 release-blocking 人工回归范围，Linux 继续按 `xdotool` / desktop environment 记录为 documented best-effort。
- medium：插件 SDK hard-cut 已在 loader / installer / permission guard 阻断不兼容 `sdkapi`；旧 raw channel 仅保留为明确抛错边界，不再作为可用兼容通道。
- low：普通 fallback 多为输入默认值、展示兜底、schema/runtime migration 或诊断面，不等价于未完成能力。

## 已收口高信号项

- Flow Transfer：未注册 delivery handler 时返回 `TARGET_OFFLINE`，不再把未投递目标包装成成功。
- DivisionBox：`division-box:show-active-sessions` 伪命令已删除，仅保留真实 shortcut mapping 搜索/执行路径。
- ServiceCenter：无读取方的注册快照伪持久化路径已删除。
- PluginStatus：插件状态按钮已改为 computed label/class/action，不再用命令式 DOM/`innerHTML` 回写状态。
- Storage renderer：CoreApp renderer 入口已改为 `initializeRendererStorage(transport)` / `useStorageSdk()`，业务侧不再直接消费旧 `storage:get` / `storage:save` / `storage:update`。
- Theme startup：仅剩测试引用的 `parseLegacyThemeStyle()` 已删除。
- Application detail：旧应用详情页不再展示 open explorer / uninstall / save/spec 等无真实执行路径的假动作，保留 launch 与 help 两个真实动作。
- Tray：旧 `src/main/modules/tray-holder.ts` 已不存在，当前实现是 `src/main/modules/tray/tray-manager.ts`。

## 仍保留但不判为假实现

- `fake-background` / `--fake-*` 是视觉 token，不代表 mock 功能。
- `placeholder` 主要是输入框、骨架屏或空图标语义；未发现把未完成能力伪装成完成入口的命中。
- Plugin widget preview 的 `mockPayload` 是开发面板显式测试载荷，不是生产 runtime mock。
- `SearchLogger`、logger 输出端、内部插件 logger、WebContents injected script 的 `console.*` 属于诊断/注入边界。
- 数据库、下载、权限等 schema/runtime migration 是本地数据演进路径，不能按关键词直接删除。
- 搜索、AI provider、i18n、icon 等 fallback 是真实兜底或错误恢复；后续只在出现 false-success 或隐藏降级时收口。

## 陈旧清单复核

- 旧汇总曾列 `src/main/modules/tray-holder.ts` 为 legacy tray holder；当前文件已不存在。
- 旧汇总曾把 `clearItems/pushItems/getItems` 作为 deprecated Plugin API 风险；当前源码中的 `boxItems.pushItems/getItems` 是运行时 SDK 对 BoxItemManager 的正常封装，旧 raw channel `channel.raw` / `channel.sendSync` 已改为 hard-cut 抛错。
- 权限中心的 historical/deprecated grant 文案只表达历史授权记录被禁用，不代表旧 SDK bypass 仍可运行。
