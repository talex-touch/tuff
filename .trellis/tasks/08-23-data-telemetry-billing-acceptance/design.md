# 技术设计

## 1. 领域边界

- Sync、Telemetry、Privacy 和 Credits 保持独立 owner；本任务统一验收术语与证据，不建立跨领域万能事件表。
- Telemetry receipt 是上传请求幂等事实源；telemetry events 和聚合是派生业务记录。
- Credit ledger 是财务变更事实源；balance 是受同一 atomic batch 约束的当前投影。
- Privacy policy 是采集、传输、接收、导出、保留和删除各层必须共同消费的控制面。

## 2. Telemetry Batch 合同

### 请求身份

- CoreApp 为每个 outbox batch 生成随机 UUID；header 与 body metadata 使用同一 key。
- Nexus 解析 authenticated user 或匿名 client scope，结合 key 形成 receipt 唯一键；receipt 只保存 canonical payload hash、状态、ACK、attempt 摘要和过期时间，不保存原始 payload。
- canonical hash 在完成严格字段/大小验证后计算；同 key 不同 hash 固定返回 `409`。

### Atomic ingest

1. 一次性校验和清洗最多 100 个事件，生成 accepted/rejected/dropped 分类。
2. 为 accepted/quarantined event 与 governance 生成由 scope/key/index 派生的确定性 ID。
3. 用 D1 `db.batch` 原子执行 receipt claim、event/quarantine、daily stats、governance 与 ACK commit。
4. receipt claim 使用 attempt id；只有本 attempt 成功 claim 时后续条件写入生效。并发 loser 读取已提交 receipt：hash 相同返回缓存 ACK，hash 不同返回 `409`。
5. schema/storage/batch 失败返回 `5xx`，不产生成功 ACK；客户端保留 outbox 并按既有退避重试。

旧 `processed` 字段保留兼容，但值等于 `accepted`。`duplicate` 表示整个 receipt replay，不重复增加业务计数。

## 3. Privacy Enforcement

- main-owned policy projection 驱动 CoreApp event admission 和 outbox drain；策略关闭时禁止新事件，并按类别删除或永久阻止旧队列上传。
- Nexus 在 receipt claim 前读取 authoritative account/anonymous policy，拒绝禁用类别；客户端 gate 不是服务端信任依据。
- export/delete 由固定 owner registry 生成 bounded projection；最终账号清理 worker 使用可重放 operation id，逐 owner 记录 redacted status，只有全部完成才进入 final state。

## 4. Credits Atomic Consumption

- API caller 提供业务 idempotency key；receipt 保存 scope、amount、reason hash 与 ledger id。
- 一个 D1 `db.batch` 完成 team/user 条件更新、ledger 插入和 receipt commit。所有语句使用 receipt attempt 条件，避免并发 loser 继续扣账。
- 同 key 同请求返回既有 ledger；同 key 不同 amount/reason/scope 返回 `409`。
- ledger 失败、额度不足或任一条件更新为零均不提交部分状态，并返回稳定业务错误。

## 5. 事实源矩阵

最终文档为每个域列出：owner、canonical table/record、idempotency key、单位、时间窗、派生投影、隐私类别、retention、export/delete owner、API/UI 消费方和证据级别。Billing registry 在真实支付接入前明确为 unavailable。

## 6. 迁移与回滚

- 新表通过 Nexus 现有 D1 schema/migration 机制创建，先部署兼容读取，再启用严格写入。
- 客户端 header/body 双写支持滚动升级；服务端先兼容 body metadata，再逐步要求 header。
- receipt retention 至少 14 天，并通过分页 maintenance 清理；不得先缩短到低于客户端最大 outbox age。
- 生产/Preview D1 迁移、回填和清理由单独高风险确认执行，本地实现不直接修改远端数据。
