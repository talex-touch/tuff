# Nexus Storage Governance Runbook

> Date: 2026-05-24
> Scope: Nexus Data Governance storage channel sizing, smoke evidence, and alert response.

## Current Status

- Status is **in progress, not production-complete**.
- Local/memory write smoke has focused test evidence for resolve/write/read/delete and sanitized governance analytics.
- R2/S3/OSS live smoke artifacts, authenticated cockpit screenshots, and production D1 backfill are still open evidence blockers.

## Supported Channels

| Profile | Channel / provider | Use case | Credential rule | Production evidence |
| --- | --- | --- | --- | --- |
| Local storage | `memory` / `memory` | Local dev fallback and controlled smoke tests when object storage binding is absent. | No credential ref. Optional `basePath` / `retentionDays` config is metadata only in the current Nexus executor. | Local test evidence only. Capture authenticated cockpit evidence before treating it as operator-visible proof. |
| Cloudflare R2 | `r2` / `cloudflare-r2` | Default production object storage for images, release assets, plugin packages, update assets, and Scene assets. | Cloudflare binding first; optional `secure://storage/*` ref is config metadata unless routed through the S3-compatible executor. | Open. Needs real Pages/Worker R2 write/read/delete smoke. |
| AWS S3 | `s3` / `aws-s3` | S3-compatible object storage executor. | `config.credentialRef`, `bucket`, and `region` are required. Credential refs must start with `secure://storage/`. | Open. Needs real or controlled S3-compatible write/read/delete smoke. |
| Aliyun OSS | `oss` / `aliyun-oss` | OSS-compatible object storage executor. | `config.credentialRef`, `bucket`, and `endpoint` are required. Credential refs must start with `secure://storage/`. | Open. Needs real or controlled OSS write/read/delete smoke. |

## Policy Fields

Storage policy configs are `platform_governance_configs` rows with `configType = "storage_channel"`.

Required policy shape:

```json
{
  "configType": "storage_channel",
  "name": "R2 production assets",
  "channel": "r2",
  "provider": "cloudflare-r2",
  "targetId": "plugin-package",
  "limits": {
    "maxBytes": 107374182400,
    "trafficBytes": 900000000000,
    "maxOperationsPerDay": 100000,
    "alertBytes": 85899345920,
    "windowDays": 30,
    "warningThreshold": 80
  },
  "config": {
    "binding": "R2",
    "region": "auto"
  }
}
```

Supported limit keys:

| Area | Accepted keys | Meaning |
| --- | --- | --- |
| Stored bytes | `maxBytes`, `maxStorageBytes`, `storageBytes` | Hard storage budget used by `storage.write`. |
| Traffic bytes | `trafficBytes`, `maxTrafficBytes`, `bandwidthBytes` | Read traffic budget used by `storage.read`. |
| Operations | `maxOperations`, `operationLimit`, `maxOperationsPerWindow`, `maxOperationsPerDay`, `dailyOperations` | Write/read/delete operation budget. Daily keys are multiplied by `windowDays`. |
| Window | `windowDays`, `periodDays` | Evaluation window, 1 to 366 days. |
| Early warning | `alertBytes`, `warningBytes`, `warningThreshold`, `warningPercent` | Warning budgets and utilization threshold. |

At least one enforcing limit must be present: stored bytes, traffic bytes, operations, or alert bytes.

## Sizing Baseline

Use these defaults as starting points, then adjust after 7 to 14 days of real traffic:

| Channel | `maxBytes` | `trafficBytes` | `maxOperationsPerDay` | `alertBytes` | `windowDays` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Local/memory | 10 GiB | 50 GiB | 100,000 | 8 GiB | 30 |
| R2 | 100 GiB | 900 GB | 100,000 | 80 GiB | 30 |
| S3-compatible | 100 GiB | 900 GB | 100,000 | 80 GiB | 30 |
| OSS | 100 GiB | 900 GB | 100,000 | 80 GiB | 30 |

Sizing rules:

1. Set `targetId` when a workload needs a distinct budget, for example `plugin-package`, `release-asset`, `scene-output-image`, or `storage-channel-smoke`.
2. Use provider-specific policies when one channel has multiple providers or buckets.
3. Keep `alertBytes` below `maxBytes`; a typical first value is 80 percent of `maxBytes`.
4. Use `warningThreshold` for utilization warnings and `alertBytes` for absolute early warning.
5. Do not use `deviceId`, object key, filename, actor id, credential ref, or raw payload content in policy names, target ids, or metadata.

## Smoke Procedure

Dry-run smoke:

1. Open Data Governance admin cockpit.
2. Go to **Storage policy health**.
3. Click **Smoke** on the target policy.
4. Expected result: `storage.channel_smoke.ready`, operation `resolve`, no write/read/delete.

Write smoke:

1. Click **Write smoke** on the target policy.
2. Expected result: `storage.channel_smoke.sent`.
3. Expected operations: `resolve`, `write`, `read`, `delete`.
4. Expected usage events: `storage.write`, `storage.read`, `storage.delete` against a stable governance resource id in the form `storage-smoke:<policyId>`.
5. For memory/local, focused tests now prove this path. For R2/S3/OSS, attach live object-store evidence before marking production proof complete.

Privacy checks for smoke evidence:

- Do not expose raw admin id, email, object key, diagnostic key prefix, credential ref, or payload content.
- `storage.smokeEvidence` should show policy, channel, provider, mode, status, reason, operations, byte counts, credential readiness, event counts, and unique actor count only.

## Alert Response

Alert sources:

- `buildStoragePolicyAlerts()` emits alerts for `maxBytes`, `trafficBytes`, `maxOperations`, and `alertBytes`.
- `storage.actionQueue` prioritizes unmanaged channels, overages, projected exhaustion, high utilization, and burn-rate review.
- `/api/dashboard/storage/alerts/notify` can run `plan` or `send` mode for storage alert notifications.

Response matrix:

| Signal | Likely reason | Action |
| --- | --- | --- |
| `critical` action queue item | Hard overage or blocked policy. | Stop non-essential writes, raise the matching limit only after checking resource type and recent trend, then run write smoke. |
| `high` action queue item | Warning, alert budget reached, or exhaustion within 7 days. | Review burn rate, check top resource type, increase the relevant limit or migrate traffic to a larger channel. |
| `configure-policy` | Storage events exist without a matched policy. | Add a storage policy for the channel/provider and target resource type. |
| `increase-operation-limit` | Operation count is exhausted or projected to exhaust first. | Increase operation budget or reduce repeated reads/writes. |
| `increase-traffic-limit` | Read traffic budget is exhausted or projected to exhaust first. | Increase traffic budget, add cache/CDN strategy, or reduce repeated downloads. |
| `increase-storage-limit` | Stored bytes or alert bytes are exhausted. | Increase storage budget, delete expired objects, or move the workload to another channel. |
| `review-burn-rate` | Utilization is rising but not yet blocked. | Compare 7-day and 30-day trends, then adjust `warningThreshold`, `alertBytes`, or channel placement. |

Notification procedure:

1. Use **Dry run** in **Storage alerts** first. It records planned delivery evidence without sending.
2. Confirm notification channel readiness and credential refs.
3. Use **Send** only after dry-run output matches the intended alerts.
4. Verify `notifications.deliveryEvidence` or `notifications.testEvidence` without storing recipients, body, endpoint keys, or provider secrets.

## Evidence Checklist

- [x] Local/memory write smoke focused tests.
- [x] Storage smoke route and governance analytics contract tests.
- [x] Admin cockpit UI contract for `storage.smokeEvidence`.
- [ ] Authenticated admin browser screenshot/interaction of Storage policy health.
- [ ] Live R2 write/read/delete smoke artifact.
- [ ] Live S3-compatible or OSS write/read/delete smoke artifact.
- [ ] Alert dry-run and send evidence through at least one configured notification provider.
- [ ] Production D1 migration/backfill evidence for governance events/configs.

## Focused Verification

```sh
pnpm -C "apps/nexus" exec vitest run \
  "test/api/dashboard/storage/channels-smoke.api.test.ts" \
  "test/api/dashboard/storage/policies.api.test.ts" \
  "test/api/dashboard/storage/channels-analytics.api.test.ts" \
  "server/utils/platformGovernanceStore.test.ts" \
  "app/pages/dashboard/admin/governance.test.ts"

pnpm -C "apps/nexus" exec eslint \
  "test/api/dashboard/storage/channels-smoke.api.test.ts" \
  "test/api/dashboard/storage/policies.api.test.ts" \
  "test/api/dashboard/storage/channels-analytics.api.test.ts" \
  "server/utils/platformGovernanceStore.test.ts" \
  "server/utils/storageChannelCatalog.ts"
```

`pnpm -C "apps/nexus" run typecheck` is still not the current acceptance gate for this slice because existing unrelated failures remain in `nuxt.config.ts`, `packages/utils/core-box/preview/abilities/*`, and Volar/vue-router plugin typing.
