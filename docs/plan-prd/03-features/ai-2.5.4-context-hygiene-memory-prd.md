# PRD: Tuff 2.5.4 ContextHygiene 与自动记忆治理

> 更新时间：2026-06-27
> 状态：Planned / Direction Locked
> 目标版本：2.5.4
> 适用范围：Tuff Intelligence 会话上下文、自动压缩、记忆沉淀、检索注入与 Prompt 预算治理

## 1. 最终目标

2.5.4 将 **TuffIntelligence ContextHygiene** 抽成 Tuff Intelligence 的上下文治理层：用户可以随时随地向 Tuff 提问，但系统不会默认继承无限增长的长上下文，也不会让旧任务、旧会话或临时噪音污染当前回答。

产品目标是形成“新会话有边界、旧会话可检索、稳定事实可记忆、长上下文可压缩、注入内容可解释”的用户体验；工程目标是以本地 SQLite 为 SoT，建立 Session / Checkpoint / Memory / Compression / ContextPackage 的统一数据模型与可回放构建流程。

## 2. 背景与问题

当前 AI 入口正在从单点问答走向桌面 Agent 工作台。随着 CoreBox AI Ask、OmniPanel Writing Tools、Workflow、Assistant 与插件能力逐步接入，单纯把所有历史对话追加进 prompt 会带来以下问题：

- 上下文持续膨胀，token 成本与延迟不可控。
- 旧任务会误导新问题，尤其是“随口问一句”的轻量场景。
- 临时信息、敏感信息和稳定偏好混在一起，难以治理、删除和同步。
- 历史对话无法解释为什么被注入，也无法稳定回放 prompt 构建过程。
- 长会话缺少自动归档和结构化摘要，导致后续“继续刚才”只能依赖完整原文。

2.5.4 的目标不是简单“总结聊天记录”，而是把上下文变成一套可管理的本地优先数据资产。

## 3. 产品原则

- **默认轻上下文**：新问题默认只使用当前输入、必要系统规则和少量工作状态。
- **边界先于继承**：跨 session 继承必须由显式意图或相关性召回证明。
- **旧会话不污染新会话**：旧 session 原文不默认注入 prompt，只可作为检索候选。
- **记忆不同于聊天记录**：只有经过分类、策略检查和可删除治理的信息才能成为 MemoryItem。
- **压缩必须结构化**：自动压缩保留目标、决策、约束、未完成事项和记忆候选，而不是普通自然语言流水账。
- **注入必须可解释**：每个进入 ContextPackage 的历史、记忆或检索片段都要能解释来源、原因和预算占比。
- **本地优先与可删除**：会话、checkpoint、摘要、记忆和索引默认本地保存，用户可查看、禁用、删除。

## 4. 范围与非目标

### Stable 范围

- Session 生命周期：active / archived / expired，支持长时间未活跃自动开启新会话。
- Checkpoint 机制：`session_start`、`session_end`、`task_switch`、`auto_prune`、`manual_reset`、`compression_snapshot`、`memory_snapshot`。
- Context Scope 判定：继续当前任务、新话题、临时问答、显式继续历史、需要检索历史。
- Rolling Summary：按 token、轮次、空闲、任务切换和手动重置触发结构化压缩。
- MemoryCandidate 提取：从交互中提取用户偏好、项目事实、任务事实、知识片段和临时信息。
- Memory policy：敏感信息默认不存；长期记忆需要分类、置信度、scope、来源和删除能力。
- ContextPackage 构建：按 PromptBudget 组装系统规则、当前输入、最近 turns、session 摘要、相关记忆和检索片段。
- UI 状态提示：显示轻上下文、当前任务、已召回历史、新会话 checkpoint、记忆保存/忽略状态。

### Beta / Experimental

- 自动长期记忆保存：首版可先进入“建议保存”或“可撤销保存”模式。
- 向量召回：可复用 2.5.3 embeddings / rerank 增强相似度，不作为 MVP 唯一路径。
- 记忆衰减：按 TTL、使用次数、冲突和用户反馈进行降权或归档。
- 多设备记忆同步：只允许密文 payload 或引用，需等待 Sync / Key 管线满足安全约束。
- Agent 长任务 checkpoint：为 Workflow / Background Automation 提供更细粒度的任务快照。

### 非目标

- 不把所有历史对话迁入 prompt。
- 不用 LangChain Memory 直接替代 Tuff 自己的 Session / Checkpoint / Memory SoT。
- 不把业务明文 dump 成 JSON 同步或落盘为可同步明文。
- 不保存 API key、token、恢复码、口令或用户未授权的隐私信息为普通记忆。
- 不在 2.5.4 承诺完整多设备加密记忆同步、全量向量数据库或跨应用自动读取私有内容。

## 5. 核心概念

| 概念 | 说明 |
| --- | --- |
| Session | 一段连续任务或话题的上下文容器。 |
| Turn | 一次用户或助手交互，归属某个 session。 |
| Checkpoint | 上下文边界事件，标记新会话、任务切换、自动压缩、手动重置等关键节点。 |
| WorkingContext | 当前 prompt 可直接使用的短上下文。 |
| CompressionSnapshot | 对长会话的结构化压缩结果。 |
| MemoryCandidate | 从 turn 或 snapshot 中提取出的待评估记忆候选。 |
| MemoryItem | 已通过策略检查并可被检索、禁用、删除的正式记忆。 |
| ContextPackage | 最终送入模型的上下文包，包含来源、预算和注入原因。 |

## 6. Session Boundary 规则

### 自动开启新会话

满足任一条件时，系统应创建新的 session 并写入 `session_start` checkpoint：

- 长时间未活跃，例如默认超过 2 小时，用户可配置为 30 分钟 / 2 小时 / 1 天。
- ScopeDetector 判定为显式新话题，且与当前 session 目标弱相关。
- 用户点击“新会话”“清理上下文”“不带历史问”。
- 当前 session 已 archived / expired。
- 当前上下文超过硬预算且压缩后仍无法安全承载当前任务。

规则优先级：

```text
manual_reset > explicit_new_topic > long_inactivity > topic_drift > token_overflow
```

### 新会话继承策略

- 新 session 默认不继承旧 session 原文。
- 旧 session 的摘要和 turns 只能通过 RetrievalAssembler 相关性召回进入 ContextPackage。
- 用户显式说“继续刚才”“接着上次那个 PRD”时，可优先检索最近 archived session summary。
- 用户显式说“不参考历史”时，ContextScope 强制为 `none`，长期偏好以外的历史不注入。
- 长期用户偏好可跨 session 使用，但必须来自 MemoryItem，并展示为“使用了偏好记忆”。

## 7. Checkpoint 设计

```ts
type CheckpointType =
  | 'session_start'
  | 'session_end'
  | 'task_switch'
  | 'auto_prune'
  | 'manual_reset'
  | 'memory_snapshot'
  | 'compression_snapshot'

interface ContextCheckpoint {
  id: string
  sessionId: string
  type: CheckpointType
  reason: string
  summary?: string
  contextScope: 'none' | 'light' | 'session' | 'retrieval'
  metadata?: Record<string, unknown>
  createdAt: number
}
```

Checkpoint 是上下文边界，不是聊天记录。它用于后续判断“从哪里开始旧上下文不应自然影响新回答”，也用于回放 prompt 构建和调试自动压缩策略。

## 8. 记忆分层

| 层级 | 生命周期 | 默认注入 | 示例 |
| --- | --- | --- | --- |
| 临时上下文 | 当前输入 / 最近 turns / 当前 UI 状态 | 是，仅限当前任务 | 刚截图里的按钮、当前选中文本 |
| 会话摘要 | session 生命周期，可归档 | 仅当前 session 默认注入 | 当前目标、已确认决策、未完成事项 |
| 任务记忆 | 项目或 workspace 维度 | 相关时召回 | 这个项目 UI 优先用 TuffEx |
| 用户偏好 | 全局或设备维度 | 可轻量注入 | 默认中文回复、偏好简洁输出 |
| 知识记忆 | 可检索索引 | 相关时召回 | 文档片段、代码说明、历史决策 |
| 敏感记忆 | 默认拒绝普通保存 | 否 | API key、token、恢复码、私人身份信息 |

MemoryItem 建议结构：

```ts
interface MemoryItem {
  id: string
  type: 'preference' | 'project' | 'task' | 'knowledge' | 'temporary'
  scope: 'global' | 'workspace' | 'project' | 'session'
  content: string
  summary: string
  tags: string[]
  confidence: number
  sourceSessionId?: string
  sourceTurnId?: string
  privacyLevel: 'normal' | 'sensitive' | 'secret'
  ttl?: number
  enabled: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
  usageCount: number
}
```

## 9. 记忆生命周期

```text
Observe → Extract Candidate → Classify → Policy Check → Store/Discard → Retrieve → Use/Decay/Delete
```

### 记忆候选提取

MemoryExtractor 可从用户输入、助手确认、CompressionSnapshot 和 checkpoint 中提取候选。候选必须包含来源 turn、分类、置信度、敏感级别和建议 scope。

```ts
interface MemoryCandidate {
  content: string
  summary: string
  proposedType: MemoryItem['type']
  proposedScope: MemoryItem['scope']
  confidence: number
  privacyLevel: MemoryItem['privacyLevel']
  sourceTurnId?: string
  reason: string
}
```

### 保存策略

- 用户明确要求“记住”：可直接保存普通偏好/项目事实，但仍需敏感策略检查。
- 模型自动提取：首版建议进入“建议保存”或“保存后可撤销”模式。
- 临时事实：默认只留在 session summary，不升为长期记忆。
- 敏感内容：默认不保存为普通 MemoryItem；如未来支持，必须走系统安全存储或密文引用。
- 冲突记忆：新旧偏好冲突时保留新版本，并记录 supersedes link。

## 10. 自动压缩策略

### 触发条件

- prompt 估算超过模型上下文预算的 70%。
- session turn 数超过阈值，例如 20 轮。
- session 长时间未活跃，即将归档。
- ScopeDetector 检测到任务切换。
- 用户手动开启新会话或清理上下文。
- 检索注入前需要把旧 turns 压成摘要以腾出预算。

### CompressionSnapshot

```ts
interface CompressionSnapshot {
  goal?: string
  currentState?: string
  decisions: string[]
  constraints: string[]
  artifacts: string[]
  openQuestions: string[]
  memoryCandidates: MemoryCandidate[]
  discarded: Array<{ reason: string; hint: string }>
  sourceTurnRange: { fromTurnId: string; toTurnId: string }
  createdAt: number
}
```

压缩输出必须结构化、可覆盖旧摘要、可追溯来源 turn，并写入 `compression_snapshot` checkpoint。压缩失败时不得删除原 turns，只能降级为更短的最近 turns + 明确 degraded reason。

### Compression 防污染 guard

Compression prompt 必须明确区分用户确认事实、助手推测、被用户否定的信息和过期信息；输出必须通过 schema 校验和 sourceTurnRange 校验。

```ts
interface CompressionDecision {
  snapshot: CompressionSnapshot
  factStates: Array<{
    text: string
    state: 'confirmed' | 'assistant-claimed' | 'user-rejected' | 'stale'
    sourceTurnIds: string[]
  }>
  blockedMemoryCandidates: Array<{ reason: string; sourceTurnId?: string }>
  warnings: Array<'schema-invalid' | 'source-missing' | 'privacy-redacted' | 'low-confidence'>
}
```

- `assistant-claimed` 和 `stale` 可以进入 session summary，但不得自动进入长期 memory。
- `user-rejected` 只能作为 negative context，用于避免重复错误，不得进入 MemoryCandidate。
- sourceTurnRange 之外的事实必须丢弃，避免模型凭空补写历史。
- 压缩前后必须保留旧 summary 版本，直到新 snapshot 通过 CAS 写入。

## 11. ContextPackage 构建流程

```text
用户输入
→ ScopeDetector 判断当前问题是否继承 session
→ SessionBoundaryManager 判断是否新建 session / checkpoint
→ ContextPruner 裁剪无关 turns
→ MemoryRouter 决定需要哪些记忆
→ RetrievalAssembler 检索历史摘要、知识和项目片段
→ PromptBudgetManager 分配 token
→ ContextPackageBuilder 组装 prompt
→ 模型回答
→ PostRunCompressor 更新摘要、checkpoint 和记忆候选
```

### prepare/finalize 时序

```text
prepareTurn(input)
  1. load feature flags + settings
  2. load current session snapshot with lock version
  3. run deterministic scope rules, optionally run classifier
  4. apply boundary action and write checkpoint if needed
  5. collect recent turns / summary / memories / retrieval candidates
  6. filter by scope, privacy, tombstone, permissions
  7. apply prompt budget and build ContextPackage
  8. write metadata-only ContextPackageLog
  9. return PreparedContext

provider.invoke(contextPackage)

finalizeTurn(result)
  1. idempotency check
  2. persist user/assistant turns according to privacy policy
  3. update session lastActiveAt and provider trace metadata
  4. enqueue compression / memory extraction if enabled
  5. record token delta and degraded warnings
```

建议 ContextPackage 结构：

```ts
interface ContextPackage {
  sessionId: string
  scope: 'none' | 'light' | 'session' | 'retrieval'
  systemRules: string[]
  currentInput: string
  recentTurns: string[]
  sessionSummary?: CompressionSnapshot
  memories: Array<{ item: MemoryItem; reason: string }>
  retrievals: Array<{
    sourceId: string
    excerpt: string
    reason: string
    citation?: { documentId: string; chunkId: string; title: string; sourceUri?: string }
    status?: 'ok' | 'degraded' | 'unavailable'
    degradedReason?: string
  }>
  budget: {
    maxTokens: number
    usedTokensEstimate: number
    outputReserve: number
  }
  explain: Array<{ source: string; reason: string; tokenEstimate: number }>
}
```

### Prompt 组装规范

ContextPackageBuilder 输出给 provider 的 prompt 必须按固定区块顺序组装，方便审计和截断：

1. `system.safety`：安全规则、隐私规则、禁止泄露与删除约束。
2. `system.task`：entrypoint、capability、模型任务说明。
3. `current.input`：当前用户输入和用户显式传入的上下文 capsule。
4. `session.summary`：仅 confirmed/stale 可用摘要，标记来源 session。
5. `memory.relevant`：通过 MemoryPolicy、scope、tombstone 二次过滤后的记忆。
6. `retrieval.citations`：2.5.3 知识片段，必须带 citation / permission metadata；没有注入片段时也要在 package metadata 记录 retrieval status / degraded reason。
7. `recent.turns`：预算允许时追加最近 turns；旧 session 原文默认不进入。

如果必须截断，按相反顺序裁剪，永不裁剪 `system.safety` 和 `current.input`。每个区块必须有 `sourceRef`、`reason`、`tokenEstimate` 和 `privacyLevel`，用于 explain drawer 与 debug bundle。

## 12. Prompt Budget 建议

| 内容 | 建议预算 |
| --- | --- |
| 系统规则 / 安全策略 | 10% - 15% |
| 当前用户输入 | 10% |
| 最近 turns | 15% - 25% |
| 当前 session 摘要 | 10% - 20% |
| 相关记忆 / 检索片段 | 25% - 35% |
| 输出预留 | 10% - 20% |

预算规则：宁可保留当前任务，也不要盲目保留历史全文；宁可召回结构化摘要，也不要注入完整旧 session。

## 13. LangChain 使用边界

LangChain 可以作为执行与编排工具，但不能成为 Tuff 上下文治理的 SoT。

可用位置：

- `RunnableSequence`：编排 scope 判定、压缩、记忆提取和上下文构建流程。
- `StructuredOutputParser`：约束 ScopeDecision、CompressionSnapshot、MemoryCandidate 输出。
- `TokenTextSplitter`：切分长 turn、文档片段和历史摘要。
- `VectorStoreRetriever`：在 2.5.3 embeddings 可用时增强历史/知识召回。
- Summary / Memory primitive：作为内部执行器，不直接暴露为业务数据模型。

禁止：

- 不把 LangChain conversation memory 当作唯一会话状态。
- 不把 LangChain 自动记忆结果绕过 Tuff MemoryPolicy 直接写库。
- 不把 prompt/response 明文写入不可治理的外部 store。
- 不启用第三方 remote tracing、remote cache、remote memory、remote vector store 或外部 callback，除非通过 Tuff 托管 adapter 做脱敏、权限与用户授权。
- 不把 LangChain callback metadata 原样记录到普通日志；trace 只能保留 source id、reason、token estimate、provider trace 与错误码。
- 不允许 LangChain retriever 绕过 2.5.3 permission / citation metadata 直接读取本地文件、浏览器数据或插件存储。

## 14. 详细设计拆分

长篇工程细节已拆到 `./ai-2.5.4-context-hygiene-memory-details.md`，主 PRD 只保留产品目标、范围、核心概念与上下文治理原则。

详细附录包含：

- 本地存储与 SQLite schema 方向。
- 工程模块职责、状态机与策略矩阵。
- Domain API 合同、插件 capability、错误码与 degraded 合同。
- migration / transaction / lock / tombstone 一致性规则。
- UI / UX、安全隐私、观测证据、测试计划与验收清单。
- 分期计划、风险登记、回滚兼容与关联入口。

## 15. 当前验收摘要

| Phase | 必须完成 | 不允许宣称完成的情况 |
| --- | --- | --- |
| P0 | CoreBox AI Ask 可通过 flags 启用；session/checkpoint/package log/tombstone schema 落地；不带历史、新会话、长空闲新会话、token prune、migration degraded、并发/tombstone tests 通过 | 只有 UI chip 但没有 SQLite SoT；没有 tombstone 表；provider 调用仍可能截断 safety/current input |
| P1 | CompressionSnapshot fact state、MemoryPolicy、suggested memory、Memory 面板最小 CRUD、删除级联 evidence 通过 | 自动长期保存默认开启；user-rejected 可进入 memory；删除后仍可能从 summary/cache 召回 |
| P2 | 旧 session summary retrieval、2.5.3 citation、explain drawer included/excluded/policy-blocked 可见，OmniPanel/Workflow/Assistant 最近路径各至少 1 条 | 只接 embeddings/rerank 但没有 permission/citation；跨 workspace 召回仅靠标题/path |
| P3 | tombstone sync replay、TTL/usage decay、supersedes、Agent/Workflow checkpoint 关联通过 | 同步明文 payload；删除记忆多端回灌；secret/sensitive 可同步 |

2026-06-24 foundation：CoreApp `ContextHygieneService` retrieval scope 已调用 2.5.3 `LocalKnowledgeEngine.buildContext()`，并把 citation/document source/status/degraded reason 写入 `ContextPackage.items[].metadata` 与 metadata-only package log；`contextListPackageLogs` typed SDK / CoreApp channel 已可按 session/trace 读取 source id、reason、token estimate 与 retrieval metadata，`contextListCheckpoints` typed SDK / CoreApp channel 已可按 session/type 读取 checkpoint boundary reason、context scope 与 metadata。`@talex-touch/tuff-intelligence` 镜像 SDK 与 Intelligence Audit 日志展开区已接入 trace package metadata 摘要和 metadata-only explain drawer 外壳，并展示 included / excluded source detail、citation metadata、excluded/pruned/policy-blocked 证据与 checkpoint boundary 摘要；官方 `touch-intelligence` CoreBox AI Ask 已在 text.chat / vision.ocr 调用前 fail-soft 准备 ContextPackage metadata 并写入 invoke/widget/item metadata。`contextEvaluateMemory` typed SDK / CoreApp channel 已提供只读 MemoryPolicy 预览：显式候选可返回 `suggested`，secret / 用户 opt-out 返回 `rejected`，sensitive 返回 `needs_review`；CoreBox AI Ask 仅在用户显式“记住 / remember”时消费该预览并写入 memory policy metadata。2026-06-27 Intelligence Audit 新增 host-side Memory Review 最小面板，并补 `contextListMemories` / `contextSetMemoryEnabled` typed SDK / CoreApp channel：用户手动输入候选、先执行策略评估，只有 `suggested` 且内容未变更时才允许显式保存；saved list 默认只展示 normal / non-tombstoned memory，可禁用/重新启用，并可通过 `contextDeleteMemory` 写 tombstone 删除；`rejected` / `needs_review` 保持 fail-closed。该进展只完成 P0/P1/P2 的服务层桥接、CoreBox 最近路径 metadata、记忆策略预览、Audit explain drawer 最小外壳、最小手动保存入口与查看/禁用/删除/tombstone 小闭环，不替代完整 explain drawer 产品化、完整 Memory 面板搜索/编辑、OmniPanel/Workflow/Assistant 最近路径或自动长期记忆治理验收。

## 16. 关联入口

- 详细设计：`./ai-2.5.4-context-hygiene-memory-details.md`
- AI 2.5.0 主线：`./ai-2.5.0-plan-prd.md`
- 本地知识检索：`./ai-2.5.3-local-knowledge-retrieval-prd.md`
- 本地模型运行时：`./ai-2.5.5-local-model-runtime-prd.md`
- ASR Provider Runtime：`./ai-2.5.8-asr-provider-runtime-prd.md`
- 当前执行清单：`../TODO.md`
- 产品路线图：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
