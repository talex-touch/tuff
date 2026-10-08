# Design — 用量账本

以父任务 `design.md` §1 为准，本文件补实现细节。

## 文件

| 文件 | 内容 |
|---|---|
| `apps/core-app/src/main/modules/ai/usage-ledger/constants.ts` | `GLOBAL_USAGE_CALLER_ID`、`OUTER_GOVERNANCE_CAPABILITIES = ['agent.run','workflow.execute']`、`system_config` key 常量 |
| `apps/core-app/src/main/modules/ai/usage-ledger/local-period.ts` | `localDayKey(ts)`、`localMonthKey(ts)`、`resolveWindow(range, now)`（本地 0 点边界，DST 安全：用 `new Date(y, m, d)` 构造边界）、`currentTimeZone()` |
| `apps/core-app/src/main/modules/ai/usage-ledger/global-deltas.ts` | 未落库增量：`add(entry)`、`settle(batchId)`、`snapshot(periodKeys)`；按批次记录，flush 失败重排队时不扣减 |
| `apps/core-app/src/main/modules/ai/usage-ledger/global-backfill.ts` | 回填：标记读写、分组重算、单事务 upsert |
| `apps/core-app/src/main/modules/ai/usage-ledger/usage-insights.ts` | `getUsageInsights` 组装：全局桶日序列、总量、去向四维 SQL、覆盖率、审计状态、定价状态 |
| `apps/core-app/src/main/modules/ai/usage-ledger/audit-log-query.ts` | `queryAuditLogs`：筛选、`COUNT(*)` 总数、分页、`limit` 截断 |
| `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts` | `log(entry, { detail })`、`flushBatch` 分流、全局桶 upsert（同事务）、提交后扣减增量 |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | 去掉 `enableAudit` 提前返回；四条路径传 `providerId`；fallback 辅助返回实际配置 id |
| `packages/utils/transport/sdk/domains/intelligence.ts` | 类型 + 事件 + SDK 方法（**第一步先写类型并单独自检**，作为限额 / 审计页子任务的契约） |
| `packages/utils/plugin/sdk/intelligence.ts` | host-only 联合与 Record 加 `getUsageInsights`、`queryAuditLogs` |
| `apps/core-app/src/main/modules/ai/intelligence-module.ts` | `registerStatsChannels` 注册两个 handler，首行 `assertHostOwnedIntelligenceControlPlane` |

## SQL 要点

- 日序列：

  ```sql
  SELECT period, request_count, success_count, failure_count,
         prompt_tokens, completion_tokens, total_tokens, total_cost, avg_latency
  FROM intelligence_usage_stats
  WHERE caller_id = '__global__' AND caller_type = 'system' AND period_type = 'day'
    AND period >= 'day:<startDay>' AND period <= 'day:<endDay>'
  ```

  走主键 / `idx_usage_period`。
- 去向，以渠道为例：

  ```sql
  SELECT provider, COUNT(*), SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END),
         SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens),
         SUM(CASE WHEN timestamp >= :since THEN COALESCE(estimated_cost, 0) ELSE 0 END)
  FROM intelligence_audit_logs
  WHERE timestamp >= :startMs AND timestamp < :endMs
    AND capability_id NOT IN ('agent.run', 'workflow.execute')
  GROUP BY provider
  ```

  - since 之前的费用：另按 `(provider, model)` 分组取 token 和，用 `estimateCostUsd` 重算后加回各维度。
  - 模型维度直接按 `(provider, model)` 分组。
- 调用方维度：`GROUP BY caller, CASE WHEN caller IS NULL THEN json_extract(metadata, '$.operation') END`。返回时 NULL caller 记 `''`，operation 放在行的附加字段 `operation`（`BreakdownRow` 允许带可选 `operation?: string`，父 design §1.5 同步加上）。
- 覆盖率：`detailRequests` = 明细窗口内非外层行数；`totalRequests` = 全局桶窗口内请求数（含增量）。
- `oldestDetailMs`：`SELECT MIN(timestamp) FROM intelligence_audit_logs`，走 `idx_audit_timestamp`。

## 写入端改动点（B4 / B5）

| 位置 | 改动 |
|---|---|
| `intelligence-sdk.ts:811-825`、`:859-873`、`:892-909`、`:1007-1054` | entry 增加 `providerId`；stream 路径不再用 chunk provider 覆盖 |
| `renderer/src/modules/conversation/useHomeConversation.ts:198-215` | `metadata.caller = 'core.home.conversation'` |
| `renderer/src/modules/home-push/opening.ts:282-292` | `'core.home.opening'` |
| `renderer/src/modules/conversation/conversation-title.ts:171-186` | `'core.home.conversation-title'` |
| `main/modules/box-tool/addon/context-actions/context-actions-provider.ts:137-144` | `'core.corebox.context-action'` |
| `main/modules/ocr/ocr-service.ts:880-887` / `:1146-1152` | `'core.ocr.clipboard'` / `'core.ocr.embedding'` |
| `main/modules/box-tool/addon/files/embedding-service.ts:101,145,315` | `'core.files.embedding'`（含 `isAvailable` 探针） |
| `main/modules/ai/intelligence-module.ts:1510-1551` | 宿主无 caller 时补 `'core.app.tts'` / `'core.app.chat'`；插件来源仍强制 `plugin:<name>`，不得被覆盖 |

renderer 传的 caller 只在宿主来源时生效。插件来源由 `intelligence-module.ts:421-441,521-534` 强制绑定，改动后要有一条测试证明插件伪造 `core.*` 无效。

## 关键边界

- 全局桶 upsert 与明细、逐调用方桶在同一写事务里（沿用 #780 的一致性，`intelligence-audit-logger.ts:584-591`）。
- `pendingGlobalDeltas` 只在事务提交成功后扣减。失败重排队时保留，避免读数短暂偏低。
- 回填与实时写入不重叠：实时条目恒有 `timestamp ≥ cutoffMs`。`cutoffMs` 只在第一次写标记时确定，之后不变。
- 新 spec `intelligence-usage-ledger-contracts.md` 写清：
  - 两类桶的键与时区；
  - 保留 caller id；
  - 外层排除；
  - 计数常开与隐私删除的关系；
  - 回填协议；
  - 读接口的覆盖率语义；
  - Good / Bad 用例。
