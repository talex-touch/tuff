# Implementation Plan — 内容运营页迁移

前置：`10-02-nexus-admin-console-kit`（PR #2040）已合入 `stage`。在独立 worktree（基于 `origin/stage`、detached）里干活，按 `guides/multi-session-collab-guide.md`「Isolating a task in a git worktree」准备环境（默认 PATH、过滤安装、端口 3205）。

## Step 0 — 准备 `[gate]`

- [ ] `trellis-before-dev`；`rg -n` 复核 page-inventory 中三页的行号。
- [ ] 基线：全量 vitest 计数；ego 复拍三页基线截图（沿用 `/tmp/nexus-admin-baseline/sweep.mjs` 的方式，worktree 自己的 dev server）。

## Step 1 — 组合件扩展

- [ ] 先改父任务 `design.md` §2.2 与 kit `design.md` §8，登记 `queryKeyPrefix`。
- [ ] `useAdminList` 加前缀 + 单测；`utils/admin-client-list.ts` + 单测。

## Step 2 — 更新与要闻

- [ ] 页面迁移、i18n 键、删除确认、`UpdateFormDrawer` 外壳与表单标签。

## Step 3 — 资源库

- [ ] `list.get.ts` 分页 + API 测试；页面网格、加载更多、错误态、上传区去重；删 i18n 豁免。

## Step 4 — 评论管理

- [ ] `#nav` 分区条 + `useAdminQueryState`；两个面板迁移（前缀 `p_` / `d_`）；确认对话框。

## Step 5 — 验证 `[gate]`

- [ ] 全量 vitest、Nexus typecheck、改动文件 ESLint、`git diff --check`。
- [ ] `trellis-check`。
- [ ] 主会话 ego：三页 × 1280 / 1920 × 亮 / 暗 × 中 / 英；资源库造 > 60 个对象验证加载更多；评论管理切标签保留页码。

## Step 6 — 提交

- [ ] 询问老板；分支 `task/feat/nexus-admin-migrate-content`，PR 合进 `stage`。
