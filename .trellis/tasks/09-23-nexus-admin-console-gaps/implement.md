# Implementation Plan — 后台补齐（路线 A）

工作集：`apps/nexus/app/pages/admin/{credits,plugins,release-evidence,governance}.vue`、`apps/nexus/app/components/admin/AdminNav.vue`、`apps/nexus/app/components/admin/governance/**`、`apps/nexus/app/composables/use{Credits,PluginModeration,ReleaseEvidence,Governance}AdminData.ts`、`apps/nexus/server/api/admin/plugins/[id]/versions/[versionId]/status.patch.ts`、`apps/nexus/server/api/images/list.get.ts`、`apps/nexus/i18n/locales/{zh,en}.ts`、相关测试。

## Step 0 — 研究 `[gate]`

- [ ] 读 `credits/ledger.get.ts`、`usage.get.ts` 的 query 字段与返回形状；读 `pluginsStore.ts:1932-2100` 的 `setPluginStatus` / `setPluginVersionStatus` 签名与审计写法；确认是否已有版本级状态路由（`grep -rn setPluginVersionStatus server/api`）。
- [ ] 读 `release-evidence/*.get.ts` 返回形状；读 `admin/audits.vue` 的 `actionLabels` 词表以便补新 action。
- [ ] 读 `governance.vue` 顶层分区（`grep -n "<section\|<TxCard\|v-if=\"activeTab" `）画出拆分边界，写入 `research/governance-sections.md`。

## Step 1 — 导航与文案

- [ ] `AdminNav.vue`：`sectionPaths` + `menuGroups` 三个新条目；`i18n/locales/zh.ts`、`en.ts` 新键。
- [ ] `pnpm -C apps/nexus exec vitest run app/components/admin` 通过。

## Step 2 — 三个新页面（按 credits → plugins → release-evidence）

- [ ] 每页：组合式函数 + 页面 + 最小 vitest（definePageMeta 的 layout/requiresAuth、首屏请求路径）。
- [ ] plugins 页附带新版本级状态路由 + `logAdminAudit` action 标签补进 `audits.vue`。
- [ ] `credits.vue` 移除重定向。

## Step 3 — governance 拆分

- [ ] 按 research 的边界搬分区，先搬非首屏分区为异步组件；每搬一块跑 `governance*.test.ts`。
- [ ] 主文件 < 800 行；记录拆分前后路由 chunk 体积（`nuxt build` 后 `dist/_nuxt` 对应 chunk）。

## Step 4 — images 分页

- [ ] `list.get.ts` 加 `limit` / `cursor`；`images.vue` 加"加载更多"；对应 vitest。

## Step 5 — 质量门 `[gate]`

- [ ] `pnpm -C apps/nexus run typecheck`；改动文件 eslint；`git diff --check`；`pnpm -C apps/nexus run check:api-routes`。
- [ ] `pnpm -C apps/nexus exec vitest run app/pages/admin app/components/admin server/api/admin`（存在的测试文件）。
- [ ] ego 以 admin 身份在 dev server 打开三页与 governance，截图记录到 `research/`。

## Step 6 — 收尾

- [ ] spec：`.trellis/spec/frontend/index.md` 若有后台页清单则补三页；否则在 `directory-structure.md` 记录 `components/admin/governance/`。
- [ ] 提交前 `git grep MUTATION HEAD`；只暂存本任务文件。
