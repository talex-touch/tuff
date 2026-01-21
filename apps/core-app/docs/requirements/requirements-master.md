# 统一需求总表（Unified Requirements）

> 目标：将所有需求来源汇总为一个统一入口，包含范围、来源索引、需求清单、执行顺序与风险。

## 1. 范围说明

- 覆盖仓库内的 plan、PRD、issues CSV 与工程规范类文档。
- 以 issues CSV 为执行状态唯一来源；其余文档作为需求来源与背景。

## 2. 来源索引

- 详见：`apps/core-app/docs/requirements/requirements-sources.md`

## 3. 需求清单（分组 + 标签）

> 详细表见：`apps/core-app/docs/requirements/requirements-grouping.md`

| 主题 | 分组 | 标签 | 来源 |
| --- | --- | --- | --- |
| 配置存储 SQLite/JSON 同步 | core-app-main | migration,compatibility,observability | plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md |
| TouchSDK hooks 迁移 | plugin-sdk | migration,compatibility | plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md |
| 插件 CLI 精炼（tuff） | tooling-cli | build,docs | plan/2026-01-20_18-48-52-plugin-cli-refine.md |
| Tuffex 组件 3/4/5/7/8 | tuffex-ui | docs,ux | plan/2026-01-20_21-16-53-tuffex-components-34578.md |
| IPC 卡顿与资源加载排查 | core-app-main | performance,observability | plan/2026-01-19_11-10-40-perf-log-analysis.md |
| Transport 全量迁移与异步 | transport | migration,compatibility | plan/2026-01-21_01-29-05-transport-migration-async.md |
| Transport MessagePort 升级 | transport | migration,performance | plan/2026-01-21_03-01-57-transport-message-port.md |
| Nexus examples 统一入口 | nexus-docs | docs | plan/2026-01-21_13-22-14-nexus-examples-section.md |
| Nexus 官网首页整改 | nexus-web | docs,ux | plan/2026-01-21_13-25-00-nexus-homepage-revamp.md |
| 内部下载可见性控制 | core-app-main | ux,permission | plan/2026-01-21_13-25-11-download-internal-visibility.md |
| SearchLogger 生命周期分析 | core-app-main | compatibility,observability | plan/2026-01-21_13-39-30-basemodule-lifecycle-analysis.md |
| 自动发布与 Nexus 同步 | devops-ci | build,security | plan/planprd-release-pipeline.md |
| App Indexing 周期对比 | core-app-main | performance,compatibility | plan/planprd-app-indexing.md |
| stash 弹出恢复 | ops-git | ops,compatibility | plan/2026-01-20_21-17-14-stash-pop-recovery.md |

## 4. 现状与缺口

- 详见：`apps/core-app/docs/requirements/requirements-coverage.md`

## 5. 去重与冲突清单

- 详见：`apps/core-app/docs/requirements/requirements-conflicts.md`

## 6. 依赖与执行顺序

- 详见：`apps/core-app/docs/requirements/requirements-sequence.md`

## 7. 风险与待澄清

- 需求来源分散且口径不一，需坚持“issues CSV 为唯一状态源”。  
- 迁移类需求（Transport/Storage/SDK）需明确依赖顺序，避免返工。  
- 平台差异（macOS/Windows/Linux）需要在需求条目中显式标注。  

## 8. 维护约定

- 新增需求必须更新：来源索引 + 分组/标签 + 对照表 + 执行顺序（如适用）。
- 所有需求都必须保留 `path:line` 级引用，便于审计与协作。
