# Implementation Plan — TuffEx 后台通用件

工作集：`packages/tuffex/packages/components/src/{descriptions/**,data-table/**,pagination/**,components.ts}`、`packages/tuffex/{README.md,README_ZHCN.md,CHANGELOG.md,components-lifecycle.json,scripts/audit-package-size.mjs（如需）}`、`apps/nexus/content/docs/dev/components/{descriptions,data-table,pagination,index}.{zh,en}.mdc`、`apps/nexus/app/components/content/{demo-registry.ts,demos/*}`、`apps/nexus/app/components/DocsSidebar.vue`。

共享工作树里 `CHANGELOG.md`、`DocsSidebar.vue`、`demo-registry.ts` 有其它会话的未提交改动：只改自己的条目，暂存时按 hunk 挑选，不覆盖他人修改。

## Step 0 — 准备 `[gate]`

- [ ] `npm view @talex-touch/tuffex versions`：确认 0.6.3 未发布（否则改 `since` 并问老板）。
- [ ] 读 `.trellis/spec/frontend/tuffex-design-rules.md`、`tuffex-docs-sync.md`、`component-guidelines.md` › TuffEx Suite Taxonomy，确定 descriptions 所属套件与分类。
- [ ] `export PATH="$HOME/.local/share/mise/shims:$PATH"`（gulp build 需要 corepack）。

## Step 1 — TxDescriptions

- [ ] 组件、类型、index、`components.ts` 字母序导出、测试。
- [ ] README 两份分类计数；`components-lifecycle.json`；CHANGELOG 条目。

## Step 2 — TxDataTable 骨架加载态

- [ ] props / 渲染 / 样式；测试三种状态（无数据加载、有数据刷新、overlay 默认）。

## Step 3 — TxPagination 每页条数

- [ ] props / emits / 渲染；测试；如 `audit:size` 报按需入口越界，按先例放行 select。

## Step 4 — tuffex 门禁

- [ ] `typecheck`、`vitest run`、`gulp build`、`audit:size`、`audit:vocab`、`node scripts/audit-readme-inventory.mjs`。
- [ ] 注意：gulp build 期间 `dist` 会被清空，正在运行的 Nexus dev server 会变成错误页且不自愈——构建前告知老板，构建后重启 dev server（`apps/nexus/node_modules/.bin/nuxt dev --port 3200`，不用 `pnpm`）。

## Step 5 — Nexus 文档与 demo

- [ ] `descriptions.{zh,en}.mdc` + demo + `demo-registry.ts` + 侧边栏 + 索引页双语链接。
- [ ] `data-table`、`pagination` 文档与 demo；包装组件文档同步（design §4 的 `rg`）。
- [ ] `node apps/nexus/build/check-mdc-fences.mjs`；`cd apps/nexus && ./node_modules/.bin/vitest run`。

## Step 6 — 验证 `[gate]`

- [ ] ego：三页亮 / 暗截图存 `research/`；骨架 demo 两种状态截图。
- [ ] 老调用方回归：Nexus 后台现有 `TxDataTable` / `TxPagination` 页面（audits、subscriptions、reviews）打开无变化。
- [ ] `trellis-check`；改动文件 eslint（注意 tuffex 的 `--fix` 会把同源值导入并进 `import type`，不要整文件自动修复）。

## Step 7 — 发版与提交

- [ ] 询问老板 0.6.3 发版时机；提交前询问；只暂存本任务 hunk。

## 回滚点

单 PR revert；新增 prop 默认关闭，即使不回滚也不影响现有调用方。
