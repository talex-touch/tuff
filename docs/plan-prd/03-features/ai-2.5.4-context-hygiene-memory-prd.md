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

## 17. Domain API 合同方向

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
  warnings: Array<{ code: string; message: string }>
}

interface FinalizeTurnInput {
  sessionId: string
  userTurnId: string
  assistantTurnId: string
  providerTraceId?: string
  result: 'success' | 'failed' | 'cancelled'
  errorCode?: string
}
```

跨层调用要求：CoreApp renderer 只能经 typed transport / domain SDK 调用上述能力；插件只能通过受权限控制的 Intelligence SDK 访问，不暴露底层 SQLite 表。

## 18. SQLite Schema 细化建议

Schema 首版应保证可迁移、可回放、可删除；不要求一步引入 embeddings 表。字段类型以 Drizzle / LibSQL 实现时再精确化。

### `intelligence_sessions`

| 字段 | 说明 |
| --- | --- |
| `id` | session id |
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
| `content` / `contentRef` | MVP 可本地明文，未来可迁移到加密引用；同步不得明文 |
| `tokenEstimate` | prompt budget 使用 |
| `privacyLevel` | `normal` / `sensitive` / `secret` |
| `createdAt` | 创建时间 |
| `metadata` | provider、entrypoint、trace 等非敏感信息 |

建议索引：`sessionId + createdAt`、`privacyLevel`。

### `intelligence_memory_items`

| 字段 | 说明 |
| --- | --- |
| `id` | memory id |
| `type` / `scope` | 记忆分类与作用域 |
| `status` | `suggested` / `saved` / `disabled` / `deleted` / `rejected` / `superseded` |
| `content` | 本地 SoT 内容，普通记忆可保存；secret 禁止普通保存 |
| `summary` | 检索和 UI 展示摘要 |
| `tags` | 搜索标签 |
| `confidence` | 自动提取置信度 |
| `privacyLevel` | 敏感级别 |
| `sourceSessionId` / `sourceTurnId` | 来源 |
| `ttl` / `expiresAt` | 生命周期 |
| `createdAt` / `updatedAt` / `lastUsedAt` | 时间 |
| `usageCount` | 注入次数 |

建议索引：`status + scope + type`、`updatedAt`、`lastUsedAt`。

### `intelligence_context_package_logs`

该表用于调试和 evidence，不默认保存完整 prompt。

| 字段 | 说明 |
| --- | --- |
| `id` | log id |
| `sessionId` / `turnId` | 关联 turn |
| `scope` | 本次 context scope |
| `sourceRefs` | 被注入来源 id 列表与 reason |
| `tokenEstimate` | 总预算估算 |
| `providerTraceId` | provider / model trace |
| `warnings` | degraded、pruned、policy-blocked 等原因 |
| `createdAt` | 创建时间 |

## 19. 策略细则

### MemoryPolicy 敏感拦截

首版至少拦截以下内容，命中后默认 `privacyLevel=secret` 且不进入普通 MemoryItem：

- API key、Bearer token、OAuth refresh token、JWT、SSH/private key、恢复码、助记词。
- 密码、口令、一次性验证码、Cookie、session id。
- 身份证件、银行卡、住址、手机号等明显个人敏感信息。
- 用户明确说“不要记住”“别保存”“临时说一下”的内容。

无法确定是否敏感时，进入 `sensitive-review`，只允许作为当前 session 临时上下文，不进入长期记忆。

### 记忆冲突处理

- 同 scope、同 type、语义冲突时，新记忆不得直接覆盖旧记忆，需写 `supersedes` link。
- UI 展示当前生效版本，并允许用户查看旧版本来源。
- prompt 注入只使用最新 enabled/saved 版本；superseded 仅用于解释和回滚。

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

## 20. 集成点

| 入口 | ContextHygiene 行为 |
| --- | --- |
| CoreBox AI Ask | 默认轻上下文；显式继续时召回旧 session；展示上下文 chip |
| OmniPanel Writing Tools | 优先使用选区/剪贴板/OCR capsule，不默认带完整聊天历史 |
| Workflow `Use Model` | 每个 run 可独立 session；Review Queue 写 checkpoint，不默认写长期记忆 |
| Assistant | 悬浮球/VoicePanel 默认轻上下文；语音或剪贴板动作仅注入当前动作 capsule |
| `touch-intelligence` 插件 | 通过 Intelligence SDK 触发，受 `intelligence.basic` 和 memory 权限策略控制 |
| 2.5.3 Local Knowledge | RetrievalAssembler 可调用 buildContext，但必须保留 citation / permission metadata |
| Provider Runtime | 接收 ContextPackage 后调用模型；不得反向修改 MemoryStore |

## 21. UI / UX 要求

### 对话态提示

- 对话区域显示当前上下文模式：`轻上下文` / `当前任务` / `已召回历史` / `不参考历史`。
- 自动新会话时显示轻量提示：“已开启新会话，旧上下文不会默认影响回答”。
- 提供“继续上次任务”入口，通过检索召回最近 archived session summary。
- 提供“本次不带历史问”入口，强制 ContextScope 为 `none`。
- 对已注入历史或记忆提供“为什么使用这段上下文”的解释入口。

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

## 22. 安全与隐私约束

- Provider secret、API key、token、恢复码、口令不得进入普通 MemoryItem、localStorage、日志或同步 JSON。
- MemoryPolicy 必须在写入前做敏感信息检测；无法判断时默认进入 sensitive review，不自动保存。
- ContextPackage 日志默认只保存 source id、reason、token 估算、trace 和错误码，不保存完整 prompt/response。
- 新增跨层接口必须使用 typed transport / domain SDK，不新增 raw channel。
- 多设备同步必须使用 `/api/v1/sync/*` 和 keys/devices 配套能力，且只同步密文 payload 或引用。
- 用户删除 memory 后，后续 prompt 构建不得再注入该 MemoryItem；需要记录 tombstone 或版本状态避免同步回灌。
- 工作区 / 项目级记忆不得跨 workspace 注入，除非 scope 明确为 global 且用户允许。
- 插件不能读取 MemoryStore 原始内容；只能通过受权限和 scope 过滤的 Intelligence SDK 获取准备好的上下文。

## 23. 观测与证据

### Runtime 指标

- `context.scope_decision.count`：按 scope / entrypoint / reason 统计。
- `context.session_boundary.count`：新建、归档、任务切换、手动重置。
- `context.compression.count`：成功、失败、degraded、节省 token 估算。
- `context.memory.candidate.count`：按 type / scope / privacyLevel 统计。
- `context.memory.policy_block.count`：敏感拦截、用户拒绝、scope 冲突。
- `context.package.token_estimate`：输入、summary、memory、retrieval、outputReserve 分布。
- `context.retrieval.hit.count`：session summary、memory、knowledge source 的命中与使用。

### Evidence 要求

- 至少保留 6 个固定 evidence item：长空闲新会话、显式继续旧会话、手动不带历史、自动压缩、敏感记忆拦截、删除记忆后不再注入。
- Evidence 只记录上下文来源 id、reason、tokenEstimate、traceId、degraded reason，不保存完整敏感 prompt。
- UI evidence 需要展示上下文 chip、checkpoint toast、memory suggestion、context explain drawer。

## 24. 测试计划

### Unit Tests

- `SessionBoundaryManager`：空闲阈值、手动 reset、topic drift、token overflow。
- `ScopeDetector`：确定性关键词优先、LLM classifier 降级、低置信度 ask-user。
- `CompressionService`：结构化输出 schema、失败不删 turns、sourceTurnRange 正确。
- `MemoryPolicy`：API key/token/password 拦截、用户“不要记住”优先、scope 冲突。
- `PromptBudgetManager`：不同模型预算、输出预留、memory/retrieval 裁剪顺序。
- `ContextPackageBuilder`：explain 来源完整、旧 session 原文默认不注入。

### Integration Tests

- CoreBox AI Ask 长空闲后新建 session，并写入 `session_start` checkpoint。
- 用户“继续刚才”可召回 archived session summary，但不注入 archived turns 全文。
- OmniPanel Writing Tools 使用选区 capsule，不继承 CoreBox 长会话。
- Memory 删除后，下一次 prepareTurn 不再返回该 memory sourceRef。
- 2.5.3 检索不可用时，ContextPackage 返回 degraded reason 并继续轻上下文。

### UI / E2E Tests

- 对话 header 显示上下文模式 chip。
- 自动新会话 toast 可见。
- Memory 面板可禁用和删除记忆。
- Context explain drawer 展示每段上下文来源和 reason。
- “不带历史问”后回答不使用旧 session sourceRef。

## 25. 验收清单

- [ ] 超过空闲阈值后再次提问，会自动创建新 session 与 `session_start` checkpoint。
- [ ] 新 session 默认不注入旧 session 原文。
- [ ] 用户显式“继续刚才”时，可以召回旧 session 摘要并展示召回原因。
- [ ] 长会话 token 不线性增长，能按阈值自动生成结构化 CompressionSnapshot。
- [ ] 压缩失败不会删除原 turns，并会返回 degraded reason。
- [ ] 稳定用户偏好可进入长期 MemoryItem；临时上下文不会误存为长期记忆。
- [ ] 敏感内容不会明文进入普通记忆、localStorage、普通 JSON、日志或同步 payload。
- [ ] ContextPackage 可解释每段历史、记忆和检索片段的来源、reason 与 token 预算。
- [ ] 用户可以查看、禁用、删除记忆，删除后不再被注入。
- [ ] CoreBox / OmniPanel / Workflow / Assistant 至少各有一个最近路径 prepareTurn integration case。
- [ ] README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步。

## 26. 分期计划

### P0 - ContextHygiene 基线

- 新增 SQLite session / turn / checkpoint / package log schema。
- 实现 SessionBoundaryManager、CheckpointManager、确定性 ScopeDetector。
- 实现 Rolling Summary 与 CompressionSnapshot schema 校验。
- 实现 PromptBudgetManager 与 ContextPackage explain log。
- CoreBox AI Ask 接入上下文 chip、手动新会话和不带历史问。

### P1 - Memory MVP

- 实现 MemoryCandidate 提取与 MemoryPolicy 敏感拦截。
- 支持手动确认 / 可撤销保存。
- Memory 面板查看、禁用、删除与 tombstone。
- 用户偏好与项目级记忆的检索注入。

### P2 - Retrieval 增强

- 接入 2.5.3 本地知识检索、FTS5 和 metadata filter。
- 可选 embeddings / rerank 增强相关性。
- 旧 session summary 与知识片段统一进入 RetrievalAssembler。
- Context explain drawer 展示 retrieval citation。

### P3 - 衰减与同步

- TTL、usageCount、冲突解决与 supersedes link。
- tombstone / 删除同步语义。
- 密文同步载荷与多设备恢复策略。
- Agent 长任务 checkpoint 与 Workflow run 关联。

## 27. 回滚与兼容

- ContextHygiene 可通过设置回退为“仅当前会话最近 turns + session summary”。
- 自动长期记忆可单独关闭，不影响 CoreBox AI Ask 和 OmniPanel Writing Tools 基础问答。
- Checkpoint / session 表新增不应破坏既有 AI invoke；迁移失败时以无历史轻上下文继续回答，并展示 degraded reason。
- Memory 删除应优先软删除 / tombstone，避免多设备同步或旧索引重新注入。
- `prepareTurn()` 失败时不得阻断基础 AI 调用；应降级为无历史轻上下文，并在 UI 显示 degraded reason。

## 28. 关联入口

- AI 2.5.0 主线：`./ai-2.5.0-plan-prd.md`
- 本地知识检索：`./ai-2.5.3-local-knowledge-retrieval-prd.md`
- 本地模型运行时：`./ai-2.5.5-local-model-runtime-prd.md`
- ASR Provider Runtime：`./ai-2.5.8-asr-provider-runtime-prd.md`
- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
