# 需求-实现对照表（Coverage Map）

> 目标：为每条需求标注完成度，并提供“实现/缺失”证据路径，支撑执行顺序与风险评估。

## 状态枚举

- 已完成：已有实现或完成证据
- 部分完成：仅完成部分子项或存在明显缺口
- 未开始：暂无实现，需进入排期

## 对照清单

| 主题 | 完成度 | 证据（实现/缺失） | 说明 |
| --- | --- | --- | --- |
| 配置存储 SQLite/JSON 同步 | 部分完成 | `apps/core-app/src/main/modules/storage/index.ts:61` | 仅 pilot key 写入，策略与迁移仍需完善。 |
| TouchSDK hooks 迁移 | 已完成 | `packages/utils/plugin/sdk/touch-sdk.ts:9` | hooks 已落地并替代示例中 window 直取。 |
| 插件 CLI 精炼（tuff） | 已完成 | `packages/unplugin-export-plugin/src/bin/tuff.ts:1` | CLI 命令与构建/发布流程已实现。 |
| Tuffex 组件 3/4/5/7/8 | 已完成 | `packages/tuffex/packages/components/src/tree/src/TxTree.vue:1` | 组件与测试已存在。 |
| IPC 卡顿与资源加载排查 | 未开始 | `plan/2026-01-19_11-10-40-perf-log-analysis.md:1` | 仅有排查计划，未见实现。 |
| Transport 全量迁移与异步 | 未开始 | `apps/core-app/src/renderer/src/modules/channel/channel-core.ts:1` | 仍保留旧 Channel 与 sendSync。 |
| Transport MessagePort 升级 | 未开始 | `plan/2026-01-21_03-01-57-transport-message-port.md:1` | 未见 MessagePort 相关实现。 |
| Nexus examples 统一入口 | 未开始 | `plan/2026-01-21_13-22-14-nexus-examples-section.md:1` | 尚未在 Nexus 文档落地。 |
| Nexus 官网首页整改 | 未开始 | `plan/2026-01-21_13-25-00-nexus-homepage-revamp.md:1` | 仍为整改计划。 |
| 内部下载可见性控制 | 未开始 | `apps/core-app/src/main/modules/download/notification-service.ts:222` | hidden 逻辑仍与 packaged 环境强绑定。 |
| SearchLogger 生命周期分析 | 部分完成 | `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts:17` | 通过 try/catch 兜底，未正式进入生命周期托管。 |
| 文件系统搜索范围权限收敛 | 未开始 | `plan/2026-01-22_10-00-00-file-search-scope-permission.md:1` | 默认范围与授权策略待落地。 |
| 自动发布与 Nexus 同步 | 未开始 | `plan/planprd-release-pipeline.md:1` | 仅 PRD/方案存在。 |
| App Indexing 周期对比 | 已完成 | `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:425` | 启动补漏与周期全量已落地。 |
| stash 弹出恢复 | 未开始 | `plan/2026-01-20_21-17-14-stash-pop-recovery.md:1` | 仅操作性计划。 |

## 维护说明

- 若状态变更，必须同步更新证据路径。
- 证据优先指向代码入口，其次为 issues CSV 或 plan 文档。
