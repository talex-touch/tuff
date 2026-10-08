# Nexus 后台全面重构：统一骨架、逐页迁移、补齐缺页与清理退役代码（父任务）

## Goal

老板原话（2026-10-02，附 `/admin/audits` 截图）：「全面重构整个 cms 后台页面，你看看，还有之前的一些功能一起加上」；补充：「10-1 删除的那几个页面你判断下必要性，感觉没啥用，代码也可以清理下」。

把 `/admin/*` 控制台重构为同一套骨架上的一致页面；把服务端早已存在、却没有界面（或界面放错了地方）的管理能力补进控制台；清理 10-01 退役页面遗留的无主代码。本任务只负责需求、子任务映射、跨子任务验收与最终集成复核，不直接承载实现。

## Decisions

- **D1**（老板）：新建本父任务并收编 `09-23-nexus-admin-console-gaps`（已从 `09-23-nexus-docs-perf-cms-remediation` 解除关联，原父任务 PRD 已注明移交）。
- **D2**（老板）：加回的功能 = 积分、插件审核、发布证据 + 风控与维护工具（IP 封禁与解封、遥测保留清理、应急）。不恢复 Tuff AI 工作台与对话探针。
- **D3**（老板）：做法 = 统一骨架 + 逐页迁移。导航只做必要调整（给加回的功能找位置、消除重名）；抽共用的页面骨架、区块、筛选栏、表格与分页、日期数字格式、骨架/空/错状态，所有页面迁过去；超大页面拆成按需加载的分区。不做整体视觉重新设计。
- **D4**（老板授权由我判断）+ **判定**：10-01 删除的 Tuff AI 工作台与对话探针**没有保留必要**（依据 `research/retired-ai-cleanup.md` §3：Agent 运行时与对话接口的唯一调用方就是这两个页面；prompt / binding 不被任何在线路径读取；runtime store 不支撑任何用户可见功能；`providers` / `heartbeat` / `pause` 从未有 UI 调用；`orchestrateIntelligenceLabStream` 自 2026-02-26 起即死代码）。残留代码清理。
- **D5**（老板）：插件审核搬进后台，新建 `/admin/plugins`（内容运营组）；`/dashboard/assets` 去掉管理员专属的「待处理审核 / 全部资产」视图。
- **D6**（老板）：分析页「AI 分析」面板随退役代码一起删除，分析页由七个面板变为六个。
- **D7**（老板）：风控与维护工具全部做，应急链路补到端到端可用（恢复码发放、会话列表与吊销、吊销使已签发 token 失效）。已向老板说明：生产公开配置 `riskControl: { enabled: false }`（2026-10-02 读取 `https://tuff.tagzxia.com/` 的 `window.__NUXT__.config.public`），风控类页面与接口在生产不可见，需老板自行开启开关后生效。
- **D8**（老板）：发布证据做页面，并在发版流水线中接上 CI 自动写入；需要老板在 GitHub 配置带 `release:evidence` 权限的 API key。
- **D9**（老板）：描述列表（新 `TxDescriptions`）、表格骨架（`TxDataTable` 骨架加载态）、分页条数切换（`TxPagination`）补进 TuffEx；后台自己的组合件（页面骨架、区块、筛选栏、危险确认、管理员闸门、格式化、列表状态）放在 Nexus。
- **默认处理**（未单独询问，评审时可推翻）：Nexus `package.json` 移除清理后零引用的 `@langchain/langgraph`、`@talex-touch/intelligence-uikit`（uikit 包本身保留）；退役功能的 5 张 D1 表只删建表代码、不删表。
- **继承**：CMS 走路线 A「git 即 CMS」（`09-23-nexus-docs-perf-cms-remediation` D2）——文档正文不入库、不做在线编辑器。

## Background（已确认的事实）

证据全文：`research/visual-baseline-2026-10-02.md`（真实浏览器）、`research/page-inventory.md`（代码盘点）、`research/orphan-api-contracts.md`（接口契约）、`research/retired-ai-cleanup.md`（退役代码依赖图）。要点：

- **外壳**：`app/layouts/admin.vue`（44px 栏、`<main>` 滚动、无 max-width）+ `components/admin/AdminNav.vue`（五组 rail）+ `components/admin/AdminPageShell.vue`（仅 `title` / `#actions` / `#filters` / 默认插槽）。表格、筛选、分页、状态、格式化全部各页自写。
- **重复**：管理员闸门 8 份 + 1 变体，3 页没有闸门；日期/数字格式化 13 套、4 种 locale 策略（`audits.vue:160,219` 写死 `en-US`）；分页 3 种样子；筛选栏 3 种样式；指标卡 3 套；破坏性确认 5 种写法，其中 3 处没有确认。
- **截图页缺陷**（1273px 视口实测）：动作列一字一行竖排、时间折 5 行、详情列被挤出视口（23 个动作里 18 个整段显示 JSON，`audits.vue:211-213`）、无名字的管理员邮箱显示两遍（`:166-168` + `:369-371`）、表格卡顶部空带只放「1 / 3」（`:329-333`）。
- **其余可见缺陷**：数据治理页 11,513px 高，332 个文案键在两种语言里都不存在，中文界面整页英文、加载时显示零值且无骨架（`governance.vue:29`、`:1255-1257`）；两页同名「审计日志」；AI 概览、服务渠道页内再套标题（违反 `component-guidelines.md:72`）；服务渠道面板自带 `max-w-6xl` 而表格 `min-w-[1470px]`（`ProviderRegistryAdminPanel.vue:506,691`）；风控、应急页几乎全英文、视觉另起一套；首帧伪空态（audits / users / subscriptions）；刷新时整页换骨架（analytics / updates / images）。
- **加回功能的现状**：积分全局接口无 UI（`credits.vue` 为重定向壳），全局流水只含团队消耗行、用量只看当月、改价审计无旧值；插件审核界面在会员侧 `/dashboard/assets`（`assets.vue:400-423,545-589`），不显示扫描结论与准入状态，审核动作不写管理审计；版本级审核路由**已存在**（`server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`，09-23 计划误判为缺失）；发布证据全仓库无写入方（除测试外）、矩阵必须传版本却无版本列表接口、运行状态无更新路径；IP 自动封禁无列表 UI；应急恢复码无发放接口（`createAdminRecoveryCode` 零调用方）、无会话列表、吊销不影响已签发 token。
- **测试阻力**：analytics / audits / governance.runtime / AdminNav 的测试把页面 `<script setup>` 剥掉 import 后现编执行；`governance.test.ts` 钉约 186 条源码字面量；i18n 守卫对 governance 的 332 键豁免按文件路径生效且要求该文件 `tt()` > 300（`test/guards/i18n-key-existence.test.ts:339-349,469-489`）；3 个守卫自 10-01 起空转（`admin-route-reachability.test.ts:223-228`、`page-toplevel-throw.test.ts:66-71`、`form-submit-button.test.ts:79-86`）。

## Task Map

顺序约束写在各子任务自己的 PRD / implement 里；下表的「依赖」列只做总览。

| # | 子任务 | 交付物 | 依赖 |
|---|---|---|---|
| 0 | `10-02-nexus-admin-retired-ai-cleanup` | 原子删除退役 AI 代码（27 个路由、4 个 util、lab service 不可达段、prompt registry 段）、分析页 AI 面板、i18n 残留、Nexus 两个依赖；修 3 个空转守卫；更新现状文档 | 无 |
| 1 | `10-02-tuffex-admin-primitives` | `TxDescriptions`（新）、`TxDataTable` 骨架加载态、`TxPagination` 每页条数；三者的 Nexus 文档与 demo | 无（发版时机需老板定） |
| 2 | `10-02-nexus-admin-console-kit` | 布局级管理员闸门、`AdminSection` / `AdminFilterBar` / `AdminTable` / `AdminConfirmDialog` / `AdminIdentity` / `AdminStatGrid`、`useAdminFormat` / `useAdminList` / `useAdminQueryState` / 错误文案工具、`/admin` 入口；以 `/admin/audits` 试点完整迁移 | 1 |
| 3 | `10-02-nexus-admin-migrate-content` | 更新与要闻、资源库（`list.get` 分页 + 加载更多，承接 09-23 R5）、评论管理 | 2 |
| 4 | `10-02-nexus-admin-migrate-accounts` | 用户管理、激活码 | 2 |
| 5 | `10-02-nexus-admin-migrate-ai-services` | AI 概览、服务渠道、AI 调用审计（手动 IP 封禁区块不动，由 #11 迁走） | 2 |
| 6 | `10-02-nexus-admin-migrate-analytics` | 分析页六个面板拆成按需加载组件、独立面板不再被总请求绑架、手写抽屉换 TxDrawer | 0、2 |
| 7 | `10-02-nexus-admin-migrate-governance` | 治理页按 `?section=` 拆分并异步加载、补全 332 个文案键、表单标签、骨架；遥测保留面板（D7） | 2 |
| 8 | `09-23-nexus-admin-console-gaps` | 积分控制台 `/admin/credits`（流水 / 用量 / 计价）及其后端补齐 | 2 |
| 9 | `10-02-nexus-admin-plugin-moderation` | `/admin/plugins`：待审队列、扫描结论与准入状态、插件与版本审核、扫描豁免、审核写管理审计；`/dashboard/assets` 去掉管理员视图 | 2 |
| 10 | `10-02-nexus-admin-release-evidence` | `/admin/release-evidence`：版本列表、矩阵、运行列表与详情；运行状态更新接口；`build-and-release.yml` 写入证据 | 2 |
| 11 | `10-02-nexus-admin-risk-console` | `/admin/risk` 迁移与汉化：自动封禁列表与解封、手动封禁从 AI 概览迁入、浏览器内 passkey 二次验证 | 2、5 |
| 12 | `10-02-nexus-admin-emergency-chain` | 恢复码生成 / 轮换、应急会话列表与吊销、吊销使未使用 token 失效、应急页迁移与汉化 | 2、11 |

## Progress（合并记录）

| 日期 | 子任务 / 事项 | PR → stage | 合并提交 |
|---|---|---|---|
| 2026-10-03 | 审计白名单例外（node-forge GHSA-86w9-cpqp-85rv、braces GHSA-vfj7-8cjw-p6xm，均无修复版本；老板批准 30 天例外，2026-11-02 到期） | #2039 | `46a38d5ed` |
| 2026-10-03 | `10-02-nexus-admin-single-root-hotfix`：两个 AI 页面模板根部注释导致多根节点、`out-in` 过渡卡死、切页后主区域空白；新增 `page-single-root` 守卫 | #2038 | `bc951a0c7` |
| 2026-10-03 | #0 `10-02-nexus-admin-retired-ai-cleanup` | #2036 | `7b1b6bb2f` |
| 2026-10-03 | #1 `10-02-tuffex-admin-primitives` | #2037 | `573b18338` |
| 2026-10-03 | #2 `10-02-nexus-admin-console-kit`（含切页骨架 R1b、闸门错误态与路由同步） | #2040 | `ee35ab869` |
| 2026-10-03 | #3 `10-02-nexus-admin-migrate-content`（含 `queryKeyPrefix`、`tableDate` 与 `{ timeZone: 'UTC' }`；验收中修了英文徽标截断、侧栏「Comments」、洛杉矶时区下要闻日期早一天、后台文档评论链到 `/docs/docs/…`） | #2042 | `bf573c468` |

- 合并前在 `origin/stage` 上逐个本地试合并并跑全量测试（#2036、#2037 与 #2038 都改了 `test/guards/helpers/fixtures.ts`，自动合并无冲突，Nexus 249 files / 1877 tests、TuffEx 279 / 3142 通过）。
- 仍为红但非必需的检查：Cloudflare Pages（#2034 起所有 PR 都红）、Windows Everything Production Gate（近期所有 PR 都红，含 #2035）。均与本任务无关，未处理。
- Trellis 记账（任务归档与 journal）推迟：`finish-work` 会在共享主检出的 `stage` 上自动提交，而那里有其它会话的未提交改动与未推送提交；整批收尾时改在独立分支经 PR 提交任务记录。

## Cross-child Acceptance Criteria

- [ ] 每个 `/admin/*` 渲染页都满足 `design.md` §4「页面迁移完成标准」，在真实浏览器（ego）中按 1280px、1920px 两种宽度，以及亮 / 暗主题、中 / 英文各验一遍，截图记录在各子任务 `research/`。
- [ ] 导航最终形态与 `design.md` §3 一致；没有指向重定向壳页的条目；没有两个页面同名；页面标题与 rail 文案一致。
- [ ] 全后台不再出现写死的 locale、`isZh ?` 内联文案、手写骨架占位、整段 JSON 详情、暴露 API 路径的错误文案。
- [ ] `/dashboard/assets` 只剩会员自己的发布物；管理员审核只在 `/admin/plugins`。
- [ ] 退役 AI 代码删除后，`/api/v1/intelligence/invoke|stream`、积分模型列表、文档助手、provider 检测在本机的响应（状态码、形状、错误码）与清理前一致。
- [ ] 每个子任务合入前：`apps/nexus` 全量 vitest（CI 同款命令）、Nexus typecheck、改动文件的包内 eslint、`git diff --check` 通过；涉及 TuffEx 的另跑 tuffex typecheck / vitest / build / `audit:size`；涉及文档的跑 `node apps/nexus/build/check-mdc-fences.mjs`。
- [ ] 风控 / 应急相关页面在开启 `riskControl`（及 break-glass）开关的本地实例上走通；生产仍关闭时页面按 feature gate 正确隐藏。
- [ ] `.trellis/spec/frontend/component-guidelines.md` 的后台条目（`:72-74`）按最终骨架与面板数更新。

## Out of Scope

- 路线 B 文档 CMS（正文入 D1、在线编辑器、ISR）。
- 恢复 Tuff AI 工作台 / 对话探针；退役功能 5 张 D1 表的删除（另走受控脚本）。
- 后台整体视觉重新设计与信息架构重排（D3）。
- 在生产开启 `riskControl` / break-glass 开关（老板自行决定与操作）。

## Follow-ups（不在本任务内，收尾时登记）

- 退役 AI 的 5 张 D1 表（含管理员对话原文 `history_json`）按 `provider:legacy:drop` 先例做「先备份、显式确认」的删表脚本。
- `admin_breakglass_audit` 没有读取接口，风控 / 应急动作在 `/admin/audits` 不可见。
- 若干后台写操作不写管理审计：图片上传 / 删除、更新删除、治理配置、Provider 创建、风控模式切换（`research/page-inventory.md` §13）。
- 已退役的 `/admin/intelligence*` 旧书签会落到 404（没有 `routeRules` 重定向）。

## Side Findings（已报告，未纳入范围）

- 管理员扣减积分被抬回：#4 已在本地复现（`10-02-nexus-admin-migrate-accounts/research/credits-subtract-repro.md`）。2026-10-03 老板决定在 #4 里修：扣减不得越过套餐基础额度与本月已用额度，超出整笔拒绝（见 #4 PRD R3）。
