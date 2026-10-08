# Implement — 用量账本

## 清单（按顺序）

1. [ ] **契约先行**：在 `packages/utils/transport/sdk/domains/intelligence.ts` 写入父 `design.md` §1.5 / §3.2 / §3.5 的全部类型，包括限额类型，供下游子任务引用。先单独过一次 `typecheck`。
2. [ ] `usage-ledger/constants.ts`、`local-period.ts` + 单测（TZ 两组，含 DST 边界日）。
3. [ ] logger：
   - `log(entry, { detail })`；
   - `flushBatch` 分流明细 / 计数；
   - 全局桶 upsert 进同一事务；
   - `global-deltas.ts` 的批次扣减。
4. [ ] SDK：
   - 去掉 `enableAudit` 提前返回；
   - 四条路径传 `providerId`；
   - fallback 辅助返回实际配置 id；
   - 外层能力不计全局（在 logger 按 `capabilityId` 判定）。
5. [ ] 回填：`global-backfill.ts`；logger 初始化时写 pending 标记，延迟后台执行。
6. [ ] 读接口：`usage-insights.ts`、`audit-log-query.ts`；`registerStatsChannels` 接线；插件 facade 清单。
7. [ ] 写入端 caller：按 design 表逐处改，renderer 三处 + 主进程六处；插件伪造 caller 的负向测试。
8. [ ] 默认开审计：`DEFAULT_GLOBAL_CONFIG` + renderer 存储迁移。
9. [ ] 测试：
   - 真实迁移库 harness 覆盖 AC-B1–AC-B4、AC-B8，参照 `ai/intelligence-stream-ledger.integration.test.ts:27-56`；
   - 归属 / 调用方覆盖 AC-B5；
   - 配置默认值覆盖 AC-B6；
   - 契约覆盖 AC-B7；
   - 计时覆盖 AC-B9。
10. [ ] 契约文档：新 spec + index；改 `pi-provider-contracts.md`、`privacy-data-lifecycle.md`；`sensitive-data-inventory.json`。

## 验证

```bash
pnpm -C "apps/core-app" run typecheck
pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/ai/usage-ledger" \
  "src/main/modules/ai/intelligence-audit-logger-caller-period.test.ts" \
  "src/main/modules/ai/intelligence-usage-stats-consistency.test.ts" \
  "src/main/modules/ai/intelligence-audit-flush-backoff.test.ts" \
  "src/main/modules/ai/intelligence-stream-ledger.integration.test.ts" \
  "src/main/modules/ai/intelligence-typed-transport.integration.test.ts" \
  "src/main/modules/ai/intelligence-admin-surface-boundary.test.ts" \
  "src/main/modules/ai/intelligence-sdk.test.ts" \
  "src/main/modules/privacy/intelligence-retention-owner.test.ts"
pnpm -C "packages/utils" exec vitest run \
  "__tests__/plugin-facing-events.test.ts" "__tests__/intelligence-client-hard-cut.test.ts" \
  "__tests__/transport-domain-sdks.test.ts"
corepack pnpm privacy:inventory:verify
git diff --check
```

- 真机冒烟（隔离 dev 实例）：
  - 关闭审计后发一次 Home 对话，用 `sqlite3 'file:…?immutable=1'` 查库（见记忆 tuff-profile-db-paths）：明细 0 行、`__global__` 当日桶 +1；
  - 开启后再发一次：明细出现，`caller='core.home.conversation'`，`provider` 为渠道配置 id。

## 风险与回滚

- **风险最高的是 flush 事务改动**：沿用 #780 的一致性测试，并新增「全局桶 upsert 失败 → 整批回滚 + 增量保留」用例。
- **renderer 传 caller 的信任边界**：插件来源必须仍被强制覆盖，有负向测试兜底。
- **回滚**：revert 即可；`__global__` 行与回填标记残留无害。
