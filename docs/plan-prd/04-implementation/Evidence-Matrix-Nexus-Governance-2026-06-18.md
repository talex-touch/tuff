# Evidence Matrix: Nexus Production Governance

> 更新时间：2026-06-24
> 定位：Nexus governance 从本地 evidence 走向 production / preview 可复现证据的矩阵。本文不授权生产操作；任何生产 API/DB、live send 或存储写入都必须另行确认。

## 1. 当前状态

- 本地 Wrangler / Miniflare / seeded admin cockpit 已提供开发态证据。
- Data Governance、Provider Registry、upload attempts、notification health、storage governance、provider quota analytics 已有代码与本地测试基础。
- Governance report 已按 source fail-closed 区分 `live` / `d1` / `r2` / `local-only` / `memory` / `open`：本地 storage smoke、browser notification delivery、provider quota smoke 不会晋级 production evidence。
- Governance report API 会记录 `governance.operator_cockpit.viewed` 审计事件，包含 environment / format / deploymentId / evidenceSource；Cloudflare Pages authenticated admin view 会在 report 中关闭对应 preview / production cockpit blocker，但 R7 完成仍必须绑定截图或录屏证据。
- production / preview operator evidence、live send、live storage、production D1 migration/backfill、真实 provider quota fail-closed 仍未形成完整闭环。

## 2. 生产证据矩阵

| ID | 证据面 | 必须证明 | 证据类型 | 状态 |
| --- | --- | --- | --- | --- |
| NX-GOV-01 | preview authenticated operator | 预览环境管理员可登录并查看 Data Governance cockpit | preview 截图/录屏 + deployment id | open |
| NX-GOV-02 | production authenticated operator | 生产环境管理员可登录并查看 Data Governance cockpit | production 截图/录屏 + deployment id | open |
| NX-GOV-03 | live notification send | 真实 channel-test/live-send 成功或明确 fail-closed；browser/local delivery 不计入 live | runbook output + redacted event id + `evidenceSource=live` | partial |
| NX-GOV-04 | SMTP / relay | SMTP socket 或托管 relay 配置可验证，失败时有 operator action | redacted config + health evidence | open |
| NX-GOV-05 | Web Push | VAPID/relay 在生产可用，失败时不伪成功 | redacted health evidence | open |
| NX-GOV-06 | R2/S3/OSS live storage | object storage executor 可写/读/删除测试对象，失败可追踪；memory/local smoke 不计入 R2 evidence | redacted object key + storage event + `evidenceSource=r2` | partial |
| NX-GOV-07 | production D1 migration | D1 migration/backfill 在生产有版本、时间和回滚记录；report 接入 D1 readiness | migration log + schema version + readiness snapshot | partial |
| NX-GOV-08 | provider quota fail-closed | 真实 provider quota exhausted 时阻断 direct invoke / scene run；channel quota 必须在 dispatch 前拦截 | `provider.quota_blocked` audit + blocked direct invoke/scene run evidence；smoke 仅作 local-only 诊断 | partial |
| NX-GOV-09 | operations dashboard | governance analytics 汇总不暴露 raw actor/secret/object key，且 fallback source 不误标 production | screenshot + payload redaction check | partial |

## 3. 代码守卫口径

- `preview-admin-cockpit` 与 `production-admin-cockpit` 在 report 中拆开呈现，二者只接受 `governance.operator_cockpit.viewed` 里 `evidenceSource=live` 且带 authenticated actor 的 Cloudflare Pages view；本地 seeded admin、local-only view 或 API-only evidence 不会关闭 production/preview 完成标准。
- `storage-smoke` 只有 `mode=write`、`status=sent`、`storageChannel=r2` 且 `evidenceSource=r2` 时才显示 `r2`；memory/local smoke 只能显示 `local-only`。
- `notification-send` 只有 credential-backed、非 browser adapter、`status=sent` 且 `evidenceSource=live` 时才显示 `live`；browser 或无 credential ref 的 delivery evidence 不得显示 `live`，只有 channel-test evidence 可显示 `local-only`。
- `provider-quota` 只有真实 provider dispatch 前的 `provider.quota_blocked`、`requestBlocked=true` 且 `evidenceSource=live` 时才显示 `live`；provider quota smoke 无论 dry-run、allowed、consumed 或 blocked 都只能显示 `local-only`。
- `d1-production` 以 production D1 readiness 为准；无 D1 binding 时 blocker 为 `production-d1-binding-required`，不能用本地/mock D1 关闭。

## 4. 不可接受证据

- 把 local-only / memory source 计入 production completion。
- 用 mock D1、mock provider、dry-run 替代 live/preview operator evidence。
- dashboard 暴露 provider secret、credential ref 明文、raw actor、raw email、object key 或 attempt id。
- live send 失败时仍显示 success。

## 5. 推荐非生产验证

```bash
pnpm -C "apps/nexus" exec vitest run "test/api/dashboard/governance/report.api.test.ts" "test/api/dashboard/storage/channels-smoke.api.test.ts" "app/pages/dashboard/admin/governance.test.ts"
pnpm -C "apps/nexus" exec vitest run "server/utils/platformGovernanceStore.test.ts" -t "cockpit analytics|storage channel usage|notification delivery health analytics"
pnpm -C "apps/nexus" exec vitest run "server/utils/tuffIntelligenceLabService.invoke.test.ts" "server/utils/platformGovernanceD1Readiness.test.ts" "test/api/dashboard/governance/d1-readiness.api.test.ts"
pnpm -C "apps/nexus" exec vitest run "app/pages/dashboard/admin/governance.test.ts" "test/api/dashboard/provider-registry/provider-registry.api.test.ts"
pnpm -C "apps/nexus" run typecheck
```

## 6. Roadmap 绑定

- 对应 Roadmap vNext：`R7 Nexus Governance`。
- R7 完成必须以 production / preview 可复现 evidence 为准；本地 evidence 只能标记为 partial。
