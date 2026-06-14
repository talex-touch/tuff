# PRD: Tuff 2.5.4 ContextHygiene 与自动记忆治理

> 更新时间：2026-06-14
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
  retrievals: Array<{ sourceId: string; excerpt: string; reason: string }>
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
6. `retrieval.citations`：2.5.3 知识片段，必须带 citation / permission metadata。
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

## 14. 本地存储与 Schema 方向

SQLite 是本地唯一权威源。JSON 只能作为密文同步载荷或引用，不允许业务明文 dump 成同步 JSON。

建议表：

```text
intelligence_sessions
intelligence_turns
intelligence_checkpoints
intelligence_compression_snapshots
intelligence_memory_items
intelligence_memory_links
intelligence_context_package_logs
```

### 最小字段

- `intelligence_sessions`：`id`、`title`、`status`、`startedAt`、`lastActiveAt`、`endedAt`、`boundaryReason`、`summaryId`。
- `intelligence_turns`：`id`、`sessionId`、`role`、`contentRef/content`、`tokenEstimate`、`createdAt`、`metadata`。
- `intelligence_checkpoints`：checkpoint 类型、原因、contextScope、summary、metadata、createdAt。
- `intelligence_memory_items`：MemoryItem 字段、enabled、privacyLevel、ttl、usageCount。
- `intelligence_memory_links`：source turn / session / supersedes / related memory 关系。
- `intelligence_context_package_logs`：只记录来源 id、reason、tokenEstimate、trace，不默认保存完整 prompt。

## 15. 工程架构与模块职责

ContextHygiene 应作为 Tuff Intelligence 的独立治理层，位于 provider/model 调用之前、回答落库之后；它不直接承担模型生成能力，也不替代 2.5.3 的知识检索引擎。

```text
Intelligence entrypoint
  → ContextHygieneService.prepareTurn()
  → Provider / Model invoke
  → ContextHygieneService.finalizeTurn()
  → UI state / audit / memory suggestions
```

建议模块职责：

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `ContextHygieneService` | 对外统一入口，串联 prepare/finalize 生命周期 | 直接调用具体 provider |
| `SessionBoundaryManager` | 判断是否延续、新建、归档 session | 语义检索和模型生成 |
| `ScopeDetector` | 产出 `ScopeDecision`，判断是否需要当前 session / retrieval / none | 保存记忆 |
| `CheckpointManager` | 写入 session_start、task_switch、compression_snapshot 等边界事件 | 存储 turns 原文之外的业务索引 |
| `ContextPruner` | 裁剪最近 turns、去除无关/过期/超预算内容 | 生成最终回答 |
| `CompressionService` | 生成结构化 `CompressionSnapshot` | 删除原始 turns |
| `MemoryExtractor` | 从 turn / snapshot 中提取 `MemoryCandidate` | 绕过用户策略自动写长期记忆 |
| `MemoryPolicy` | 分类、敏感检测、scope 判定、保存/忽略策略 | 解密或读取 provider secret |
| `MemoryStore` | MemoryItem CRUD、tombstone、usage 统计 | 同步明文 payload |
| `RetrievalAssembler` | 合并 session summary、MemoryItem、2.5.3 知识检索结果 | 私自扫描未授权 App 数据 |
| `PromptBudgetManager` | 按模型和任务分配 token 预算 | 改变模型最大上下文能力 |
| `ContextPackageBuilder` | 组装可解释 `ContextPackage` | 保存完整 prompt 为默认日志 |
| `ContextExplainLogger` | 记录 source id、reason、tokenEstimate、trace | 记录完整 prompt/response 明文 |

## 16. 状态机与策略矩阵

### Session 状态机

MVP 物理状态建议保持克制：`active`、`archived`、`expired`、`deleted`。`idle` 和 `archiving` 可作为运行时派生状态，不必落库成长期状态。

```text
active ── inactivity / task_switch / manual_reset ──> archived
active ── retention ttl / cleanup policy ───────────> expired
archived ── retention ttl / user delete ────────────> expired
active|archived|expired ── user delete ─────────────> deleted(tombstone)
```

| 触发 | 旧 session | 新 session | Checkpoint | 默认上下文 |
| --- | --- | --- | --- | --- |
| 用户手动新会话 | archived | active | `manual_reset` + `session_start` | `none` / `light` |
| 超过空闲阈值 | archived | active | `session_end` + `session_start` | `light` |
| 明确新话题 | archived | active | `task_switch` + `session_start` | `light` |
| token overflow | active | active | `auto_prune` 或 `compression_snapshot` | `session summary` |
| 用户继续历史 | archived | active 或 current | `session_start` 或 retrieval log | `retrieval` |

### Memory 状态机

```text
candidate → suggested → saved → disabled → deleted(tombstone)
candidate → rejected
saved → superseded → archived
```

| 状态 | 说明 | 是否可注入 |
| --- | --- | --- |
| `candidate` | 模型或规则刚提取，尚未过策略 | 否 |
| `suggested` | 可建议保存，等待用户确认或可撤销窗口 | 否，除非仍属于当前 session summary |
| `saved` | 正式 MemoryItem | 是，需相关性和权限通过 |
| `disabled` | 用户禁用 | 否 |
| `deleted` | tombstone，防止同步回灌 | 否 |
| `rejected` | 用户或策略拒绝 | 否 |
| `superseded` | 被新记忆替代 | 默认否，可作为解释链路 |

### Scope 判定矩阵

确定性规则优先于 LLM classifier，避免轻量问题也产生模型路由成本。

| 输入信号 | 推荐 Scope | 行为 |
| --- | --- | --- |
| “新话题”“不带历史问”“清空上下文” | `none` | 新建 session 或当前 turn 不注入历史 |
| “继续刚才”“接着上次那个 PRD” | `retrieval` | 检索最近 archived session summary |
| 空闲超过阈值且无继续词 | `light` | 新建 session，只注入长期偏好与当前输入 |
| 当前输入引用“这个文件/这段代码/刚才结果” | `session` | 保留当前 session summary 与最近 turns |
| topic drift 高但未显式新话题 | `light` | 写 `task_switch` checkpoint，可提示用户 |
| provider/model 预算不足 | `session` + prune | 压缩旧 turns，保留当前任务关键摘要 |

ScopeDecision 建议结构：

```ts
interface ScopeDecision {
  scope: 'none' | 'light' | 'session' | 'retrieval'
  confidence: number
  reason: string
  boundaryAction?: 'keep' | 'new_session' | 'archive_current' | 'compress_current'
  retrievalHints?: string[]
  shouldAskUser?: boolean
}
```

### ScopeDetector 输出合同

- 确定性规则必须先运行；LLM classifier 只在规则无法判断且 feature flag 允许时运行。
- classifier 输出必须通过 schema 校验；非法 JSON、低置信度或超时均降级为 `light`，并返回 `scope-low-confidence`。
- `shouldAskUser=true` 只用于 UI 可交互入口；后台 Workflow / Assistant action 不得阻塞等待用户选择。
- `retrievalHints` 不得包含 secret 原文；只能包含脱敏关键词、session id、project id 或 source type。
- `boundaryAction=new_session` 必须说明 reason，且写入 checkpoint metadata。

## 17. Implementation Mapping

首版实现应尽量复用现有 Intelligence 运行时与内存上下文入口，而不是平行新造一套孤岛系统。

| 层级 | 现有入口 / 建议落点 | 说明 |
| --- | --- | --- |
| CoreApp main AI runtime | `apps/core-app/src/main/modules/ai/intelligence-service.ts`、`apps/core-app/src/main/modules/ai/tuff-intelligence-runtime.ts` | `prepareTurn()` 应在 provider invoke 前进入，`finalizeTurn()` 应在 audit / result 之后进入。 |
| 现有 agent memory | `apps/core-app/src/main/modules/ai/agents/memory/context-manager.ts`、`apps/core-app/src/main/modules/ai/agents/memory/memory-store.ts` | 现有 Map + maxMessages 只能作为兼容层；2.5.4 应迁到 SQLite-backed session / turn / checkpoint。 |
| Transport / SDK | `packages/utils/transport/sdk/domains/intelligence.ts`、`packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts` | 新增 renderer 可见接口必须走 typed transport/domain SDK。 |
| Plugin SDK | `packages/utils/plugin/sdk/intelligence.ts`、`packages/utils/intelligence/index.ts` | 插件只能调用受权限控制的 prepare/invoke 能力，不暴露 MemoryStore 原始内容。 |
| Database schema | `apps/core-app/src/main/db/schema.ts` 与对应 migration | 新表进入 Drizzle / LibSQL 路径，迁移必须幂等、可回滚、可只读降级。 |
| UI | CoreBox AI Ask、Intelligence 设置页、OmniPanel Writing Tools | P0 只做 CoreBox chip/toast/不带历史入口；Memory 面板后移 P1。 |

### 依赖矩阵

| 依赖 | 阻塞阶段 | 需要能力 | 降级策略 |
| --- | --- | --- | --- |
| Database / Drizzle / LibSQL | P0 | session、turn、checkpoint、tombstone、package log | 迁移失败则轻上下文只读降级 |
| Typed transport / domain SDK | P0 | renderer 调用 prepare/startNewSession/explain metadata | 不走 raw channel，未就绪则仅 main 内部实验 |
| CoreBox AI Ask | P0 | chip、toast、不带历史、新会话入口 | flag 关闭时维持现有问答 |
| Intelligence provider runtime | P0 | provider usage/token/trace 回传 | 无 usage 时使用估算并提高 safety margin |
| Intelligence settings | P0/P1 | feature flags、空闲阈值、context log 开关 | 使用保守默认值 |
| TuffEx / UI primitives | P0/P1 | chip、drawer、Memory panel | P0 可先用现有 CoreBox UI primitive |
| 2.5.3 Local Knowledge | P2 | FTS/metadata/citation retrieval | unavailable 时只用 session summary + memory |
| Secure store / sync keys | P3 | 密文同步、secret 引用 | P3 前不同步敏感内容 |

## 18. Domain API 合同方向

文档层面先锁接口形状，不在本 PRD 直接要求实现。

```ts
interface ContextHygieneService {
  prepareTurn(input: PrepareTurnInput): Promise<PreparedContext>
  finalizeTurn(input: FinalizeTurnInput): Promise<FinalizeTurnResult>
  startNewSession(input: StartNewSessionInput): Promise<ContextSession>
  listMemories(input: ListMemoriesInput): Promise<ListMemoriesResult>
  updateMemory(input: UpdateMemoryInput): Promise<MemoryItem>
  deleteMemory(input: DeleteMemoryInput): Promise<{ tombstoneId: string }>
}

interface PrepareTurnInput {
  entrypoint: 'corebox-ai-ask' | 'omnipanel' | 'workflow' | 'assistant' | 'plugin'
  userInput: string
  workspaceId?: string
  projectId?: string
  currentSessionId?: string
  contextHints?: Array<{ type: string; value: string; privacyLevel?: string }>
  userIntentOverride?: 'continue' | 'new-session' | 'no-history'
  modelBudget?: { maxInputTokens: number; outputReserve: number }
}

interface PreparedContext {
  session: ContextSession
  checkpoint?: ContextCheckpoint
  scopeDecision: ScopeDecision
  contextPackage: ContextPackage
  warnings: Array<{ code: ContextHygieneWarningCode; message: string }>
}

type ContextHygieneWarningCode =
  | 'context-hygiene-disabled'
  | 'migration-unavailable'
  | 'scope-low-confidence'
  | 'token-budget-estimate-unsafe'
  | 'compression-unavailable'
  | 'retrieval-unavailable'
  | 'memory-policy-blocked'
  | 'memory-permission-denied'
  | 'storage-degraded'
  | 'concurrency-conflict'

interface FinalizeTurnInput {
  sessionId: string
  userTurnId: string
  assistantTurnId: string
  providerTraceId?: string
  result: 'success' | 'failed' | 'cancelled'
  errorCode?: string
  idempotencyKey: string
}
```

跨层调用要求：CoreApp renderer 只能经 typed transport / domain SDK 调用上述能力；插件只能通过受权限控制的 Intelligence SDK 访问，不暴露底层 SQLite 表。

### 插件 capability 矩阵

| 能力 | 插件默认 | 需要权限 | 返回字段 | 拒绝码 |
| --- | --- | --- | --- | --- |
| `prepareTurn` + invoke | 允许受限调用 | `intelligence.basic` | 当前请求的 prepared context，不含 MemoryStore 原始列表 | `PERMISSION_DENIED` / `MEMORY_SCOPE_DENIED` |
| 查看 context explain | 默认不允许 | `intelligence.basic` + 用户显式打开 explain | source id、reason、tokenEstimate、degraded reason | `CONTEXT_EXPLAIN_DENIED` |
| `listMemories` | 不允许 | 未来单独 `intelligence.memory.read`，首版仅宿主 UI | 最小 summary，不含 secret/sensitive 原文 | `MEMORY_READ_DENIED` |
| `saveMemory` / `deleteMemory` | 不允许 | 未来单独 `intelligence.memory.write` + 用户确认 | 操作结果 / tombstone id | `MEMORY_WRITE_DENIED` |

P0 不向第三方插件开放 `listMemories`、`saveMemory`、`deleteMemory`；官方 `touch-intelligence` 也只能通过宿主 UI 触发记忆确认，避免插件间接读取跨 workspace 偏好。

### 错误码与 degraded 合同

| Code | 层级 | 用户可见行为 | 允许继续调用 provider | 记录要求 |
| --- | --- | --- | --- | --- |
| `CONTEXT_HYGIENE_DISABLED` | info | 显示轻上下文模式 | 是 | 记录 feature flag |
| `MIGRATION_UNAVAILABLE` | warning | 提示上下文系统降级 | 是，仅轻上下文 | 记录 schemaVersion / migration state |
| `SCOPE_LOW_CONFIDENCE` | warning | 可提示是否继续上次任务 | 是 | 记录候选 scope 与 confidence |
| `TOKEN_BUDGET_ESTIMATE_UNSAFE` | error | 提示上下文过大需清理 | 否 | 记录 model budget 与估算来源 |
| `COMPRESSION_UNAVAILABLE` | warning | 使用最近 turns + 旧摘要 | 是 | 记录 compression provider / parser reason |
| `RETRIEVAL_UNAVAILABLE` | warning | 不召回历史，仅轻上下文 | 是 | 记录 source unavailable reason |
| `MEMORY_POLICY_BLOCKED` | info/warning | 显示敏感信息未保存 | 是 | 记录 policy rule id，不记录原文 |
| `MEMORY_SCOPE_DENIED` | warning | 不使用跨 workspace/project 记忆 | 是 | 记录 requested / effective scope |
| `STORAGE_DEGRADED` | warning | 不保存新记忆或 checkpoint | 是，仅轻上下文 | 记录 SQLite / transaction error code |
| `CONCURRENCY_CONFLICT` | warning | 自动重试或提示刷新 | 是，需重新 prepare | 记录 lock / CAS conflict |

Degraded 合同：只要 provider 仍会被调用，ContextPackage 必须携带 warning；只要安全规则、当前输入或用户显式上下文无法保留，必须阻断 provider 调用，禁止“截断后继续”。

## 19. SQLite Schema 细化建议

Schema 首版应保证可迁移、可回放、可删除；不要求一步引入 embeddings 表。字段类型以 Drizzle / LibSQL 实现时再精确化。

### `intelligence_sessions`

| 字段 | 说明 |
| --- | --- |
| `id` | session id |
| `schemaVersion` | 行级 schema 版本，支持后续 backfill |
| `title` | 用户可见标题，可由首轮输入或摘要生成 |
| `status` | `active` / `archived` / `expired` / `deleted` |
| `scope` | 默认 scope 偏好，通常为 `session` 或 `light` |
| `workspaceId` / `projectId` | 可选作用域 |
| `startedAt` / `lastActiveAt` / `endedAt` | 生命周期时间 |
| `boundaryReason` | 创建或归档原因 |
| `summarySnapshotId` | 当前结构化摘要 |
| `metadata` | JSON object，仅存非敏感 metadata |

建议索引：`status + lastActiveAt`、`workspaceId + lastActiveAt`、`projectId + lastActiveAt`。

### `intelligence_turns`

| 字段 | 说明 |
| --- | --- |
| `id` | turn id |
| `sessionId` | 归属 session |
| `role` | `user` / `assistant` / `tool` / `system` |
| `content` / `contentRef` | `normal` 可本地 SoT；`sensitive/secret` 必须优先 redaction 或加密引用 |
| `redactionState` | `none` / `redacted` / `content-ref` / `blocked` |
| `tokenEstimate` | prompt budget 使用 |
| `privacyLevel` | `normal` / `sensitive` / `secret` |
| `retentionUntil` | turn 级保留期限，secret/sensitive 必须短 TTL 或 contentRef |
| `createdAt` | 创建时间 |
| `metadata` | provider、entrypoint、trace 等非敏感信息 |

建议索引：`sessionId + createdAt`、`privacyLevel`、`retentionUntil`。同步时禁止输出 `content` 明文；`secret` turn 不得进入 FTS、embedding、context log 或可同步 payload。

### `intelligence_memory_items`

| 字段 | 说明 |
| --- | --- |
| `id` | memory id |
| `schemaVersion` | 行级 schema 版本 |
| `type` / `scope` | 记忆分类与作用域 |
| `status` | `suggested` / `saved` / `disabled` / `deleted` / `rejected` / `superseded` |
| `content` | 本地 SoT 内容，普通记忆可保存；secret 禁止普通保存 |
| `summary` | 检索和 UI 展示摘要 |
| `tags` | 搜索标签 |
| `confidence` | 自动提取置信度 |
| `privacyLevel` | 敏感级别 |
| `sourceSessionId` / `sourceTurnId` | 来源 |
| `supersedesId` | 冲突替代关系 |
| `ttl` / `expiresAt` | 生命周期 |
| `createdAt` / `updatedAt` / `lastUsedAt` | 时间 |
| `usageCount` | 注入次数 |

建议索引：`status + scope + type`、`updatedAt`、`lastUsedAt`、`expiresAt`。

### `intelligence_tombstones`

| 字段 | 说明 |
| --- | --- |
| `id` | tombstone id |
| `targetType` | `session` / `turn` / `memory` / `summary` / `embedding` |
| `targetId` | 被删除对象 id |
| `reason` | `user-delete` / `ttl-expired` / `policy-blocked` / `migration-cleanup` |
| `createdAt` | 创建时间 |
| `syncVersion` | 后续 sync replay 使用 |

P1 前必须定义 tombstone 表和查询过滤规则，不能等到 P3 才解决删除后不注入；P3 只负责多设备同步 replay。

### `intelligence_context_package_logs`

该表用于调试和 evidence，不默认保存完整 prompt。

| 字段 | 说明 |
| --- | --- |
| `id` | log id |
| `sessionId` / `turnId` | 关联 turn |
| `scope` | 本次 context scope |
| `sourceRefs` | 被注入来源 id 列表与 reason |
| `excludedRefs` | 被排除来源 id、pruned/policy-blocked/tombstone reason |
| `tokenEstimate` | 总预算估算 |
| `tokenizerDelta` | provider 返回后记录估算误差 |
| `providerTraceId` | provider / model trace |
| `warnings` | degraded、pruned、policy-blocked 等原因 |
| `createdAt` | 创建时间 |

## 20. 迁移、并发与一致性

### Migration Contract

- 新增 Drizzle migration 必须幂等；重复执行不得重复创建 checkpoint、默认 session 或索引。
- 所有新表必须有 `schemaVersion` 或 migration metadata，便于 backfill 和 debug bundle 判断版本。
- 旧 `agents/memory` Map 存储只作为兼容输入，不做自动长期迁移；首版只在用户继续旧 agent session 时生成临时 session summary。
- 迁移半成功时进入只读 degraded：`prepareTurn()` 继续轻上下文，禁止写 memory，UI 展示 `migration-unavailable`。
- backfill 校验必须覆盖默认值、索引、status、workspace/project scope；失败不得把旧会话误判为 active。

### Transaction / Lock Contract

- 同一 `sessionId` 的 checkpoint、summary、turn finalize 必须串行化，避免并发 entrypoint 覆盖摘要。
- `finalizeTurn()` 必须通过 `idempotencyKey` 幂等；重复 finalize 不得重复提取 memory 或重复更新 usageCount。
- `deleteMemory()` 与 `prepareTurn()` 并发时，tombstone 优先级高于召回结果；prepare 末尾必须再校验 sourceRefs 未命中 tombstone。
- CompressionSnapshot 写入采用 compare-and-swap：只有基于最新 `summarySnapshotId` 的压缩结果可覆盖当前摘要。
- SQLite 写失败时不得返回伪成功；可降级为无历史轻上下文并记录 `storage-degraded`。

### 删除级联

- 删除 MemoryItem 必须写 tombstone，并从 MemoryStore 查询、FTS/embedding 索引、retrieval cache、ContextPackageBuilder 候选中同步排除。
- 旧 CompressionSnapshot 中引用已删除 memory 时，不删除 snapshot 原文，但后续 package explain 必须展示 `excluded: tombstone`，且不注入内容。
- 删除 session 时，turns、checkpoint、summary 可按用户选择软删或硬删；无论哪种，后续 retrieval 都必须先查 tombstone。
- sync replay 时 tombstone 赢过旧 `saved` memory；P1 本地先实现该语义，P3 再扩展到多设备。

## 21. 策略细则

### MemoryPolicy 敏感拦截

首版至少拦截以下内容，命中后默认 `privacyLevel=secret` 且不进入普通 MemoryItem：

- API key、Bearer token、OAuth refresh token、JWT、SSH/private key、恢复码、助记词。
- 密码、口令、一次性验证码、Cookie、session id。
- 身份证件、银行卡、住址、手机号等明显个人敏感信息。
- 用户明确说“不要记住”“别保存”“临时说一下”的内容。

无法确定是否敏感时，进入 `sensitive-review`，只允许作为当前 session 临时上下文，不进入长期记忆。

### 摘要事实状态

CompressionSnapshot 中的事实必须带状态，避免助手幻觉或被用户否定的内容长期污染：

```ts
type SummaryFactState = 'confirmed' | 'assistant-claimed' | 'user-rejected' | 'stale'
```

- 只有 `confirmed` 可自动进入 MemoryCandidate。
- `assistant-claimed` 只能用于当前 session summary，不能升为长期记忆。
- `user-rejected` 不得进入 prompt；保留为避免重复犯错的 negative context。
- `stale` 需要重新确认或低权重召回。

### 记忆冲突处理

- 同 scope、同 type、语义冲突时，新记忆不得直接覆盖旧记忆，需写 `supersedes` link。
- UI 展示当前生效版本，并允许用户查看旧版本来源。
- prompt 注入只使用最新 enabled/saved 版本；superseded 仅用于解释和回滚。
- usageCount 不能单独提高错误记忆权重；用户反馈为错误或删除后必须清零或 tombstone。

### 记忆召回排序

召回排序建议使用 deterministic score + 可选 rerank：

```text
score = relevance * 0.45
      + recency * 0.15
      + usageAffinity * 0.15
      + scopeMatch * 0.15
      + confidence * 0.10
```

- `scopeMatch`：project > workspace > global > session。
- `usageAffinity`：被相同 entrypoint 或相同任务类型使用过的记忆加权。
- `privacyLevel=sensitive` 需要更高相关性阈值；`secret` 不注入。
- 同名 project/workspace 必须以 stable id 匹配，不允许仅靠标题或路径 basename 召回。

### Tokenizer 与硬截断

- Token 估算必须按 provider/model 记录 `estimatedTokens` 与 provider 返回的真实 usage delta。
- 估算误差超过阈值时，后续同模型自动提高 safety margin。
- 硬截断保护顺序：系统/安全规则 > 当前输入 > 用户明确上下文 > confirmed session summary > relevant memory > retrieval excerpt > 最近旧 turns。
- 当预算不足以保留安全规则和当前输入时，必须返回 `token-budget-estimate-unsafe`，不得继续调用 provider。

## 22. 集成点

| 入口 | ContextHygiene 行为 |
| --- | --- |
| CoreBox AI Ask | 默认轻上下文；显式继续时召回旧 session；展示上下文 chip |
| OmniPanel Writing Tools | 优先使用选区/剪贴板/OCR capsule，不默认带完整聊天历史 |
| Workflow `Use Model` | 每个 run 可独立 session；Review Queue 写 checkpoint，不默认写长期记忆 |
| Assistant | 悬浮球/VoicePanel 默认轻上下文；语音或剪贴板动作仅注入当前动作 capsule |
| `touch-intelligence` 插件 | 通过 Intelligence SDK 触发，受 `intelligence.basic` 和 memory 权限策略控制 |
| 2.5.3 Local Knowledge | RetrievalAssembler 可调用 buildContext，但必须保留 citation / permission metadata |
| Provider Runtime | 接收 ContextPackage 后调用模型；不得反向修改 MemoryStore |

## 23. Feature Flags 与 Rollout

### Feature Flags

| Flag | 默认 | 说明 |
| --- | --- | --- |
| `intelligence.contextHygiene.enabled` | off in release / on in dev | 总开关；关闭时回退轻上下文 |
| `intelligence.contextHygiene.corebox.enabled` | canary | P0 只对 CoreBox AI Ask 灰度 |
| `intelligence.contextHygiene.omnipanel.enabled` | off | P1/P2 再接入 |
| `intelligence.memory.suggestions.enabled` | off | P1 开启 suggested memory，不自动保存 |
| `intelligence.memory.autoSave.enabled` | off | Stable 不默认开启 |
| `intelligence.contextExplain.enabled` | on metadata | 只显示 source/reason，不显示完整 prompt |
| `intelligence.contextCompression.enabled` | off for P0 | P1 后开启结构化压缩 |

### Rollout 顺序

1. P0 dev-only：CoreBox AI Ask + deterministic scope + session/checkpoint/package log + chip。
2. P0 canary：启用手动新会话、不带历史问、长空闲新会话；Compression 仍关闭。
3. P1 beta：Memory suggestions、MemoryPolicy、tombstone、Memory 面板最小 CRUD。
4. P2 beta：旧 session summary retrieval、2.5.3 knowledge citation、explain drawer。
5. P3 experimental：多设备 tombstone replay、记忆衰减、Workflow/Agent 长任务 checkpoint。

### Kill switch 与自动降级

- 任一 P0 integration evidence 失败时，release flag 默认关闭，仅保留 dev flag。
- `TOKEN_BUDGET_ESTIMATE_UNSAFE` 比例超过阈值时自动关闭 retrieval / recent turns 注入，只保留 current input + safety。
- `MEMORY_POLICY_BLOCKED` 命中异常升高时只关闭 memory suggestion，不关闭基础 session boundary。
- `CONCURRENCY_CONFLICT` 连续出现时禁用 compression overwrite，回退 append-only checkpoint。
- migration / schemaVersion mismatch 时自动进入 `MIGRATION_UNAVAILABLE`，禁止 memory 写入。
- kill switch 不删除已写入数据，只停止参与 prompt；重新启用前必须跑 schemaVersion 与 tombstone consistency check。

## 24. UI / UX 要求

### 对话态提示

- 对话区域显示当前上下文模式：`轻上下文` / `当前任务` / `已召回历史` / `不参考历史`。
- 自动新会话时显示轻量提示：“已开启新会话，旧上下文不会默认影响回答”。
- 提供“继续上次任务”入口，通过检索召回最近 archived session summary。
- 提供“本次不带历史问”入口，强制 ContextScope 为 `none`。
- 对已注入历史或记忆提供“为什么使用这段上下文”的解释入口。

### Context Explain Drawer

- 必须展示 included sources、excluded/pruned sources、policy-blocked sources、tombstone hits、预算占比和来源新鲜度。
- 不展示完整 prompt/response；敏感 source 只显示类型和 block reason。
- 用户可从 drawer 中执行“本次不使用”“以后不要使用这条记忆”“打开 Memory 面板”。

### Memory 面板

- Memory 面板支持查看、搜索、编辑、禁用、删除记忆，并显示来源 session / turn。
- 记忆保存需可见：展示“已记住 / 建议记住 / 已忽略 / 因敏感信息未保存”。
- Suggested memory 必须能一键保存、忽略、编辑后保存。
- 删除 memory 后，UI 应提示“后续回答不会再使用这条记忆”。

### 设置项

建议放入 Intelligence 设置页：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| 自动新会话空闲阈值 | 2 小时 | 可选 30 分钟 / 2 小时 / 1 天 / 从不 |
| 自动压缩 | 开启 | 关闭后仅保留最近 turns 与用户手动摘要 |
| 长期记忆 | 开启但需可撤销 | 支持关闭自动建议和自动保存 |
| 敏感记忆保存 | 关闭 | 首版不提供普通保存 |
| Context explain log | 开启 metadata | 不记录完整 prompt/response |
| 默认上下文模式 | 轻上下文 | 可选轻上下文 / 当前任务优先 |

## 25. 安全与隐私约束

- Provider secret、API key、token、恢复码、口令不得进入普通 MemoryItem、localStorage、日志或同步 JSON。
- MemoryPolicy 必须在写入前做敏感信息检测；无法判断时默认进入 sensitive review，不自动保存。
- Sensitive / secret turns 必须优先 redaction 或 `contentRef` 加密引用，且不得进入 FTS、embedding、context package log 或可同步 payload。
- ContextPackage 日志默认只保存 source id、reason、token 估算、trace 和错误码，不保存完整 prompt/response。
- 新增跨层接口必须使用 typed transport / domain SDK，不新增 raw channel。
- 多设备同步必须使用 `/api/v1/sync/*` 和 keys/devices 配套能力，且只同步密文 payload 或引用。
- 用户删除 memory 后，后续 prompt 构建不得再注入该 MemoryItem；需要记录 tombstone 或版本状态避免同步回灌。
- 工作区 / 项目级记忆不得跨 workspace 注入，除非 scope 明确为 global 且用户允许。
- 插件不能读取 MemoryStore 原始内容；只能通过受权限和 scope 过滤的 Intelligence SDK 获取准备好的上下文。

### Consent 与保留策略

| 数据类型 | 默认保留 | 用户同意 | 删除语义 |
| --- | --- | --- | --- |
| `normal` turns | 本地保留，受会话保留期影响 | 使用 AI 即隐含本地会话记录，可在设置关闭 | 删除 session 时软删或硬删，并写 tombstone |
| `sensitive` turns | 短 TTL 或 redacted contentRef | 需要明确 UI 提示，不进入长期记忆 | TTL 到期清理 content / index / cache |
| `secret` turns | 默认不保存原文 | 不提供普通保存入口 | 立即 redaction 或 blocked，禁止同步 |
| `suggested` memory | 本地 pending | 用户确认或可撤销窗口 | reject 后不再提示同源候选一段时间 |
| `saved` memory | 本地长期 | 用户保存或明确“记住” | 删除写 tombstone，所有召回路径二次过滤 |
| context package log | metadata-only | 设置中可关闭 | 删除 session 时按 sourceRef 清理或保留脱敏 audit |

P0 不实现自动长期保存；P1 若启用 suggested memory，必须有“查看后保存 / 忽略 / 编辑后保存”路径，并在设置中允许完全关闭。

## 26. 观测与证据

### Runtime 指标

- `context.scope_decision.count`：按 scope / entrypoint / reason 统计。
- `context.session_boundary.count`：新建、归档、任务切换、手动重置。
- `context.compression.count`：成功、失败、degraded、节省 token 估算。
- `context.memory.candidate.count`：按 type / scope / privacyLevel 统计。
- `context.memory.policy_block.count`：敏感拦截、用户拒绝、scope 冲突。
- `context.package.token_estimate`：输入、summary、memory、retrieval、outputReserve 分布。
- `context.package.token_delta`：按 provider/model 记录估算误差。
- `context.tombstone.hit.count`：删除后被召回但成功排除的 source 数。
- `context.concurrency.conflict.count`：CAS 失败、session lock 等冲突。
- `context.retrieval.hit.count`：session summary、memory、knowledge source 的命中与使用。

### Debug Bundle

单 turn debug bundle 只能包含：scope decision、boundary action、sourceRefs、excludedRefs、policy blocks、degraded reason、token estimate/delta、schemaVersion、providerTraceId；禁止包含完整 prompt/response、secret content 或未脱敏用户输入。

### Evidence 要求

- 至少保留 10 个固定 evidence item：长空闲新会话、显式继续旧会话、手动不带历史、token budget prune、自动压缩、敏感记忆拦截、删除记忆后不再注入、delete vs prepareTurn 并发、migration degraded fallback、LangChain 外部 tracing/cache 禁用。
- Evidence 只记录上下文来源 id、reason、tokenEstimate、traceId、degraded reason，不保存完整敏感 prompt。
- UI evidence 需要展示上下文 chip、checkpoint toast、memory suggestion、context explain drawer。

### Evidence 矩阵

| Evidence item | 自动化 | UI / 手工 | 必须证明 |
| --- | --- | --- | --- |
| 长空闲新会话 | integration | toast/chip screenshot | 旧 session archived，新 session `session_start` |
| 显式继续旧会话 | integration | explain drawer | 只召回 summary，不注入旧 turns 全文 |
| 手动不带历史 | integration | chip screenshot | scope=`none`，无 memory/retrieval sourceRef |
| token budget prune | unit/integration | debug bundle | 安全规则和当前输入优先保留 |
| 自动压缩 | unit/integration | optional | `confirmed/user-rejected/stale` fact state 正确 |
| 敏感记忆拦截 | unit | memory suggestion state | 不写 MemoryItem content，不进 log/index |
| 删除记忆不再注入 | integration | Memory panel | tombstone 命中且 prepareTurn 二次过滤 |
| delete vs prepare 并发 | integration | 不需要 | tombstone 优先，无 stale sourceRef |
| migration degraded fallback | integration | degraded banner | 轻上下文继续，禁止写 memory |
| LangChain 外发限制 | unit/contract | 不需要 | callback/tracing/cache/vectorstore 未启用或已脱敏 |

## 27. 测试计划

### Unit Tests

- `SessionBoundaryManager`：空闲阈值、手动 reset、topic drift、token overflow。
- `ScopeDetector`：确定性关键词优先、LLM classifier 降级、低置信度 ask-user。
- `CompressionService`：结构化输出 schema、失败不删 turns、sourceTurnRange 正确、`user-rejected` 不进入 memory。
- `MemoryPolicy`：API key/token/password 拦截、用户“不要记住”优先、scope 冲突、prompt injection 诱导记忆保存失败。
- `PromptBudgetManager`：不同模型预算、输出预留、memory/retrieval 裁剪顺序、估算误差 safety margin。
- `ContextPackageBuilder`：explain 来源完整、旧 session 原文默认不注入、tombstone sourceRef 二次过滤。

### Integration Tests

- CoreBox AI Ask 长空闲后新建 session，并写入 `session_start` checkpoint。
- 用户“继续刚才”可召回 archived session summary，但不注入 archived turns 全文。
- OmniPanel Writing Tools 使用选区 capsule，不继承 CoreBox 长会话。
- Memory 删除后，下一次 prepareTurn 不再返回该 memory sourceRef，FTS/embedding/cache 候选也被排除。
- deleteMemory 与 prepareTurn 并发时 tombstone 优先。
- migration 半成功时 prepareTurn 降级为轻上下文并返回 `migration-unavailable`。
- 2.5.3 检索不可用时，ContextPackage 返回 degraded reason 并继续轻上下文。
- LangChain adapter 外部 callback/tracing/cache 关闭或经 Tuff adapter 脱敏。

### UI / E2E Tests

- 对话 header 显示上下文模式 chip。
- 自动新会话 toast 可见。
- Memory 面板可禁用和删除记忆。
- Context explain drawer 展示 included/excluded/policy-blocked/tombstone reason。
- “不带历史问”后回答不使用旧 session sourceRef。

## 28. 验收清单

- [ ] 超过空闲阈值后再次提问，会自动创建新 session 与 `session_start` checkpoint。
- [ ] 新 session 默认不注入旧 session 原文。
- [ ] 用户显式“继续刚才”时，可以召回旧 session 摘要并展示召回原因。
- [ ] 长会话 token 不线性增长，能按阈值自动生成结构化 CompressionSnapshot。
- [ ] 压缩失败不会删除原 turns，并会返回 degraded reason。
- [ ] 稳定用户偏好可进入长期 MemoryItem；临时上下文不会误存为长期记忆。
- [ ] 敏感内容不会明文进入普通记忆、localStorage、普通 JSON、日志或同步 payload。
- [ ] Sensitive / secret turns 不进入 FTS、embedding、context log 或可同步 payload。
- [ ] ContextPackage 可解释每段历史、记忆和检索片段的来源、reason 与 token 预算。
- [ ] Context explain drawer 可解释 included、excluded、policy-blocked、tombstone 和 token budget。
- [ ] 用户可以查看、禁用、删除记忆，删除后不再被注入。
- [ ] CoreBox / OmniPanel / Workflow / Assistant 至少各有一个最近路径 prepareTurn integration case；P0 可先只要求 CoreBox。
- [ ] Migration、并发、tombstone、LangChain 外发限制各有 focused evidence。
- [ ] README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步。

## 29. 分期计划

### P0 - CoreBox-only ContextHygiene 基线

- 新增 feature flags、SQLite session / turn / checkpoint / package log / tombstone schema。
- 实现 SessionBoundaryManager、CheckpointManager、确定性 ScopeDetector。
- 实现 PromptBudgetManager、ContextPackage explain metadata 与 token budget prune；不启用模型压缩。
- CoreBox AI Ask 接入上下文 chip、手动新会话、不带历史问和长空闲新会话。
- 完成 migration degraded fallback、finalize 幂等、session 写入串行化、隐私日志断言。

### P0 issue 切片建议

| Slice | 交付物 | 验证 |
| --- | --- | --- |
| P0.1 Schema & flags | Drizzle schema、migration、feature flags、degraded fallback | migration unit + `git diff --check` |
| P0.2 Session boundary | SessionBoundaryManager、CheckpointManager、deterministic scope | unit + CoreBox integration |
| P0.3 Context package | PromptBudgetManager、ContextPackageBuilder、metadata explain log | unit + privacy log assertion |
| P0.4 CoreBox UI | chip、toast、手动新会话、不带历史问 | focused UI test / screenshot evidence |
| P0.5 Concurrency & tombstone | finalize idempotency、session lock、tombstone prepare 二次过滤 | integration race tests |
| P0.6 Rollout gate | dev/canary flags、degraded banner、debug bundle | contract test + manual smoke |

### P1 - Compression 与 Memory MVP

- 实现结构化 CompressionSnapshot、schema 校验和 summary CAS 写入。
- 实现 MemoryCandidate 提取与 MemoryPolicy 敏感拦截。
- 支持手动确认 / 可撤销保存；不默认自动长期保存。
- Memory 面板查看、禁用、删除与 tombstone 本地级联。
- 用户偏好与项目级记忆的受控检索注入。

### P2 - Retrieval 增强

- 接入 2.5.3 本地知识检索、FTS5 和 metadata filter。
- 可选 embeddings / rerank 增强相关性。
- 旧 session summary 与知识片段统一进入 RetrievalAssembler。
- Context explain drawer 展示 retrieval citation、excluded/pruned/policy-blocked source。
- 接入 OmniPanel / Workflow / Assistant 最近路径。

### P3 - 衰减与同步

- TTL、usageCount、冲突解决与 supersedes link。
- tombstone / 删除同步 replay 语义。
- 密文同步载荷与多设备恢复策略。
- Agent 长任务 checkpoint 与 Workflow run 关联。

### Phase Definition of Done

| Phase | 必须完成 | 不允许宣称完成的情况 |
| --- | --- | --- |
| P0 | CoreBox AI Ask 可通过 flags 启用；session/checkpoint/package log/tombstone schema 落地；不带历史、新会话、长空闲新会话、token prune、migration degraded、并发/tombstone tests 通过 | 只有 UI chip 但没有 SQLite SoT；没有 tombstone 表；provider 调用仍可能截断 safety/current input |
| P1 | CompressionSnapshot fact state、MemoryPolicy、suggested memory、Memory 面板最小 CRUD、删除级联 evidence 通过 | 自动长期保存默认开启；user-rejected 可进入 memory；删除后仍可能从 summary/cache 召回 |
| P2 | 旧 session summary retrieval、2.5.3 citation、explain drawer included/excluded/policy-blocked 可见，OmniPanel/Workflow/Assistant 最近路径各至少 1 条 | 只接 embeddings/rerank 但没有 permission/citation；跨 workspace 召回仅靠标题/path |
| P3 | tombstone sync replay、TTL/usage decay、supersedes、Agent/Workflow checkpoint 关联通过 | 同步明文 payload；删除记忆多端回灌；secret/sensitive 可同步 |

## 30. 风险登记与开放决策

| 风险 | 级别 | 缓解 |
| --- | --- | --- |
| 自动摘要把错误事实固化 | 高 | SummaryFactState、user-rejected 禁止进入 memory、Compression evidence |
| 记忆误召回跨 workspace 泄露 | 高 | stable workspace/project id、scope filter、插件 capability 限制 |
| 删除后被旧索引/summary/cache 回灌 | 高 | tombstone-first、prepareTurn 二次过滤、tombstone hit 指标 |
| token 估算偏差导致安全规则被截断 | 高 | provider/model delta、safety margin、unsafe 直接阻断 |
| LangChain tracing/cache 外发 | 高 | 默认禁用外部 callback/cache/vectorstore，Tuff adapter 脱敏审计 |
| P0 范围过大拖累 2.5.0 | 中 | CoreBox-only rollout，compression/memory/retrieval 后移 |
| 用户不理解“记忆”和“历史”区别 | 中 | context chip、explain drawer、Memory 面板和设置文案 |

开放决策：

- 默认空闲阈值是否固定为 2 小时，还是根据 entrypoint 区分 CoreBox / OmniPanel / Workflow。
- Suggested memory 是否默认展示 toast，还是只进入 Memory 面板 badge。
- Session turn 原文本地保留期默认值；是否提供“退出应用时清理临时会话”。
- Context explain drawer 在 P0 是否只做 metadata 列表，还是必须包含 excluded source。
- Global preference memory 是否需要首次使用时二次确认。

## 31. 回滚与兼容

- ContextHygiene 可通过设置回退为“仅当前会话最近 turns + session summary”。
- 自动长期记忆可单独关闭，不影响 CoreBox AI Ask 和 OmniPanel Writing Tools 基础问答。
- Checkpoint / session 表新增不应破坏既有 AI invoke；迁移失败时以无历史轻上下文继续回答，并展示 degraded reason。
- Memory 删除应优先软删除 / tombstone，避免多设备同步或旧索引重新注入。
- `prepareTurn()` 失败时不得阻断基础 AI 调用；应降级为无历史轻上下文，并在 UI 显示 degraded reason。
- 如果 feature flag 关闭，已写入的 session/checkpoint/memory 数据保留但不参与 prompt；重新开启后必须先跑 schemaVersion 校验。

## 32. 关联入口

- AI 2.5.0 主线：`./ai-2.5.0-plan-prd.md`
- 本地知识检索：`./ai-2.5.3-local-knowledge-retrieval-prd.md`
- 本地模型运行时：`./ai-2.5.5-local-model-runtime-prd.md`
- ASR Provider Runtime：`./ai-2.5.8-asr-provider-runtime-prd.md`
- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
