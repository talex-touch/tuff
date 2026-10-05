# Design — 清理退役 AI 后台残留代码

依据：`../10-02-nexus-admin-console-overhaul/research/retired-ai-cleanup.md`（下称「研究」），所有行号以研究写作时的 HEAD 为准，动手前用 `rg` 复核。

## 1. 删除集与保留集

| 类 | 删除 | 保留（共享，附在线调用方） |
|---|---|---|
| 路由 | `server/api/admin/intelligence-agent/**`（16）、`intelligence/chat.ts`、`intelligence-lab/**`（10）、`admin/analytics/intelligence.get.ts` | 其余 `server/api/admin/analytics/*` |
| util | `intelligenceAgentGraphRunner.ts`、`intelligenceAgentRuntimeBridge.ts`、`tuffIntelligenceRuntimeStore.ts`、`tuffIntelligenceLabTools.ts` | `intelligenceErrorContract.ts`、`tuffIntelligenceCapabilityMessages.ts`、`adminAuditStore.ts`、`auth.ts` |
| lab service | 研究 §2.3 不可达区间（类型 `:88-111,200-204,215-311`；常量 `:313,316-318,355-368`；辅助 `:403-453,459-505,513-518,644-815`；`:2520-2800`；`:2821-3774`；`:3776-4936`；`:4938-5059`）及失效 import（`:9,18,21,57-59,61-81` 中不再使用者） | 6 个存活根及其可达闭包；`createAudit` import；`createId`（`:455-457`）；`isRetryableInvokeError`（`:578`） |
| intelligenceStore | prompt import / 常量 / DDL / 行类型 / mapper / Prompt Registry 段（研究 §2.4 左列）、`listRuntimeAudits`（`:445-477`，D6 后无调用方） | `createAudit`、`listAudits`、IP 封禁段、`ensureSchema` 的其余 DDL |
| 前端 | analytics 的 intelligence 面板、tab 项、composable 分支、类型 | 其余六个面板 |
| i18n | `dashboard.intelligenceLab.*`、`menu.{intelligence,intelligenceLab,intelligenceChat}`、`sections.analytics.intelligence.*` | 审计动作标签 `intelligence.prompt*`、`intelligence.tool.*`（后者由 #2 补标签） |
| 依赖 | Nexus `package.json` 的 `@langchain/langgraph`、`@talex-touch/intelligence-uikit` | catalog 定义、core-app 与 `packages/tuff-intelligence` 的使用、uikit 包 |
| 测试 | 研究 §2.6 的 5 个文件；policy 测试中测死代码的段；analytics 相关断言（`analytics-page-performance.test.ts:132-134,274-276,407,536,579-581,644-649,751`）、`test/api/admin/analytics/intelligence.get.test.ts`、`intelligenceStore.runtime-audits.test.ts` | policy 测试 `:78-85`；`test/api/v1/intelligence/*` 等研究 §2.6 列为「不受影响」者 |

## 2. 裁剪 lab service 的方法

研究的可达性分析是一次性 AST 脚本、偏保守（属性名、类型引用也算边）。实施时：

1. 先按研究的区间删除，再跑 `tsc`/Nexus typecheck 让编译器找出遗漏的引用，而不是凭肉眼判断。
2. 删完后用同样的方法（TS 编译器 API 列顶层声明 + 从 6 个根 BFS）复跑一次，确认「不可达声明」为 0，并把脚本输出贴进本任务 `research/`。
3. 文件内风格（双引号 + 分号）保持原样，不顺手改格式。

## 3. 守卫负控的修法

三个守卫原本读已删页面的源码当负控样本，文件不存在就 `return`，于是永远通过。改为：

- 负控样本来自 `test/guards/fixtures/` 已有的 `intelligence-chat.buggy.vue.txt`、`intelligence-lab.buggy.vue.txt`（研究 G1，它们本就是守卫的正控样本）或从 `5e6579e05^` 取回的 blob（`d7fa8d8b…`、`7b46607c…`）固化成新 fixture；
- 去掉「文件不存在即跳过」的分支，改为样本缺失时测试失败（避免再次静默空转）。

## 4. 行为兼容

- 13 个 410 URL 变 404；无已知调用方（研究 §3.1 全仓扫描带正控）。
- `?section=intelligence` 走 analytics 现有的遗留 section 回落（`analytics-page-performance.test.ts` 已有该行为断言）。
- 共享表里本功能写入的历史行（`intelligence_audits` 中 `source=intelligence-agent-runtime|admin-intelligence-chat`、`admin_audits` 的 `intelligence.*`）保留，不做数据迁移。

## 5. 回滚

单个 PR，revert 即恢复。lockfile 变更随同一 PR 回滚。
