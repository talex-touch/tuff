---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 内部下载任务隐藏与通知抑制（SVG 下载等）
complexity: medium
planning_method: builtin
created_at: 2026-01-21T13:25:16+08:00
---

# Plan: 内部下载任务隐藏与通知抑制

🎯 任务概述
当前 SVG 远程预取通过 DownloadCenter 创建隐藏任务，但在开发环境仍会进入下载中心并触发系统通知。目标是让 internal/hidden 任务默认不展示、不发送通知，仅在手动开启开发者模式时可见，失败仅维护内部状态即可。

📋 执行计划
1. 梳理现状链路：useSvgContent 创建 hidden 任务、DownloadCenter 完成/失败触发通知与历史写入、useDownloadCenter 的过滤条件；记录 hidden 元数据的既有语义与出入口。
   - 现状链路清单（DLVIS-010）：
     - useSvgContent.downloadRemoteSvg -> downloadSdk.addTask，metadata.hidden=true，purpose=tufficon-svg，sourceUrl=targetUrl（SVG 预取）。
     - DownloadCenter.shouldSuppressHistory：app.isPackaged && metadata.hidden；saveToHistoryDb 在任务完成时受此条件控制。
     - NotificationService.shouldSuppressNotifications：app.isPackaged && metadata.hidden；用于下载完成/失败通知入口。
     - useDownloadCenter.shouldHideTask：!import.meta.env.DEV && metadata.hidden；filterVisibleTasks 影响列表与统计口径。
2. 统一 hidden 行为定义：明确“内部任务”应默认隐藏 UI/历史/通知；确定开发者模式作为唯一可见开关（与插件内部项保持一致）。
3. 主进程调整方案：
   - NotificationService：shouldSuppressNotifications 以 metadata.hidden 为主判定，去除 app.isPackaged 限制，确保内部任务永不通知。
   - DownloadCenter：shouldSuppressHistory 同步调整，隐藏任务不写入历史；失败仍更新任务状态并保持可查询。
   - 如需调试覆盖，仅允许 developerMode 影响“列表可见性”，不恢复通知。
4. 渲染进程过滤：useDownloadCenter 改用 appSetting.dev.developerMode 控制 hidden 任务可见性，替代 import.meta.env.DEV；确保列表/统计/详情一致使用同一过滤逻辑。
5. 文档同步：更新 Download SDK 文档对 metadata.hidden 的描述（不区分生产/开发），补充开发者模式下可见但不通知的说明。
6. 测试与验证：
   - notification-service 单测覆盖 hidden 任务不触发通知。
   - 若可用，补充渲染侧过滤逻辑的单测；并提供手动验证步骤（刷新触发 SVG 下载、通知不出现、任务默认隐藏）。

⚠️ 风险与注意事项
- 隐藏任务不入历史会降低调试可见性，需要确认是否接受或是否需要额外 debug 开关。
- 主进程读取 appSetting 需保证 Storage 就绪，必要时提供安全兜底。

📎 参考
- `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts:190`
- `apps/core-app/src/main/modules/download/notification-service.ts:222`
- `apps/core-app/src/main/modules/download/download-center.ts:788`
- `apps/core-app/src/main/modules/download/download-center.ts:1287`
- `apps/core-app/src/renderer/src/modules/hooks/useDownloadCenter.ts:19`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue:30`
- `apps/nexus/content/docs/dev/api/download.zh.md:31`
- `apps/nexus/content/docs/dev/api/download.en.md:25`
- `packages/test/src/download/notification-service.test.ts:1`
