# Evidence Matrix: Nexus Production Governance

> 更新时间：2026-06-18
> 定位：Nexus governance 从本地 evidence 走向 production / preview 可复现证据的矩阵。本文不授权生产操作；任何生产 API/DB、live send 或存储写入都必须另行确认。

## 1. 当前状态

- 本地 Wrangler / Miniflare / seeded admin cockpit 已提供开发态证据。
- Data Governance、Provider Registry、upload attempts、notification health、storage governance、provider quota analytics 已有代码与本地测试基础。
- production / preview operator evidence、live send、live storage、production D1 migration/backfill、真实 provider quota fail-closed 仍未形成完整闭环。

## 2. 生产证据矩阵

| ID | 证据面 | 必须证明 | 证据类型 | 状态 |
| --- | --- | --- | --- | --- |
| NX-GOV-01 | preview authenticated operator | 预览环境管理员可登录并查看 Data Governance cockpit | preview 截图/录屏 + deployment id | open |
| NX-GOV-02 | production authenticated operator | 生产环境管理员可登录并查看 Data Governance cockpit | production 截图/录屏 + deployment id | open |
| NX-GOV-03 | live notification send | 真实 channel-test/live-send 成功或明确 fail-closed | runbook output + redacted event id | open |
| NX-GOV-04 | SMTP / relay | SMTP socket 或托管 relay 配置可验证，失败时有 operator action | redacted config + health evidence | open |
| NX-GOV-05 | Web Push | VAPID/relay 在生产可用，失败时不伪成功 | redacted health evidence | open |
| NX-GOV-06 | R2/S3/OSS live storage | object storage executor 可写/读/删除测试对象，失败可追踪 | redacted object key + storage event | open |
| NX-GOV-07 | production D1 migration | D1 migration/backfill 在生产有版本、时间和回滚记录 | migration log + schema version | open |
| NX-GOV-08 | provider quota fail-closed | 真实 provider quota exhausted 时阻断 direct invoke / scene run | provider quota smoke evidence | open |
| NX-GOV-09 | operations dashboard | governance analytics 汇总不暴露 raw actor/secret/object key | screenshot + payload redaction check | partial |

## 3. 不可接受证据

- 把 local-only / memory source 计入 production completion。
- 用 mock D1、mock provider、dry-run 替代 live/preview operator evidence。
- dashboard 暴露 provider secret、credential ref 明文、raw actor、raw email、object key 或 attempt id。
- live send 失败时仍显示 success。

## 4. 推荐非生产验证

```bash
pnpm -C "apps/nexus" exec vitest run "app/pages/dashboard/admin/governance.test.ts" "test/api/dashboard/provider-registry/provider-registry.api.test.ts"
pnpm -C "apps/nexus" run typecheck
```

## 5. Roadmap 绑定

- 对应 Roadmap vNext：`R7 Nexus Governance`。
- R7 完成必须以 production / preview 可复现 evidence 为准；本地 evidence 只能标记为 partial。
