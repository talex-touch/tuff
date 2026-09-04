# 遗留项 — 2026-09-04

三项在 OTA 传输层错误分类（PR #1864，已合并）与 CoreBox 推荐修复（`62f4b146a`）过程中发现、但**刻意未在当次改动里处理**的问题。每项都已实测复现，命令与行号见下。

排序即建议处理顺序：1 是坏的、2 是未验证的、3 是已知缺陷但影响面最小。

---

## 1. `scripts/check-prod-audit.mjs --self-test` 直接抛 ReferenceError

**状态**：坏的。自测入口当前完全不可用。

```
$ node scripts/check-prod-audit.mjs --self-test
ReferenceError: runAuditWithRetry is not defined
    at file:///…/scripts/check-prod-audit.mjs:319:16
```

`runAuditWithRetry` 在 `scripts/check-prod-audit.mjs:270` 与 `:284` 两处被调用，**全仓没有任何定义**。

**成因**：分支 `wip/prod-audit-retry`（tip `4bdbd6bfa` "test(ci): cover production audit retry policy"）只提交了重试策略的测试用例，没提交被测函数。同一批 +41 行现在也躺在 master 侧工作区未提交（`git diff --stat scripts/check-prod-audit.mjs` → 41 insertions）。

**要点**：这不是"补个函数"就完的事 —— 需要先决定重试策略本身（重试几次、退避多久、哪些失败算可重试），测试是照着一个还不存在的设计写的。两处调用点的用法是唯一的现存规格。

**处理选项**（按代价递增）：
- 回滚工作区那 41 行并删掉 `wip/prod-audit-retry`，当没发生过；
- 或补齐 `runAuditWithRetry` 实现，让 `--self-test` 重新可用。

不建议维持现状：一个"自测"命令必然抛异常，比没有自测更有害。

**验证**：`node scripts/check-prod-audit.mjs --self-test` 应当跑完并报告用例结果。

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

**相关约束（务必确认已还原）**：#1864 的 `implement.md` 里为测 OTA 临时下调过版本号，要求还原为 `2.4.14-beta.20` 且**绝不能进提交**；`tmp-*` 探针脚本要求删除而非提交。合并前已确认，真机验证时若再次临时改版本号，同样约束适用。

---

## 3. 推荐位在"部分重建失败"时不回补

**状态**：既有缺陷，非本次引入；但因 `62f4b146a` 会主动丢弃不可推荐项而更容易被看见。

`apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts:1311`：

```ts
if (items.length === 0 && diversified.length > 0) {
```

回退**只在重建结果为空时**触发。若要 10 项、重建出 3 项，剩下 7 个格子就那么空着 —— 不回补。

**与本次修复的关系**：`SystemActionsProvider.rebuildRecommendationItems` 现在会把一次性动作（`file-index` / `tpex-plugin` / `app-index` / `dev-plugin`）过滤掉。这是对的（它们本来就不该出现在推荐位），但它把"打分候选数 > 实际重建数"从偶发变成了常态 —— 此前正是这几类把 ⌘7–⌘9 占满的。

**注意**：修复方向不是"让 provider 少丢项"，而是引擎层应支持部分回补 —— 打分候选与可渲染项数量不一致是正常状态，不是异常。任何一个 source 重建失败（`item-rebuilder.ts:116` 那条 catch 也会返回 `[]`）都会走到同一处。

**待定问题**（改之前需要决定）：回补项按什么顺序插入？追加在尾部最简单，但会让"高分项重建失败"表现为低分项上浮到它的位置。

---

## 未触碰的工作区文件（与以上无关，仅备忘）

`docs/design/corebox/v2.5.0.pen`、`pnpm-lock.yaml`、`.trellis/tasks/09-04-transport-resource-unify/task.json`，以及 5 个未跟踪的 `.trellis/tasks/09-04-*` 目录。`git stash@{0}` 里另有一份无关的 caniuse-lite lockfile 漂移。
