# nexus-provider-registry-observability

服务渠道的两个观测列表接口：

- 用量账本 `GET /api/dashboard/provider-registry/usage`（`server/utils/providerUsageLedgerStore.ts`）；
- 健康检查 `GET /api/dashboard/provider-registry/health`（`server/utils/providerHealthStore.ts`）。

共同约定：

- 两个接口都只对管理员开放（`requireAdmin`）。
- 按记录时间倒序返回 `{ entries, page, limit, total }`。用量按 `created_at` 排序，健康按 `checked_at` 排序。
- 所有筛选条件之间是「且」的关系。
- `total` 是满足全部筛选条件的总条数，与分页无关。

## Requirement: 分页

- `page` 取正整数；缺省或不是正整数时为 1。
- `limit` 取正整数；缺省或不是正整数时为 50；大于 100 时按 100 处理。
- 返回体里的 `page` 与 `limit` 是实际生效的值。

### Scenario: 分页取值

- WHEN 请求 `usage?limit=500&page=2`
- THEN 返回 `limit: 100`、`page: 2`，`entries` 是按时间倒序的第 101–200 条
- WHEN 请求 `health` 时不带分页参数
- THEN 返回 `page: 1`、`limit: 50`

Acceptance: A18

## Requirement: 用量账本筛选

| 参数 | 取值 | 含义 |
| --- | --- | --- |
| `runId`、`sceneId`、`providerId`、`capability` | 字符串 | 按字段相等筛选 |
| `status` | `planned` / `completed` / `failed` | 按状态筛选 |
| `mode` | `dry_run` / `execute` | 按模式筛选 |
| `attention` | `true` / `false` | 为 `true` 时只返回需要关注的记录：状态为 `failed` 或 `planned`，或者是估算记录。这一判定与管理后台「需关注」相同 |
| `estimated` | `true` / `false` | 为 `true` 时只返回估算记录 |

规则：

- `attention`、`estimated` 缺省或为 `false` 时不参与筛选。
- `status`、`mode`、`attention`、`estimated` 取其他值时返回 400，`statusMessage` 为 `<参数名> is invalid.`。

### Scenario: 需关注与估算

- GIVEN 账本中有四条记录：
  - 一条 `completed`，非估算；
  - 一条 `completed`，估算；
  - 一条 `failed`；
  - 一条 `planned`
- WHEN 请求 `usage?attention=true`
- THEN 返回估算的 `completed`、`failed`、`planned` 三条，`total` 为 3
- WHEN 请求 `usage?estimated=true`
- THEN 只返回估算的那条，`total` 为 1
- WHEN 请求 `usage?attention=true&status=failed`
- THEN 只返回 `failed` 那条
- WHEN 请求 `usage`，不带新参数
- THEN 返回全部四条，与改动前一致

Acceptance: A18

### Scenario: 非法取值

- WHEN 请求 `usage?attention=maybe`
- THEN 返回 400，`statusMessage` 为 `attention is invalid.`
- WHEN 请求 `usage?estimated=1`
- THEN 返回 400，`statusMessage` 为 `estimated is invalid.`

Acceptance: A18

## Requirement: 健康检查筛选

| 参数 | 取值 | 含义 |
| --- | --- | --- |
| `providerId`、`capability` | 字符串 | 按字段相等筛选 |
| `status` | 一个状态，或用逗号分隔的多个状态，每项为 `healthy` / `degraded` / `unhealthy` | 返回状态属于其中任意一个的检查 |

规则：

- 每项先去掉首尾空白再判断，重复项按一项处理。
- 有任何一项不在三个取值之内（包括空项）时，返回 400，`statusMessage` 为 `status is invalid.`。

### Scenario: 多状态筛选

- GIVEN 有三次检查：`healthy`、`degraded`、`unhealthy` 各一次
- WHEN 请求 `health?status=degraded,unhealthy`
- THEN 返回 `degraded` 与 `unhealthy` 两次检查，`total` 为 2
- WHEN 请求 `health?status=healthy`
- THEN 只返回 `healthy` 那次，与改动前一致
- WHEN 请求 `health?status=degraded,bogus`
- THEN 返回 400，`statusMessage` 为 `status is invalid.`

Acceptance: A18
