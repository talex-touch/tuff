# Implementation Plan — suite 画廊异步化与 docs 样式表实验

工作集：`apps/nexus/app/components/docs/DocsComponentsGallery.vue`、新增 `apps/nexus/app/components/docs/gallery/**`、`apps/nexus/app/pages/docs/docs-page-performance.test.ts`、`apps/nexus/nuxt.config.ts`（仅 R4）、`.trellis/spec/frontend/nexus-docs-static-delivery.md`。
只读上下文：`DocsGallerySpecimen.vue`、`build/check-worker-bundle.mjs`、`build/check-demo-registry-orphans.mjs`。

共享工作树注意：其他会话在同一文件上有未提交改动；按 `git show HEAD:path` 逐文件核对，不 stash / checkout。

## Step 0 — 前置与基线 `[gate]`

- [ ] 确认 `09-23-nexus-pro-gallery-polish`、`09-23-nexus-base-gallery-sidebar` 已提交（`git log -- apps/nexus/app/components/docs/DocsComponentsGallery.vue`），工作树中该文件无他人未提交改动。
- [ ] 基线：`pnpm -C apps/nexus run build`；记录五个 suite 页与 button 页的 stylesheet / modulepreload 计数、`node build/check-worker-bundle.mjs` 的家族预算输出，写入 `research/baseline.md`。
- [ ] 基线 ego：pro-suite 页 `.docs-gallery__cell` 数、FCP、请求数（禁缓存）。

## Step 1 — 抽公共

- [ ] 新建 `gallery/shared.ts`（文案表、`cellLabel`、`docPath`、`INSTALL_CMD`）与 `gallery/manifest.ts`（五个 suite 的格子 id / doc / 中英标签，顺序与今天模板一致）。
- [ ] 外壳用 manifest 渲染 fallback；对照今天的 SSR HTML，外壳 DOM 结构不变（section / label / NuxtLink / 占位）。

## Step 2 — 逐 suite 搬运

- [ ] 先搬 `base`：`suites/base.vue` 承接分支内模板、其 script 状态与 import；外壳 `suiteLoaders.base` 指向它；build 后核对 base-suite 页 head 计数下降、格子数不变。
- [ ] 依次 `pro`、`ai`、`data`、`flow`，每个 suite 一次 build 核对。
- [ ] 外壳最终不含任何 `@talex-touch/tuffex/*`、`#components` Tx 静态 import；`DocsComponentsGallery.css` 仍由外壳引入。

## Step 3 — 测试与静态检查 `[gate]`

- [ ] 新增/更新 `docs-page-performance.test.ts` 断言：外壳无 Tx 静态 import；`suiteLoaders` 五键；manifest 与各 suite 格子数一致。
- [ ] `pnpm -C apps/nexus exec vitest run "app/pages/docs/docs-page-performance.test.ts" "app/components/docs"`，`pnpm -C apps/nexus run check:demo-registry`，`pnpm -C apps/nexus run typecheck`，改动文件 eslint，`git diff --check`。

## Step 4 — 构建与运行时验证 `[gate]`

- [ ] `pnpm -C apps/nexus run build && node build/check-worker-bundle.mjs`：五个 suite 页 stylesheet ≤ 35、modulepreload ≤ 60；button 页 ≤ 基线；不新增 findings。
- [ ] ego（`wrangler pages dev dist` 或 dev server）：pro-suite 27 格全部渲染、重播可用、无 hydration 警告；记录 FCP / 请求数与基线对比，写入 `research/after.md`。

## Step 5 — R4 实验（独立提交）

- [ ] `experimentalMinChunkSize` 三档各 build 一次，记录家族预算表；再试 `tuffex-core` manualChunks。
- [ ] 按 design §4 的保留规则决定是否保留；无论结果都写 `research/chunk-floor-experiment.md`。

## Step 6 — 收尾

- [ ] spec 更新：`nexus-docs-static-delivery.md` 新增"Suite gallery bodies are client-only async modules"一节（原因、结构、门禁）。
- [ ] 提交前 `git grep MUTATION HEAD`（防止他人扫入的调试断点），只暂存本任务文件。
