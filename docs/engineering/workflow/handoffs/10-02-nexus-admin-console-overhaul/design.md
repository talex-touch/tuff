# Design — Nexus 后台全面重构（父任务）

本文件定义跨子任务的契约：共用骨架的形状、导航终态、页面迁移完成标准、测试与验证方式。各子任务的 `design.md` 只写自己范围内的细节，不得与本文件冲突；需要改契约时先改这里。

## 1. 边界

- 范围：`apps/nexus/app/{layouts/admin.vue, components/admin/**, pages/admin/**, composables/**（后台相关）}`、被后台页面引用的 `components/dashboard/{intelligence,provider-registry}/**` 与 `UpdateFormDrawer.vue`、`pages/dashboard/assets.vue`（仅 D5 去掉管理员视图）、`server/api/admin/**` 及其 store（仅各子任务列出的接口）、`i18n/locales/route/{zh,en}/dashboard.ts`、`packages/tuffex/packages/components/src/{descriptions,data-table,pagination}`、`.github/workflows/build-and-release.yml`（仅 #10）。
- 不碰：文档内容链路（路线 A）、`/admin/emergency` 的无会话设计（`layout: false`、不要求登录，这是 break-glass 的前提）、会员控制台 `/dashboard/*` 的其它页面、`auth/admin-bootstrap.vue`。

## 2. 共用骨架

### 2.1 TuffEx 新增 / 扩展（子任务 #1）

TuffEx 不做 i18n：所有可见文案都是默认英文的 text props，由 Nexus 传入本地化文案（项目约定）。

| 件 | 形态 | 关键契约 |
|---|---|---|
| `TxDescriptions` + `TxDescriptionsItem`（新） | 语义 `<dl>`；子组件 `<div><dt/><dd/></div>` | `columns`（默认 2，容器变窄时退成 1 列）、`layout: 'horizontal' \| 'vertical'`、`size`（复用 `audit:vocab` 已有词表）、`emptyText`（默认 `—`）；`TxDescriptionsItem` 的 `label`、`span`，值走默认插槽 |
| `TxDataTable` 骨架加载态（扩展） | 新 prop `loadingVariant: 'overlay' \| 'skeleton'`（默认 `overlay`，保持兼容）、`skeletonRows` | 只在**没有数据**时渲染贴合列宽的骨架行（`aria-hidden`，表格 `aria-busy`）；已有数据时刷新**不换骨架**，保留行（spec `component-guidelines.md:316`） |
| `TxPagination` 每页条数（扩展） | 新 prop `pageSizes?: number[]`、`v-model:pageSize`、`pageSizeLabel` | 提供 `pageSizes` 才渲染选择器；改条数时发 `update:pageSize` 并回到第 1 页由调用方决定；现有 `#info` 插槽承载「共 N 条」 |

### 2.2 Nexus 后台组合件（子任务 #2）

> **API 已定型（2026-10-03）**：以 `10-02-nexus-admin-console-kit/design.md` §8 为准（含 `useAdminGate` 的 `error` 态与 `retry`、`useAdminRouteSkeleton`、各组件新增 props）。后续子任务若需改 API，先改这里与该节。

文件都放在 `app/components/admin/`（自动导入名 `Admin*`）与 `app/composables/`；页面显式 import（`component-guidelines.md:70`）。

**布局级管理员闸门**（替换 8 份 `watch(isAdmin…)`）
- `useAdminGate()` 给出 `resolving | allowed | denied` 三态：会话加载中为 `resolving`；已登录且非管理员为 `denied`，此时只调用一次 `navigateTo('/dashboard/overview')`；管理员为 `allowed`。
- `layouts/admin.vue` 在 `resolving` 时渲染页面骨架、在 `denied` 时渲染 `TxPermissionState`，只有 `allowed` 才挂载页面插槽。页面因此不再自带闸门，也不会对非管理员发出注定 403 的请求。SSR 与首帧都是 `resolving`，保持水合一致（与 `AdminNav` 的 `mounted` 约定相同）。
- 各页面迁移时删除自己的 watch，相应测试改为断言布局行为。

**页面与区块**
- `AdminPageShell`：保留 `title`、`#actions`、`#filters`、默认插槽，新增 `#nav`（标题下方的分区条，用于 `?section=` / `?tab=`）。标题必须等于 rail 文案。正文里不得再出现页级标题或副标题（spec `:72`）；区块标题由 `AdminSection` 承担。
- `AdminSection`：区块卡（`title?`、`description?`、`#actions`、默认插槽、`#footer`），统一圆角、内边距、暗色底色；替换各页手写的 `apple-card` / `TxCard` / 裸色块混用。
- `AdminStatGrid`：统一用 `TxStatCard` 的响应式网格，自带与卡片同形的骨架；替换 analytics / governance / intelligence / users 里手写的指标卡。

**列表**
- `AdminFilterBar`：带标签的字段网格 + 「清空筛选」，字段经插槽传入；搜索统一用 `TxSearchInput` 的内置防抖。
- `AdminTable`：`TxDataTable`（`loadingVariant="skeleton"`）+ 错误态（`TxErrorState` + 重试）+ 空态（区分「没有数据」与「筛选后为空」）+ `TxPagination`（总数 + 每页条数）。行点击打开详情抽屉（`TxDrawer` + `TxDescriptions`）。
- `useAdminList({ fetch, defaultLimit, filters })`：page / limit / total / filters 状态；与 URL query 双向同步（可深链、可分享）；筛选变化回到第 1 页并防抖；请求代次防竞态（旧响应后到不覆盖新数据）；`refresh()` 保留现有数据只刷新；与 `useDeferredLoading` 配合避免闪烁。
  - 已登记扩展（2026-10-03，内容运营迁移 `10-02-nexus-admin-migrate-content`）：可选 `queryKeyPrefix`。同一路由上有多个列表（评论管理的插件 / 文档两个队列）时，各自读写 `${prefix}page`、`${prefix}limit`、`${prefix}<filter>`，互不覆盖；不设置时键名与行为完全不变。
- `useAdminQueryState(key, allowed, fallback)`：`?section=` / `?tab=` 的读写（`replace` 导航）；analytics、governance、reviews、provider-registry、risk 共用。

**表单**
- 已登记扩展（2026-10-03，用户与订阅迁移 `10-02-nexus-admin-migrate-accounts`）：`AdminFormField`，抽屉 / 弹层表单里的一个带标签字段（`label`、`for?`、`hint?`、`invalid?`），块级、占满宽度，列数由表单决定。`hint` 显示在控件下方并经 `aria-describedby` 关联到控件；`invalid` 让提示转危险色、控件得到 `aria-invalid`。标注规则与 `AdminFilterField` 共用一处实现（有 `for` 用 `<label for>`，否则给字段内第一个 combobox / input 补 `aria-labelledby`；label 永不包住控件）。表单字段一律用它：`AdminFilterField` 是筛选栏横排里的 flex 项（`flex: 1 1 200px`），放进纵向 flex 会被读成 200px 高。定型 API 见 `10-02-nexus-admin-console-kit/design.md` §8。

**格式化与错误**
- `useAdminFormat()`：按当前 i18n locale 映射 BCP-47（`zh → zh-CN`、`en → en-US`）。表格里的时间统一用紧凑、不折行的 `YYYY-MM-DD HH:mm`，完整本地化时间放 `title` 提示；另提供 `date`、`dateTime`、`relative`、`number`、`compact`、`bytes`、`duration`、`percent`。禁止页面再写 `toLocaleString('en-US')`。
  - 已登记扩展（2026-10-03，内容运营迁移 `10-02-nexus-admin-migrate-content`）：`tableDate(v)`，`YYYY-MM-DD`（本地时区，与 `tableDateTime` 的日期部分一致），空值 / 非法值返回 `—`。用于取值是「某一天」的列：手动发布的要闻存为 `T00:00:00Z`，带时刻只会显示读者的时区偏移（UTC+8 下恒为 08:00）。完整时间仍放 `dateTimeTitle` 提示与详情抽屉。`tableDate` 与 `date` 另接受可选 `{ timeZone: 'UTC' }`，用于存成 UTC 零点的日期：在 UTC 以西读本地会早一天（本机 `America/Los_Angeles` 实测）。是否按日期读由页面决定，更新页用 `isCalendarDayTimestamp` / `updateDateLabels`。
- `resolveAdminErrorMessage(error, fallback)`：优先 `data.message` / `statusMessage`，绝不回落到 ofetch 的 `[GET] "/api/…"` 原文。

**确认与身份**
- `AdminConfirmDialog`：统一的破坏性确认；`tone: 'danger' | 'warning'`，可要求输入确认文本（用于真删遥测、吊销应急会话、批量解封等不可逆操作），提交中锁定按钮。
- `AdminIdentity`：头像 + 名字 + 邮箱。名字为空时只显示一次邮箱；首字母跳过方括号、emoji 等符号（修 `[R`、`[江`）。

### 2.3 共用的 passkey 二次验证（子任务 #11 引入，#12 复用）

`useAdminStepUp()` 复用 `pages/team/join.vue:125-157` 的流程（`/api/passkeys/options` → `navigator.credentials.get` → `/api/passkeys/verify`，得到 10 分钟 token，只有 UV 通过才算 step-up），替换风控页、AI 概览里手动粘贴明文 token 的输入框。

## 3. 导航终态

| 组 | 条目（rail 文案 = 页面标题） | 变化 |
|---|---|---|
| 数据分析 | 数据分析 `/admin/analytics` | 页面标题由「当前面板名」改为「数据分析」；面板条放 `#nav`；六个面板（删除 AI 分析，D6） |
| 内容运营 | 更新与要闻、资源库、评论管理、**插件审核** `/admin/plugins` | 新增插件审核（D5），位于评论管理之后 |
| 用户与订阅 | 用户管理、激活码、**积分** `/admin/credits` | 新增积分；`credits.vue` 由重定向壳改为真实页面；`activeSection` 中 `/admin/credits → users` 的映射删除 |
| AI 服务 | AI 概览、服务渠道、AI 调用审计 | 页面标题与 rail 对齐（不再是「概览」「审计日志」） |
| 系统治理 | 数据治理（含遥测保留分区）、管理操作审计、**发布证据** `/admin/release-evidence`、风控控制面（风控开关开启时才出现） | 新增发布证据；管理操作审计的标题改为「管理操作审计」；风控页承接 IP 封禁、手动封禁、应急会话与恢复码 |

- 新增 `pages/admin/index.vue`：`definePageMeta({ redirect: '/admin/updates' })`，与 `HeaderUserMenu.vue:260` 的入口和 `AdminNav` 的回落一致，`/admin` 不再 404。
- `/admin/codes` 保持重定向壳，不进菜单（守卫 `KNOWN_ORPHANS` 已登记）。
- `/admin/emergency` 仍不进 rail。
- 文案键：`dashboard.sections.menu.{credits,pluginModeration,releaseEvidence}` 新增（`menu.plugins` 已被会员侧「发布物」占用）；退役键按 #0 删除。

## 4. 页面迁移完成标准（每个渲染页逐条勾选）

1. 用 `AdminPageShell`，标题等于 rail 文案；正文没有第二个页级标题或副标题。
2. 不自带管理员闸门（由布局负责）；不对非管理员发请求。
3. 每个数据区域：首屏为贴合版式的骨架；刷新时保留内容；失败时 `TxErrorState` + 重试，且文案不含 API 路径；「没有数据」与「加载失败」「筛选为空」三者可区分。独立区域各自加载、各自失败，不被页面级请求一起挡住。
4. 列表：`AdminFilterBar` + `AdminTable` + `TxPagination`（总数 + 每页条数）；筛选与页码进 URL。
5. 格式化只用 `useAdminFormat`；1280px 视口下主列不折行、不横向溢出，次要信息进详情抽屉。
6. 所有文案走 `t()`，中英两份 route chunk 同步；无 `isZh ?` 三元、无写死英文。
7. 破坏性操作走 `AdminConfirmDialog`；没有「点两次」「无确认」。
8. 详情走 `TxDrawer` + `TxDescriptions`；不手写 `fixed inset-0` 遮罩。
9. 只用 `--tx-*` token 着色，亮 / 暗主题都无写死色值；不加与外壳打架的 `max-w-*` 或 `:deep()` 覆写 TuffEx 内部。
10. 钉住旧结构的测试改为测行为（见 §5）；新组合件有自己的单测。
11. ego 截图：1280 / 1920 × 亮 / 暗 × 中 / 英，存子任务 `research/`。

## 5. 测试策略

- **组合件**（#2）：`useAdminFormat`、`useAdminList`、`useAdminGate`、`useAdminQueryState`、`resolveAdminErrorMessage` 写普通单测；组件测试用 `test/helpers/sfc-component.ts` 编译 SFC，再以 `vue/server-renderer` 断言标记，交互规则放进 `utils/admin-kit.ts` 纯函数单测（Nexus 没有 `@vue/test-utils` / jsdom，加依赖要改 lockfile，#2 决定不加）。
- **现编页面脚本的测试**（analytics、audits、governance.runtime、AdminNav）：迁移时把可测逻辑移进组合件或纯函数并直接测它们，不再剥 import 现编整页；保留原测试守住的行为断言（错误兜底文案不含 API 路径、文案随 locale 变、筛选回第 1 页、默认 query、请求路径白名单、旧响应不覆盖等），逐条迁到新测试里。
- **源码字面量测试**（`governance.test.ts` 约 186 条、`provider-registry-admin.test.ts` 的样式类、`docs-page-performance.test.ts` 的 provider-registry 包装断言）：改为断言行为或结构契约；能删的字面量要说明它原来守的是什么、现在由哪条测试守。
- **守卫**：#7 删除 governance 的 332 键豁免（键全部补齐）；#0 修 3 个空转守卫并保留正控；`admin-route-reachability` 的页数门槛（> 10）在迁移后仍成立；新嵌套目录组件遵守 `component-auto-import` 命名。
- **CI 同款命令**：`cd apps/nexus && ./node_modules/.bin/vitest run`（不要用 `pnpm -C apps/nexus test`，会触发 install 并可能杀掉 :3200 dev server）。

## 6. 验证方式

- 浏览器只用 ego（全局约定）。一个子任务一个 TaskSpace；巡检脚本沿用 `research/visual-baseline-2026-10-02.md` 的 `/tmp/nexus-admin-baseline/sweep.mjs`（会话用 `tuff-dev-secret` 签发测试账号 `ui-audit-bot@local.test`，在根 `.wrangler` D1 里提为 admin；只用本地 demo 数据做写操作验证）。
- :3200 上的 dev server 可能是老板或其它会话的；只读浏览可以直接用，需要重启（tuffex 重建后、或开风控开关时）先问老板。
- TuffEx 改动要 `gulp build` 刷新 `dist` 后 Nexus 才看得到，而重建会让正在运行的 Nexus dev server 变成错误页且不自愈，必须重启。Bash 工具保持默认 `PATH`（已是 Node 26 与 pnpm 11.24.0），**不要**把 mise shims 放到最前：worktree 的 `mise.toml` 未信任时会退到 Node 24，信任后又要求 mise 管理的 pnpm；gulp 构建的 corepack 问题见 `frontend/tuffex-docs-sync.md` 的 Gates 一节。在独立 worktree 里干活的完整清单见 `guides/multi-session-collab-guide.md`「Isolating a task in a git worktree」。
- 风控 / 应急：需要 `NUXT_PUBLIC_RISK_CONTROL_ENABLED=true`（应急另需 break-glass 开关与非占位的 `ADMIN_CONTROL_PLANE_PEPPER`）的本地实例；passkey 环节用 CDP 虚拟认证器（`WebAuthn.addVirtualAuthenticator`）或请老板手动完成一次。

## 7. 并发、分支与提交

- 工作树有其它会话的未提交改动（tuffex 流式文本、模板文档等）。每个子任务只改自己清单内的文件；验证不用 `git stash/checkout/restore`，需要对照 HEAD 时用 `git show HEAD:path`。
- 全局约定：没有老板明确要求不 commit / push / 建分支。到 Trellis 3.4 提交步骤时询问；仓库强制走 PR（直推 master 被拒），每个子任务一个分支、一个 PR，提交时只暂存本子任务文件（必要时用私有 index）。
- #0 必须一个提交内删完（`tuffIntelligenceLabService.ts:57-81` 顶层 import 了要删的模块，拆开提交会让 `/api/v1/intelligence/*` 在加载时报错）。

## 8. 发布与回滚

- 每个子任务一个 PR，回滚即 revert 该 PR。#1 的新组件会让 tuffex 的组件生命周期 / changelog 门禁变红，直到发 0.6.3（npm 当前最新 0.6.2）；何时发版由老板决定，合入前确认。
- 后端新增接口都是新增文件或可选参数，旧客户端不受影响；#12 改变「吊销」语义（吊销后未使用的 token 立即失效），属于收紧，回滚即恢复旧行为。
- #10 改发版流水线：写证据的步骤失败不得阻断发版（`continue-on-error` 只用于这一步，并在日志里显式报出），避免把证据系统变成发版的单点故障。
