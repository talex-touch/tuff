# 数据链路埋点与计费验收

## Goal

以可重放、可对账、可删除的事实源，验收同步清单、遥测、隐私生命周期、Credits 与计费展示的端到端数据链路。

## Confirmed Facts

- Sync v1 的 oplog、items、quota 和 session 已在同一 D1 `db.batch` 中提交，并有重复 `op_seq`、tombstone、额度与失败回滚测试；生产运行证据仍待补。
- CoreApp 将 telemetry batch 持久化到 outbox，并在重试请求中发送 `X-Idempotency-Key`；当前批次已把 Sentry telemetry batch key 改为 `randomUUID()`。
- Nexus telemetry batch route 已读取幂等 header；同 key 同 payload 返回缓存 ACK，同 key 不同 payload 返回 `409`，`processed` 只等于真实 accepted 数。
- telemetry receipt、event、daily stats 和 governance 已有本地幂等/失败测试；但 receipt、event/stat/governance 的完整 D1 原子 batch 和 retention maintenance 仍未作为生产证据闭环。
- Dashboard privacy settings 已开始进入 telemetry 双端门禁：CoreApp 关闭 telemetry 后停止上传并清理 Nexus telemetry outbox；Nexus batch ingest 对已登录用户执行 `analytics`、`crashReports`、`usageData` 事件级拒收。`personalization`、全量采集面与 privacy export/delete/finalization 仍未闭环。
- privacy export 未覆盖用户关联 telemetry/provider usage；账号注销只有 30 天 pending 标记，未找到到期后的最终停用、脱敏与关联数据处理 worker。
- Credits 消费已支持业务 `X-Idempotency-Key`，同 key 重试不重复扣费，同 key payload conflict fail-closed；ledger idempotency 字段与唯一索引已加入，消费路径改为 D1 batch 写 ledger + team/user balance。
- Billing registry 仍为空，Credits、subscription usage、本地 AI quota、provider governance 与 sync quota 尚未形成单一可解释口径。
- 详细锚点见 `research/data-telemetry-billing-audit.md`。

## Requirements

- R1：所有可重试 telemetry batch 必须携带强随机幂等键；Nexus 以调用方作用域、key 和 canonical payload hash 建立至少覆盖客户端最大重试期的 receipt。
- R2：同 key 同 payload 返回缓存 ACK 且不重复写 event、daily stats 或 governance；同 key 不同 payload 返回 `409`，不做部分写入。
- R3：batch 必须先完成 bounded validation/sanitization，再以一次 D1 atomic batch 写 receipt、accepted/quarantined event、聚合与确定性 governance；存储不可用或任一必要写失败返回非 2xx，客户端保留 outbox。
- R4：ACK 必须分别报告 `accepted`、`rejected`、`duplicate` 和 `dropped`；兼容字段 `processed` 只能等于真实 accepted 数，不能等于输入长度。
- R5：analytics、crashReports、usageData 和 personalization 设置必须进入 CoreApp 采集与 Nexus 接收双门禁；离线 outbox 在策略关闭后不得继续上传已禁止类别。
- R6：隐私 export、delete preview、delete 和到期账号清理必须覆盖拥有明确 owner 的 telemetry、provider usage、Credits/ledger 与同步数据；删除/脱敏可重试、幂等、可审计且不暴露原始用户数据。
- R7：Credits 消费以业务 idempotency key 为唯一请求身份，在一个 D1 atomic batch 中完成 team/user quota 条件扣减与 ledger 插入；余额不足、重复、冲突或 ledger 失败均不得留下部分扣账。
- R8：Credits、subscription usage、AI quota、provider governance 和 sync quota 必须有明确 owner、单位、时间窗和展示映射；未接真实支付链的 Billing registry 不得伪装成可购买/已结算。
- R9：遥测与账单证据只保留 schema/version、稳定 ID 摘要、计数、金额/单位和 bounded timestamps，不保存搜索词、路径、Token、设备指纹、IP、Provider payload 或真实用户资料。

## Acceptance Criteria

- [ ] telemetry 同 key 同 payload 并发/串行重放只写一次并返回一致 ACK；同 key 不同 payload 为 `409`。
- [ ] invalid、quarantined、超限、D1 缺失、event/stat/governance/receipt 任一失败均返回真实分类，客户端 outbox 仅在完整 ACK 后删除。
- [ ] receipt、event、daily stats 与 governance 的原子性和 14 天以上 retention 有自动化测试与维护入口。
- [ ] privacy settings 对 CoreApp 采集、outbox drain 和 Nexus 接收均生效，关闭后无被禁止类别的新写入或旧队列上传。
- [ ] privacy export/delete 与 30 天到期 worker 覆盖 telemetry/provider usage/Credits/sync owner，并通过 replay、partial failure、redaction 和删除后查询测试。
- [ ] Credits 同幂等键重试不重复扣费，余额与 ledger 原子一致；并发额度竞争、ledger 失败和 payload conflict 均 fail-closed。
- [ ] 统一数据/计费矩阵列出每个事实源、owner、单位、时间窗、隐私分类、导出/删除策略和 UI/API 消费方。
- [ ] Sync 本地原子/幂等测试与至少一次生产或 Preview 受控证据通过；memory/local-only 不计为生产完成。
- [ ] Nexus/CoreApp 聚焦测试、Nexus typecheck、CoreApp node typecheck、scoped lint、privacy inventory 和 `git diff --check` 全绿。

## Current Acceptance Matrix

| Domain | Status | Evidence / Remaining Gate |
| --- | --- | --- |
| Sync | partial | 本地 atomic/idempotency 合同存在；缺生产或 Preview 运行证据。 |
| Telemetry | partial | 随机 batch key、服务端 receipt replay、payload conflict、真实 accepted ACK 与写入失败 fail-closed 已本地修复并测试；完整 D1 atomic ingest、receipt retention 和生产/Preview 证据仍缺。 |
| Privacy | partial | CoreApp Nexus telemetry outbox drain 与 Nexus batch ingest 已接 privacy gate 并有 focused tests；`personalization`、非 telemetry 采集面、导出与最终删除仍未闭环。 |
| Credits/Billing | partial | Credits 业务幂等与 D1 batch 扣账/ledger 已本地修复并测试；并发生产证据、统一 billing registry 和真实支付链仍缺。 |

## Out of Scope

- 不在本任务中启用真实付费、创建价格、模拟 checkout 成功或修改生产 D1 数据。
- 不将 telemetry receipt 与 Credits ledger 合并成一个通用事件总线；两者共享幂等原则，但保持领域 owner 独立。
- 不把本地 D1 mock、memory fallback 或 UI 文案当作生产数据生命周期证据。
