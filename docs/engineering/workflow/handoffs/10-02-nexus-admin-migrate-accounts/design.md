# Design — 用户与订阅页迁移（用户管理、激活码）

依据：父任务 `design.md` §2.2 / §4；组合件定型 API 见 `../10-02-nexus-admin-console-kit/design.md` §8；页面现状见 `../10-02-nexus-admin-console-overhaul/research/page-inventory.md`（行号动手时复核）。

## 1. 用户管理 `/admin/users`

- 页头：`AdminPageShell title=menu.users`；`#actions`：刷新。
- 列表：`useAdminList`，fetch = `GET /api/admin/users?page&limit&q&status&role`（接口已支持，`server/api/admin/users/index.get.ts:17-26`），筛选 `q`（防抖）/ `status` / `role` 与页码进 URL；每页 20 / 50 / 100。
- 列：用户（`AdminIdentity`，修首字母取到方括号）、角色与状态徽标、邮箱验证、创建时间（`tableDateTime`）、操作（详情 / 编辑 / 更多）。1280px 视口不折行。
- 抽屉五种模式保留（详情 / 编辑 / 订阅 / 积分 / 删除）：
  - 详情、订阅信息改用 `TxDescriptions`（替换手写 `<dl>`）；
  - 积分抽屉补请求代次防竞态（与订阅抽屉同一写法，spec `quality-guidelines.md:118`）；
  - 删除走 `AdminConfirmDialog`，`requireText` = 该用户邮箱（沿用现有「输入邮箱确认」语义）；
  - 硬编码 `ID:`、`tokens` 改 i18n 键；`resolveErrorMessage` 改用 `resolveAdminErrorMessage`。
- 页面内 `watch(isAdmin…)` 删除（布局闸门负责）。

## 2. 激活码 `/admin/subscriptions`

- 页头：`AdminPageShell title=menu.subscriptions`（「激活码」）；`#actions`：生成。
- 列表：`useAdminList`，fetch = `GET /api/admin/codes?page&limit&q&status&plan`（`server/api/admin/codes/index.get.ts:17-25`）。
- 列：激活码（等宽 + `TxCopyButton`）、方案、时长、使用次数、状态、创建时间、到期时间、操作。操作只有「吊销」（接口只接受 `status: 'revoked'`，`[id].patch.ts:16-20`），仅对仍可用的码显示；当前页没有任何可吊销的码时，不渲染操作列（计算列），避免整列空白。
- 1440px 视口下不横向溢出（当前列宽合计 1180px 且 `nowrap`）：时间列用 `tableDateTime`，方案与状态用徽标，宽度重排。
- 生成：`TxModal` 内的带标签表单（方案、时长、数量、使用次数上限，字段与 `codes/generate.post.ts` 校验一致），提交中锁定；吊销走 `AdminConfirmDialog`（`tone: danger`）。

## 3. R3 修复：管理员扣减不得越过下限（2026-10-03 老板决定）

复现结论见 `research/credits-subtract-repro.md`。规则：扣减后的额度必须不低于 `下限 = MAX(planFloor, used)`；超出整笔拒绝。

### 3.1 下限的唯一来源

- `planFloor` 的定义就是「`ensureBalance` 对 user 作用域会把额度抬到的值」：`resolvePersonalQuota(event, userId, resolveCreditAmount(PERSONAL_QUOTA_BY_PLAN[plan] ?? DEFAULT_PERSONAL_QUOTA), month, plan)`（FREE 满足加赠条件且激活月早于本月时为 `BOOSTED_PERSONAL_QUOTA`，`creditsStore.ts:441-459`）。
- 抽出 `resolveUserQuotaFloor(event, userId, month)`，`ensureBalance`（user 作用域）与扣减检查都调用它，两处不得各算各的。

### 3.2 签名与契约

```ts
// server/utils/creditsStore.ts
export class CreditDeductLimitError extends Error {
  readonly errorCode = 'CREDITS_DEDUCT_LIMIT'
  constructor(readonly limits: UserCreditAdjustLimits) { super('Credit deduction exceeds the adjustable amount.') }
}
export interface UserCreditAdjustLimits {
  planFloor: number   // 3.1
  used: number        // 本月已用
  quota: number       // 当前额度
  maxDeduct: number   // MAX(0, quota - MAX(planFloor, used))
}
export async function getUserCreditAdjustLimits(event: H3Event, userId: string): Promise<UserCreditAdjustLimits>
```

- `adjustUserCredits`：
  - 增加：`UPDATE … SET quota = quota + ?`，行为不变。
  - 减少：单条条件更新 `UPDATE … SET quota = quota + ? WHERE scope = 'user' AND scope_id = ? AND month = ? AND quota + ? >= MAX(?, used)`（`?` = delta、planFloor）。检查和写入在同一条语句里，并发扣减不会一起越过下限。原来的「先读再写回计算值」会丢更新，这里一并消除。`meta.changes === 0` 时重新读 limits，并抛 `CreditDeductLimitError`。
  - 只有更新成功才插流水。被拒绝的扣减不写余额、流水，也不写审计（审计在 handler 里，排在 adjust 之后）。
  - 原有的 `nextQuota < 0`、`< used` 两条检查被新条件覆盖，删去，不保留两套判断。
- `PATCH /api/admin/users/:id/credits`：
  - 捕获 `CreditDeductLimitError`，返回 `createError({ statusCode: 400, statusMessage: 'Credit deduction exceeds the adjustable amount.', data: { errorCode: 'CREDITS_DEDUCT_LIMIT', maxDeduct, planFloor, used } })`。错误码按仓库惯例写在 `data.errorCode`（`pluginContentStore.ts:185`）。
  - 其它错误的映射不变。
  - 成功响应新增顶层 `limits: UserCreditAdjustLimits`，为扣减后的值。
- `GET /api/admin/users/:id/credits`：响应新增顶层 `limits`，抽屉打开时就知道可扣上限。
- 不改 `getCreditSummary` 和会员侧接口。下限守住以后，`getCreditSummary` 不会再把额度抬回。

### 3.3 抽屉

- 「减少」模式下，数量字段（`AdminFormField`）的 `hint` 显示「最多可扣 {n}」；超出时 `invalid`，提交按钮禁用。`maxDeduct = 0` 时提示「当前额度已在下限，不能再扣减」。
- 服务端返回 `CREDITS_DEDUCT_LIMIT` 时（并发场景），显示本地化提示并带上 `data.maxDeduct`，同时用响应里的上限刷新提示。不显示服务端英文原文。
- `limits` 跟着积分抽屉的请求代次走：旧用户、旧请求的 limits 不得覆盖当前的。

### 3.4 验证与错误矩阵

| 条件 | 结果 |
|---|---|
| delta > 0 | 200，额度 +delta，写流水和审计 |
| delta < 0 且 `quota + delta >= MAX(planFloor, used)` | 200，额度 +delta；随后 GET 的余额等于扣减后的值 |
| delta < 0 且越过下限（含额度正好等于下限） | 400 `CREDITS_DEDUCT_LIMIT` + `maxDeduct`；余额、流水、审计都不变 |
| amount 非法 / 超过单笔上限 / 方向非法 | 400，与现在一致 |

### 3.5 测试

- 服务端用真实 SQL 语义来测，不用按 SQL 字符串匹配的 mock，否则 mock 会把缺陷一起编进去：
  - 在测试 helper 里用 Node 26 内置的 `node:sqlite`（`DatabaseSync`，不加依赖）实现一个最小 D1 shim，支持 `prepare/bind/first/all/run` 和 `meta.changes`。
  - `subscriptionStore` / `teamStore` 照现有 store 测试的方式 mock。
- 必测用例：
  - 基础额度用户扣 100 → 抛错，`maxDeduct` 为 0，余额与流水不变；
  - 高于下限时在上限内扣减成功，随后 `getCreditSummary` 返回扣减后的额度（R3 回归点）；
  - 跨过下限 → 抛错，`maxDeduct = quota - planFloor`；
  - `used > planFloor` 时上限按 `used` 算；
  - 增加积分不受影响；
  - FREE 加赠后的下限生效。
- API 测试：错误映射与 `data` 字段；被拒绝时不写审计；GET 和 PATCH 都带 `limits`。
- 负控：去掉下限条件后，上面的服务端用例要失败。
- 端到端：在本地 dev server 上重跑 `/tmp/accounts-verify/r3.sh` 的五个用例，「修复后」结果补进 `research/credits-subtract-repro.md`。

## 4. 测试

- 列表组装（query 参数、默认值不发参、筛选回第 1 页）放进纯函数测；积分抽屉代次防竞态的单测（快速切换两个用户，旧响应不覆盖）。
- 守卫：`i18n-key-existence`、`dashboard-admin-i18n-coverage`、`component-auto-import`。

## 5. 兼容与回滚

- 页面部分是纯前端改动。
- R3 修复收紧了管理员扣减：原来「报成功、但余额不动」的请求，现在直接返回 400。
- 接口只新增 `limits` 字段，旧客户端不受影响。
- 不涉及表结构。回滚 = revert PR。
