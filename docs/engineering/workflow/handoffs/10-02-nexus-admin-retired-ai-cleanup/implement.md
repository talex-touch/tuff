# Implementation Plan — 清理退役 AI 后台残留代码

工作集见 `design.md` §1。全部改动进**一个提交**。

## Step 0 — 复核与基线 `[gate]`

- [ ] 用 `rg -n` 复核研究里的关键行号仍然成立（lab service 顶层 import `:57-81`、`intelligenceStore.ts` prompt 段、analytics 面板区间、i18n 区间）；不成立的先更新本文件再动手。
- [ ] 记录清理前基线（存 `research/before.md`）：
  - 本机 :3200 上 `POST /api/v1/intelligence/invoke`、`stream`、`GET /api/credits/models`、文档助手一次提问、provider registry 一次渠道检测的状态码与响应形状；
  - `cd apps/nexus && ./node_modules/.bin/vitest run` 的通过 / 失败数（基线要按本分支重测，不沿用别处数字）。

## Step 1 — 删路由与 util

- [ ] 删 R1 的 27 个路由文件与 `admin/analytics/intelligence.get.ts`。
- [ ] 删 4 个 util 文件。
- [ ] 裁 `tuffIntelligenceLabService.ts`（design §2 的方法），清失效 import。
- [ ] 裁 `intelligenceStore.ts`（prompt 段 + `listRuntimeAudits`）。
- [ ] Nexus typecheck（先确认 :3200 dev server 可以被打断，或先问老板），按报错补漏。

## Step 2 — 前端与文案

- [ ] analytics：删 intelligence 面板模板、tab 项、`useAdminAnalyticsData` 分支、类型；确认遗留 section 回落。
- [ ] i18n：en / zh 对称删除 R3、R4 的键；`dashboard-admin-i18n-coverage` 与 `i18n-key-existence` 守卫通过。

## Step 3 — 测试、守卫、脚本

- [ ] 删 5 个测试文件；改 policy 测试；改 analytics 测试中的 intelligence 断言；删 `intelligence.get.test.ts`、`intelligenceStore.runtime-audits.test.ts`。
- [ ] `verify-intelligence.mjs:54,66` 去掉失效路径；跑 `mise run intelligence:verify`。
- [ ] 修 3 个空转守卫（design §3），逐个做负控：注入问题 → 失败；恢复 → 通过。

## Step 4 — 依赖

- [ ] 从 `apps/nexus/package.json`（包名 `@talex-touch/tuff-nexus`）移除两个依赖，用 `pnpm install --filter @talex-touch/tuff-nexus --prefer-offline` 更新 lockfile。注意：任何 `pnpm <script>` 都会先触发全量 install，被中断会清空根 `node_modules/.bin`，导致 pre-commit 失败（修复：`pnpm install --filter . --prefer-offline --ignore-scripts`）。运行前确认没有并发的 install 或依赖 :3200 的人。
- [ ] 对比 lockfile 包集合差：只少了这两个依赖及其独占传递依赖。

## Step 5 — 文档与 spec

- [ ] 改 PRD R8 列出的现状文档（中英对照）；`CHANGES.md` 追加一条。
- [ ] `component-guidelines.md:73` 改为六个面板。
- [ ] `node apps/nexus/build/check-mdc-fences.mjs`。

## Step 6 — 验证 `[gate]`

- [ ] 复跑 Step 0 的五个调用，与基线逐项对比（`research/after.md`）。
- [ ] 复跑 lab service 可达性脚本，不可达声明为 0。
- [ ] PRD Acceptance 的 `rg` 残留扫描（带正控）。
- [ ] 全量 vitest、typecheck、`check-server-api-route-tree.mjs`、改动文件 eslint、`git diff --check`。
- [ ] ego：`/admin/analytics` 六个面板逐个打开截图；`?section=intelligence` 回落截图。
- [ ] `trellis-check`。

## Step 7 — 提交

- [ ] 询问老板后提交；只暂存本任务文件；提交信息用 `ref(nexus): …`（commitlint 没有 `refactor`）。

## 回滚点

单提交，revert 即回滚。
