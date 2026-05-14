# 04-implementation 状态索引

> 更新时间: 2026-05-14  
> 状态: 目录清点完成 / 持续维护  
> 用途: 只做实施文档的入口与有效状态判定；当前发布 gate 仍以 `../TODO.md`、`../01-project/CHANGES.md` 与对应专题 PRD 为准。

## 判定原则

- `当前参考`：仍可作为执行或验收入口，但状态变化必须同步 `TODO / CHANGES`。
- `历史参考`：保留追溯价值，不直接作为当前 gate 或实现方案来源。
- `待重写`：旧目标、旧架构或旧验收口径已漂移；继续推进前必须先按当前代码与质量门禁重写。
- `Runbook`：仅在具备目标环境、凭证与变更窗口时使用；不得把历史命令当作当前生产操作许可。

## 文件清点

| 文件 | 有效状态 | 当前边界 / 下一动作 |
| --- | --- | --- |
| `AssistantExperiment-VoiceFloatingBall-260223.md` | 历史参考 / 待重写 | 实验能力默认关闭；继续推进前需重写为当前 Assistant / OmniPanel 能力边界。 |
| `CoreAppRefactor260111.md` | 历史参考 / 待重写 | 早期 CoreApp/Tuffex/utils 改造草案；当前实现以代码现状与 TODO 分波次债务为准。 |
| `FileWorkerIdlePlan260111.md` | 历史参考 | Worker + Idle 设计已部分被启动异步化、FileProvider 后台 ready 与搜索性能治理吸收；剩余动作进入 Wave C / 搜索性能验收。 |
| `LegacyChannelCleanup-2408.md` | 历史参考 / 已漂移 | 2.4.8 P0 计划不再代表当前事实；Transport Wave A 与 typed boundary 清册是现行入口。 |
| `NexusDeviceAuthRiskControl-260316.md` | 当前参考 / 非当前主线 | Phase 0/1 已落地并保留证据入口；后续只在设备授权风控变化时更新。 |
| `NexusLocaleBackfillRunbook-260226.md` | Runbook / 历史操作入口 | 生产回填前必须重新确认 DB、环境、备份、凭证与回滚窗口。 |
| `PerformanceLag260111.md` | 历史参考 | 卡顿归因与 Worker/Idle 方向可追溯；真实 release 验收仍看 search trace 与 clipboard stress evidence。 |
| `Quality260111.md` | 历史参考 | 质量审查快照；后续治理以当前 lint/typecheck/test、超长文件治理与 TODO 债务池为准。 |
| `QualityAnalysis260111.md` | 历史参考 / 部分落地 | 环境工具抽离已部分落地；新增治理需先复核当前 `@talex-touch/utils/env` 使用面。 |
| `SqliteRetryRetrier260222.md` | 实施草案 | 继续推进前需先对照当前 `sqlite-retry` 与 `createRetrier` 实现，避免重复迁移。 |
| `StorageUnified260111.md` | 历史参考 | Storage 双轨分析保留；当前 SoT 规则以 SQLite 本地权威源与密文 sync payload 约束为准。 |
| `TaskScheduler260111.md` | 历史参考 | 调度模型保留为设计来源；当前周期任务优先复用 `PollingService` 与已落地的 startup/background gate。 |
| `TransportRetainedEventWireNamePlan-260514.md` | 当前参考 | Transport retained non-conforming event names 的 wire-name 迁移方案；后续按 alias registry、双监听、发送端切换与 hard-cut evidence 分批实施。 |
| `TuffTransportMigration260111.md` | 历史参考 / 待重写 | 已补 TL;DR；当前边界以 typed event boundary、retained raw definition 清册与 Wave A 为准。 |
| `TuffTransportPortPlan260111.md` | 方案参考 | 可作为 MessagePort/Port 抽象后续输入；不得替代当前 Transport Wave A 验收。 |
| `WidgetSandboxIsolation260221.md` | 历史参考 / 待重写 | 部分能力已落地；当前 widget 验收以 DivisionBox detached widget 真机 evidence 为准。 |
| `config-storage-unification.md` | 草案 / 库存参考 | 可用于存储盘点；Source of Truth、同步与敏感信息规则以当前 Storage / Sync 约束为准。 |
| `performance/PERFORMANCE_REFERENCE.md` | 参考资料 | 只保留性能优化历史与指标说明；不得代替真实设备性能证据。 |

## 维护规则

- 新增实施文档时必须先在本索引登记状态、适用范围与下一动作。
- 若正文状态变化影响当前行为、接口、质量门禁或发布判断，必须同步 `../TODO.md` 与 `../01-project/CHANGES.md`。
- 历史文档重新启用前，先把状态从 `历史参考` 改为 `当前参考`，并补齐可复现验证命令或证据入口。
