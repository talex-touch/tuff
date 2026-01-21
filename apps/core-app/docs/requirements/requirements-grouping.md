# 需求分组与标签清单（Requirements Grouping & Tags）

> 目标：为需求清单提供统一的系统域分组与跨域标签，便于执行顺序与依赖编排。

## 系统域分组定义

- core-app-main：主进程/核心模块
- core-app-renderer：渲染进程/界面
- plugin-sdk：插件 SDK/插件生态
- transport：IPC/Transport 通道与协议
- tuffex-ui：Tuffex 组件体系
- nexus-docs：Nexus 文档与开发者站
- nexus-web：Nexus 官网页面与内容
- tooling-cli：工具链/CLI
- devops-ci：发布/CI/CD
- ops-git：运维/仓库维护

## 跨域标签定义（示例）

- migration（迁移/重构）
- performance（性能/优化）
- compatibility（兼容性）
- permission（权限/安全）
- observability（可观测性/日志）
- docs（文档/说明）
- build（构建/发布）
- ux（体验/交互）

## 需求清单（含分组与标签）

| 主题 | 分组 | 标签 | 来源（path:line） |
| --- | --- | --- | --- |
| 配置存储 SQLite/JSON 同步 | core-app-main | migration,compatibility,observability | `plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md:1`; `plan/2026-01-20_18-55-03-context-requirements.md:1`; `issues/2026-01-20_19-01-23-context-requirements.csv:1` |
| TouchSDK hooks 迁移 | plugin-sdk | migration,compatibility | `plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md:1`; `issues/2026-01-20_18-56-53-touchsdk-window-hooks-migration.csv:1` |
| 插件 CLI 精炼（tuff） | tooling-cli | build,docs | `plan/2026-01-20_18-48-52-plugin-cli-refine.md:1`; `docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md:1`; `issues/2026-01-20_18-52-04-plugin-cli-refine.csv:1` |
| Tuffex 组件 3/4/5/7/8 | tuffex-ui | docs,ux | `plan/2026-01-20_21-16-53-tuffex-components-34578.md:1`; `issues/2026-01-20_21-20-03-tuffex-components-34578.csv:1` |
| IPC 卡顿与资源加载排查 | core-app-main | performance,observability | `plan/2026-01-19_11-10-40-perf-log-analysis.md:1` |
| Transport 全量迁移与异步 | transport | migration,compatibility | `plan/2026-01-21_01-29-05-transport-migration-async.md:1`; `docs/plan-prd/03-features/tuff-transport/TUFF-TRANSPORT-PRD.md:1` |
| Transport MessagePort 升级 | transport | migration,performance | `plan/2026-01-21_03-01-57-transport-message-port.md:1`; `issues/2026-01-21_03-07-24-transport-message-port.csv:1` |
| Nexus examples 统一入口 | nexus-docs | docs | `plan/2026-01-21_13-22-14-nexus-examples-section.md:1`; `issues/2026-01-21_13-25-58-nexus-examples-section.csv:1` |
| Nexus 官网首页整改 | nexus-web | docs,ux | `plan/2026-01-21_13-25-00-nexus-homepage-revamp.md:1`; `issues/2026-01-21_13-31-52-nexus-homepage-revamp.csv:1` |
| 内部下载可见性控制 | core-app-main | ux,permission | `plan/2026-01-21_13-25-11-download-internal-visibility.md:1`; `issues/2026-01-21_13-32-17-download-internal-visibility.csv:1` |
| SearchLogger 生命周期分析 | core-app-main | compatibility,observability | `plan/2026-01-21_13-39-30-basemodule-lifecycle-analysis.md:1`; `issues/2026-01-21_13-43-27-basemodule-lifecycle-analysis.csv:1` |
| 自动发布与 Nexus 同步 | devops-ci | build,security | `plan/planprd-release-pipeline.md:1` |
| App Indexing 周期对比 | core-app-main | performance,compatibility | `plan/planprd-app-indexing.md:1` |
| stash 弹出恢复 | ops-git | ops,compatibility | `plan/2026-01-20_21-17-14-stash-pop-recovery.md:1`; `issues/2026-01-20_21-19-32-stash-pop-recovery.csv:1` |

## 维护说明

- 新增需求时必须指定分组与标签，并补充来源路径。
- 若出现跨域需求，允许使用 `both` 或多标签，但需说明主域。
