# 用量账本：计数常开、全局本地桶、写入端归属、洞察读接口

父任务：`../10-03-intelligence-audit-rebuild/`（需求 R-A1–R-A10，R-G1 / R-G2 中账本部分；决定 D2 / D8 / D9 / D10）。设计以父任务 `design.md` §1 为准。

## Goal

让「AI 用了多少」这件事在任何设置下都可信：计数不再依赖审计开关；新增按本地自然日 / 月汇总全部调用方的全局桶；渠道与调用方归属在写入端就记对；提供审计页与限额需要的两个 host-only 读接口；新装默认开启审计。

## Requirements

- **B1（R-A1）计数常开**：
  - 写审计的路径不再因 `enableAudit=false` 提前返回，改为 `log(entry, { detail })`；
  - `detail:false` 只计数、不写明细、不进 `memoryLogs`；
  - 隐私删除后的保留地板只拦明细，不拦计数。
- **B2（R-A2）全局桶**：
  - caller `__global__` / `system`，period 键用主进程本地日 / 月；
  - 外层 `agent.run / workflow.execute` 不计入；
  - 逐调用方 UTC 桶语义不变；
  - 维护未落库增量 `pendingGlobalDeltas`，事务提交后扣减。
- **B3（R-A3）回填**：
  - `system_config['intelligence.usage.global-backfill']` 先持久化 `cutoffMs`；
  - 后台把 `timestamp < cutoffMs` 的明细（排除外层行、费用按当前目录重算）一次性汇入全局桶；
  - 与标记置 `done` 同一写事务；
  - 失败整体回滚，下次用同一 `cutoffMs` 重做。
- **B4（R-A4）渠道归属**：主路径、fallback、失败、stream 的审计行 `provider` 都写实际选中渠道配置 id。
- **B5（R-A5）内置调用方**：按父 `design.md` §1.4 的表补 `core.*` caller（renderer 三处 Home 调用 + 主进程六处）；确认 `quotaCache` 缓存「无配额」结果。
- **B6（R-A6）新装默认开审计**：`DEFAULT_GLOBAL_CONFIG.enableAudit=true`；renderer 存储迁移的 `?? false` 改为读常量；已有持久值不动。
- **B7（R-A7）`getUsageInsights({ range })`**：
  - 按父 `design.md` §1.5 的 `UsageInsights` 返回（`limits` 字段在本子任务内先返回「未设置」形状，由限额子任务填实）；
  - 去向四维来自明细、排除外层行、附覆盖率；
  - 模型行带 `ModelPricing`；
  - 费用按 since 标记分界：之后的行取库值，之前的行重算。
- **B8（R-A8）`queryAuditLogs(query)`**：`{ rows, total }`，筛选项见父 `design.md` §1.5，`limit` 截断 1..200（缺省 50），行带安全 metadata。
- **B9（R-A9）新鲜度**：总量与日序列包含未落库增量；`getUsageInsights` 发现定价目录过期时调用 `requestPricingRefresh()`，不等待。
- **B10（R-A10）host-only 接线**：
  - domain 类型、`IntelligenceSdk`、事件、实现；
  - 主进程 handler 首行断言宿主；
  - 插件 facade host-only 联合与 Record；
  - 两份手写清单测试补条目。
- **B11（R-G1 / R-G2）契约**：
  - 新增 `.trellis/spec/main-process/intelligence-usage-ledger-contracts.md` 并挂进 index；
  - 修订 `pi-provider-contracts.md:191-195`（计数 = 明细仅限审计开启时段）与 `privacy-data-lifecycle.md`（计数常开）；
  - 更新 `docs/engineering/sensitive-data-inventory.json` 的 `intelligence-audit-context-memory`（写入方与保留说明补「审计关闭时仍写计数」）。

## Acceptance Criteria

- [ ] AC-B1（父 AC-1）：关审计调用一次 → 明细 0 行、全局桶与逐调用方桶各 +1；开审计 → 两者都增加且整数一致。
- [ ] AC-B2（父 AC-2）：设 `process.env.TZ='Asia/Shanghai'`，两次调用的固定时间戳为 UTC 23:59 与 00:01 时，落在同一个本地日（东八区 07:59 / 08:01）；跨本地零点的两次落在两个本地日；`America/Los_Angeles` 同类一组。
- [ ] AC-B3（父 AC-3）：一次含两次内层调用的 `agent.run` → 全局请求 +2、Token = 内层之和。
- [ ] AC-B4（父 AC-4）：临时库预置明细后首启 → 回填与重算期望一致；再启动不重复；在回填事务内注入失败 → 无残留。
- [ ] AC-B5（父 AC-5）：同一自定义渠道的 chat、embedding、失败三类调用，`provider` 都是该渠道配置 id；九个新 `core.*` caller 各有一条断言。
- [ ] AC-B6（父 AC-6）：新 profile 首启 `enableAudit===true`；预置 `false` 的配置升级后仍为 `false`。
- [ ] AC-B7（父 AC-7）：
  - 两个新事件对插件来源返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`；
  - `plugin-facing-events.test.ts` 绿；
  - `limit=1000` 被截断为 200；
  - `total` 随筛选正确变化。
- [ ] AC-B8（父 AC-8）：调用完成后、flush 前，`getUsageInsights` 的今日请求已包含它。
- [ ] AC-B9：20 万行明细的夹具库上，`getUsageInsights('30d')` 主进程耗时 < 150 ms。用测试计时并打印，不作为硬断言；超标时记录原因。
- [ ] AC-B10：
  - `pnpm -C apps/core-app run typecheck` 本子任务范围 0 新错误；
  - 相关 vitest 全绿；
  - `corepack pnpm privacy:inventory:verify` 通过；
  - `git diff --check` 干净。

## Out of Scope

- 全局上限的执行与界面（限额子任务）。
- 审计页界面（审计页子任务）。
- `ai-cli-orchestrator` 写死 caller 的发起方归属（父 PRD Out of Scope）。

## Dependencies

- 前置：`10-03-modelsdev-pricing` 已合入（`estimateCostUsd`、`resolveModelPricing`、since 标记）。
- 下游：
  - 限额子任务复用 B2 的全局桶读取与在途放行设施；
  - 审计页子任务调用 B7 / B8。
