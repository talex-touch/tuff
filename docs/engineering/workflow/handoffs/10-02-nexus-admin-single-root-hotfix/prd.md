# 热修：两个后台页面多根节点导致切页后主区域空白

父任务：`10-02-nexus-admin-console-overhaul`。来源：老板 2026-10-02 在本地 :3200 反馈「数据分析老是加载不出来」（主区域整块空白），要求排查并加骨架屏。骨架屏部分并入 `10-02-nexus-admin-console-kit` R1b（布局在那里改）。

## 排查结论（ego 实测）

- 强制刷新直接打开 `/admin/analytics`：2 s 内正常渲染，接口全部 200。
- 从 7 个后台页面经左侧导航点到数据分析：从 `/admin/intelligence-overview` 出发时，`<main>` 8 s 后仍是 0 个子节点（复现截图中的空白）；其余 6 个页面 1.2 s 内正常。
- 根因：`app/pages/admin/intelligence-overview.vue`、`intelligence-audits.vue` 的模板根部在 `<AdminPageShell>` 前有一段 HTML 注释。开发模式下 Vue 保留模板注释，页面因此是多根节点（基线巡检时 Nuxt 已报 `does not have a single root node and will cause errors when navigating between routes`）。后台页面声明了 `pageTransition: { mode: 'out-in' }`，离开多根节点页面时离场过渡无法完成，下一页永远挂不上。生产构建默认去掉注释，线上大概率不受影响。
- 全部 67 个页面模板扫描（注释计入根节点，根部 `v-if` / `v-else` 链除外）：只有这两个页面多根。

## Requirements

- R1：两个页面的说明注释移出模板根部，模板只剩 `<AdminPageShell>` 一个根节点；注释内容保留（移到 `<script setup>`）。
- R2：新增守卫 `apps/nexus/test/guards/page-single-root.test.ts`：`app/pages/**/*.vue` 的模板只能有一个根节点（注释也算，根部 `v-if` / `v-else-if` / `v-else` 链视为一个）。正控用冻结的出问题模板 fixture（登记在 `helpers/fixtures.ts` 的 `historicalFixtures`），负控用合成样本（单根、注释在根元素内、根部 `v-if` 链）；样本缺失时测试失败而不是跳过。README 守卫表与 `run-guards.mjs` 注释同步。

## Acceptance Criteria

- [ ] ego：worktree dev server 上，从 AI 概览、AI 调用审计分别经导航切到数据分析和管理操作审计，主区域 2 s 内渲染出内容；控制台不再出现 single root node 警告。
- [ ] 守卫在修复前的模板上失败、修复后通过（正控 / 负控都有）。
- [ ] `apps/nexus` 全量 vitest、改动文件 ESLint、`git diff --check` 通过。
- [ ] 单独分支 `task/fix/nexus-admin-single-root-pages`（基于 `origin/stage`），PR 合进 `stage`。
