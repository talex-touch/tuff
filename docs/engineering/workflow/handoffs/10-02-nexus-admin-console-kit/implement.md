# Implementation Plan — 后台统一骨架

前置：`10-02-tuffex-admin-primitives` 已合入（或同一分支已有其改动），且 tuffex `dist` 已重建、:3200 dev server 已重启。

工作集：design §1 列出的文件；`i18n/locales/route/{zh,en}/dashboard.ts`（新增 `dashboard.sections.adminKit.*`、`adminGate.*`、审计页新键）；`.trellis/spec/frontend/component-guidelines.md:72`；相关测试。

## Step 0 — 准备 `[gate]`

- [ ] `trellis-before-dev`（Directory Structure、Component Guidelines 含 Loading States、Hook Guidelines、State Management、Type Safety、Quality Guidelines）。
- [ ] 本分支重测基线：`cd apps/nexus && ./node_modules/.bin/vitest run` 通过 / 失败数记入 `research/before.md`。
- [ ] ego 复拍 `/admin/audits` 基线（沿用 `/tmp/nexus-admin-baseline/sweep.mjs`，存 `research/`）。

## Step 1 — 组合式函数与工具（先测后用）

- [ ] `utils/admin-request-error.ts` + 测试。
- [ ] `useAdminFormat` + 测试。
- [ ] `useAdminQueryState` + 测试。
- [ ] `useAdminList` + 测试（design §6 全部用例）。
- [ ] `useAdminGate` + 测试。

## Step 2 — 组件

- [ ] `AdminSection`、`AdminStatGrid`、`AdminFilterBar` / `AdminFilterField`、`AdminIdentity`、`AdminConfirmDialog`、`AdminTable`、`AdminGateSkeleton`，各带组件测试。
- [ ] `AdminPageShell` 加 `#nav`。

## Step 3 — 布局闸门与入口

- [ ] `layouts/admin.vue` 三态；`pages/admin/index.vue`。
- [ ] 确认其余页面行为不变（打开 `/admin/users`、`/admin/analytics` 冒烟）。

## Step 4 — 审计页试点

- [ ] `utils/admin-audits.ts`（标签表 + 摘要）迁出并补 `intelligence.tool.*` 标签。
- [ ] `pages/admin/audits.vue` 按 design §5 重写；删除页内 watch 闸门。
- [ ] 中英文案。
- [ ] 改写 `audits-page-behavior.test.ts`（PRD R9 断言逐条保留，在测试文件头部列出「原断言 → 新位置」对照）。

## Step 5 — spec

- [ ] 更新 `component-guidelines.md:72`（组合件清单、`#nav`、区块标题规则、布局闸门、迁移完成标准出处）。

## Step 6 — 验证 `[gate]`

- [ ] 全量 vitest、Nexus typecheck（先确认 :3200 可以被打断）、改动文件 eslint（包内配置，不整文件 `--fix`）、`git diff --check`。
- [ ] ego：PRD Acceptance 全部场景；非管理员用 `Target.createBrowserContext` 隔离的上下文（共享 cookie 罐会伪造权限结论）。
- [ ] `trellis-check`。

## Step 7 — 冻结与提交

- [ ] 在父任务 `design.md` §2.2 标注「组合件 API 已冻结（日期、提交）」。
- [ ] 询问老板后提交；只暂存本任务文件。

## 回滚点

单 PR revert。若试点暴露组合件 API 缺陷，在本任务内修正后再冻结，不把问题带进 #3–#12。
