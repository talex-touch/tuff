# Research: 有接口无界面的后台能力 —— 接口契约（积分 / 插件审核 / 发布证据 / 风控·维护·应急）

- **Query**: 为 D2 加回的功能（积分、插件审核、发布证据、IP 封禁与解封、遥测保留清理、应急吊销）整理服务端契约；核对 09-23 计划与审计在当前代码下是否过期。
- **Scope**: internal（只读：rg / git / sed；未跑构建、测试、dev server，未请求生产）
- **Date**: 2026-10-02（基线：工作树 `stage`，HEAD `ca6577bbb`）
- 路径约定：`server/…`、`app/…` 均相对 `apps/nexus/`。

## 0. 综合表

| 功能 | 端点 | 鉴权 | 破坏性 | 与现有 UI 的重叠 | 建议位置（AdminNav 组） | 待老板决策 |
|---|---|---|---|---|---|---|
| 积分流水 / 用量 | `GET /api/admin/credits/ledger`、`/usage` | `requireAdmin` | 只读 | `/admin/users` 抽屉按单个用户看（口径不同，见 §2.2） | `accounts`（用户与订阅），替换 `credits.vue` 重定向 | 全局流水只含团队消耗行、用量只看当月——要不要先补后端 |
| 计价规则 | `GET/PATCH /api/admin/credits/pricing` | `requireAdmin` | 改价即时影响全体扣费；`active=false` 使该能力对所有人 503 | 无 | 同上（同页分区） | 改价是否要二次确认；审计不记旧值 |
| 插件 / 版本审核 | `GET /api/admin/plugins/pending`；`PATCH /api/dashboard/plugins/:id/status`；`PATCH /api/dashboard/plugins/:id/versions/:versionId` | 见 §3.1 | 可改回；版本批准会签发 Nexus attestation | **`/dashboard/assets` 管理员「待处理审核」视图已能批 / 驳插件与版本** | `content`（内容运营），`reviews` 之后；或留在 `/dashboard/assets` | 新建后台页、迁移、还是只加链接 |
| 扫描豁免 | `GET/POST /api/admin/plugin-scan-waivers`、`DELETE …/:id` | `requireAdmin` | 创建 = 放行 high 级规则（只影响之后上传 / 重传的同 sha 包） | 无 | 与插件审核同页 | 豁免入口如何拿到 artifact sha |
| 发布证据 | `GET …/release-evidence/{matrix,runs,runs/:runId}`（读）；`POST runs`、`runs/:runId/items`、`doc-guard`（写） | `requireAdminOrApiKey(['release:evidence'])` | 只读页无 | 无 | `operations`（系统治理） | **仓库里没有任何写入方**，页面会是空的 |
| 自动封禁 IP | `GET /api/admin/telemetry/ip-blocks`；`POST …/ip-blocks/unblock` | 风控开关 + `requireAdmin`；解封走控制面守卫 | 解封可逆，但不清违规计数，并顺带写一条「已停用」手动封禁 | `/admin/risk` 已能按 IP 解封（无列表）；手动封禁的增删改在 `/admin/intelligence-overview` | `operations` → `/admin/risk` 内加列表 | 生产是否开 `riskControl`；用兼容路由还是 `risk/actor.unblock` |
| 遥测保留清理 | `POST /api/admin/maintenance/retention` | `requireAdminOrApiKey(['maintenance:write'])` | `dryRun=false` 时不可逆删除 | 无（已有每 6 小时的自动清理） | `operations`（数据治理附近） | 是否需要手动入口；只留 dry-run 预览？ |
| 应急吊销 | `POST /api/admin/emergency/revoke` | 风控开关 + 控制面 A 通道 + passkey step-up（受保护时） | 只阻止后续签发；已签发 token 用到过期为止 | `/admin/emergency` 无吊销按钮 | 不进 rail；可并入 `/admin/risk` | 没有会话列表接口、生产 break-glass 关闭、恢复码无发放路径——还做不做 |
| OOB 风控 | `POST /api/admin/oob/risk/*` ×3 | Cloudflare Access service token（+可选 mTLS），通道 C | 同 `risk/*` | `/admin/risk` 已覆盖同名 A/B 通道版本 | 不做 UI（机器通道） | 无 |

## 1. 09-23 计划 / 审计的过期项

| 09-23 原文 | 当前事实 | 证据 |
|---|---|---|
| 版本级 `setPluginVersionStatus` 「目前没有路由」，R2 计划新建 `admin/plugins/[id]/versions/[versionId]/status.patch.ts` | **一直有路由**：`PATCH /api/dashboard/plugins/[id]/versions/[versionId]`，2025-11-29（`03a22bc3f`）起就在，09-23 当天也在；`/dashboard/assets` 正在调用 | `server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts:6,36`；`app/pages/dashboard/assets.vue:903` |
| pricing.patch body = capability、creditsPerUnit、minCredits，校验 :24-38 | 还有 `reserveMultiplier`、`upstreamCostUsdPerUnit`、`active`；校验 :22-68（09-23 当天已经如此） | `server/api/admin/credits/pricing.patch.ts:13-68` |
| `credits.vue:9` 直接 `navigateTo('/admin/users')` | 09-28 改为 `definePageMeta({ redirect: '/admin/users' })` | `app/pages/admin/credits.vue:2-4`；`cf3b48934` |
| `AdminNav.vue:33-48` sectionPaths、`:110-230` menuGroups，组「内容 / 实验场 / 账户 / 分析 / 运营」 | sectionPaths `:33-46`；menuGroups `:82-188`；组 id `analytics/content/accounts/intelligence/operations`（数据分析 / 内容运营 / 用户与订阅 / AI 服务 / 系统治理），「实验场」组已不存在 | `app/components/admin/AdminNav.vue:33-46,82-188` |
| 菜单文案取自 `dashboard.sections.menu.*`，由 `AdminNav.routing.test.ts:241-281` 检查 | 测试只剩 256 行、不再断言文案命名空间；往返断言在 `:191-198`；`accounts` 组条目被 `toEqual` 钉死在 `:162-165`；`/admin/credits → users` 在 `:204` | `app/components/admin/AdminNav.routing.test.ts` |
| 验收依赖 `AdminNav.test.ts`、`admin-page-layout-contracts.test.ts`（design 说 `:62-128` 检查 audits 动作词表） | 两个文件都在 10-01 `5e6579e05` 删除 | `git show --name-status 5e6579e05` |
| 沿用 `doc-comments.vue:24-30` 的 watch 写法 | `doc-comments.vue` 已删除，并入 `reviews.vue` 的 tab；同样的 watch 在 `reviews.vue:44-47`、`risk.vue:24-27` | `5e6579e05` |
| 发布证据写接口「由 CI 使用」 | 全仓库无任何调用方（`.github`、`scripts`、`packages`、`apps/core-app` 均为 0）；`git log -S` 在 `.github/scripts` 下也查不到；`pnpm docs:guard` 于 2026-05-13 退役，doc-guard 的默认证据改成了「manual documentation review」 | §4.3；`0c08b11a2` |
| 驳回「必须填写 reason」 | 服务端不强制；现有 UI 提示写的是「（可选）」 | `status.patch.ts:41`；`[versionId].patch.ts:39`；`i18n/locales/route/zh/dashboard.ts:1458` |
| 版本级路由要写 `logAdminAudit` | 现有插件 / 版本状态变更都**不写** `admin_audits`，只写插件时间线、治理事件和通知 | §3.1 |
| `retention.post` 属「维护 API key」 | 管理员会话也能调，API key 只是另一种方式 | `server/api/admin/maintenance/retention.post.ts:27`；`server/utils/auth.ts:214-226` |
| `/api/admin/*` 共 76 个文件 | 80 个 | `find server/api/admin -type f` |
| `subscriptions.vue` 用 `requestJson` 拉取 | 用 `rawFetch`（ofetch）；`TxDataTable scroll-x` 仍在 | `app/pages/admin/subscriptions.vue:2,112,303` |
| `pluginsStore.ts:2044` | 仍准确（`setPluginStatus` 在 :1932） | — |

## 2. A 积分

### 2.1 端点契约

| 端点 | 鉴权 | 输入 / 校验 | 返回 | 副作用 · 审计 | 分页 · 错误 |
|---|---|---|---|---|---|
| `GET /api/admin/credits/ledger`（`server/api/admin/credits/ledger.get.ts`） | `requireAdmin` :6 | `page`、`limit`（默认 20，上限 200）、`q`/`query` :8-13 | `{ entries: CreditLedgerAuditEntry[], pagination{page,limit,total,totalPages} }` :21-29；类型见 `server/utils/creditsStore.ts:1680-1691` | 只读 | page/limit；401/403 |
| `GET /api/admin/credits/usage`（`usage.get.ts`） | `requireAdmin` :6 | 同上 :8-13；**不读 `month`**（store 支持 `creditsStore.ts:1879,1884`，handler 没传 :15-19） | `{ month, totalUsed, totalQuota, users[{userId,email,name,role,status,quota,used,month}], pagination }` :21-32 | 只读 | page/limit |
| `GET /api/admin/credits/pricing`（`pricing.get.ts`） | `requireAdmin` :6 | 无 | `{ unit:'credits', rules: CreditPricingRule[] }` :8-10；字段见 `server/utils/creditPricingStore.ts:36-62`（含内部字段 `reserveMultiplier`、`upstreamCostUsdPerUnit`、`active`、`updatedAt`） | **GET 会写库**：补种缺失能力行、把未改过的旧种子行重置为新默认值（`creditPricingStore.ts:355-396`） | 全量，按 capability 排序 |
| `PATCH /api/admin/credits/pricing`（`pricing.patch.ts`） | `requireAdmin` :11 | body：`capability`（必填）、`creditsPerUnit`（0 < x ≤ 1e6）、`minCredits`（0~1e6 整数）、`reserveMultiplier`（1~100）、`upstreamCostUsdPerUnit`（≥0 或 null）、`active`（boolean）:13-68；不能改 `unit`、第二计价单位，也不能新建能力 | `{ rule }` :87 | 改 `credit_pricing`（`creditPricingStore.ts:556-615`）；审计 `credits.pricing.update`，元数据只有新值，**无旧值、无 `upstreamCostUsdPerUnit`** :74-85 | 400（7 种文案）/ 404 `Capability has no price.` :71-72 |
| `GET /api/admin/users/:id/credits`（`server/api/admin/users/[id]/credits.get.ts`） | `requireAdmin` :7 | `page`、`limit`（默认 10，上限 100）:17-19 | `{ user{id,email,name,status}, summary, ledger{entries,pagination} }` :26-43 | **GET 可能写库**：`getCreditSummary` 发现额度低于套餐基线时会 `ensureBalance` 插入或抬高余额（`creditsStore.ts:768-786,693-716`） | 404 用户不存在 |
| `PATCH /api/admin/users/:id/credits`（`credits.patch.ts`） | `requireAdmin` :10 | `amount`（取整取绝对值，0 < x ≤ 1e9）、`direction` add/subtract、`reason`（≤120 字，默认 `admin-credit`/`admin-debit`）:24-38；已合并 400、待删除 409 :19-22 | `{ adjustment, summary, ledger }` :70-82 | 改当月 `credit_balances.quota` 并写一条 `scope='user'` 流水（`creditsStore.ts:1033-1089`）；审计 `user.credits.adjust` :52-63 | 400（store 抛出的「不能为负 / 不能小于已用」）|

调用方：前四个在 `app/`、`apps/core-app`、`packages`、`plugins`、`.github`、`scripts` 中均 0 次（只有 `docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md:33` 的文字提及）；对照组：同样的搜索能找到 `admin/store/reviews`（`app/components/admin/PluginReviewsPanel.vue:71`）。`users/:id/credits` 由 `app/pages/admin/users.vue:424`（GET）、`:448`（PATCH）调用。

### 2.2 全局控制台与用户抽屉的口径差异

- **流水行范围不同**。全局 `listCreditLedgerAdmin` 只查 `l.scope = 'team'`（`creditsStore.ts:1958`），即调用扣费与释放（写入点 `:1180-1182`、`:1401-1403`）。管理员调额（`:1071-1072`）、验证加赠（`:869-875`，`verification-boost`）、每日签到（`:988-994`，`daily-checkin`）都是 `scope='user'`，**全局流水里看不到**；只有用户抽屉的 `listCreditLedgerByUsers` 带这些行（`:1613`）。
- **身份解析不同**。全局流水按团队 owner 关联用户（`:1972-1973`、`:1992-1993`），但 `userId` 优先取 `metadata.userId`（`:2001`）。组织团队的消耗行可能出现 `userId` 是成员、`userEmail` 却是 owner 的情况。用户抽屉按 `COALESCE(metadata.userId, …)` 关联，两者一致（`:1632`、`:1652`）。
- **用量只看当月个人余额**：`cb.scope='user' AND cb.month=?`（`:1890`），按 `used` 降序（`:1922`）。余额行是懒创建的，本月没触发过 summary 或扣费的用户不会出现。
- **写操作对象不同**：抽屉改单个用户当月额度；全局页改所有人的单价。`active=false` 会让 `resolveSellableCreditPricingRule` 对该能力返回 503 `CAPABILITY_DISABLED`（`creditPricingStore.ts:464-478`），面向用户的价目表也会隐藏它（`server/api/credits/pricing.get.ts:18-28`）。
- 推断（读代码，未运行）：对处于套餐基线的用户做 subtract，`credits.patch.ts:65-66` 紧接着调用 `getCreditSummary`，发现 quota 低于基线（`:768`）会被 `ensureBalance` 抬回（`:711-715`）。结果是流水和审计都记了扣减，余额却不变。现有测试全部 mock 了 store（`test/api/admin/users-credits.api.test.ts:16-17,38`），没覆盖这条路径。
- 导航：`AdminNav.vue:240-241` 把 `/admin/credits` 高亮为 `users`，routing 测试 `:204` 钉死了这一点；在 `accounts` 组加条目要同时改这两处和 `:162-165`。

## 3. B 插件审核

### 3.1 端点契约

| 端点 | 鉴权 | 输入 / 校验 | 返回 | 副作用 · 审计 | 分页 · 错误 · 调用方 |
|---|---|---|---|---|---|
| `GET /api/admin/plugins/pending`（`server/api/admin/plugins/pending.get.ts`） | `requireAdmin` :5 | 无 | `{ pendingPlugins: DashboardPlugin[], pluginsWithPendingVersions: (DashboardPlugin & 只含 pending 的 versions)[] }` :25-31；类型 `server/utils/pluginsStore.ts:202-279` | 只读；整表 `listPlugins` 调两次 :7-17，`listPlugins` 无 limit（`pluginsStore.ts:1342`） | 无分页；调用方 0 |
| `PATCH /api/dashboard/plugins/:id/status`（`server/api/dashboard/plugins/[id]/status.patch.ts`） | `requireAuthOrApiKey(['plugin:publish'])` :9；会话不看 scope；管理员可设任意状态，owner 只能 draft/pending :27-36 | `status ∈ draft/pending/approved/rejected` :6,19-20；`reason` 只在 rejected 时保存、可空 :41 | `{ plugin }` :44-46 | `setPluginStatus`：改插件状态、重算各版本资格、写时间线 `plugin.status.changed`（`pluginsStore.ts:1932-2042`，状态相同直接返回 :1945）；**无 `logAdminAudit`、无通知** | 400/403/404；调用方 `app/pages/dashboard/assets.vue:861`、`apps/core-app/src/renderer/src/composables/store/useUserPlugins.ts:280`（owner 提交 / 撤回） |
| `PATCH /api/dashboard/plugins/:id/versions/:versionId`（`[versionId].patch.ts`） | `requireAuthOrApiKey(['plugin:moderate'])` :11（管理员专用 scope，`server/utils/apiKeyScopes.ts:21`）+ 必须 role=admin :30-34 | `status ∈ pending/approved/rejected` :8,22-23；`reason` 同上 :39 | `{ version }` :74-76 | `setPluginVersionStatus`（`pluginsStore.ts:2044-2215`）：批准前检查产物、策略、签名、扫描结论，不满足返回 409 `PLUGIN_ADMISSION_PREREQUISITES_MISSING`（:2075-2089），满足则签发 Nexus attestation（:2097）；写时间线 `version.status.changed`（:2201）、治理事件 `plugin.version.*` :42-56、通知 :58-72；**无 `logAdminAudit`** | 400/403/404/409；调用方 `assets.vue:903` |
| `GET /api/admin/plugin-scan-waivers`（`server/api/admin/plugin-scan-waivers.get.ts`） | `requireAdmin` :6 | 可选 `artifactSha256`（非 64 位 hex 返回 400）:8-11 | `{ waivers: PluginSecurityScanWaiverRecord[] }`（id、artifactSha256、ruleId、owner、reason、createdAt、expiresAt、ticket?、revokedAt）`server/utils/pluginSecurityScanWaiverStore.ts:34-36,112-124` | 只读；不带过滤时 `LIMIT 500`（:203-207） | 无分页；调用方 0 |
| `POST /api/admin/plugin-scan-waivers`（`.post.ts`） | `requireAdmin` :16 | `artifactSha256`、`ruleId`（只能是 5 条可豁免规则之一，见 store :14-20）、`reason`（1-500）、`expiresAt`（必须在未来）、`ticket?`（1-120）（store :86-110） | `{ waiver }` :39 | 写 `plugin_security_scan_waivers` 和治理事件 `waiver.created`（store :150-178）；审计 `plugin_scan_waiver.create` :22-37 | 400 |
| `DELETE /api/admin/plugin-scan-waivers/:id`（`[id].delete.ts`） | `requireAdmin` :7 | 路由参数 `id` | `{ waiver }` :27 | 置 `revoked_at`；对已撤销的豁免重复调用仍返回 200，并**再次**写审计和治理事件（store :242-265）；审计 `plugin_scan_waiver.revoke` :12-25 | 400/404 |

豁免什么时候生效：只在上传版本（`pluginsStore.ts:2546`）、重传（`:2949`）和包预览（`server/api/dashboard/plugins/package/preview.post.ts:21`）时按 artifact sha 查一次。版本行只保存当时的扫描结论（spec `.trellis/spec/frontend/plugin-runtime-security.md:2485-2487`）。因此给已上传版本补豁免不会改变它的结论，需要开发者重传同一 sha 的包；而 `.tpex` 每次构建 hash 都不同，必须是同一份文件。

### 3.2 已有 UI：会不会重复

- **`/admin/reviews?tab=plugins` 管的是商店评价，不是插件提交。** `PluginReviewsPanel.vue` 的数据形状是 rating / title / content / author（:22-36），调用 `/api/admin/store/reviews/pending`（:71）和 `…/:id/status`（:123）；`reviews.vue:60-71` 把它和文档评论放在同一页的两个 tab。
- **管理员审核 UI 已经存在于会员侧 `/dashboard/assets`（「发布物」，`app/components/dashboard/DashboardNav.vue:110-137`）。** 管理员会多出 `pending`、`all` 两个本地视图（`assets.vue:400-423`，只是 `ref`，不进 URL，无法深链）。待审列表在前端从 `/api/dashboard/plugins` 的全量结果里算出（`assets.vue:355-372`；管理员拿到全部插件，`server/api/dashboard/plugins.get.ts:25-33`）。审核弹窗 `ReviewModalOverlay.vue` 发出 approve / reject 事件（:27-31），由 `assets.vue:545-589` 调上面两个 PATCH；驳回理由可空（:87-90）。2026-09-09（`f79a2eb77`）起就是独立视图。
- 现有审核 UI **不展示**扫描结论、准入状态和资格原因：`assets.vue`、`ReviewModalOverlay.vue`、`PluginDetailDrawer.vue`、`PluginListItem.vue` 中对 `eligib|securityScan|admissionStatus` 的计数都是 0（对照：`rejectReason` 在 `ReviewModalOverlay.vue` 计数为 6）。前端类型 `app/types/dashboard-plugin.ts` 也没有这些字段（只有 `rejectReason`，:28）。
- `PluginDetailDrawer.vue` 不提供审核动作（emits 只有 edit、delete、publishVersion、submitReview、withdrawReview、deleteVersion、reeditVersion 等，:46-56），只展示审核分析和时间线。
- `app/components/dashboard/PendingReviewSection.vue` **没有任何引用**（apps/nexus 内搜 `PendingReviewSection|pending-review-section`，排除自身后 0；同样方法能搜到 `ReviewModalOverlay` 的两处 import 作为对照）。

## 4. C 发布证据

### 4.1 端点契约（统一 `requireAdminOrApiKey(event, ['release:evidence'])`；`release:` 是管理员专用 scope，`server/utils/auth.ts:195-198`；无限流）

| 端点 | 输入 / 校验 | 返回 | 副作用 · 审计 |
|---|---|---|---|
| `GET …/release-evidence/matrix`（`matrix.get.ts:6-10`） | `version` **必填**，缺失返回 400 `version is required.`（`server/utils/releaseEvidenceStore.ts:590`） | `ReleaseEvidenceMatrix{version, generatedAt, summary{total,required,passed,failed,blocked,pending,bestEffort,skipped,blocking}, platforms{windows,macos,linux,all → status,计数,blockingItems}, blockers[], docsGuard}`（store :122-165） | 只读 |
| `GET …/release-evidence/runs`（`runs.get.ts:7-17`） | `version`、`platform`、`scope`、`status`（枚举不合法返回 400 `${field} is invalid.`）、`page`、`limit`（默认 50，上限 100，store :353-357） | `{ runs: ReleaseEvidenceRun[], page, limit, total }`（无 totalPages）（store :115-120） | 只读 |
| `GET …/release-evidence/runs/:runId`（`[runId].get.ts:6-16`） | — | `{ run, items }`（items 按 updated_at 降序，不分页）（store :438-466） | 404 |
| `POST …/release-evidence/runs`（`runs.post.ts:7-36`） | `version`、`platform ∈ windows/macos/linux/all`、`scope ∈ core-app/nexus/docs/release`、`status ∈ running/passed/failed/partial`（默认 running）、`notes`（store :13-16,359-395） | `{ run }` | 写 `release_evidence_runs`；审计 `release.evidence.run.create`，metadata 含 `authType` |
| `POST …/runs/:runId/items`（`items.post.ts:7-41`） | `category`、`caseId`、`status ∈ pending/passed/failed/blocked/best_effort/skipped`、`requiredForRelease`（默认 true）、`evidence`（JSON 对象，≤128 KB）、`notes`（store :9,16,269-291） | `{ item }` | 按 `(run_id, case_id)` upsert（store :491）；审计 `release.evidence.item.upsert` |
| `POST …/release-evidence/doc-guard`（`doc-guard.post.ts:15-60`） | `status`（默认 passed）、`evidence`（默认「manual documentation review」）、`version`（默认硬编码 `'2.5.0'`，:34）、`notes` | `{ run, item }` | 新建 run（platform=all、scope=docs）+ `docs-guard` 条目；审计 `release.evidence.doc-guard.record` |

### 4.2 数据语义

矩阵按 `platform:scope:caseId` 只取该版本下最新的一条（store :647）。「required 且状态为 failed / blocked / pending / skipped」算阻塞（:564-566），平台状态在 :568-584 判定。run 的 `status` 创建后**没有任何更新路径**：store 里没有 `UPDATE release_evidence_runs`（rg 0 次），也没有删除接口。

### 4.3 写入方

repo 内没有。`.github/workflows/build-and-release.yml:181` 的 `windows-everything-release-evidence` 只是 GitHub artifact 名；`scripts/plugin-release-evidence.mjs` 是插件发布证据的本地 manifest，与这组 Nexus 接口无关。i18n 里的 API key scope 文案写着「记录 2.5.0 回归、文档门禁与平台阻塞矩阵证据」（`i18n/locales/route/zh/dashboard.ts:949-951`），说明这是设计意图，但没有落地的调用方。

## 5. D 风控 / 维护 / 应急

### 5.1 鉴权机制（四个 D 类端点共用）

- **服务端风控开关**：`server/middleware/feature-gates.ts:4-10` 把 `/api/admin/{emergency,risk,oob/risk,telemetry/ip-blocks}` 和 `/api/dashboard/intelligence/ip-bans` 归为风控路径，开关关闭时返回 404 + `data.code = NEXUS_FEATURE_DISABLED`（:52-67、:74-75）。开关值来自 `NUXT_PUBLIC_RISK_CONTROL_ENABLED || NEXUS_EXPERIMENTAL_RISK_ENABLED`（`nuxt.config.ts:188-190`，写入 `:319-321`、`:382-384`）；根目录 `wrangler.toml` 没有设置它。**`maintenance/retention` 不受这个开关控制。**
- **控制面守卫** `requireAdminControlPlaneAuth`（`server/utils/adminControlPlaneGuard.ts:298-335`）有三条通道：
  - A：管理员会话，默认还要一次性 passkey step-up（`X-Login-Token`，:248-296）；
  - B：break-glass JWT（Bearer + `X-Device-Fingerprint`，JTI 一次性，:122-213）；
  - C：OOB（`/api/admin/oob/risk/*` 固定走 C，:304；校验 `cf-access-client-id/secret`，`mtlsEnabled` 时还校验证书指纹，`server/utils/adminOobGuard.ts:89-133`）。
  - 写操作限流：每管理员 20/分钟、每 IP 60/分钟、每 actor 40/分钟（:93-114）。EXTREME 模式下非保留路径返回 503（:306-313）。
  - `controlPlaneProtectedEnabled` 为 false 时：会话通道不要 step-up、不限流（:315-324）。
- **双人复核**（`dualControlEnabled`，默认开）：模式切到 NORMAL、一次解封超过 50 个 actor、永久封禁时，返回 202 并生成待确认操作，有效期 15 分钟（`server/utils/adminRiskActions.ts:67-86`）。确认必须由另一位管理员通过 `risk/dual-control/confirm` 完成（`confirm.post.ts:50-61`）。**没有列出待确认操作的接口**（store 只有 create / get / confirm / reject，`adminDualControlStore.ts:126,179,192,222`），操作 id 只能手工粘贴。
- **审计去向**：这些端点写的是 `admin_breakglass_audit`（哈希链，`server/utils/adminBreakglassAuditStore.ts:8,34-49,118-175`），**不是** `admin_audits`。前者没有任何读取接口（rg 表名，排除定义文件后 0），所以 `/admin/audits` 看不到风控和应急动作。
- **生产配置**：`wrangler.toml:28-31`（preview `:56-59`）写的是 `ADMIN_BREAKGLASS_ENABLED / ADMIN_CONTROL_PLANE_PROTECTED_ENABLED / ADMIN_DUAL_CONTROL_ENABLED / ADMIN_PRESERVE_IN_EXTREME_ENABLED = "false"`。但 `nuxt.config.ts:360-364` 在**构建时**读 `process.env`，这些变量名又不带 `NUXT_` 前缀，运行时无法覆盖。线上实际生效的值取决于 Pages 构建环境，仓库里无法确认（见 §8）。

### 5.2 端点契约

| 端点 | 鉴权 / 开关 | 输入 | 返回 | 副作用 · 审计 | 破坏性 · 调用方 |
|---|---|---|---|---|---|
| `GET /api/admin/telemetry/ip-blocks`（`server/api/admin/telemetry/ip-blocks.get.ts`） | 风控开关 + `requireAdmin` :5 | `limit`（1~200，默认 50；非数字会得到 NaN，D1 报错被吞掉，返回空数组，`server/utils/ipSecurityStore.ts:239,263-266`） | `{ items[{ ip, blockedUntil(ms), blockReason?, violationCount, updatedAt(ms) }] }`；只含当前仍在封禁期内的，按 blockedUntil 降序（:244-245） | 只读 | 无分页、无搜索、无历史；调用方 0 |
| `POST /api/admin/telemetry/ip-blocks/unblock`（`unblock.post.ts`） | 风控开关 + 控制面（scope `risk.actor.unblock`）:7-9 | `ip`（必填）:11-18 | `{ success }` :35（只要有一个成功就是 true） | 调 `executeRiskActorUnblock`，原因固定为 `compat:admin-telemetry-unblock` :20-23：清 `telemetry_ip_security.blocked_until`，但**不清 `violation_count`**，下次封禁仍按次数指数加长（`ipSecurityStore.ts:285-288`，阈值 :9-12）；同时在 `intelligence_ip_bans` 写入或更新一条 `enabled=0` 的记录（`adminRiskActions.ts:109-114`；`intelligenceStore.ts:516-586`）。不走双人复核。审计 `risk.actor.unblock.compat.auth` + `risk.actor.unblock.compat`（breakglass） | 可逆；调用方 0 |
| `POST /api/admin/maintenance/retention`（`retention.post.ts`） | `requireAdminOrApiKey(['maintenance:write'])` :27；无风控开关、无限流 | body 或 query：`telemetryRetentionDays`（默认 7）、`governanceRetentionDays`（默认 14，均 ≤366）、`batchLimit`（默认 1 万，≤5 万）、`dryRun`（**默认 true**）:29-38；`server/utils/telemetryRetentionCore.ts:6-10,184` | `{ result{ dryRun, generatedAt, telemetryRetentionDays, governanceRetentionDays, batchLimit, tables[{table,cutoff,matched,deleted,remainingAfterBatch}] } }` | 非 dry-run 时先把聚合写入 `daily_stats`，再按批删除 `telemetry_events` 和 `platform_governance_events`（core :188-196）；审计 `maintenance.telemetry_retention.run`，含删除行数 :43-64 | **不可逆**；调用方 0。已有自动任务按同样参数每 6 小时跑一次（`server/utils/telemetryRetentionMaintenance.ts:7,151-157`，由遥测上报和治理事件触发 `telemetryStore.ts:771`、`platformGovernanceStore.ts:7689`），状态存在 `nexus_maintenance_state`，**没有读取接口** |
| `POST /api/admin/emergency/revoke`（`server/api/admin/emergency/revoke.post.ts`） | 风控开关 + 控制面，只允许 A 通道、要求 step-up :7-11 | `session_id` 必填 :13-20 | `{ success:true }`；会话不存在也返回 success（`UPDATE … WHERE status IN ('init','verified')`，`adminEmergencyStore.ts:431-446`） | 把会话置为 revoked，之后 `issue` 会失败（`issue.post.ts:66-72`）。**已签发的 token 不失效**：`consumeEmergencyJti` 和 JWT 校验都不看会话状态（`adminEmergencyStore.ts:466-484`；`adminEmergencyToken.ts:92-121`），有效期 10 分钟（`issue.post.ts:15`）。审计 `admin.emergency.revoke.auth` + `admin.emergency.revoke` | 不可撤销；调用方 0 |
| `POST /api/admin/oob/risk/{actor.unblock,case.review,mode.override}` | 风控开关 + 通道 C，不要 step-up（例如 `actor.unblock.post.ts:20-24`） | 与对应的 `risk/*` 完全相同 | 同 `risk/*`，可能 202 待确认 | 审计动作带 `.oob.auth` 后缀 | 调用方 0（CI 的 CF Access 凭据只用于版本同步，`build-and-release.yml:1512-1513`） |

### 5.3 现有页面已经覆盖的部分

- `/admin/risk`（`app/pages/admin/risk.vue`）调用 `risk/mode.override`、`actor.unblock`、`case.review`（固定为永久封禁）、`dual-control/confirm`（:304、:310、:323、:335），step-up token 靠手工粘贴（:181-187、:375-384）。它**只写不读**：不列出封禁 IP、不显示当前防御模式（`getCurrentDefenseMode` 在 `defenseModeController.ts:75`，没有 API 暴露）、不列出待确认操作。导航里仅在风控开关打开时出现（`AdminNav.vue:175-185`）。
- `/admin/emergency`（`emergency.vue`，`layout:false` :7-9，不在 rail 里）走 init → verify → issue（:256、:314、:347），然后用 Bearer 调 `risk/actor.unblock`（:389-393），没有吊销按钮。另外：`verify` 必须提供恢复码（`verify.post.ts:151-156`），但 `createAdminRecoveryCode`（`adminEmergencyStore.ts:523`）全仓库没有调用方，**恢复码无法通过接口发放**。
- **手动 IP 封禁**（`intelligence_ip_bans`，目前只在文档助手 `server/api/docs/assistant.post.ts:80` 生效）已经在 `/admin/intelligence-overview` → `IntelligenceOverviewPanel.vue` 中可增、删、启停（:145、:171、:203、:230，step-up 输入在 :84-92）。**自动封禁**（`telemetry_ip_security`，作用于 `/api/telemetry/{messages,batch,record}`，例如 `server/api/telemetry/record.post.ts:6`）目前没有任何列表 UI。
- 现成的浏览器内 passkey step-up 流程可以复用：`app/pages/team/join.vue:125-157`（`/api/passkeys/options` → `navigator.credentials.get` → `/api/passkeys/verify`，返回 10 分钟 token，只有 UV 验证通过才算 step-up，`server/api/passkeys/verify.post.ts:77-96`）。

### 5.4 09-23 为什么写「需单独决策」，现在到底要决定什么

09-23 的理由是这三项分属三个权限域：风控开关、维护 API key、控制面应急（`.trellis/tasks/09-23-nexus-admin-console-gaps/prd.md:65`）。D2 已经决定要做，剩下的是下面这些具体问题：

1. **IP 封禁列表与解封**
   - 生产是否打开 `riskControl`。不打开的话，接口一律 404，页面只能显示「功能未开启」；而自动封禁照常发生（`guardTelemetryIp` 本身不受开关控制）。
   - 放在哪里：并入 `/admin/risk` 作为列表，还是放在 intelligence-overview 的手动封禁旁边。
   - 解封走哪个接口：兼容路由（单个 IP、原因固定、只返回 `success`），还是 `risk/actor.unblock`（可多个、可填原因、逐个返回结果、支持双人复核）。
   - step-up 方式：手工粘贴，还是复用 `team/join.vue` 的流程。
   - 风控审计要不要在 `/admin/audits` 可见（需要新增 breakglass 审计的读接口）。
2. **保留清理**
   - 已有每 6 小时的自动清理，参数相同，手动入口只在三种情况下有意义：dry-run 预览、积压追赶（`remainingAfterBatch > 0`）、比 7/14 天更激进的保留期。
   - 是否只开放 dry-run；如果开放真删除，确认流程怎么设计。
   - 是否新增接口读取 `nexus_maintenance_state`，用来显示上次自动运行时间。
3. **应急吊销**
   - 现状：没有会话列表接口（session_id 只有发起端知道）；吊销不影响已签发的 token；生产 `wrangler.toml` 关闭了 break-glass；恢复码没有发放路径。
   - 要决定：补「会话列表 + 吊销」接口，还是只做「粘贴 session_id」的最小入口，或者确认不做。
4. **OOB**：机器通道，不需要决策，不做 UI。

## 6. i18n 现状

- **审计动作标签**（`app/pages/admin/audits.vue:76-103`；zh `i18n/locales/route/zh/dashboard.ts:2127-2161`，en `…/en/dashboard.ts:2131-2165`）：已有 `credits.pricing.update`、`user.credits.adjust`、`plugin_scan_waiver.create/revoke`、`release.evidence.{run.create,item.upsert,doc-guard.record}`、`maintenance.telemetry_retention.run`。
  - 插件 / 版本审核没有对应的审计动作。
  - breakglass 动作不进 `admin_audits`。
  - 另外发现：`intelligence.tool.approve/reject`（`server/api/admin/intelligence-agent/tool/approve.post.ts:35`）有写入但没有标签。
- **可复用的界面文案**：
  - 用户积分 `dashboard.sections.users.credits.*`（zh :2022-2042，en :2026-2046）；
  - 插件审核 `dashboard.sections.plugins.{pendingReviews,reviewPlugin,reviewVersion,rejectReason*}`（zh :1451-1458，en :1455-1462）；
  - API key scope `releaseEvidence`、`maintenanceWrite`（zh :949-956）；
  - 手动封禁 `dashboard.sections.intelligence.overview.ipBans`（zh :2277）。
- **缺的文案**：
  - 菜单 `dashboard.sections.menu.*` 没有 credits、releaseEvidence、插件审核、维护相关的键（zh :805-848；`menu.plugins` 已被会员侧的「发布物」占用）。
  - 风控、应急、双人复核没有任何 i18n 键（zh/en 计数均为 0），`risk.vue` 和 `emergency.vue` 的文案全是硬编码英文。
  - 菜单里还残留 `intelligenceLab`、`intelligenceChat`。

## 7. 会阻塞 UI 的后端缺口

1. 积分：用量没有月份参数（handler 不透传）；全局流水缺 `scope='user'` 行，组织团队行的 email 与 userId 可能不一致；流水不能按原因、时间、用户 id 过滤；改价审计没有旧值。
2. 插件审核：`pending.get` 不分页，且每次全量读两遍；插件和版本状态变更不写 `admin_audits`；列表不带扫描发现明细（只有结论、数量、摘要，`pluginsStore.ts:231-236`），前端类型也缺这些字段；豁免列表最多 500 条，不能按规则或状态过滤。
3. 发布证据：没有写入方；没有版本列表接口（矩阵必须传 version）；run 的状态不能更新；`runs.get` 不返回 totalPages。
4. IP 封禁：只能看到仍在封禁期的条目，不分页、不能搜索；没有读取当前防御模式的接口；没有列出待确认双人复核操作的接口；breakglass 审计没有读接口。
5. 保留清理：没有读取自动任务状态的接口。
6. 应急：没有会话列表；恢复码无法发放；吊销不影响已签发 token。
7. `audits.vue` 不读 URL query（没有 `useRoute`），其他页面无法深链到按动作过滤的审计视图。

## 8. Caveats / 未验证

- 生产的 `riskControl` 和四个控制面开关的实际值无法从仓库确认：开关来自构建环境，wrangler 变量名不带 `NUXT_` 前缀，无法在运行时覆盖。按规则也没有请求生产去验证。
- §2.2 的「subtract 被抬回」是读代码得出的推断，没有运行验证。
- 不在本文范围：`intelligence-agent` ×17、`intelligence-lab` ×10、`intelligence/chat`（属于 10-01 退役代码的调研）。
