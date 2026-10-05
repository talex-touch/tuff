# 清理 10-01 退役的 AI 后台残留代码（含分析页 AI 面板）

父任务：`10-02-nexus-admin-console-overhaul`（D4 判定、D6、默认处理）。证据：`../10-02-nexus-admin-console-overhaul/research/retired-ai-cleanup.md`（下称「研究」）。

## Goal

10-01（`5e6579e05`）删掉了 Tuff AI 工作台与对话探针两个页面，但服务端运行时、接口、测试、文案和依赖都还在，成了无主代码。把只为它们服务的代码一次删干净，同时保证线上仍在用的共享部分（v1 AI 调用、积分模型列表、文档助手、provider 检测）不受影响。

## Requirements

- **R1 路由**：删除 `server/api/admin/intelligence-agent/**`（16 个文件：13 个在线 handler + 3 个 orchestrator 410 桩）、`server/api/admin/intelligence/chat.ts`、`server/api/admin/intelligence-lab/**`（10 个 410 桩）。对外这 13 个 410 URL 变为 404（研究 §6 R-5：迁移目标已不存在、无已知调用方）。
- **R2 工具模块**：删除 `server/utils/{intelligenceAgentGraphRunner,intelligenceAgentRuntimeBridge,tuffIntelligenceRuntimeStore,tuffIntelligenceLabTools}.ts`；按研究 §2.3 裁掉 `tuffIntelligenceLabService.ts` 的不可达声明（约 2,900 行）并清理失效 import，保留 `invokeIntelligenceCapability`、`streamIntelligenceCapability`、`listIntelligenceLabProviders`、`resolveIntelligenceProviderRuntimeContexts`、`probeIntelligenceLabProvider`、`createId`、`isRetryableInvokeError` 及其可达依赖；按研究 §2.4 裁掉 `intelligenceStore.ts` 的 Prompt Registry 段与 `ensureSchema` 中 prompt 两表的 DDL（函数本身保留）。
- **R3 分析页 AI 面板（D6）**：删除 `/admin/analytics?section=intelligence` 面板（`analytics.vue:1247-1410` 及其 tab）、`server/api/admin/analytics/intelligence.get.ts`、`useAdminAnalyticsData.ts` 的对应分支（`:48-50,119-129`）、`types/admin-analytics.ts:168` 相关类型、`listRuntimeAudits`、相应测试与 `dashboard.sections.analytics.intelligence.*` 文案；遗留 `?section=intelligence` 回落到 overview（沿用现有遗留 section 回落逻辑）。
- **R4 文案**：删除 `dashboard.intelligenceLab` 整块与 `dashboard.sections.menu.{intelligence,intelligenceLab,intelligenceChat}`（en `route/en/dashboard.ts:618-709,827,828,830`；zh `:615-706,823,824,826`），两语对称。保留审计动作标签 `intelligence.prompt*` ×4（`audits.vue:95-98`，历史行仍需可读）。
- **R5 依赖**：从 `apps/nexus/package.json` 移除 `@langchain/langgraph`、`@talex-touch/intelligence-uikit`（`:51,57`），更新 lockfile；不动 uikit 包本身与 core-app / tuff-intelligence 对 langgraph 的使用。
- **R6 测试与脚本**：删除研究 §2.6 列出的 5 个测试文件；`intelligence-agent-policy.test.ts` 保留 `:78-85`（`isRetryableInvokeError` 的唯一覆盖）并删掉测死代码的部分；`scripts/intelligence/verify-intelligence.mjs:54,66` 去掉被删测试路径。
- **R7 空转守卫**：修 `test/guards/admin-route-reachability.test.ts:223-228`、`page-toplevel-throw.test.ts:66-71`、`form-submit-button.test.ts:79-86`——负控改读 `test/guards/fixtures/` 里的样本或从 `5e6579e05^` 取回的 blob 内容，使它们重新能失败；更新 `:10-13,129-131,213` 等过期注释。守卫 fixtures 与 AdminNav 墓碑断言保留。
- **R8 文档**：更新研究 §2.8 列为「改」的现状文档（`content/docs/dev/intelligence/{index,schema-migration,langchain-agent}.{en,zh}.mdc`、`content/docs/guide/tips/index.{en,zh}.mdc:18`、`docs/plan-prd/TODO-AI.md:48`、`TODO-BACKLOG-LONG-TERM.md:34,58`），在 `docs/plan-prd/01-project/CHANGES.md` 追加一条记录；历史记录不动；`intelligence-agent-playbook` 文档保留（通用指南，未绑定后台页面）。
- **R9 spec**：`component-guidelines.md:73` 的「seven query-addressed panels」改为六个、去掉 intelligence。

## Acceptance Criteria

- [ ] R1–R4、R6 在**同一个提交**内完成（研究 §6 R-1）。
- [ ] `rg -n "intelligence-agent|intelligence-lab|intelligence/chat|tuffIntelligenceRuntimeStore|intelligenceAgentGraphRunner|IntelligenceLabTools" apps/nexus --glob '!**/node_modules/**' --glob '!**/.nuxt/**'` 只剩研究 §0 判为「保留」的命中（守卫 fixtures、AdminNav 墓碑断言、审计标签、`packages/utils` 类型），并附正控（同一命令能命中保留项）。
- [ ] 本机 dev server 上，清理前后各调一次并对比响应（状态码、响应形状、错误码；本地 demo provider 本身可能就返回 503，要求的是「前后一致」而不是「成功」）：`POST /api/v1/intelligence/invoke` 与 `stream`、`GET /api/credits/models`、文档助手、`/admin/provider-registry` 的渠道检测。`/admin/analytics` 六个面板可切换，`?section=intelligence` 回落到 overview。
- [ ] 3 个守卫做负控：临时把被测问题注回样本，守卫失败；恢复后通过。
- [ ] `cd apps/nexus && ./node_modules/.bin/vitest run`、Nexus typecheck、`node apps/nexus/build/check-server-api-route-tree.mjs`、`mise run intelligence:verify`、改动文件 eslint、`git diff --check`、`node apps/nexus/build/check-mdc-fences.mjs` 通过。
- [ ] lockfile 变更只包含两个依赖及其独占的传递依赖（对比包集合差，不看行数）。

## Out of Scope

- 删除 5 张 D1 表（父任务 Follow-ups）。
- `packages/utils` 的 prompt API 类型（已发布的公共类型）、`@talex-touch/intelligence-uikit` 包本身。
- 为旧 `/admin/intelligence*` 页面 URL 加重定向（父任务 Follow-ups）。
