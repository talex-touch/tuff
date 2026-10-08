# Research: 10-01 退役 AI 后台页面的残留代码清理（必要性判断与删除边界）

- **Query**：`5e6579e05` 删除 `/admin/intelligence`（Tuff AI 工作台）、`/admin/intelligence-chat`（对话探针）及两个重定向壳页后，哪些代码只为它们服务、哪些与在线功能共用、按什么顺序删才能保持构建/测试/守卫为绿
- **Scope**：internal（整个 monorepo，排除 node_modules/dist/.output/.nuxt/.wrangler/.data）
- **Date**：2026-10-02
- **方法**：rg/grep、git log/show、TypeScript AST 可达性分析（只读 `node -e`，未落盘），未跑任何构建、测试、typecheck

## 0. 裁决表

路径默认相对 `apps/nexus/`。

| # | 项 | 位置 | 裁决 | 关键依据 |
|---|---|---|---|---|
| R1 | intelligence-agent 的 13 个在线 handler（prompts×3、prompt-bindings×3、providers、session×5、tool/approve） | `server/api/admin/intelligence-agent/**` | **删** | 全仓唯一调用方是已删的 Workspace；core-app/packages/plugins 零调用（§3.1） |
| R2 | 对话探针接口 | `server/api/admin/intelligence/chat.ts` | **删** | 唯一调用方是已删的 `intelligence-chat.vue`（`5e6579e05^:…/intelligence-chat.vue:98,240`） |
| R3 | 13 个 410 桩（lab×10 + agent/orchestrator×3）及其合同测试 | `server/api/admin/intelligence-lab/**`、`intelligence-agent/orchestrator/*`、`test/api/admin/intelligence-compat-retired.api.test.ts` | **删**（对外 410→404，见风险 R-5） | 桩的迁移目标就是 R1，R1 删后提示指向不存在的路由；无调用方；跟踪项已不在当前 TODO |
| U1 | `server/utils/intelligenceAgentGraphRunner.ts`（968 行） | — | **删** | 只被 R1 `session/stream.post.ts:3` 与两份测试引用 |
| U2 | `server/utils/intelligenceAgentRuntimeBridge.ts`（309 行） | — | **删** | 只被 U1（`:29-33`）与测试引用 |
| U3 | `server/utils/tuffIntelligenceRuntimeStore.ts`（634 行） | — | **删** | 引用方 = R1/R2/U1/U2 + lab service 的不可达段（§2.3） |
| U4 | `server/utils/tuffIntelligenceLabTools.ts`（255 行） | — | **删** | 只被 lab service 不可达段使用（`tuffIntelligenceLabService.ts:2954,3214,4971`） |
| U5 | `server/utils/tuffIntelligenceLabService.ts`（5,059 行） | §2.3 | **部分删**（约 2,900 行声明不可达） | 存活入口：v1 invoke/stream、credits/models、docs assistant、provider check |
| U6 | `server/utils/intelligenceStore.ts` 的 Prompt Registry 段 | `:2-6,14-15,35-95,182-210,285-315,637-917` | **部分删** | 审计 / IP 封禁 / runtime 审计查询仍被在线接口使用 |
| U7 | `intelligenceErrorContract.ts`、`tuffIntelligenceCapabilityMessages.ts`、`adminAuditStore.ts`、`auth.ts` | — | **保留（共享）** | v1 路由与 analytics 在用；`buildCapabilityMessages` 被 `sceneOrchestrator.ts` 使用 |
| C1 | i18n `dashboard.intelligenceLab` 整块 + `dashboard.sections.menu.{intelligence,intelligenceLab,intelligenceChat}` | en `i18n/locales/route/en/dashboard.ts:618-709,827,828,830`；zh `…/zh/dashboard.ts:615-706,823,824,826` | **删** | app 内零 `t()` 调用；服务端 `i18nKey` 的发送方全部在删除集内（§2.5） |
| C2 | `app/` 下的组件、composable、types、样式 | — | **无残留** | `5e6579e05` 已一并删除；全量 grep 为空（§2.5） |
| C3 | Nexus 依赖 `@langchain/langgraph`、`@talex-touch/intelligence-uikit` | `package.json:51,57` | **需老板拍板** | 删 U1 后 Nexus 源码零引用；删除要改 lockfile；uikit 包本身有独立 CI 和路线图 TI-02，不能连包删 |
| C4 | 审计动作标签 `intelligence.prompt*` ×4 | `app/pages/admin/audits.vue:95-98` | **保留（共享）** | `admin_audits` 没有保留期清理，历史行仍需可读、可筛（`audits.vue:83-85` 的注释说明了缺标签的后果） |
| A1 | 分析页 AI 面板（`/admin/analytics?section=intelligence`）及其接口、类型、测试和 spec 条目 | `app/pages/admin/analytics.vue:1247-1410`、`server/api/admin/analytics/intelligence.get.ts` 等（§3.4） | **需老板拍板** | 新数据的唯一生产者是 U1；删 U1 后面板只剩历史数据 |
| D1 | 5 张 D1 表（prompt×2、runtime×3） | §2.7 | **表保留**，只删建表代码；不在代码里 DROP | 生产库有数据；仓库已有带备份的受控删表先例 |
| P1 | `packages/utils/types/intelligence.ts:2119-2156` 中 8 个 prompt API 类型 | — | **保留** | 属于已发布的 `@talex-touch/utils` 公共类型；同类的 `TuffIntelligenceApprovalTicket` 仍被 core-app 使用 |
| G1 | 守卫 fixtures `intelligence-chat.buggy.vue.txt`、`intelligence-lab.buggy.vue.txt` | `test/guards/fixtures/` | **保留** | 它们是守卫的正控样本（`test/guards/helpers/fixtures.ts:39-56`），与页面是否存在无关 |
| G2 | AdminNav 墓碑断言 | `app/components/admin/AdminNav.routing.test.ts:170-189,210-219` | **保留** | 断言的是导航不暴露已删入口 |
| T1 | 测试删 5 改 1，守卫 3 处空转，CI 脚本 1 处 | §5 | **改** | — |
| X1 | 描述「现状」的文档 | §2.8 | **改**；历史记录不动 | — |
| X2 | `content/docs/guide/tips/intelligence-agent-playbook.{en,zh}.mdc` | — | **需老板拍板** | 这是通用的 Agent 模式指南，没有绑定 Nexus 后台页面 |

## 1. 背景事实与口径更正

- `5e6579e05` 删除了 `app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue`（blob `044339df`）、`app/pages/admin/{intelligence,intelligence-chat,intelligence-agent,intelligence-lab}.vue` 以及 `intelligence-chat.test.ts`。旧 Workspace 实际调用的接口如下（`git show 5e6579e05^:…IntelligenceAgentWorkspace.vue`）：
  - `session/trace`（`:668`）、`session/history`（`:725`）
  - `prompts` 的 GET/POST/DELETE（`:799,836,867`）、`prompt-bindings` 的 GET/POST/DELETE（`:802,896,923`）
  - `session/stream`（`:1200`）、`tool/approve`（`:1239`）
- **从来没有 UI 调用过的接口**：`providers.get.ts`、`session/heartbeat.post.ts`、`session/pause.post.ts`。对 `apps/nexus/app` 跑 `git log -S"session/heartbeat"` 和 `-S"session/pause"` 都没有结果；2 月之前的 lab 页（`0624e0c85^:…/dashboard/admin/intelligence-lab.vue:612,669,959,1002`）也只调了 trace、history、stream、approve。
- **10-01 之前就已经是死代码的**：`orchestrateIntelligenceLabStream`（`tuffIntelligenceLabService.ts:3776-4936`，1,161 行）。`0624e0c85`（2026-02-26）把 lab 的 stream 路由改成 410 桩之后，它就没有任何调用方了。
- **口径更正**：PRD 写的「intelligence-agent ×17」实际是 **16 个文件**（13 个在线 handler + 3 个 orchestrator 410 桩，`find … | wc -l` = 16）。加上 `intelligence/chat.ts`，在线 handler 共 14 个。

## 2. 残留清单

### 2.1 服务端路由（共 27 个文件）

| 文件 | 依赖 | 备注 |
|---|---|---|
| `intelligence-agent/prompts.{get,post,delete}.ts` | `intelligenceStore` 的 list/save/deletePromptRecord；post、delete 会写 `logAdminAudit` | `requireAdmin`；审计动作 `intelligence.prompt.{upsert,delete}`（`prompts.post.ts:62`、`prompts.delete.ts:23`） |
| `intelligence-agent/prompt-bindings.{get,post,delete}.ts` | list/save/deletePromptBinding | 审计动作 `intelligence.prompt-binding.*`（`prompt-bindings.post.ts:49`） |
| `intelligence-agent/providers.get.ts` | `listIntelligenceLabProviders` | 该函数仍被 `credits/models.get.ts:2,19` 使用，删的是路由，不是函数 |
| `intelligence-agent/session/{stream,trace,history,pause,heartbeat}` | U1、U3、lab service 的会话函数 | `stream.post.ts:152` 会下发 `i18nKey: 'dashboard.intelligenceLab.system.error'` |
| `intelligence-agent/tool/approve.post.ts` | `approveIntelligenceLabTool` 加审计 | 审计动作 `intelligence.tool.{approve,reject}`（`:35`），`audits.vue` 里本来就没有这两个标签 |
| `intelligence-agent/orchestrator/{plan,execute,reflect}.post.ts` | 无 | 410，提示「改用 `/session/stream`」（`:3-5`） |
| `intelligence/chat.ts` | U3 的 `get/upsertRuntimeSession`、`streamIntelligenceCapability` | 会话 id 为 `tuff-intelligence-chat-<userId>`（`:12,48`），对话历史写入 runtime sessions 表 |
| `intelligence-lab/**`（10 个） | 无 | 都是 410 桩，提示「改用 `/api/admin/intelligence-agent/*`」（`:4`）；**在任何鉴权之前就直接抛错** |

### 2.2 服务端 utils 依赖图

```
R1 stream ─┬─> U1 GraphRunner ─┬─> U2 RuntimeBridge ─> U3
           │                   ├─> U3 RuntimeStore
           │                   ├─> U5 lab: plan/execute/reflect/buildFinal/followUp（不可达段）
           │                   └─> intelligenceStore.createAudit（共享）
R1 其余 ───┼─> U3 / U5 会话函数 / intelligenceStore prompt 段
R2 chat ───┴─> U3 + U5.streamIntelligenceCapability（共享）
U5 不可达段 ─> U3（import :61-75）、U4（import :77-81）、prompt 函数（import :57-59）
```

### 2.3 `tuffIntelligenceLabService.ts` 的可达性

**方法**：用 TS 编译器 API 解析顶层声明。只要某个声明体里出现与另一个顶层名同名的标识符，就连一条边（属性名、类型引用也算，会高估存活集，所以结论偏保守）。从 6 个存活根出发做 BFS：`invokeIntelligenceCapability`、`streamIntelligenceCapability`、`listIntelligenceLabProviders`、`resolveIntelligenceProviderRuntimeContexts`、`probeIntelligenceLabProvider`、类型 `NexusIntelligenceInvokePayload`。结果：可达声明 1,885 行，不可达声明 **2,900 行**。

不可达区间：

- 类型：`:88-111`、`:200-204`（ProviderRequestError）、`:215-311`
- 常量：`:313`、`:316-318`、`:355-368`（`AGENT_PROMPT_CAPABILITY`、`promptBootstrapCache` 等）
- 辅助函数：
  - `:403-453`（`resolveAgentPromptInstruction`）
  - `:459-505`（注意 `createId` `:455-457` 仍被存活代码使用）
  - `:513-518`
  - `:644-815`（含 `isReadOnlyTool`、`shouldContinueOnActionFailure`）
- 模型阶段：`:2520-2800`（intent / narrative / summarize）
- 会话与阶段函数：`:2821-3774`（heartbeat/pause/history/plan/execute/reflect/buildFinal/followUp）
- 编排：`:3776-4936`（`orchestrateIntelligenceLabStream`）
- 尾部：`:4938-5059`（approve/sanitize/normalizeLabMessages）

裁剪后会变成无用 import 的有：

- `TuffIntelligenceApprovalTicket`（`:9`）、`normalizeCapabilityMessages`（`:18`）、`getUserById`（`:21`）
- `resolvePromptTemplateFromRegistry/savePromptBinding/savePromptRecord`（`:57-59`）
- 整段 runtime store import（`:61-75`）、`normalizeLocaleCode`（`:76`）、lab tools import（`:77-81`）

`createAudit`（`:56`）保留。

存活的共享调用方（同时也是这次扫描的正控）：

- `invokeModel`（`:927`）、`invokeModelStream`（`:1093`）被 probe（`:1303`）、invoke（`:2352`）、stream（`:2453`）调用
- `isRetryableInvokeError`（`:578`）在 `:1010,1189` 被调用，属于存活代码

### 2.4 `intelligenceStore.ts` 拆分

| 删 | 留 |
|---|---|
| import `resolveIntelligencePromptTemplate` 及 prompt 类型（`:2-6`） | `createAudit`（`:329`）：docs assistant、lab invoke 在用 |
| 常量 `PROMPT_REGISTRY_TABLE`、`PROMPT_BINDINGS_TABLE`（`:14-15`） | `listAudits`（`:383`）：`dashboard/intelligence/{audits,overview,usage}.get.ts` |
| `ensureSchema` 中 prompt 两表和两个索引的 DDL（`:35-95`） | `listRuntimeAudits`（`:445-477`）：A1 面板，取决于老板决定 |
| 行类型（`:182-210`）、mapper（`:285-315`） | IP 封禁 `:479-635`：`dashboard/intelligence/ip-bans.get.ts`、`adminRiskActions.ts:6`、docs assistant 的 `isIpBanned` |
| 整个 Prompt Registry 段（`:637-917`） | 其余 `ensureSchema` DDL：audits、ip_bans 表 |

注意 `ensureSchema` 是共享函数，只能删其中 prompt 相关的语句，不能整函数删。

### 2.5 客户端与 i18n

- `app/` 的全量 grep 结果：`intelligence-agent|intelligenceLab|intelligence-lab|intelligence/chat|intelligenceChat|IntelligenceAgentWorkspace` 只命中 `AdminNav.routing.test.ts`（G2）和 `DocsSidebar.vue:478`（playbook 文档链接）。`app/types`、`app/composables`、`shared/` 里都没有 lab/agent 类型。
- i18n：
  - `dashboard.intelligenceLab` 的键只被已删的 Workspace 使用：它用 `labText`/`t` 调用了 50 个不同的键，chat 页面没有 i18n，用的是硬编码中文。
  - 服务端以 `i18nKey` 形式下发这些键的位置都在删除集内：
    - `intelligenceAgentGraphRunner.ts:314-315,388,478,693,767,851`
    - `intelligenceAgentRuntimeBridge.ts:234`
    - `session/stream.post.ts:152`
    - lab service `:3937-4734`（都在 `orchestrateIntelligenceLabStream` 里）
  - 菜单键 `dashboard.sections.menu.{intelligence,intelligenceLab,intelligenceChat}` 在 app 内零引用。正控：同一次扫描命中了 `AdminNav.vue:142` 的 `menu.intelligenceOverview`。
  - `app/utils/dashboard-admin-i18n-coverage.test.ts` 只检查「代码用到的键是否已定义」，删除未用的键不受影响。
- 依赖：
  - `@talex-touch/intelligence-uikit`（`package.json:57`）在 Nexus 里唯一的 import 就是已删的 Workspace（`5e6579e05^:…:8-9`）。
  - `nuxt.config.ts` 的 `components.dirs`（`:212-229`）和 `build.transpile`（`:402-406`）都不包含它。
  - Nexus 里的 `<TxAiMessage>`（`DocsComponentsGallery.vue:3850`、`AiSuiteChatShowcaseDemo.vue:19,113`）来自 tuffex 的 `@tuffex-components/ai-elements`，不是 uikit。
  - `@langchain/langgraph`（`package.json:51`）在 Nexus 里只被 U1 `:3` 使用；core-app（`package.json:105`）和 `packages/tuff-intelligence`（`:64`）仍然通过 catalog 使用它。

### 2.6 测试、守卫与脚本

| 文件 | 动作 | 说明 |
|---|---|---|
| `test/api/admin/intelligence-agent/session/stream.post.test.ts`（199 行） | 删 | 只测 R1 |
| `test/api/admin/intelligence-agent/session/trace.get.test.ts`（168 行） | 删 | 只测 R1 |
| `test/api/admin/intelligence-compat-retired.api.test.ts`（55 行） | 删（随 R3） | lab 段 `:10-21`、orchestrator 段 `:23-27,44-54` |
| `server/utils/__tests__/intelligence-agent-graph-runner.test.ts`（209 行） | 删 | 只测 U1 |
| `server/utils/__tests__/intelligence-agent-runtime-bridge.test.ts`（169 行） | 删 | 只测 U1/U2 |
| `server/utils/__tests__/intelligence-agent-policy.test.ts` | **改** | `:29-76` 测的是死代码；`:78-85` 是全仓**唯一**覆盖存活函数 `isRetryableInvokeError` 的用例，要保留或迁走 |
| `scripts/intelligence/verify-intelligence.mjs:54`（dev）、`:66`（release） | **改** | 显式列出了两个要删的测试路径；CI 通过 `.github/workflows/intelligence.yml:53` → `mise run intelligence:verify`（`mise.toml:49`）执行 |
| `test/guards/admin-route-reachability.test.ts:223-228` | **改** | 从 10-01 起已经空转：`if (!lab) return`；`:10-13,129-131,213` 的注释也过期了 |
| `test/guards/page-toplevel-throw.test.ts:66-71` | **改** | 负控读的是已删的 `app/pages/admin/intelligence-lab.vue`，`fileExists` 为假就直接 return |
| `test/guards/form-submit-button.test.ts:79-86` | **改** | 同上，读的是 `intelligence-chat.vue` |

守卫 README 要求每个守卫都有负控（`test/guards/README.md:71-73`）。修复后的页面版本可以从 git 取：`intelligence-chat.vue` 的 blob 是 `d7fa8d8b0f99a55f22354513f87405b60675e774`，`intelligence-lab.vue` 的 blob 是 `7b46607c08ebf6704c913cf87ec935c477207498`，都在 `5e6579e05^`。

关于 vitest 的行为：根据 vitest 3.2.7 源码，只有在**所有**过滤条件一个文件都匹配不到时才会报「No test files found」并以 1 退出（`node_modules/.pnpm/vitest@3.2.7_…/dist/chunks/index.VByaPkjc.js:210`）。所以单删测试文件不会让 CI 变红，但会在门禁脚本里留下失效路径，应该在同一个提交里改掉。

以下项已核实**不受影响**：

- `test/api/v1/intelligence/{invoke.post,stream.post,invoke.api}.test.ts`：只 mock 存活导出（`:19-21` / `:11-13`）
- `server/utils/intelligenceProviderHealthCheck.test.ts:8-10`
- 4 个 lab service 存活测试：用 `importActual` 加只覆盖 `createAudit` 的方式 mock `./intelligenceStore`
- `check:api-routes`：`build/check-server-api-route-tree.mjs:9-14` 只禁止 server/api 下出现测试文件
- `scripts/check-orphan-tests.mjs`：Nexus 的覆盖根是整个 `apps/nexus`
- `.github/module-size-ratchet.json`：只管 core-app 的 4 个文件
- `app/pages/admin/audits-page-behavior.test.ts`：没有钉这 4 个标签
- Nexus 里没有快照文件
- `mutation-audit-logging.api.test.ts`：没有覆盖 prompt 路由

### 2.7 D1 表（全部在代码里惰性建表，没有迁移文件，仓库里也没有其他引用）

| 表（含索引） | 建表位置 | 内容 |
|---|---|---|
| `intelligence_prompt_registry`（+`idx_…_scope`） | `intelligenceStore.ts:35-68` | 按管理员 `user_id` 存的 prompt；lab service 会自动写入 `<capability>.default`（`:421-447`） |
| `intelligence_prompt_bindings`（+`idx_…_prompt`） | `intelligenceStore.ts:70-95` | capability 到 prompt 的绑定 |
| `intelligence_runtime_sessions`（+1 个索引） | `tuffIntelligenceRuntimeStore.ts:249-272` | 包含 `history_json`，即**管理员对话原文** |
| `intelligence_runtime_trace_events`（+2 个索引） | `:274-297` | trace 的 payload |
| `intelligence_runtime_checkpoints`（+1 个索引） | `:299-315` | checkpoint 状态 |

共享表里还留有本功能写入的行：

- `intelligence_audits` 中 `metadata.source` 为 `intelligence-agent-runtime` 或 `admin-intelligence-chat` 的行
- `admin_audits` 中 `intelligence.prompt*` 和 `intelligence.tool.*` 动作的行；`server/utils/adminAuditStore.ts` 没有保留期清理

### 2.8 文档

| 文件 | 动作 |
|---|---|
| `content/docs/dev/intelligence/index.{en,zh}.mdc:12`：「Prompt Registry admin surface」 | 改（`:11` 的 LangGraph 条目同时适用于 core-app 和 tuff-intelligence，保留） |
| `content/docs/guide/tips/index.{en,zh}.mdc:18`：指向 `/dashboard/admin/intelligence-agent` | 改 |
| `content/docs/dev/intelligence/schema-migration.{en,zh}.mdc:52`：称 prompt、runtime 会话「继续保留」 | 改 |
| `content/docs/dev/intelligence/langchain-agent.{en,zh}.mdc:8,14,48`：Nexus Lab runtime 的映射 | 改，或标注已退役（页面其余内容涉及 core-app） |
| `docs/plan-prd/TODO-AI.md:48`、`docs/plan-prd/TODO-BACKLOG-LONG-TERM.md:34,58`：把 R1 写成「现行唯一入口」 | 改 |
| `docs/plan-prd/01-project/CHANGES.md` | 追加一条新记录；不改 `:127,609,619` 的旧条目 |
| `notes/update_2.4.7.{zh,en}.md:110`、`docs/engineering/tuff-intelligence-rollout-todo.md`（`:3` 已标注 Historical）、`docs/engineering/reports/**`、已归档任务 | 不动（历史记录） |
| `.trellis/spec/**` | 唯一相关的是 `frontend/component-guidelines.md:73`（列出七个分析面板，含 intelligence），随 A1 决定 |

## 3. 共享性核查

### 3.1 路由字符串的全仓扫描与正控

- **Nexus `app/`**：所有 `/api/admin/*` 字面量共 30 处。其中**有** `/api/admin/analytics/intelligence`（`composables/useAdminAnalyticsData.ts:122`，可作正控），**没有** intelligence-agent、intelligence-lab、intelligence/chat。动态拼接方面，只有 `users.vue` 的 `` `/api/admin/users/${entry.id}/${segment}` ``，没有 `` `/api/admin/${…}` `` 这种首段动态的写法，也没有 base 常量拼接。
- **core-app、packages、plugins**：`/api/admin` 零命中。正控：同一类扫描在 core-app src 里找到 83 个 `/api/` 字面量，其中有 `/api/v1/intelligence/invoke|stream`（`apps/core-app/src/main/modules/ai/providers/nexus-provider.ts:218,222`）；packages 和 plugins 里也找到了 `/api/v1/intelligence/stream`、`/api/v1/sync/*` 等。
- core-app 的 `tuff-intelligence-storage-adapter.ts:25-30` 中的 `'intelligence/prompt-bindings'` 是**本地 sqlite config 键**，和 Nexus D1 无关。

### 3.2 Prompt 和 binding 是否被在线运行时读取：**否**

- prompt 行唯一的读取路径是 `resolveCapabilityPromptTemplate`（`intelligenceStore.ts:894-917`）。它唯一的调用方是 `resolveAgentPromptInstruction`（lab `:403-453`，经 `:57` 别名导入），只服务于 `agent.*` 能力（`:356-366`），而这些都不可达（§2.3）。
- v1 invoke/stream、docs assistant、scene 路由都不读 prompt 表。
- 因此删掉管理接口**不会**让任何在线行为失去管理入口。prompt 本来就只影响 Agent 运行时，而 Agent 运行时也在本次删除范围内。

### 3.3 RuntimeStore 是否支撑任何用户可见功能：**否**

- 它的 import 方只有：R1（`trace.get.ts:3`、`stream.post.ts:4`、`pause.post.ts:1`）、R2（`chat.ts:3`）、U1（`:6-15`）、U2（`:8-11`）、lab（`:61-75`，不可达）。
- `server/api/v1/**`、`server/api/dashboard/**`、`server/plugins/*`（4 个无关文件）、维护/保留期清理、隐私/账号删除代码都没有引用这三张表。`intelligence_runtime_` 只出现在 store 文件本身。

### 3.4 仍在线的共享方（必须保留）

| 共享对象 | 在线调用方 |
|---|---|
| `invokeIntelligenceCapability` / `streamIntelligenceCapability` | `server/api/v1/intelligence/invoke.post.ts:7`、`stream.post.ts:8`（core-app 默认的 Nexus provider） |
| `listIntelligenceLabProviders` | `server/api/credits/models.get.ts:2,19`（`requireVerifiedEmail`，面向普通用户） |
| `resolveIntelligenceProviderRuntimeContexts` | `server/api/docs/assistant.post.ts:12` |
| `probeIntelligenceLabProvider` | `intelligenceProviderHealthCheck.ts:5,170` → `server/api/dashboard/provider-registry/providers/[id]/check.post.ts` |
| `createAudit`、`listAudits`、IP 封禁 | docs assistant、`dashboard/intelligence/*`、`adminRiskActions.ts:6` |
| `normalizeNexusIntelligenceTransportError` | v1 两个路由、`admin/analytics/intelligence.get.ts:5` |

**分析页 AI 面板（A1）属于「在线但依赖被删功能产出」**：

- `admin/analytics/intelligence.get.ts:86` 调用 `listRuntimeAudits`，后者只取 `metadata.source` 为 `intelligence-agent-runtime` 或 `intelligence-lab-runtime` 的行（`intelligenceStore.ts:458-459`）。
- 全仓的写入方只有 U1（`intelligenceAgentGraphRunner.ts:426-429,539-542`），以及死函数 `orchestrateIntelligenceLabStream` 里的 `:3984-3987,4148-4151,4833-4836`。
- 面板展示的是成功率、审批命中、checkpoint 丢失、工具失败分布、最近运行记录（`analytics.vue:1247-1410`）；相关代码还有 `useAdminAnalyticsData.ts:48-50,119-129`、`types/admin-analytics.ts:168`。
- 10-01 之后已经没有 UI 路径能产生新数据；清理之后则彻底没有任何路径。

## 4. 删除顺序（保持构建、测试、守卫为绿）

1. **第一步（必须在同一个提交里完成）**
   - 删 R1（16 个文件）、R2、intelligence-lab（10 个）。
   - 删 U1–U4。
   - 按 §2.3 裁剪 U5，包括清掉失效的 import。
   - 按 §2.4 裁剪 U6。
   - 删 §2.6 中 5 个测试文件，改 policy 测试，改 `verify-intelligence.mjs:54,66`。
   - 必须原子提交的原因：U5 在模块顶层 import 了 U3/U4（`:61-81`）和 prompt 函数（`:57-59`）。如果先删文件、后裁 U5，`v1/intelligence/*`、`credits/models`、`docs/assistant`、provider check 都会在模块加载时失败。
2. **第二步：i18n（C1）**。en/zh 两边对称删除。删之前确认第一步已经去掉所有服务端发送方，否则旧 payload 会带着孤儿 `i18nKey`。
3. **第三步：守卫的 3 个空转用例和过期注释**（§2.6）。fixtures 保留。
4. **第四步：文档**（§2.8），并追加一条 CHANGES 记录。
5. **第五步：需要老板拍板的项**：A1 面板、C3 依赖（要动 lockfile）、D1 删表（走受控脚本）、X2 playbook。

建议实施者自行跑的验证（本次未执行）：

- `pnpm -C apps/nexus exec vitest run server/utils test/api/v1/intelligence test/api/admin test/guards`
- `node apps/nexus/build/check-server-api-route-tree.mjs`
- `mise run intelligence:verify`
- Nexus typecheck：注意项目记录里提到，`pnpm typecheck` / `nuxt typecheck` 会杀掉正在运行的 :3200 dev server。

## 5. 需要更新的测试、守卫和脚本（汇总）

- **删除**：`test/api/admin/intelligence-agent/session/stream.post.test.ts`、`…/trace.get.test.ts`、`test/api/admin/intelligence-compat-retired.api.test.ts`、`server/utils/__tests__/intelligence-agent-graph-runner.test.ts`、`…/intelligence-agent-runtime-bridge.test.ts`
- **修改**：`server/utils/__tests__/intelligence-agent-policy.test.ts`、`scripts/intelligence/verify-intelligence.mjs:54,66`、`test/guards/admin-route-reachability.test.ts:10-13,129-131,213,223-228`、`test/guards/page-toplevel-throw.test.ts:11,66-71`、`test/guards/form-submit-button.test.ts:16,79-86`
- **取决于 A1**（如果删面板）：`test/api/admin/analytics/intelligence.get.test.ts`、`server/utils/intelligenceStore.runtime-audits.test.ts`、`app/pages/admin/analytics-page-performance.test.ts`（`:132-134,274-276,407,536,579-581,644-649,751`）、spec `component-guidelines.md:73`、分析相关的 i18n 键 `dashboard.sections.analytics.intelligence.*`

## 6. 风险

- **R-1 原子性**：见 §4 第一步。拆开提交会打断面向用户的 v1 AI 调用，以及积分模型列表、文档助手、provider 检测。
- **R-2 分析面板静默变空**：A1 不会报错，但新数据归零，最终变成空面板。需要老板决定：作为历史视图保留（`days` 最长 365），还是一并删除并更新 spec。
- **R-3 生产数据**：5 张表有数据，其中含管理员对话原文（`history_json`）。当前**没有**任何保留期清理或账号删除路径会清理它们。删代码不等于删数据。如果要删表，应参照 `scripts/drop-legacy-intelligence-providers.mjs` 加 `provider:legacy:drop` 的先例（`schema-migration.en.mdc:42-50`：启动时不执行破坏性 DDL、先导出 D1 备份、需要显式确认），不要把 `DROP` 写进代码。
- **R-4 公共 SDK**：P1 的类型在已发布的 `@talex-touch/utils` 里，本次不动。uikit 包有自己的 CI（`.github/workflows/package-intelligence-uikit-ci.yml`）和路线图（`docs/plan-prd/04-implementation/Launcher-TuffIntelligence-QuickReview-Roadmap-2026-07-07.md:36`），不能因为 Nexus 不再使用就删包。
- **R-5 410→404**：13 个 URL 的对外状态码会改变。
  - 来历：桩由 `0624e0c85`（2026-02-26）创建；合同测试由 `d171d0572`（2026-05-21）在 P0-AI-COMPAT 下加入，当时的目标是「不返回可消费的占位 payload」，返回 404 同样满足。
  - 现状：`P0-AI-COMPAT` 在当前 `docs/` 里 0 处命中；兼容中间件已在 `d63c00de2`（2026-05-11）硬切。
  - 对比：仓库里其他 410 桩都指向仍然存在的替代接口，并服务于已安装的客户端（例如 `server/api/sync/pull.get.ts:5-6`）。这批桩的迁移目标会消失，也没有任何已知调用方。
- **R-6 空转守卫**：§2.6 中 3 处从 10-01 起就已经无法失败，和是否清理无关，但会让人误以为有负控。
- **R-7 旧页面 URL 404**：`/admin/intelligence*` 页面已在 10-01 删除，`nuxt.config.ts` 没有对应的 `routeRules` 重定向。旧书签会落到 404。这不属于代码清理范围。
- **R-8 并行会话**：本次调研时，目标的 server、test、i18n、pages/admin、scripts/intelligence 文件在工作区都是干净的；但 `app/components/DocsSidebar.vue` 和若干 `.trellis/spec` 文件正被其他会话修改，涉及 X2 时要协调。

## Caveats / Not Found

- 没有运行任何测试、构建或 typecheck。vitest 的行为是读 3.2.7 源码得出的；可达性分析是一次性的 AST 脚本，会高估存活集，所以删除集偏保守。
- 无法访问生产 D1，表里的行数和数据量未知。
- 去掉 langgraph 对 Worker bundle 体积的影响没有测量；`build/check-worker-bundle.mjs` 里没有针对 langgraph 的规则。
- `.trellis/spec/**` 中没有提及 intelligence-agent、lab、chat、prompt registry（grep 为空）；唯一相关的是 `component-guidelines.md:73`。
