# Research: current state of the AI services admin pages

- **Query**: survey AI 概览 / 服务渠道 / AI 调用审计 so `design.md` / `implement.md` can be written for `10-02-nexus-admin-migrate-ai-services`
- **Scope**: internal
- **Date**: 2026-10-03
- **Source**: `origin/stage` = **`0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e`** (2026-10-03 03:10 -0700). Every anchor is valid at this SHA (`git show origin/stage:<path>`). Paths are relative to `apps/nexus/app/`; `server/…` = `apps/nexus/server/…`.

Kit status at this SHA:

- Merged (kit PR #2040, `ee35ab869`, is an ancestor of the SHA): `components/admin/Admin{PageShell,Section,StatGrid,FilterBar,FilterField,Table,ConfirmDialog,Identity,GateSkeleton}.vue`, `composables/useAdmin{Gate,List,QueryState,Format,RouteSkeleton}.ts`, `utils/admin-{kit,request-error,audits}.ts`, the gate in `layouts/admin.vue`, and the pilot `pages/admin/audits.vue`.
- **Not at this SHA**:
  - `useAdminList` `queryKeyPrefix` and `useAdminFormat.tableDate` / `{ timeZone: 'UTC' }` exist only on `origin/task/feat/nexus-admin-migrate-content` (`eec931ad6`, unmerged).
  - `AdminFormField` and `useAdminFieldControl` exist only as uncommitted files in the worktree `~/Workspace/Worktrees/talex-touch-migrate-accounts`.
  - Their APIs are taken from kit design §8.
- No page at this SHA uses `#nav` or `useAdminQueryState`. The only precedent is on the unmerged content branch: `pages/admin/reviews.vue` puts a `TxFlatRadio` in `#nav`, binds it to `useAdminQueryState('tab', …)`, and calls the child panel's exposed `refresh()` from `#actions`.

---

## 1. PRD anchors at this SHA

| PRD claim | At SHA | Holds? |
|---|---|---|
| R1 page `intelligence-overview.vue` is 39 lines | 41 lines; the single-root comment block `:15-20` was added by `630b0d6ae` | ✗ minor |
| R1 panel is 553 lines | 553 | ✓ |
| R1 h2「智能概览」+ subtitle at `IntelligenceOverviewPanel.vue:274-279` | h2 `:274-276`, `<p>` `:277-279` | ✓ |
| R1 violates `component-guidelines.md:72` | `:72` is the AdminPageShell single-heading rule | ✓ |
| R1 metrics interpolated raw at `:302,318` | `:302` totalRequests, `:318` totalTokens; also `:310` `{{ }}%` and `:326` `{{ }}ms` | ✓ (plus two sites) |
| R1 "四个独立请求各自加载、各自失败、各自重试" | Outside the IP-ban block there are only **two** requests: GET overview, which feeds all four metrics, the three Top lists and the sample hint; and an on-demand GET usage. The other four `rawFetch` calls belong to the IP-ban block (`:145,171,203,230`). | **✗** |
| R1 ClientOnly fallback at page `:25-37` | `<ClientOnly>` `:27-39`, `#fallback` `:29-38` (pulse blocks `:30-37`) | ~ shifted |
| R1 current page title is「概览」 | `t('dashboard.sections.intelligence.tabs.overview')` at `:26` = 概览 / Overview; rail `menu.intelligenceOverview` = AI 概览 / AI Overview | ✓ |
| R2 page 32 / panel 2207 / composable 1186 lines | 32 / 2207 / 1186 | ✓ |
| R2 `mx-auto max-w-6xl` at `:506` | `:506` | ✓ |
| R2 four tabs 服务渠道 / 能力路由 / 用量 / 健康 | `TxTabItem name=providers / routes / usage / health` at `:615,832,1030,1143` | ✓ |
| R2 `min-w-[1470px]` at `:691`, plus `:904,1099,1212` | 1470 `:691`, 1040 `:904`, 940 `:1099`, 920 `:1212` | ✓ but not exhaustive: also `min-w-[760px]` `:999` (capability index) and the drawer tables `[620px]` `:1398`, `[920px]` `:1612`, `[520px]` `:2126` |
| R2 `toLocaleString()` at `utils/provider-registry-admin.ts:1223-1226` | `formatDate` `:1223-1226` | ✓ |
| R2 watch at `useProviderRegistryAdmin.ts:98-104` | `:98` `useAccountRole()`, watch `:100-104`; `:93` `useAuthUser()` exists only to feed this watch | ✓ |
| R2 test lines `useProviderRegistryAdmin.test.ts:169-170` | inside the test `:162-172`; `:171` also asserts that no request was sent | ✓ |
| R2 page title (no change listed) | `providerRegistry.title` already equals the rail `menu.providerRegistry` (服务渠道 / Provider Registry) | needs no change |
| R3 page is 34 lines | 36 lines | ✗ minor |
| R3 panel is 221 lines | 221 | ✓ |
| R3 "与 `/admin/audits` 同为「审计日志」" | The kit pilot renamed `/admin/audits` to `menu.adminAudits` 管理操作审计 (`audits.vue:108`). `/admin/intelligence-audits` still uses `intelligence.tabs.audits` 审计日志 / Audits (`intelligence-audits.vue:26`). The duplicate name is gone; the mismatch with the rail remains. | **✗ outdated** |
| R3 the API filters on `page/limit/userId` | `server/api/dashboard/intelligence/audits.get.ts:7-22` also accepts `providerId` | ~ |
| R3 `toLocaleString()` at `:69-78` | `formatAuditTime` `:69-78` | ✓ |
| R4 `provider-registry-admin.test.ts:269-320,390-444` pin style classes | These ranges hold five source-literal tests (`:269-282`, `:286-301`, `:305-321`, `:390-402`, `:435-445`) and one pure-function test (`:404-433`). Style-class literals appear only at `:316` and `:318-320`. | ~ |
| R4 `docs-page-performance.test.ts:263-265` | `:263-265`; the file is read at `:35` | ✓ |
| Sibling `10-02-nexus-admin-risk-console` anchors into this panel | ip-ban calls `:145,171,203,230` ✓; its "step-up `:84-92`" is `ipBanAuthHeaders` `:85-92`; the step-up `<TuffInput>` itself is `:477-483` | ✓ |
| Baseline: Nuxt single-root warning on both intelligence pages | Fixed by `630b0d6ae`; guarded by `test/guards/page-single-root.test.ts` | resolved |

---

## 2. AI 概览 `/admin/intelligence-overview`

The page (`pages/admin/intelligence-overview.vue`) nests AdminPageShell → ClientOnly → `LazyDashboardIntelligenceOverviewPanel`. The panel template runs `:270-552` under a root `div.space-y-6`:

| Block | Lines | Heading and actions |
|---|---|---|
| Overview card | `:271-334` | h2 智能概览 `:274-276`, `<p>` subtitle `:277-279`, 「刷新」 `:281-283` |
| Top lists (three cards) | `:336-381` | h3 模型分布 / IP 热点 / 国家/地区 at `:338-340,353-355,368-370` |
| User usage | `:383-454` | h3 用户消耗查询 `:386-388`, `<p>` `:389-391` |
| IP ban (frozen) | `:456-551` | see §2.5 |

### 2.1 Requests

| # | Trigger | Endpoint / params | Response fields used | Loading | Error | Retry |
|---|---|---|---|---|---|---|
| O1 | `onMounted` `:262-263`; 「刷新」 `:281` | `GET /api/dashboard/intelligence/overview` with no params. The server samples the latest 200 rows by default, and `listAudits` caps any request at 200 (`server/utils/intelligenceStore.ts:249`). | `summary.{totalRequests, successRate, totalTokens, avgLatency, sampleSize}`, `models[]`, `ips[]`, `countries[]` (`label`, `count`). Returned but unused: `providers[]` (top 6) and every `tokens` field. | `overviewLoading` makes one spinner replace the four cards (`:290-292`), on refresh as well | Red box `:286-288` showing `e.data?.message ‖ t(overview.loadFailed)` (`:109`). `overviewData` is not cleared, so stale cards and the error can show together. On a first-load failure the Top lists print 暂无数据, the same as empty. | Header 「刷新」 only |
| O2 | 「查询」 `:393-395`, disabled while loading or when the input is blank | `GET /api/dashboard/intelligence/usage?userId=<trimmed>` | `{ok, result, error}`; `result.{totalRequests, totalTokens, successRate, lastSeenAt, models[]}`. Unused: `sampleSize`, `userId`. | Button reads 查询中… and is disabled; the old result stays | Red box `:406-408` showing `e.data?.message ‖ e.message ‖ t(usage.loadFailed)` (`:131`). `e.message` is ofetch's `[GET] "/api/…"` string. `ok:false` throws the server's English text (`'Missing userId'`, `usage.get.ts:10`). The old result is not cleared. | Click again; Enter does not submit |
| IP1–4 | frozen | `GET ip-bans?limit=100` `:145`, `POST` `:171`, `PATCH /:id` `:203`, `DELETE /:id` `:230` | — | — | — | — |

### 2.2 The four metrics

| Card | Source | Format now | Note |
|---|---|---|---|
| 请求总量 | `summary.totalRequests` = `audits.length` (`server/api/dashboard/intelligence/overview.get.ts:67`) | raw `:302` | Always equals `sampleSize` (`:71`), so it is ≤ 200 |
| 成功率 | `summary.successRate`, an integer 0–100 (`:68`) | `{{ }}%` `:310` | `useAdminFormat.percent` expects a fraction |
| Token 消耗 | `summary.totalTokens`, the sum of `metadata.tokens` (`:33-34`) | raw `:318` | |
| 平均延迟 | `summary.avgLatency` in ms; 0 when no row has a latency (`:69`) | `{{ }}ms` `:326` | `duration()` rounds anything ≥ 1 s to whole seconds (`composables/useAdminFormat.ts:171-173`) |
| Sample hint | `summary.sampleSize` | `t(overview.sampleHint, {count})` `:331-333`: 基于最近 {count} 条审计数据 | |

### 2.3 Top lists and the user-consumption query

- **Top lists.** Models, IPs and countries come from `models` / `ips` / `countries`, each the top 8 by count (`overview.get.ts:58-76`). A row is `label` (truncated) plus a raw `count` (`:341-346,356-361,371-376`); an empty list shows 暂无数据. The lists have no loading or error state of their own.
- **Input.** The user query is a `TuffInput` with a placeholder and no label (`:399-403`).
- **Result.** Four cards (`:410-443`) and a model breakdown (`:445-453`). There is no "no data for this user" state.
  - 请求数 is the user's all-time count (`usage.get.ts:47`).
  - Tokens, success rate and the model breakdown come from that user's latest ≤ 200 rows.
  - 最近请求 is formatted by `formatAuditTime` (`:250-259`, `toLocaleString()`) at `:440`, and shows `-` when null.

### 2.4 Formatting sites

- Numbers and suffixes: `:302,310,318,326,332,344,359,374,416,424,432,451`.
- Date: `:440` via `formatAuditTime` (`:250-259`). It uses the browser's locale and prints "Invalid Date" for unparsable input.

### 2.5 Manual IP-ban block (must stay untouched)

| Part | Lines |
|---|---|
| `interface IpBan` | `:53-59` |
| State: `ipBansRequested`, `ipBans`, `ipBanLoading`, `ipBanError`, `ipBanFeatureAvailable` (seeded from `runtimeConfig.public.riskControl.enabled`), `ipBanStepUpToken`, `ipBanForm {ip, reason}` | `:71-83` |
| `ipBanAuthHeaders` (sends `X-Login-Token`) | `:85-92` |
| `isFeatureNotFoundError` | `:94-98` |
| `fetchIpBans` / `addIpBan` / `toggleIpBan` / `removeIpBan` | `:138-160` / `:162-195` / `:197-222` / `:224-248` |
| Mount call | `:264-265`, inside the shared `onMounted` at `:261-266` |
| Comment plus the section `v-if="ipBanFeatureAvailable"`: header and refresh, step-up input `:477-483` (hardcoded English placeholder `:480`), add form `:485-499`, error, spinner, list with enable / disable / remove `:509-540` (no confirmation), empty state | `:456-545` |
| 「当前环境未启用风险控制能力…」 notice, `v-if="!ipBanFeatureAvailable"` | `:547-551` |

What the block shares with the rest of the panel. The panel has no props, and the block shares no reactive state and no composable result. It shares only:

- the imports `TxButton :2`, `TuffInput :3`, `TxSpinner :4` and `rawFetch :5` (`isFeatureFlagEnabled :6` and `runtimeConfig :19` are used only by the block);
- `t` at `:18`;
- the root `<div class="space-y-6">` at `:270`;
- the `onMounted` body at `:261-266`, which holds one if-statement per half.

`formatAuditTime` (`:250-259`) is used only by the user query.

**Minimal seam: the component boundary.** Everything that moves to the kit is script `:21-51,61-69,100-136,250-259,262-263` and template `:271-454`. Removing it leaves the IP-ban lines byte-identical and still self-contained: own imports, own fetch on mount, own feature flag. The remainder can live in one of two places:

- **S1: stay in `IntelligenceOverviewPanel.vue`**, rendered under the new kit sections. The risk-console PRD names this file and will delete the block from it. Its line numbers shift, but the file reference stays valid.
- **S2: move verbatim to a new component.** The risk-console anchors (`IntelligenceOverviewPanel.vue:145,171,203,230`, `:84-92`) would then point at a deleted file.

The block's `apple-card-lg` sections already get the same 22 px radius and dark wash as `AdminSection` (`layouts/admin.vue:119-130`, `AdminSection.vue:50-66`). The page fallback at `:29-38` has no IP-ban placeholder.

---

## 3. 服务渠道 `/admin/provider-registry`

### 3.1 Frame

- **Page** `pages/admin/provider-registry.vue:18-32`: AdminPageShell with title `providerRegistry.title`, then ClientOnly, then `LazyDashboardProviderRegistryAdminPanel`; pulse fallback at `:22-29`.
- **Panel root** `div.mx-auto.max-w-6xl.space-y-6` at `:506`.
- **Refresh** `:507-512`: on its own row, `secondary`, spinner, disabled while loading; calls `fetchRegistry`.
- **Admin-only hint** `v-if="!isAdmin"` at `:514-516`. Under the layout gate it can never render.
- **Global error banner** `:518-520`: shows any load or mutation error, on every tab.
- **Stat cards.** Skeleton at `:527-539` (when `loading && !providers.length`); five `TxStatCard`s at `:540-611`, each with a `#label` slot holding a label and a hint line. Values come from `useProviderRegistryAdmin.ts:175-179`:
  - `providers.length`, plus `enabledProviders` in the hint;
  - `capabilityCount`;
  - `sceneCount`;
  - `usageCount`, out of a 25-row window;
  - `unhealthyCount`, the non-healthy checks among at most 25.
- `useProviderRegistryAdmin()` is called **inside the panel** (`:27-131`). `loading`, `error`, `fetchRegistry` and `activeTab` all live there.

### 3.2 Tabs

`TxTabs v-model="activeTab"` (`:614`) switches the tabs. `activeTab` is `ref('providers')` (`useProviderRegistryAdmin.ts:106`) and is not in the URL. `TxTabs` renders only the active item.

| Tab (`name`) | Lines | Renders | Requests on switch |
|---|---|---|---|
| 服务渠道 `providers` | `:615-830` | h2 + hint `:623-628`; search `:631-637`; status select `:638-645`; 创建服务渠道 `:646-648`; empty-state banner `:652-679`; table `:681-828` | none |
| 能力路由 `routes` | `:832-1028` | h2 + hint `:840-845`; filter chips `:848-860`; 创建路由 `:861-863`; banner `:867-894`; routes table `:896-980`; capability index h3 + hint `:984-989` and table `:991-1025` | none |
| 用量 `usage` | `:1030-1141` | h2 + hint `:1038-1043`; chips `:1046-1058`; banner `:1062-1089`; table `:1091-1139` | none |
| 健康 `health` | `:1143-1252` | h2 + hint `:1151-1156`; chips `:1159-1171`; banner `:1175-1202`; table `:1204-1250` | none |

All data comes from a single `fetchRegistry()` (`useProviderRegistryAdmin.ts:603-636`). It runs on mount (`:1069-1071`), on Refresh, and after most mutations, in three steps:

1. `POST /api/dashboard/provider-registry/seed`, awaited first.
2. In parallel: `GET …/providers` (yields `providers` and the `adapters` catalog), `GET …/capabilities`, `GET …/scenes` (with `readiness`), `GET …/usage?limit=25`, `GET …/health?limit=25`.
3. `GET …/providers/:id/quota`, once per provider.

There is one `loading` and one `error` for the whole load. If step 3 fails, the step-2 data stays assigned and the banner shows. The usage and health endpoints return `{entries, page, limit, total}` and accept `status`, `providerId`, `capability` and other filters plus `page` / `limit` (capped at 100). The UI reads only `entries` and filters on the client.

**Mutations that call `fetchRegistry` on success**:

| Action | Lines |
|---|---|
| Create provider (also writes the credential and the status PATCH) | `:638-715` |
| Update provider status | `:756-770` |
| Save provider edit (also creates, updates and deletes capabilities) | `:800-844` |
| Delete provider | `:892-906` |
| Create scene | `:908-946` |
| Update scene status | `:948-962` |
| Save scene edit | `:964-1010` |
| Run scene, when the request does not throw | `:1012-1051` |
| Delete scene | `:1053-1067` |

**Mutations that do not refresh**: check `:717-754` (the health table only updates on the next refresh), fetch models `:772-798`, and save quota `:846-890`, which patches local state.

### 3.3 Tables

Widths below are `TxDataTable` column props. Cells are 13 px text with 12 px of side padding (`packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue:682-689`).

**Providers** (`:682-827`): `table-layout="auto" bordered nowrap class="min-w-[1470px]"`, inside an `overflow-x-auto`. Columns are defined at `:239-247`.

| # | Key (title) | Width | Cell |
|---|---|---|---|
| 1 | provider (服务渠道) | 420, min 360, max 520, fixed left, sortable | displayName, truncated `:693-699` |
| 2 | status | 96 | `TxSwitch` that PATCHes the status with no confirmation `:700-709` |
| 3 | capabilities (能力) | auto, min 180 | up to 3 chips (`max-w-36`) with a tooltip showing the metering unit, then "+N" `:710-743` |
| 4 | health | 136 | badge; `{latencyMs ?? '-'}ms`; hint with `line-clamp-2` `:744-761` |
| 5 | quota | 170 | badge; `{maxRequests} requests · {count} channels` `:762-776` |
| 6 | updatedAt | 172 | `formatDate` `:777-779` |
| 7 | actions | 208, fixed right | 4 circular icon buttons: check, edit, quota, delete `:780-826` |

The table and every column are `nowrap`. The declared widths sum to about 1382 px plus borders.

**Routes** (`:897-979`): `bordered class="min-w-[1040px]"`, columns at `:270-277`.

| Key | Width | Cell |
|---|---|---|
| scene | 26%, sortable | name, then `id · owner` |
| status | 120 | readiness badge and amber 缺失能力 text with `line-clamp-2` (`:916-931`) |
| strategy | 150 | `mode · 降级 fallback` |
| requiredCapabilities | 22% | truncated, max 260 px |
| latestRun | 160 | badge, providerId, hint |
| actions | 300, right | 5 text buttons 运行 / 编辑 / 启用 / 禁用 / 删除 with `flex-wrap` (`:960-978`) |

Cells wrap.

**Capability index** (`:992-1024`): `bordered class="min-w-[760px]"`, columns at `:249-254`.

| Key | Width | Cell |
|---|---|---|
| capability | 34%, sortable | capability, then its id |
| provider | 26% | provider name |
| metering | 20% | metering unit |
| adapter | 140 | badge: ready / missing / unknown |

`adapter.reason`, `matchedKey` and `fallbackKey` are not shown.

**Usage** (`:1092-1138`): `bordered min-w-[940px]`, columns at `:279-286`.

| Key | Width | Cell |
|---|---|---|
| run | 28% | sceneId, then `runId · mode · capability` |
| status | 120 | badge |
| provider | 18% | provider name |
| metering | 170 | `qty unit · billable` |
| reference | 20% | reference and hint |
| createdAt | 150 | `formatDate` |

`trace`, `fallbackTrail`, `selected`, `errorCode` and `errorMessage` are fetched but never rendered.

**Health** (`:1205-1249`): `bordered min-w-[920px]`, columns at `:288-295`.

| Key | Width | Cell |
|---|---|---|
| provider | 24% | name, then `id · vendor` (title = endpoint) |
| status | 120 | badge |
| capability | 18% | capability |
| latency | 110 | `{ms}ms` |
| reason | 22% | reason and hint |
| checkedAt | 150 | `formatDate` |

**Native tables in drawers**:

| Table | Lines | Min width | Columns |
|---|---|---|---|
| Create drawer, capability rows | `:1397-1448` | 620 px | capability select · metering select (`w-44`) · remove (`w-12`) |
| Edit drawer, capabilities | `:1611-1703` | 920 px, inside a 920 px drawer | capability input · metering (`w-36`) · model (`w-64`) · advanced `<details>` (`w-48`) · remove (`w-16`) |
| Check drawer, candidate capabilities | `:2125-2158` | 520 px | capability · metering (`w-36`) · model (`w-40`) |

**Proposed primary / secondary split for a 976 px table area.**

- 976 = 1280 − rail 240 (`components/admin/AdminNav.vue:279`, `xl:w-60`) − 2 × 32 padding (`layouts/admin.vue:19`, `lg:px-8`).
- This holds for a flush `AdminSection :padded="false"`, as in the audits pilot. A padded section leaves 936 px.
- Widths are arithmetic estimates for 13 px text plus 24 px padding; check them in the browser.

| Table | Primary columns (px) | Fixed sum | Into the detail drawer |
|---|---|---|---|
| Providers | provider auto (≥ 240) · status switch 88 · capabilities 220 · health badge 112 · actions, 4 icons, 176 (4×32 + 3×8 + 24) | 596 → provider ≈ 380 | latency, observability hint and detail, quota summary, updated at, id, vendor, adapter key, endpoint, region, auth type, scope, full capability list with metering and adapter readiness / reason. The PRD also lists health as secondary; dropping the badge gives the provider column ≈ 492. |
| Routes | route auto (≥ 260; name + id · owner) · readiness 140 (badge + 缺失 N) · latest-run badge 120 · actions, 3 icons, 136; add an enabled switch (88) if enable / disable leave the buttons | 396–484 + route | strategy · fallback, required capabilities, latest-run provider and hint, the full missing list, bindings, `invalidBindings` codes (shown nowhere today) |
| Capability index | capability auto · provider 200 · metering 120 · adapter 140 | already fits (760 < 976) | id, schemaRef, adapter reason / matched key / fallback key |
| Usage | run auto (≥ 260) · status 112 · provider 180 · metering 140 · created 148 | 580 → run ≈ 396 | mode, capability, billable, estimated, pricing and provider refs, hint, error code and message, trace, fallback trail, selected |
| Health | provider auto (≥ 220) · status 112 · capability 180 · latency 96 · checked 148; optionally a 1-line reason at 200 | 536 + provider | full reason (degraded reason, error code and message, request id), hint, endpoint |

Row-click caveat: `TxDataTable` emits `rowClick` for any click inside the `<tr>` (`TxDataTable.vue:429-431,557`). The switches and buttons in a clickable row would also open the drawer unless they stop propagation themselves.

### 3.4 Drawers, dialogs, forms

| Surface | Lines | Purpose and fields | Destructive / confirm |
|---|---|---|---|
| Provider drawer, create mode | `:1256-1450`; size `min(920px,100vw)` | 服务大类, 预设, 名称, 显示名称, 厂商, 适配器 (server catalog), 状态, 认证类型, API Key / SecretId / SecretKey (conditional), 端点, 地域; 模型列表 textarea and 默认模型; capability-row table | none |
| …edit mode | `:1452-1705` | error box; basic fields (name … description); models plus 获取模型列表 (POST models); 高级信息 `<details>` (Provider ID read-only, auth ref, owner scope, owner id, metadata JSON); capability table with per-row JSON `<details>` | Removing or blanking a capability row DELETEs it on save (`useProviderRegistryAdmin.ts:430-461`), with no confirmation |
| …quota mode | `:1707-1758` | quota name, status, window days, max requests, max tokens, warning %; a channel list when there is more than one quota | Saving writes one quota and replaces the whole list with it (`useProviderRegistryAdmin.ts:871-878`) |
| Provider drawer footer | `:1761-1771` | Cancel / Create or Save. After awaiting, it closes whatever drawer is open if `!error.value` (`:389-402`) | |
| Scene drawer, create mode | `:1774-1860`; size `min(820px,100vw)` | route id, display name, owner, strategy, status, fallback, required capabilities; binding rows (provider, capability, model, priority) with **no labels**, placeholders only | Removing a row is local until save |
| …edit mode | `:1862-1973` | adds owner scope and id plus metering / audit / metadata JSON; bindings gain weight (its only label is the English placeholder "weight", `:1947`), status, and constraints / metadata JSON | Bindings are replaced on save, with no confirmation |
| …run mode | `:1975-2043` | capability, provider, input JSON and 重置样例; result shows status, runId, mode, then `<pre>` blocks for trace, output, selection and fallback trail | 执行 makes a real upstream call (`:2056-2059`) with no confirmation; 试运行 also has none |
| Check drawer | `:2069-2183`; size `min(760px,100vw)` | capability (from those declared); default model and endpoint as read-only inputs; candidate table | Check is a POST probe |
| Delete confirmation (`TxBottomDialog`) | `:2185-2194`; logic `:449-502` | Delete a provider or a scene; the message includes the capability or binding count | Confirms, but has no loading lock |
| Inline status controls | provider switch `:700-709`; scene 启用 / 禁用 `:968-973` | | No confirmation |

**Label association.** None of the drawer labels is connected to its control. There are 67 `<label class="apple-section-title">` elements; all are siblings of their control, none has `for`, and no control has an `id`. These controls have no label at all:

- the toolbar search and select (`:631-645`);
- the filter chips (`:848-860,1046-1058,1159-1171`), which are plain `<button>`s that show selection only by colour, with no `aria-pressed`;
- the binding rows;
- the editors inside table cells.

### 3.5 Headings inside the panel

- h2, each with a `<p>` hint: 已注册服务渠道 `:623-625`, 能力路由 `:840-842`, 用量账本 `:1038-1040`, 健康检查 `:1151-1153`.
- h3: 服务渠道能力索引 `:984-986`, with its hint at `:987-989`.
- Drawer h3s: `:1343,1390,1458,1516,1604,1745,1827,1925`.
- Drawer hint `<p>`s: `:1265,1708,1782`.

### 3.6 Formatting sites

**Dates.** `formatDate` (`utils/provider-registry-admin.ts:1223-1226`, re-exported at `useProviderRegistryAdmin.ts:1106`) calls `toLocaleString()` with the browser's default locale and returns the raw string when the date is invalid. It is used at `:778` (updatedAt), `:1136` (createdAt) and `:1247` (checkedAt). The trace JSON in the run drawer prints raw ISO `at` values.

**Numbers.**

- Stat values `:542,556,570,584,598`. TxStatCard prints numbers in en-US (`utils/admin-kit.ts:12`).
- Enabled count `:550`; filter counts `:643,859,1057,1170`; `+N` `:739`.
- Latency `:752` (prints `-ms` when there is no evidence) and `:1231`.
- Quota `:770-773` and `:1754-1755`; quantity `:1119`.

**Hardcoded English shown in the Chinese UI.**

- `utils/provider-registry-admin.ts:764`: `` `${n} failed` `` in the routes latest-run hint.
- Client-side validation messages shown through `error.message`:
  - `useProviderRegistryAdmin.ts:532`;
  - `utils/provider-registry-admin.ts:1241,1280,1488,1499`;
  - `JSON.parse` errors at `:1239` and `:1506`.
- `valueLabel` falls back to the raw value when a `values.*` key is missing. `values.ready` exists in neither locale, so a ready scene shows "ready". Its badge is also `muted`, because `statusTone` has no case for `ready` (`:627-635`).

### 3.7 The admin watch

- `useProviderRegistryAdmin.ts:93`: `const { user } = useAuthUser()`, used only at `:101`.
- `:98`: `const { isAdmin } = useAccountRole()`.
- `:100-104`: `watch(isAdmin, … navigateTo('/dashboard/overview'), { immediate: true })`.

`isAdmin` is also returned (`:1130`) for the panel hint at `:514`. The watch is pinned by `useProviderRegistryAdmin.test.ts:162-172` (`:169` isAdmin is false, `:170` navigateTo is called, `:171` no request is sent); the runtime stubs are at `:90-110`. The layout gate already covers the same behaviour: `composables/useAdminGate.test.ts:148` (a member is denied and navigated once) and `layouts/admin-layout.test.ts:87` (when denied, the page is not mounted).

### 3.8 Against the drawer request-generation rule (`quality-guidelines.md:116`)

- `submitProviderDrawer` (`:389-402`) and `submitSceneDrawer` (`:433-443`) await the save, then close whatever drawer is open. A save that finishes after the operator has opened another provider's drawer closes that drawer.
- `fetchProviderModels` writes into the panel object it captured at call time (`useProviderRegistryAdmin.ts:773`). A late failure still sets the global `error` and shows a toast.
- Run results are stored per scene (`sceneRunPanels`) and land even after the drawer is closed; reopening the drawer shows them.

---

## 4. AI 调用审计 `/admin/intelligence-audits`

- **Page** `:25-36`: title `intelligence.tabs.audits` (审计日志 / Audits); ClientOnly wrapping `LazyDashboardIntelligenceAuditsPanel`; the fallback is one `h-[32rem]` pulse block (`:29-33`).
- **Request** (`:42-48`): `GET /api/dashboard/intelligence/audits` with `limit` = 20, `page`, and `userId` (trimmed, or omitted when blank).
  - The server (`audits.get.ts`) also accepts `providerId`, and computes `offset = (page-1) * (limit ?? 50)`.
  - `listAudits` clamps the limit to 1–200, but `pageSize` echoes whatever was requested.
- **Response** `{audits, total, page, pageSize}`. Each row is an `IntelligenceAuditRecord` (`server/utils/intelligenceStore.ts:126-141`): id, userId, providerId, providerType, providerName, model, endpoint, status, latency, success, errorMessage (≤ 600 chars), traceId, metadata (≤ 2000 chars of JSON), createdAt. The panel's type omits `userId` (`:12-26`).
- **Fields on each card today** (`:130-208`):
  - Line 1: provider name, or the label `intelligence.types.<type>` (missing for dashscope and tencent-cloud), then the model; the time on the right.
  - Line 2: a 成功 / 失败 pill with ` · status`, 延迟 `{n}ms`, 接口 endpoint (truncated), and the Trace id.
  - Line 3: metadata fields `baseUrl`, `requestId`, `contentType`, `endpoints` (joined with " | "), `tokens`, `ip`, `country`.
  - The red `errorMessage`, then a `responseSnippet` box.
  - Not shown: userId, providerId, and the other metadata keys (source, stage, sessionId, attempt, errorCode, retryable, …).
- **Filters**: one `TuffInput` (placeholder 按用户 ID 过滤, no label) and a 筛选 button (`:110-119`). The filter applies only on click. From page > 1 it sends two requests (the watch plus the explicit call, `:60-63,96-98`), with no generation guard.
- **Pagination**: `TxPagination v-model:current-page` appears only when `total > 20` (`:216-218`). There is no page-size selector, and nothing is in the URL.
- **States**:
  - A spinner (`:126-128`) replaces the list while loading.
  - The error (`:122-124`, `e.data?.message ‖ t(audit.loadFailed)`) does not clear the rows, so stale rows and the error can show together.
  - The empty state is guarded by `!auditError` (`:210-214`).
  - Refresh is a text button (`:104-108`).
- **Formatting**: time `:146` via `formatAuditTime` (`:69-78`); latency `:160`; tokens `:187`.
- **The PRD's columns at 976 px (flush)**: time 148 · provider/model auto ≥ 220 · result + code 120 · latency 96 · endpoint 200 · trace 160 = 944. A padded section (936 px) is 8 px short.
- **Precedent**: `pages/admin/audits.vue`, built on `utils/admin-audits.ts` `createAuditListOptions` and tested by `pages/admin/audits-page-behavior.test.ts`.
- **Also exists**: `GET /api/dashboard/intelligence/invoke-audits` (`server/api/dashboard/intelligence/invoke-audits.get.ts`), a billing-matched invoke ledger. No UI uses it; only `test/api/dashboard/intelligence/invoke-audits.api.test.ts` calls it.

---

## 5. Browser checks: `nexus-provider-scene-routing.md:105`

The spec reads: "Admin UI: real browser shows adapter selector, full capability catalog, binding model selector, and degraded missing-capability reason." Its origin is the scene-unification task (`.trellis/tasks/09-28-09-28-nexus-provider-scene-unification/prd.md:69-71`):

- adapter options come from the server catalog;
- model options come from the selected provider's declared models;
- degraded scenes explain what is missing or invalid.

The same task's `design.md:142-143` adds that static templates "cannot restrict the capability or adapter catalog".

| Item | Where (at SHA) | Data source | What to verify | Click path (now → after `?tab=`) |
|---|---|---|---|---|
| Adapter selector | create `:1300-1305`, edit `:1480-1485` (`providerForm.adapterKey` / `panel.adapterKey`) | `providerAdapterOptions`, taken from `adapters` in `GET …/providers` (`useProviderRegistryAdmin.ts:265-268,613`; `server/api/dashboard/provider-registry/providers.get.ts:27`) | Options match the server catalog (count and labels match the response), not only the preset's key. Changing 预设 resets the adapter to the template's key (`:270-293`). An unsupported adapter/capability pair, or a default model outside the model list, is rejected and the server's error is shown (spec `:77-80`). | 服务渠道 tab → 创建服务渠道 → 适配器; or a row's ✎ 编辑 → 适配器. After: `/admin/provider-registry` (the default tab) |
| Full capability catalogue | capability rows in the create drawer, `:1419-1426` | `providerCapabilityCatalogOptions` = `listTuffIntelligenceBuiltinAbilities()` (`utils/provider-registry-admin.ts:424-428`; 34 entries in `packages/tuff-intelligence/src/resolvers/builtin-abilities.ts:51-287`) | The select lists the whole catalogue whichever preset is chosen; presets only seed the initial rows. Picking a capability fills its metering unit. There is no schemaRef field. Related: the capability index on the routes tab (`:982-1026`) lists declared capabilities with adapter readiness. | 创建服务渠道 → 能力 → 添加能力, or the select in an existing row |
| Bound-model selector | create scene `:1843-1846`, edit scene `:1942-1945` | `bindingModelOptions(providerId)`, the provider's `metadata.models` (`:518-524`), plus 使用默认模型 | Options follow the row's provider and equal that provider's 模型列表. A model outside the list is rejected (spec `:63,80`). Changing the provider does not reset a model already chosen, because nothing watches it. | 能力路由 tab → 创建路由 → a 服务渠道绑定 row; or a row's 编辑 → bindings. After: `?tab=routes` |
| Degraded missing-capability reason | status cell of the routes table, `:916-931` | `scenes[].readiness {status, missingCapabilities, invalidBindings}` (`server/api/dashboard/provider-registry/scenes.get.ts:16`) | A scene missing a required capability shows 降级 (warning) and 缺失能力: … (the full list is in `title`). `invalidBindings[].code` is rendered nowhere. | 能力路由 tab → 状态 column. After: `?tab=routes` |

"降级" is ambiguous in Chinese. `fields.fallback` and `routes.fallbackTrail` (降级链路) also use 降级. Fallback reasons, in the "fallback" sense, appear only as raw JSON in the run drawer (`:2035-2040`). The health check's `degradedReason` appears in the health table's reason column (`:1233-1245`).

---

## 6. Tests that pin structure

| File:lines | What it asserts | Behaviour it actually guards | Existing behaviour coverage | Re-express as |
|---|---|---|---|---|
| `utils/provider-registry-admin.test.ts:269-282` | Panel source contains `getProviderQuotaList`, `(selectedProvider.id)`, the keys `quota.channels` / `defaultChannel`, `quota.channel`, `quota.limits?.maxRequests` / `maxTokens` | The quota drawer lists every channel of a multi-quota provider, labels a null channel 默认, and shows each channel's limits | `summarizeProviderQuotaList` `:238-265` | A pure view-model of the channel rows, or an SSR render of the drawer content |
| `:286-301` | The four hint getters, `observability.latestSceneRun`, `latestHealth?.latencyMs`, `latestUsage?.providerId`, `getUsageLedgerReference`, `getHealthCheckReason` | Each list shows its next-action hint; a provider shows its latest latency; a scene shows its latest-run provider; usage shows its reference; health shows its reason | the resolvers, `:470-770` | A contract on each table's row or drawer view-model |
| `:305-321` | `providerCapabilityTemplateOptions`, `applyProviderCapabilityTemplate(row, $event)`; no `providerSchemaRefOptions` or `row.schemaRef`; `providerMeteringUnitOptions`; `<table class="w-full min-w-[620px]`; `fields.meteringUnit`; `text-red-500`; `i-carbon-close`; `w-full min-w-0` | Capabilities are picked from the catalogue; the template fills schemaRef and unit; schemaRef is never editable. `:316` and `:318-320` are purely visual. | none for `applyProviderCapabilityTemplate` (`useProviderRegistryAdmin.ts:327-335`) | A composable test of the template fill, plus a "no schemaRef control" assertion on the markup or view-model. The style literals carry no behaviour. |
| `:390-402` | `providerServiceCategoryOptions`, `applyProviderServiceCategory`, `providerTemplateOptions`, `applyProviderTemplate`, the keys `fields.serviceCategory` and `fields.adapter` | The create flow offers category → preset → adapter and re-seeds the form | only `resolveFirstProviderTemplateForServiceCategory` (`:136-142`) | A composable test: changing the category picks its first template and resets the form and rows; adapter options equal the server catalogue |
| `:404-433` | pure functions (`createDefaultSceneCapabilityInput`, `createSceneRunPanel`) | — | itself | keep |
| `:435-445` | `applySceneRunCapabilitySample`, `selectSceneRunCapability`, `routes.resetSample`, `activeSceneRunPanel.error` | The run drawer re-seeds its input per capability, offers a reset, and shows the run's error | none (`:544-555`, `:1027-1031`) | Composable tests for the sample reset and for a failed run setting `panel.error` |
| `pages/docs/docs-page-performance.test.ts:263-265` (file read at `:35`) | The page contains `<ClientOnly>` and `<LazyDashboardProviderRegistryAdminPanel />`, and no `import ProviderRegistryAdminPanel` | Keeps the 2207-line panel as an async chunk outside the server render. It was introduced by `6efa011e9` (hydration) and extended by `8841182e0` ("tighten docs static bundle boundaries"). Its companion build check, `apps/nexus/build/check-worker-bundle.mjs:285-311`, fails if docs / store / landing / public / auth HTML links a CSS chunk matching `/ProviderRegistry/i`. | the build guard | Assert that the page does not statically import the heavy panel module (or whatever replaces it). The `<ClientOnly>` literal is now covered by the layout gate, which never server-renders the page slot. That regex matches component chunk names, not a `provider-registry` route chunk. |
| `composables/useProviderRegistryAdmin.test.ts:162-172` | A non-admin triggers `navigateTo` and no request | A non-admin never stays on the page and never fetches | `useAdminGate.test.ts:148`, `admin-layout.test.ts:87` | Delete; optionally assert that the composable no longer navigates |
| `…:253-282` | `error.value === 'Probe unavailable'`, taken from `Error.message` | A failed check keeps a result scoped to that provider | itself | This pins `normalizeError`'s fallback to `error.message` (`utils/provider-registry-admin.ts:1194-1199`), so it changes if `resolveAdminErrorMessage` is adopted |
| `…:174-251, 284-357` | seed on mount, hydration, refresh after mutations, credential ordering | behaviour | — | keep |
| Intelligence overview and audits | No tests at this SHA. Only indirect ones: `components/admin/AdminNav.routing.test.ts:155-159` (rail order); `test/guards/page-single-root.test.ts` plus its frozen fixture `test/guards/helpers/fixtures.ts:61-62`; `utils/dashboard-admin-i18n-coverage.test.ts:35-48` (`ADMIN_SURFACE` directories, literal `t('dashboard.…')` calls only) | — | — | New code outside the listed directories must be added to `ADMIN_SURFACE` to stay covered. Dynamic keys (`valueLabel`, `filterLabel`, `*.titleKey`) are invisible to that test. |

Stale but not a structure pin: `apps/nexus/build/check-worker-bundle.mjs:96` lists `/dashboard/admin/provider-registry`, a page that no longer exists.

---

## 7. Kit fit (kit design §8)

**Fits as-is**

- `AdminPageShell` (`title`, `#actions`, `#nav`, default slot) for all three pages. Titles come from the rail keys `menu.intelligenceOverview`, `menu.providerRegistry` and `menu.intelligenceAudits`.
- `useAdminQueryState('tab', ['providers','routes','usage','health'], 'providers')` for the tabs; it keeps the other query keys.
- `AdminStatGrid` for the four overview metrics and the five registry cards (`label`, `meta` for the hint line, `iconClass`), with values passed as `useAdminFormat` strings.
- `AdminSection` for the Top lists, the user query, and each registry table (`padded=false` for tables).
- AI call audits end to end:
  - `useAdminList` with `defaults {userId: ''}`, `debounceKeys ['userId']`, and a fetch returning `{rows: audits, total}`;
  - `AdminFilterBar` / `AdminFilterField` for the filter;
  - `AdminTable` with `clickableRows`;
  - `TxDrawer` + `TxDescriptions`, following the pilot;
  - `useAdminFormat.tableDateTime` / `dateTimeTitle`.
- `AdminConfirmDialog` for deleting providers and scenes, replacing the `TxBottomDialog` at `:2185-2194`.
- `AdminFormField` (unmerged, API fixed) for the block-level fields of the three drawers.
- `useAdminFormat`:
  - `tableDateTime` plus `dateTimeTitle` for `:778,1136,1247` and for the audits and usage dates;
  - `number` for counts and tokens;
  - `percent(successRate / 100, 0)`;
  - `duration` for latency (rounds to whole seconds at ≥ 1 s).
- `resolveAdminErrorMessage` for transport errors.

**Gaps** (listed only; no kit changes invented)

1. **No error, retry or empty state outside tables.** `AdminStatGrid` and `AdminSection` have none, and `AdminStatGrid.loading` covers only the first load. The overview metrics, Top lists, user query and registry cards need `TxErrorState` / `TxEmptyState` composed on the page.
2. **No composable for non-list loads.** The kit has nothing for a single unpaged request (the overview), an on-demand query (user usage), or one orchestrated load that feeds several tables (`fetchRegistry`). `useAdminList` is one paged list per fetch.
3. **`AdminTable` assumes server paging.** Its footer pager appears once `total > limit` (default 20). The registry lists are entirely client-side, with no paging.
4. **`AdminTable` empty states are limited.** They take a title only. The filtered state has a fixed description and a "Clear filters" action. There is no description or tone for the registry's positive "nothing needs attention" states (`utils/provider-registry-admin.ts:921-1172`).
5. **No responsive or extra table options.** There is no per-column hiding at narrow widths (the PRD's "在窄宽时隐藏"). `AdminTable` does not expose `rowClass`, `defaultSort`, `bordered`, `nowrap` or `expandable`.
6. **Clickable rows catch clicks on controls.** Rows emit on any click, and the kit has no rule to ignore clicks that start on an interactive element.
7. **Validation messages would be lost.** `resolveAdminErrorMessage` never reads `error.message`. The registry's client-side validation errors (JSON, model, number, duplicate) are plain `Error`s that today reach the screen through `normalizeError`, and `useProviderRegistryAdmin.test.ts:275` pins that path.
8. **`AdminFormField` does not fit table editors.** It is block-level with a visible label, so it does not suit per-row editors inside tables (capability rows, binding rows) or `<details>` groups.
9. **Several URL-synced lists on one route need `queryKeyPrefix`**, which is unmerged. This matters only if usage and health move to server paging and filters.
10. **The composable lives inside the panel.** To put Refresh in `#actions` and the tab state in `#nav`, the page needs the composable hoisted or exposed. The reviews page on the unmerged content branch is a precedent.
11. **No skeleton for small ranked lists** (the Top lists), unless they become `AdminTable`s.

---

## 8. Caveats

- `10-02-nexus-admin-retired-ai-cleanup` (in progress) edits `server/utils/intelligenceStore.ts` and `tuffIntelligenceLabService.ts`. Anchors in those files may shift.
- The pixel figures in §3.3 and §4 are arithmetic, not measured in a browser.
- The combined effect of `nowrap` and `line-clamp-2` in the providers table was read from the CSS, not observed.

---

## Open questions for the owner

1. 「请求总量」 is the size of the latest ≤ 200-row sample, so it always equals the sample hint. Keep the label, relabel it as a sample, or ask for an all-time count (an API change, out of scope)?
2. The overview API already returns a Top 服务渠道 list (`providers`) that is never shown. Show it?
3. Do the five registry summary cards stay above the tab strip on every tab, or move into their tabs?
4. When a registry row is clicked, open a new read-only detail drawer or the existing edit drawer? Which actions stay in the row?
5. Which of these need `AdminConfirmDialog` (DoD #7)?
   - the provider status switch;
   - scene 启用 / 禁用;
   - 执行 (a real upstream call);
   - capability and binding removal on save.
6. Should provider search / status and the routes / usage / health filters go into the URL (DoD #4)? Should usage and health stay a 25-row client-side window or move to server paging?
7. Routes: must the missing-capability reason stay visible in the table cell (spec `:105`), or is the drawer enough? Should the `invalidBindings` codes be shown?
8. Does the PRD's 「降级原因」 mean the spec's "degraded missing-capability reason", the fallback-trail reasons, or both?
9. AI call audits: expose the `providerId` filter the API already accepts? Is `invoke-audits`, the billing-matched invoke ledger with no UI, meant to feed this page?
10. IP-ban seam: keep the frozen block in `IntelligenceOverviewPanel.vue` (S1), or move it verbatim to a new component (S2, which breaks the risk-console PRD's anchors)?
11. Latency display: `duration()` (850 毫秒 / 1 秒), or exact milliseconds with thousands separators?
