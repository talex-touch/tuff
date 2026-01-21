# 需求去重与冲突清单（Requirements De-dup & Conflicts）

> 目标：将同主题需求在多来源间合并，并标注差异与冲突类型，作为后续执行顺序编排的基础。
> 约定：issues CSV 为执行状态唯一来源；plan/PRD/规范作为需求来源与上下文。

## 合并条目列表（已识别的重复来源）

| 合并ID | 主题 | 合并说明 / 差异保留 | 来源（path:line） |
| --- | --- | --- | --- |
| MERGE-001 | 配置存储 SQLite/JSON 同步 | plan 中一个偏策略/进度，一个偏上下文/需求；issues CSV 为任务状态来源。合并为同一“配置存储同步”需求，保留策略与需求拆分说明。 | `plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md:1`; `plan/2026-01-20_18-55-03-context-requirements.md:1`; `issues/2026-01-20_19-01-23-context-requirements.csv:1` |
| MERGE-002 | 插件 CLI 精炼（tuff） | PRD 定义目标与范围，plan 给出执行步骤，issues CSV 表示任务清单与状态。合并为“CLI 规范化”单一需求源。 | `docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md:1`; `plan/2026-01-20_18-48-52-plugin-cli-refine.md:1`; `issues/2026-01-20_18-52-04-plugin-cli-refine.csv:1` |
| MERGE-003 | TouchSDK hooks 迁移 | plan 为迁移方案，issues CSV 为任务落地状态；合并为“窗口全局迁移”单一需求。 | `plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md:1`; `issues/2026-01-20_18-56-53-touchsdk-window-hooks-migration.csv:1` |
| MERGE-004 | 下载任务隐藏与通知抑制 | plan 给出方案与验收，issues CSV 为执行状态；合并为“内部下载可见性控制”。 | `plan/2026-01-21_13-25-11-download-internal-visibility.md:1`; `issues/2026-01-21_13-32-17-download-internal-visibility.csv:1` |
| MERGE-005 | Nexus 官网首页整改 | plan 为整改方案，issues CSV 为执行状态；合并为“Nexus 首页内容整改”。 | `plan/2026-01-21_13-25-00-nexus-homepage-revamp.md:1`; `issues/2026-01-21_13-31-52-nexus-homepage-revamp.csv:1` |
| MERGE-006 | Nexus examples 统一入口 | plan 为融合方案，issues CSV 为执行状态；合并为“examples 统一入口”。 | `plan/2026-01-21_13-22-14-nexus-examples-section.md:1`; `issues/2026-01-21_13-25-58-nexus-examples-section.csv:1` |
| MERGE-007 | TuffTransport 迁移与异步能力 | PRD/实现指南定义范围，plan 为执行步骤；合并为“Transport 全量迁移”。 | `docs/plan-prd/03-features/tuff-transport/TUFF-TRANSPORT-PRD.md:1`; `docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.md:1`; `plan/2026-01-21_01-29-05-transport-migration-async.md:1` |
| MERGE-008 | Transport MessagePort 升级 | plan 与实现方案重复，合并为“MessagePort 升级与流式通道迁移”。 | `plan/2026-01-21_03-01-57-transport-message-port.md:1`; `docs/plan-prd/04-implementation/TuffTransportPortPlan260111.md:1` |

## 冲突 / 待澄清清单

- TYPE:source-of-truth — 同一主题在 plan/PRD 与 issues CSV 同时出现，执行状态以 issues CSV 为准，需在统一需求文档中声明“状态权威来源”。  
  - 影响：MERGE-001 至 MERGE-008  
  - 参考：`apps/core-app/docs/requirements/requirements-template.md:1`

- TYPE:scope-overlap — 交通（Transport）迁移与 MessagePort 升级存在阶段重叠，需明确顺序：先迁移 invoke/async，再引入 Port 升级。  
  - 影响：MERGE-007 / MERGE-008  
  - 参考：`plan/2026-01-21_01-29-05-transport-migration-async.md:1`; `plan/2026-01-21_03-01-57-transport-message-port.md:1`

## 维护说明

- 新增合并项时，必须补充来源与差异说明；冲突类型需标注清晰且可追溯。
- 合并条目只是“索引”，真实任务状态以 issues CSV 为准。
