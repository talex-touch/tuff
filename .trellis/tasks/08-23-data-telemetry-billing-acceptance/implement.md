# 实施计划

## 1. Telemetry 幂等与真实 ACK

- 将 CoreApp telemetry idempotency key 改为 outbox batch 级随机 UUID，并校验 header/body 一致。
- 增加 ingestion receipt schema、canonical payload hash、attempt claim、cached ACK 与 retention maintenance。
- 将 validation、event/quarantine、daily stats、governance 和 receipt ACK 改为一个 D1 atomic batch。
- 路由返回 `accepted/rejected/duplicate/dropped`；D1 缺失和必要写失败返回非 2xx。
- 覆盖串行/并发 replay、payload conflict、partial failure、invalid/oversized batch、retention 和客户端 outbox 删除门禁。

## 2. Privacy 双端门禁

- 建立账号隐私设置的 main-owned typed projection，并接入 CoreApp event admission/outbox drain。
- Nexus 在 ingest 前执行 authoritative policy gate；匿名策略使用固定默认并保持披露一致。
- 补 telemetry/provider usage export owner、delete preview/delete 与 30 天到期 finalization worker。

## 3. Credits 原子账务

- 为 consume API/owner 增加业务 idempotency key 与 request hash。
- 在一个 D1 batch 中提交 team/user balance、ledger 与 receipt，删除 compensating partial rollback 路径。
- 覆盖重试、并发额度竞争、payload conflict、ledger failure 与账后对账。

## 4. 统一矩阵与受控证据

- 生成 sync/telemetry/privacy/Credits/subscription/AI quota/provider governance 事实源矩阵。
- 在本地 D1 执行完整测试；经单独确认后在 Preview 执行 schema、replay、privacy gate 和 reconciliation smoke。
- Billing registry 未接真实支付时保持 unavailable，不增加 mock checkout。

## 5. 最终门禁

```bash
corepack pnpm -C "apps/nexus" exec vitest run \
  "server/utils/telemetryStore.test.ts" \
  "server/utils/telemetryRetentionStore.test.ts" \
  "server/utils/telemetryRetentionMaintenance.test.ts" \
  "server/utils/__tests__/syncStoreV1.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/sentry/sentry-service.test.ts" \
  "src/main/modules/analytics/report-queue-store.test.ts"
corepack pnpm -C "apps/nexus" run typecheck
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm privacy:inventory:verify
git diff --check
```

- 将脱敏 ACK、replay、reconciliation、privacy 和 deletion evidence 回写任务；未执行远端证据时不归档。
