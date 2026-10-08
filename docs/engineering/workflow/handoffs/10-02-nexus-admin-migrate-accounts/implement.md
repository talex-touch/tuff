# Implementation Plan — 用户与订阅页迁移

前置：`10-02-nexus-admin-console-kit`（PR #2040）已合入 `stage`。独立 worktree（基于 `origin/stage`、detached），环境按 `guides/multi-session-collab-guide.md`「Isolating a task in a git worktree」（默认 PATH、过滤安装、端口 3206）。与 `10-02-nexus-admin-migrate-content` 可并行：两者文件不相交（i18n 文件各改各自的 `sections.*` 子树，合并时留意同文件不同 hunk）。

## Step 0 — 准备 `[gate]`

- [ ] `trellis-before-dev`；复核 page-inventory 中两页行号。
- [ ] 基线：全量 vitest 计数；ego 复拍两页基线。

## Step 1 — 用户管理

- [ ] 列表迁移（`useAdminList` + `AdminFilterBar` + `AdminTable` + `AdminIdentity`）。
- [ ] 抽屉：`TxDescriptions`、积分抽屉代次、删除确认、i18n 键。

## Step 2 — 激活码

- [ ] 列表迁移、计算操作列、复制按钮、生成表单、吊销确认。

## Step 3 — R3 复现

- [x] 本地复现并写 `research/credits-subtract-repro.md`；报告主会话，不擅自修。

## Step 3b — R3 修复（老板 2026-10-03 决定；在 trellis-check 第一轮之后做，避免与复核同时改抽屉）

- [ ] `creditsStore.ts`：`resolveUserQuotaFloor` 单一来源、`getUserCreditAdjustLimits`、`CreditDeductLimitError`、扣减改条件更新（design §3.2）。
- [ ] `credits.patch.ts` / `credits.get.ts`：错误映射与 `limits` 字段。
- [ ] 抽屉：可扣上限提示、超限拦截、服务端拒绝的本地化提示（design §3.3）。
- [ ] `node:sqlite` D1 shim + 服务端用例 + 负控；API 测试；dev server 重跑复现脚本并补 research。
- [ ] 第二轮 `trellis-check`（只看 R3 改动）。

## Step 4 — 验证 `[gate]`

- [ ] 全量 vitest、Nexus typecheck、改动文件 ESLint、`git diff --check`。
- [ ] `trellis-check`。
- [ ] 主会话 ego：两页 × 1280 / 1440 / 1920 × 亮 / 暗 × 中 / 英。

## Step 5 — 提交

- [ ] 询问老板；分支 `task/feat/nexus-admin-migrate-accounts`，PR 合进 `stage`。
