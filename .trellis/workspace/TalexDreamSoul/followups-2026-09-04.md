# 遗留项 — 2026-09-04

三项在 OTA 传输层错误分类（PR #1864，已合并）与 CoreBox 推荐修复（`62f4b146a`）过程中发现、但**刻意未在当次改动里处理**的问题。每项都已实测复现，命令与行号见下。

排序即建议处理顺序。**第 1 项已于 2026-09-04 解决**，条目保留而非删除：它的解决过程里量到的网络故障率，是判断第 2 项该怎么做的直接依据。待处理的是 2（未验证）和 3（已知缺陷，影响面最小）。

---

## ~~1. `scripts/check-prod-audit.mjs --self-test` 直接抛 ReferenceError~~

**状态：已解决**（2026-09-04，提交 `e7030c0a9`）。`--self-test` 恢复可用，19/19 通过。

原症状：`runAuditWithRetry` 在 `:270` 与 `:284` 被调用而全仓无定义，`node scripts/check-prod-audit.mjs --self-test` 必抛 `ReferenceError`。成因是 `wip/prod-audit-retry`（tip `4bdbd6bfa` "test(ci): cover production audit retry policy"）只提交了重试策略的测试用例、没提交被测函数。

**选的是补实现而非回滚测试。** 两处调用点是唯一现存规格，照它实现：逐次尝试，`JSON.parse` 失败或 `collectBlockingAdvisories` 抛出都算一次失败并重试，耗尽 `maxAttempts` 后抛出并带上最后一次的原因。不加 sleep —— `pnpm audit` 本身就是一次 registry 往返，重试间隔由被重试的东西自己拉开。

**过程中的发现**：这个重试不是理论上的。反复调用 `pnpm audit --prod --json`，**8 次里有 4 次**返回

```json
{"error":{"code":"pnpm","message":"fetch failed"}}
```

pnpm 把失败报成**格式完好的 JSON**：输出能 parse，退出码也不说明问题（pnpm 只要发现任何东西都非零）。这正是 `collectBlockingAdvisories` 注释里 #1586 要防的形状 —— 够不到 registry 的审计和什么都没发现的审计长得一模一样。故额外加了一条按 shape 识别 pnpm error 载荷的分支，让 "fetch failed" 能留在最终报错里，而不是被换成泛泛的"既无 advisories 也无 metadata"。

**该分支的测试强度（诚实记录，供审查时省一遍功夫）**：补了 2 个自测用例并做过变异验证 —— 删掉该分支后只有一个失败。另一个照样过，因为 `collectBlockingAdvisories` 本来也会拒掉 error 载荷。所以这条分支唯一的**可观察**收益是报错信息的质量，由"the pnpm error reason survives into the message"锁住；另一条锁的是行为（error 载荷绝不被当成有效审计），两条实现路径都满足也值得留着。

**仍待决定**：`AUDIT_ATTEMPTS = 3` 这个上限是拍的，没量过。按本机观测到的约 50% 失败率，三次全挂仍有约 1/8 概率；CI 网络通常好得多，但这个数字目前无依据支撑。若 CI 里真出现"三次全挂"，先看这里。

**验证**：`node scripts/check-prod-audit.mjs --self-test` → `Self-test passed: 19 cases.`

---

## 2. PR #1864 的 AC7 / AC8 未做真机验证

**状态**：代码与单测已合并（19 项 CI 全绿），但**验收标准里的实机回退链路没跑过**。

AC7 / AC8 要的是一次真实 OTA 轮次：官方源传输层失败 → 自动回退 GitHub → 取到候选 release。判据是日志里出现

```
Nexus update lookup failed transiently; falling back to GitHub
```

单测覆盖的是分类器（`isTransportFailureError` 对各方言的判定），**不覆盖**"分类结果确实驱动了回退"这一段接线。

**为什么需要真机**：这条链路跨 `session.fetch`（Electron 主进程，Chromium net 栈）→ `projectNetworkRequestError` → `release-fetch-service.fetchOfficial` → `fetchGitHub`。`net::ERR_*` 方言只有 Electron 运行时才产得出来，vitest 环境里造不出真实的 Chromium 网络错误。

**建议做法**：本机断网/劫持官方源域名后跑一次更新检查，抓上面那行日志。

**可能不需要人为断网**：第 1 项的排查里量到，这台机器当前对外网络本身就在大幅丢连 —— `pnpm audit` 8 次挂 4 次报 `fetch failed`，`git push` 连挂 10 次报 `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`。也就是说传输层失败现在极易自发出现，直接跑更新检查就可能撞上真实回退，比造假环境更有说服力。反过来说，若真机验证挑在网络恢复后做，就还是得人为制造故障。

**相关约束（务必确认已还原）**：#1864 的 `implement.md` 里为测 OTA 临时下调过版本号，要求还原为 `2.4.14-beta.20` 且**绝不能进提交**；`tmp-*` 探针脚本要求删除而非提交。合并前已确认，真机验证时若再次临时改版本号，同样约束适用。

---

## 3. 推荐位在"部分重建失败"时不回补

**状态**：既有缺陷，非本次引入；但因 `62f4b146a` 会主动丢弃不可推荐项而更容易被看见。

`apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts:1351`：

```ts
if (items.length === 0 && diversified.length > 0) {
```

> 行号会漂（2026-09-04 当天就从 `:1311` 移到了 `:1351`，因为并行的空态分层改动落在了同一文件）。上面那行代码本身是稳定锚点，用它 grep。

回退**只在重建结果为空时**触发。若要 10 项、重建出 3 项，剩下 7 个格子就那么空着 —— 不回补。

**与本次修复的关系**：`SystemActionsProvider.rebuildRecommendationItems` 现在会把一次性动作（`file-index` / `tpex-plugin` / `app-index` / `dev-plugin`）过滤掉。这是对的（它们本来就不该出现在推荐位），但它把"打分候选数 > 实际重建数"从偶发变成了常态 —— 此前正是这几类把 ⌘7–⌘9 占满的。

**注意**：修复方向不是"让 provider 少丢项"，而是引擎层应支持部分回补 —— 打分候选与可渲染项数量不一致是正常状态，不是异常。任何一个 source 重建失败（`item-rebuilder.ts:121` 那条 `catch` 也会返回 `[]`，注释写着"One source failing must not empty the whole grid"）都会走到同一处。

**待定问题**（改之前需要决定）：回补项按什么顺序插入？追加在尾部最简单，但会让"高分项重建失败"表现为低分项上浮到它的位置。

---

## 未触碰的工作区文件（与以上无关，仅备忘）

截至 2026-09-04 收尾时：`docs/design/corebox/v2.5.0.pen`、`pnpm-lock.yaml`（仅 caniuse-lite `1.0.30001805 → 1.0.30001810` 一行），以及 3 个未跟踪的 `.trellis/tasks/09-04-dev-update-*/` 规划目录（`check-noop`、`download-root-mismatch`、`flow-untestable`）。`git stash@{0}` 里另有一份无关的 caniuse-lite lockfile 漂移。

这份清单很快会过时：并行会话与本次工作共用同一个工作目录，收尾时 HEAD 已被它推到 `f3e8daaec`。以 `git status` 为准，别以本节为准。
