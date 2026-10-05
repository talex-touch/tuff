# R3 复现：给处于套餐基线额度的用户「减少」积分

- 结论：**复现成立**。对额度正好等于套餐基线的用户做「减少」，接口返回 200，流水与管理审计都记下了扣减，但余额原样不变；额度高于基线时，扣减只生效到基线为止。本任务**未修复**（PRD R3：先复现、报告，由老板决定）。
- 时间：2026-10-03 10:24 UTC（本月 `2026-10`）。
- 环境：worktree `~/Workspace/Worktrees/talex-touch-migrate-accounts`（detached `ee35ab869` = `origin/stage`），dev server `127.0.0.1:3206`（复现后已停，:3200 未碰）；本地 D1 是 `/tmp/admin-kit-verify/main-d1-snapshot.sqlite` 的副本（主检出开发库的一致快照，14 个用户），只改了 worktree 自己的副本。
- 会话：`next-auth/jwt` `encode`（secret `tuff-dev-secret`）为 `ui-audit-bot@local.test`（快照中已是 admin）签发。
- 脚本：`/tmp/accounts-verify/r3.sh`；原始输出：`/tmp/accounts-verify/r3-output.txt`。每个用例依次是：`GET /api/admin/users/:id/credits`、直接读库、`PATCH …/credits`、再读库、再 `GET`、再读库，最后读 `credit_ledger` 与 `admin_audits`。

## 结果

| 用例 | 用户 / 套餐 | 操作前额度 / 已用 | 操作 | PATCH 响应 | 操作后额度（库） | 流水 | 管理审计 |
|---|---|---|---|---|---|---|---|
| 1 | `demo_local_user_09` / FREE（基线 20000） | 20000 / 4670 | 减少 100 | 200，`adjustment.delta = -100`，`summary.user.quota = 20000` | **20000（未变）** | 新增 `-100 r3-free-baseline-subtract` | 新增 `user.credits.adjust {delta:-100}` |
| 2 | `demo_local_user_01` / PRO（基线 240000） | 240000 / 48210 | 减少 100 | 200，`delta = -100`，`quota = 240000` | **240000（未变）** | 新增 `-100` | 新增 `{delta:-100}` |
| 3（对照） | `demo_local_user_10` / FREE | 20000 / 5100 | 增加 500 | 200，`quota = 20500` | 20500 | `+500` | `{delta:500}` |
| 4（对照） | 同上 | 20500 / 5100 | 减少 100（仍高于基线） | 200，`quota = 20400` | 20400 | `-100` | `{delta:-100}` |
| 5（对照） | 同上 | 20400 / 5100 | 减少 1000（跨过基线） | 200，`delta = -1000`，`quota = 20000` | **20000（只少了 400）** | `-1000` | `{delta:-1000}` |

用例 1 的库内记录（其余用例同形）：

```text
credit_balances  user|demo_local_user_09|2026-10|20000.0|4670.0        ← PATCH 前后、再次 GET 后都是这一行
credit_ledger    0a9da9bf-3615-41e8-a528-d42c51ca8ce2|-100.0|r3-free-baseline-subtract|2026-10-03T10:24:08.308Z
                 {"adminUserId":"196881f3-…","source":"admin-user-management","userId":"demo_local_user_09"}
admin_audits     user.credits.adjust|demo_local_user_09|local-demo-09@example.invalid
                 {"delta":-100,"reason":"r3-free-baseline-subtract","ledgerId":"0a9da9bf-…"}|2026-10-03T10:24:08.330Z
```

用户管理页的积分抽屉直接渲染 PATCH 响应里的 `summary`，所以管理员看到的是：提示「积分已更新」，流水第一条是 `-100`，而「剩余 / 额度」一个数都没动。

## 机制（读代码，行号为 `ee35ab869`）

1. `server/api/admin/users/[id]/credits.patch.ts:42` → `adjustUserCredits`（`server/utils/creditsStore.ts:1033`）：先 `ensureBalance`（`:1042`），再把额度写成 `quota + delta`（`:1056`、`:1062-1066`），并插入流水（`:1068-1080`）。这一步确实把 20000 改成了 19900。
2. 同一个请求随后写审计（`credits.patch.ts:52-63`），再并行调用 `getCreditSummary` 与 `listCreditLedgerByUsers`（`:65-68`）。
3. `getCreditSummary` 发现 `quota < 套餐应有额度`（`creditsStore.ts:768`）就调用 `ensureBalance`（`:772`）；`listCreditLedgerByUsers` 也会对每个用户无条件 `ensureBalance`（`:1521`）。
4. `ensureBalance` 的 `UPDATE … SET quota = ? WHERE … AND quota < ?`（`:711-714`）把额度抬回套餐基线（`PERSONAL_QUOTA_BY_PLAN`，`:324-330`；FREE 满足加赠条件时为 40000，`:441-458`）。

也就是说，基线是每个读写入口都会重新施加的「下限」：`consumeCredits`（`:1103`）、每日签到（`:976`）、加赠领取（`:851`）、用户自己的积分页同样会调用 `ensureBalance`。所以管理员减少积分时，最终额度只能降到 `max(基线, 原额度 − 扣减量)`；落在基线以下的那部分只出现在流水和审计里，余额里没有。

## 影响

- 低于基线的扣减实际不生效，接口仍返回成功，界面提示「积分已更新」。
- `credit_ledger` 与余额对不上：流水净额（如用例 1 的 `-100`）没有任何对应的余额变化，以后对账或做全局积分控制台时会出现解释不了的差额。
- 「减少」只对高于基线的那部分（加赠、签到、此前管理员增加的额度）有效。

## 可选修法（供老板决定，本任务未做）

1. **拒绝越过基线的扣减**：`adjustUserCredits` 在扣减后额度会低于套餐基线时返回 400（例如「扣减后低于套餐基础额度 {baseline}」），界面显示可扣上限。改动最小，语义也最清楚：基线不可扣。
2. **把管理员调整与基线分开记**：基线由套餐决定，管理员调整单独累计（单独列或按流水汇总），有效额度 = 基线 + 调整。这样「减少」能真正低于基线，`ensureBalance` 也不会覆盖它；需要迁移与统一读取口径，改动较大。
3. **让 `ensureBalance` 识别「本月已被管理员下调」**，只在没有管理员扣减时抬回基线。能修好症状，但会让「基线是下限」这条规则出现例外，读取路径更难推理。

无论选哪种，都应补一条服务端测试：基线用户扣减后再 `GET credits`，断言余额与流水净额一致（当前 `test/api/admin/users-credits.api.test.ts` 整体 mock 了 store，覆盖不到这条路径）。

## 修复后（2026-10-03，老板选定方案 1：拒绝越过下限的扣减）

- 规则：扣减后额度必须不低于 `MAX(planFloor, used)`（`planFloor` 即套餐基础额度，FREE 满足加赠且激活月早于本月时为 40000）；超出可扣上限的扣减整笔拒绝，返回 400 `CREDITS_DEDUCT_LIMIT`，不写余额、流水与审计。增加积分不变。
- 实现（worktree，行号为改后文件）：
  - `server/utils/creditsStore.ts`：下限只有 `resolveUserQuotaFloor` 一处来源（`:704`），`ensureBalance`（user 作用域）用它，并把这次施加的额度返回（`:715`）；`adjustUserCredits` 的扣减改为一条条件更新 `… AND quota + ? >= MAX(?, used)`（`:1144`），`meta.changes = 0` 时重读上限并抛 `CreditDeductLimitError`（`:1149`），只有更新成功才写流水。原来的「先读再写回计算值」一并去掉，所以并发扣减也不会一起越过下限。
  - `server/api/admin/users/[id]/credits.patch.ts`：`CreditDeductLimitError` → 400，`statusMessage: 'Credit deduction exceeds the adjustable amount.'`，`data: { errorCode: 'CREDITS_DEDUCT_LIMIT', maxDeduct, planFloor, used }`，不写审计；成功响应与 `GET` 都新增顶层 `limits: { planFloor, used, quota, maxDeduct }`。
- 复跑：同一 worktree（未提交改动）、同一本地 D1 副本，dev server `127.0.0.1:3206`（跑完已停，:3200 未碰）；会话同上。脚本 `/tmp/accounts-verify/r3-after.sh`（`r3.sh` 的副本：400 时打印 H3 `data`，GET / PATCH 打印 `limits`，每步数该用户的 `credit_ledger`（user 作用域）与 `user.credits.adjust` 审计条数）；原始输出 `/tmp/accounts-verify/r3-after-output.txt`。时间 2026-10-03 11:55 UTC。
- 起点说明：用例 1、2 的余额仍是修复前那次的状态（扣减未生效，额度等于基础额度）；`demo_local_user_10` 修复前最后被抬回到 20000，所以这次从 20000 / 5100 起步，用例 3–5 的前后额度与修复前那次相同，可以逐行对比。

| 用例 | 用户 / 套餐 | 操作前额度 / 已用 | 操作 | 修复前 PATCH | 修复后 PATCH | 修复后额度（库，含随后 GET 之后） | 流水 / 审计条数 |
|---|---|---|---|---|---|---|---|
| 1 | `demo_local_user_09` / FREE（下限 20000） | 20000 / 4670 | 减少 100 | 200，余额不变，流水与审计各多一条 | **400** `CREDITS_DEDUCT_LIMIT`，`maxDeduct 0` | 20000（不变） | 4 → 4 / 2 → 2（未写） |
| 2 | `demo_local_user_01` / PRO（下限 240000） | 240000 / 48210 | 减少 100 | 200，余额不变，流水与审计各多一条 | **400**，`maxDeduct 0`，`planFloor 240000` | 240000（不变） | 4 → 4 / 2 → 2（未写） |
| 3（对照） | `demo_local_user_10` / FREE | 20000 / 5100 | 增加 500 | 200，20500 | 200，20500，`limits.maxDeduct 500` | 20500 | 6 → 7 / 3 → 4 |
| 4（对照） | 同上 | 20500 / 5100 | 减少 100（仍高于下限） | 200，20400 | 200，20400，`maxDeduct 400` | 20400（随后 GET 未被抬回） | 7 → 8 / 4 → 5 |
| 5 | 同上 | 20400 / 5100 | 减少 1000（跨过下限） | 200，`delta -1000`，额度却只到 20000（实际少 400） | **400**，`maxDeduct 400`，`used 5100` | 20400（不变，不再截断到下限） | 8 → 8 / 5 → 5（未写） |
| 6（新增边界） | 同上 | 20400 / 5100 | 减少 400（正好等于上限） | — | 200，20000，`maxDeduct 0` | 20000 | 8 → 9 / 5 → 6 |

用例 1 的 400 响应体（其余拒绝同形）：

```json
{"statusMessage":"Credit deduction exceeds the adjustable amount.","data":{"errorCode":"CREDITS_DEDUCT_LIMIT","maxDeduct":0,"planFloor":20000,"used":4670}}
```

- 服务端测试 `server/utils/creditsStore.adjust.test.ts`（真实 SQL：`test/helpers/d1-sqlite.ts` 用 Node 26 内置 `node:sqlite` 实现的 D1 shim，`meta.changes` 是 SQLite 的真实值，每条语句前让出一个微任务以便并发调用交错）8 条：FREE / PRO 基础额度用户扣 100 被拒且余额、流水不变；下限之上扣减成功且随后 `getCreditSummary` 返回扣减后的额度；跨下限整笔拒绝、`maxDeduct = quota − planFloor`，扣满上限正好落在下限；`used > planFloor` 时上限按 `used`；增加不受影响；FREE 加赠下限 40000 生效；两笔并发扣减合起来越过下限时只放行一笔。
- 负控 1：去掉条件更新里的下限条件（连同两个绑定值）后，上面 8 条中 6 条失败（只剩「下限之上扣减」「增加」两条通过）；文件按字节恢复（`cmp` 一致）。负控 2：把条件更新换成同样判断下限的「先读再写」，只有并发那条失败（两笔都被放行）——说明那条测试确实区分了原子更新与读后写。
- 抽屉：「减少」时数量字段提示「最多可扣 {n}」，超出则字段标红、「应用」禁用，`maxDeduct = 0` 时提示「当前额度已在下限，不能再扣减」；服务端返回 `CREDITS_DEDUCT_LIMIT` 时提示本地化文案（带 `data.maxDeduct`），仍是当前账号时用它刷新上限，换了账号后到的拒绝不改当前账号的上限。真实浏览器里的抽屉表现留给主会话 ego 验收。
- 注：上文「机制」第 3 条的 `:1521` 实际在 `listCreditUsageByUsers` 里，`listCreditLedgerByUsers` 不调用 `ensureBalance`；不影响结论（抬回发生在 `getCreditSummary`）。
