# Intelligence Module SDK

> 统一的 AI 能力调用接口，支持多供应商、策略路由、审计计费

## 快速开始

### 基础调用

```typescript
import { intelligence as ai } from './intelligence-sdk'

// 使用 typed domain wrapper
const result = await ai.text.chat({
  messages: [{ role: 'user', content: 'Hello!' }]
})

console.log(result.result) // AI 回复
console.log(result.usage) // { promptTokens, completionTokens, totalTokens }
console.log(result.model) // 实际使用的模型
console.log(result.latency) // 延迟 (ms)
```

### 语法糖方法

```typescript
// 文本对话
const chat = await ai.text.chat({
  messages: [{ role: 'user', content: '你好' }]
})

// 翻译
const translated = await ai.text.translate({
  text: 'Hello world',
  targetLang: 'zh-CN'
})

// 代码生成
const code = await ai.code.generate({
  prompt: '写一个快速排序函数',
  language: 'typescript'
})

// OCR
const ocr = await ai.vision.ocr({
  source: { type: 'data-url', dataUrl: 'data:image/png;base64,...' },
  includeKeywords: true
})
```

### 流式响应

```typescript
const stream = ai.stream('text.chat', { messages: [{ role: 'user', content: '写一首诗' }] })

for await (const event of stream) {
  if (event.type === 'delta') {
    process.stdout.write(event.delta)
  }
}

// 用户取消时调用 `await stream.return(undefined)`；正常消费完毕不需要手动关闭。
```

`start` event 表示客户端的 provisional provider/model 选择；provider 后续若在 `IntelligenceStreamChunk` 返回实际 `traceId`、`provider`、`model` 或 `latency`，SDK 会从首个 metadata-bearing chunk 起用于 delta/usage/end。最终路由与审计展示应读取 `end` event；未返回这些可选字段的 provider 继续使用原有客户端 metadata 与本地耗时。

整次调用只产生一个 `start`；若首选 provider 在首个可见 `delta` 前失败且调用方没有显式锁定 provider，SDK 可尝试下一候选并继续使用原 provisional start。任一候选输出 delta 后即提交该回答，后续错误直接抛出，不再跨 provider fallback 或重放非流式 invoke。

非流式 invoke 的 provider fallback 以整次调用的最终结果记账：fallback 成功时只写一条使用实际 fallback provider/model/trace/usage/latency 的成功审计，并按原始调用 cache key 缓存；不得先把 primary 失败持久化成一次失败调用。只有所有候选均失败时才写一条 canonical failure audit，并继续抛出原 primary error。outer-governed 内部 invoke 仍不重复写审计，但成功结果可缓存。

## Renderer 端使用

### useIntelligenceSdk

```typescript
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'

const intelligence = useIntelligenceSdk()

// 调用 AI
const result = await intelligence.text.chat({
  messages: [{ role: 'user', content: 'Hello' }]
})

// 读取 provider / model 发现信息，避免插件或页面把不可用能力渲染成可执行入口
const status = await intelligence.getCapabilityStatus({ capabilityId: 'text.chat' })
const modelOptions = await intelligence.getProviderModelOptions({ capabilityId: 'text.chat' })

console.log(result.result)
console.log(status.available)
console.log(modelOptions.map((option) => option.providerName))
```

### 兼容 Composables

`useIntelligence()` 与 `useIntelligenceStats()` 仍保留为兼容壳；新代码优先直接使用 `useIntelligenceSdk()`，避免新增一层状态镜像。

```typescript
import { useIntelligenceStats } from '@talex-touch/utils/renderer'

const { getTodayStats, getAuditLogs, exportToCSV, downloadAsFile } = useIntelligenceStats()

// 获取今日统计
const stats = await getTodayStats()
console.log(`今日请求: ${stats?.requestCount ?? 0}`)
console.log(`Token 用量: ${stats?.totalTokens ?? 0}`)
console.log(`成本: $${(stats?.totalCost ?? 0).toFixed(4)}`)

// 导出审计日志
const logs = await getAuditLogs({ limit: 1000 })
const csv = exportToCSV(logs)
downloadAsFile(csv, 'audit-logs.csv', 'text/csv')
```

### Local / Ollama-compatible Provider

CoreApp `LocalProvider` 已支持用户现有 Ollama 服务：通过统一 NetworkService 调用 `/api/chat`（非流式/NDJSON 流式）并从 `/api/tags` 发现模型，无需 API key，始终使用 local direct proxy；仅当捕获到 `NetworkHttpStatusError.status === 404` 且尚未输出时才回退到 OpenAI-compatible local endpoint，普通错误消息中的 `404` 不会切换 backend。流式解码使用单一 UTF-8 decoder，CJK/emoji 即使跨网络 chunk 也不会产生替换字符；无尾换行的最终 `done` frame 仍保留 delta 与 Ollama usage，且只产生一个 terminal chunk。
首个非空 Ollama delta 是该 provider 内部 compatibility commit point：之后即使出现 typed HTTP 404 或任意其他 stream error 也原样传播，不会切到第二个 local backend 拼接另一份回答；只有尚未输出的 typed HTTP 404 才允许兼容回退。
NetworkService 不把 stream response object 视为调用成功：只有 body 正常 `end` 才按 `autoResetOnSuccess` 清理失败计数，body `error` 会记录一次 cooldown failure 并继续传给消费者；主动取消导致的 early close 不计成功或失败。body 已交付后不做自动 retry/replay，避免重复可见 delta。

这只是 **Ollama-compatible 兼容层**。内置 llama.cpp/GGUF binary、模型下载/checksum、删除/加载/停止、资源诊断、管理 UI、平台打包与设备 smoke 仍未实现，不得把现有 LocalProvider 表述为 2.5.5 built-in runtime 完成。

### 本地知识库

本地知识库是 SQLite FTS5 检索能力，不等同于 `search.semantic`，不会自动采集文件或聊天内容。宿主页必须为索引与查询显式选择可信 `permissionScope`；插件请求则由 main-process 依据 verified transport identity 强制绑定为 `plugin:<manifest plugin id>`，忽略缺失或伪造 scope。

```typescript
const intelligence = useIntelligenceSdk()

await intelligence.knowledgeIndexDocument({
  sourceType: 'manual',
  sourceUri: 'plugin://my-plugin/notes/getting-started',
  title: 'Getting started',
  content: 'Plugin-owned searchable text.',
  permissionScope: 'plugin:my-plugin'
})

const search = await intelligence.knowledgeSearch({
  query: 'getting started',
  permissionScope: 'plugin:my-plugin',
  limit: 5
})

const context = await intelligence.knowledgeBuildContext({
  query: 'Summarize the getting started notes',
  permissionScope: 'plugin:my-plugin',
  tokenBudget: 1_200,
  maxChunks: 4
})
```

`knowledgeSearch` 返回 `ok`、`degraded` 或 `unavailable` 状态；调用方必须处理空命中和 `degradedReason`，不得把检索失败伪装为“没有结果”。`knowledgeBuildContext` 把 `tokenBudget` 作为硬上限：完整 chunk 超限时跳过并继续寻找后续可容纳结果；有检索命中但没有任何 chunk 可容纳时返回 `degraded / token-budget-exhausted`，不会截断 chunk 或泄漏超预算正文。所有知识库调用需要 `intelligence.basic` 权限。
其中 `tokenEstimate` 是宿主共享的保守预算估算：连续 ASCII 近似按每 4 个 code point 计 1，CJK 等非 ASCII 至少各计 1，emoji 按更高权重计算；读取旧数据时只允许上调旧估算，不能借旧值绕过预算。该值不等同于具体 Provider tokenizer 的实际计费 token。
运行时预算值只接受有限 `number`：ContextHygiene 对省略、非 number、`NaN` 与正负无穷回退到 1,600；LocalKnowledgeEngine 对同类非法值回退到最小预算 1，且不把数字字符串强制转换为预算。有限小数向下取整，零/负数收敛到 1；typed SDK 签名不变。
同一归一规则也适用于 ContextHygiene prepare 失败后的 `context_prepare_failed` summary/runtime metadata，降级路径不会重新产生 `NaN`、无穷或数字字符串 coercion。

插件获得的 knowledge document/chunk id 是宿主生成的 opaque actor-namespaced id：追加 chunk 时必须复用索引响应中的 `document.id`，不得构造或依赖 SQLite 全局 id。相同插件与输入保持确定性，不同插件即使提交相同本地 id/内容也不会碰撞；宿主可按产品策略显式聚合插件公开内容，但插件不能搜索或覆盖其他 scope。

### 文档语义搜索

`search.semantic` 优先调用 provider 自己实现的 `semanticSearch`；没有该实现时，SDK 对调用方传入的文档执行 embedding 后在本地按余弦相似度排序。它不会检索本地知识库，也不会把文档写入任何索引。已有的 `document.embedding` 会被直接复用，缺失向量的文档才会调用 embedding provider。结果仅包含与查询向量维度一致、达到 `threshold` 的文档，并按 `topK` 截断。

```typescript
const result = await intelligence.search.semantic({
  query: 'how to configure a plugin action',
  documents: [
    { id: 'guide', content: 'Configure plugin actions in manifest.json.' },
    { id: 'note', content: 'Use permission scopes to protect local knowledge.' }
  ],
  threshold: 0.5,
  topK: 3
})
```

该能力在 fallback 路径依赖 provider 的 `embedding` runtime method。优先在 `search.semantic` 的 capability binding 中配置 embedding 模型；该能力没有启用 binding 时，SDK 继承 `embedding.generate` 的 provider 与模型配置。两者都未指定模型时使用 provider 的 embedding 默认模型。若你需要检索已索引的应用内内容，请使用 `knowledgeSearch`。

### 文档重排序

`search.rerank` 优先调用 provider 的原生 `rerank` runtime method。没有原生实现时，SDK 会对查询和每个调用方传入的文档生成 embedding，以余弦相似度重排序；相似度 `[-1, 1]` 会映射为返回的 `score` `[0, 1]`。结果按分数降序排列，分数相同则保留调用方的原始顺序，并通过 `originalRank` 暴露该零基位置，再在排序后应用 `topK`。generic fallback 不写入索引；空文档返回空结果，空查询会在调用 embedding 前失败。若 `search.rerank` 没有启用 binding，它和 `search.semantic` 一样继承 `embedding.generate` 的 provider 与模型 binding。

```typescript
const reranked = await intelligence.search.rerank({
  query: 'plugin permission for local knowledge',
  documents: [
    { id: 'permissions', content: 'Plugins need intelligence.basic for local knowledge.' },
    { id: 'appearance', content: 'Themes customize launcher appearance.' }
  ],
  topK: 1
})
```

### RAG 问答

`rag.query` 优先调用 provider 的原生 `ragQuery` runtime method。若选中的 provider 同时支持 `chat` 和 `embedding`，且调用方显式传入 `documents`，SDK 会先在这些文档上执行本地语义检索，再将**命中的片段**作为上下文交给同一 provider 的聊天模型生成答案。该 fallback 不会读取或写入本地知识库；未传入文档时会以 `RAG query requires caller-provided documents` 失败，不会退化为无依据回答。返回的 `sources` 保留命中文档的内容、metadata 与语义相关度，`confidence` 取最高相关度并限制在 0–1。`rerank: true` 在 generic fallback 中保留语义检索排序；需要专用重排序模型时应使用实现了原生 `ragQuery` 的 provider。

```typescript
const answer = await intelligence.rag.query({
  query: 'Which plugin permission protects local knowledge?',
  documents: [
    {
      id: 'permissions-guide',
      content: 'Plugins must request intelligence.basic before querying local knowledge.',
      metadata: { source: 'plugin-guide' }
    }
  ],
  topK: 2
})
```

## 能力覆盖

`IntelligenceModule.registerCapabilities()`、`@talex-touch/tuff-intelligence` / `@talex-touch/utils` 的 `DEFAULT_CAPABILITIES`、能力测试器和 SDK wrapper 需要保持同一组稳定能力：

| 分类             | 能力 ID                                                                                               | SDK wrapper                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Text             | `text.chat`, `text.translate`, `text.summarize`, `text.rewrite`, `text.grammar`, `text.classify`      | `text.chat`, `text.translate`, `text.summarize`, `text.rewrite`, `text.grammar`, `text.classify`     |
| Embedding        | `embedding.generate`                                                                                  | `embedding.generate`                                                                                 |
| Code             | `code.generate`, `code.explain`, `code.review`, `code.refactor`, `code.debug`                         | `code.generate`, `code.explain`, `code.review`, `code.refactor`, `code.debug`                        |
| Analysis         | `intent.detect`, `sentiment.analyze`, `content.extract`, `keywords.extract`                           | `intent.detect`, `sentiment.analyze`, `content.extract`, `keywords.extract`                          |
| Vision / Image   | `vision.ocr`, `image.caption`, `image.analyze`, `image.translate.e2e`, `image.generate`, `image.edit` | `vision.ocr`, `image.caption`, `image.analyze`, `image.translateE2e`, `image.generate`, `image.edit` |
| Audio            | `audio.tts`, `audio.stt`, `audio.transcribe`                                                          | `audio.tts`, `audio.stt`, `audio.transcribe`                                                         |
| RAG / Search     | `rag.query`, `search.semantic`, `search.rerank`                                                       | `rag.query`, `search.semantic`, `search.rerank`                                                      |
| Workflow / Agent | `workflow.execute`, `agent.run`                                                                       | `workflow.execute`, `agent.run`                                                                      |

`providers: []` 表示 SDK 不会钉死默认供应商。`image.caption` 与 `image.analyze` 由内置 OpenAI-compatible（OpenAI、SiliconFlow，以及配置了视觉模型的 Local）和 Anthropic provider 通过视觉聊天模型实现；选择的模型必须支持图像输入。`rag.query` 可由实现 `chat` 与 `embedding` 的 provider 在调用方提供文档时完成 generic fallback。

OpenAI-compatible provider 已实现 `audio.tts`、`audio.stt`、`audio.transcribe`、`image.generate` 和 `image.edit`，分别调用 `/audio/speech`、`/audio/transcriptions`、`/audio/translations`、`/images/generations` 与 `/images/edits`；自定义厂商若不兼容这些 OpenAI 端点，仍需要 custom/provider plugin 实现相应 runtime method。当前 Nexus server 对 non-chat provider shape 明确 fail-closed，因此 `tuff-nexus-default` 不再声明或绑定 `audio.tts`；已存配置会移除该 stale capability/binding，OpenAI/SiliconFlow TTS 不受影响。

`search.semantic` 优先使用 provider 的 `semanticSearch` runtime method；未实现时 SDK 使用 `embedding` runtime method 和本地余弦排序作为 fallback。语义搜索和重排序 fallback 分别优先采用 `search.semantic` / `search.rerank` binding；对应能力没有启用 binding 时继承 `embedding.generate` 的 provider 与模型 binding。

`getCapabilityStatus` 与 `getProviderModelOptions` 共享运行时方法检查；后者仅返回具备模型且真正实现该能力的候选供应商，并在 capability binding 声明模型时仅展示该 binding 的模型。未声明 binding 时，内置 OpenAI-compatible provider 使用能力专属默认模型，而不是把全局聊天模型暴露给图片、语音或 embedding 入口：OpenAI 图像使用 `gpt-image-1`，STT/转录使用 `whisper-1` / `gpt-4o-transcribe`，TTS 使用 `tts-1` / `tts-1-hd`；SiliconFlow 图像生成使用 `Kwai-Kolors/Kolors`，STT/转录使用 `FunAudioLLM/SenseVoiceSmall`，TTS 使用 `fnlp/MOSS-TTSD-v0.5`，embedding/search fallback 使用 `netease-youdao/bce-embedding-base_v1` / `BAAI/bge-m3`。自定义 OpenAI-compatible provider 如果在全局 `models` 混放多类模型，必须通过 capability binding 明确每个能力可选模型。任何可执行入口都必须仅展示和选择 `available: true` 的选项。`workflow.execute` 和 `agent.run` 由内部编排运行：声明 `text.chat` 的 provider 即可作为其运行时供应商，无需重复声明这两个内部能力；未配置已启用的专用 binding 时，两者继承 `text.chat` 的 provider 与模型 binding。

Tuff Pi 的 token signal 必须来自 host-owned provider：Utility Process 只回传 `promptTokens/completionTokens/totalTokens/cost`，Orchestrator run、Agent 结果与 Workflow 顶层 aggregate 逐层保留。只有 provider/step 均未返回 usage 时才显式回退为全零，不得把“采集缺失”误写成真实零成本。

## 配额管理

### 设置配额

```typescript
import { useIntelligenceStats } from '@talex-touch/utils/renderer'

const { setQuota, checkQuota } = useIntelligenceStats()

// 为插件设置配额
await setQuota({
  callerId: 'my-plugin-id',
  callerType: 'plugin',
  requestsPerDay: 1000,
  tokensPerDay: 100000,
  costLimitPerDay: 1.0
})

// 检查配额
const result = await checkQuota('my-plugin-id')
if (!result.allowed) {
  console.error(`配额超限: ${result.reason}`)
}
```

### 配额字段说明

| 字段                | 类型   | 说明               |
| ------------------- | ------ | ------------------ |
| `requestsPerMinute` | number | 每分钟请求数限制   |
| `requestsPerDay`    | number | 每日请求数限制     |
| `requestsPerMonth`  | number | 每月请求数限制     |
| `tokensPerMinute`   | number | 每分钟 Token 限制  |
| `tokensPerDay`      | number | 每日 Token 限制    |
| `tokensPerMonth`    | number | 每月 Token 限制    |
| `costLimitPerDay`   | number | 每日成本限制 (USD) |
| `costLimitPerMonth` | number | 每月成本限制 (USD) |

## IPC 通道

### 核心调用

| 通道                                          | 说明                                     |
| --------------------------------------------- | ---------------------------------------- |
| `intelligence:api:invoke`                     | 调用 AI 能力                             |
| `intelligence:api:stream`                     | 订阅流式能力输出                         |
| `intelligence:api:tts-speak`                  | 语音合成并播放                           |
| `intelligence:api:chat-langchain`             | LangChain 聊天调用                       |
| `intelligence:api:test-provider`              | 测试供应商连接                           |
| `intelligence:api:test-capability`            | 测试能力                                 |
| `intelligence:api:get-capability-test-meta`   | 获取能力测试输入要求                     |
| `intelligence:api:get-capability-status`      | 获取能力可用性、供应商与 degraded reason |
| `intelligence:api:get-provider-model-options` | 获取能力可用供应商/模型选项              |
| `intelligence:api:fetch-models`               | 拉取供应商模型列表                       |
| `intelligence:api:reload-config`              | 重新加载 Intelligence 配置               |
| `intelligence:api:local-environment`          | 获取本地 AI 环境摘要                     |

### 审计 & 统计

| 通道                               | 说明         |
| ---------------------------------- | ------------ |
| `intelligence:api:get-audit-logs`  | 查询审计日志 |
| `intelligence:api:get-today-stats` | 获取今日统计 |
| `intelligence:api:get-month-stats` | 获取本月统计 |
| `intelligence:api:get-usage-stats` | 获取历史统计 |

### 配额管理

| 通道                                 | 说明         |
| ------------------------------------ | ------------ |
| `intelligence:api:get-quota`         | 获取配额配置 |
| `intelligence:api:set-quota`         | 设置配额     |
| `intelligence:api:delete-quota`      | 删除配额     |
| `intelligence:api:get-all-quotas`    | 获取所有配额 |
| `intelligence:api:check-quota`       | 检查配额     |
| `intelligence:api:get-current-usage` | 获取当前用量 |

## 调用选项

```typescript
interface IntelligenceInvokeOptions {
  // Provider 路由策略。默认 adaptive-default；支持 adaptive-default、rule-based-default 与 round-robin。
  strategy?: string
  // 显式 provider 总是优先于策略路由。
  preferredProviderId?: string
  // 模型偏好
  modelPreference?: string[]
  // 成本上限 (USD)
  costCeiling?: number
  // 延迟目标 (ms)
  latencyTarget?: number
  // 允许的供应商
  allowedProviderIds?: string[]
  // 超时 (ms)
  timeout?: number
  // chat 调用的显式 system prompt；优先于 metadata legacy 字段和 capability binding
  promptTemplate?: string
  // promptTemplate 的 Mustache 变量；provider fallback 保留同一渲染结果
  promptVariables?: Record<string, unknown>
  // 元数据
  metadata?: {
    caller?: string // 调用方 ID (用于审计和配额)
    userId?: string // 用户 ID
    [key: string]: any
  }
}
```

路由优先级固定为 `preferredProviderId`、`modelPreference`、`strategy`。`adaptive-default` 与 `rule-based-default` 当前都按 capability binding / provider 的 `priority` 升序稳定选择；它们不是基于历史延迟或成本的优化器。`round-robin` 仅在前两项没有命中时生效，并按每个 capability 的已排序可用 provider 轮换；首选 provider 失败时按同一轮换顺序尝试后备 provider。旧值 `adaptive` 与 `priority` 分别归一化为 `adaptive-default` 与 `rule-based-default`；未知策略会安全回退到稳定的 priority 路由。

`promptTemplate` / `promptVariables` 只用于 chat prompt 组装。显式顶层字段优先于 `metadata.promptTemplate` / `metadata.promptVariables`（兼容旧调用），模板未提供时再解析 capability prompt binding。模板与变量进入 provider 输入；日志和审计不得保存原文，审计只记录 prompt hash。

## 返回结构

```typescript
interface IntelligenceInvokeResult<T> {
  result: T // 结果数据
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost?: number // 估算成本
  }
  model: string // 使用的模型
  provider: string // 使用的供应商
  latency: number // 延迟 (ms)
  traceId: string // 追踪 ID
}
```

## 失败合同

主进程、typed transport 与 renderer 共用 `@talex-touch/utils/transport/events/types` 导出的 `IntelligenceErrorCode`。可恢复失败携带 `code`、稳定 `reason` 与 `recovery`；UI 应按 `code` 本地化，不要解析 provider 原始文案。

| Code | 语义 |
| --- | --- |
| `NEXUS_AUTH_REQUIRED` | 需要登录 Nexus |
| `PROVIDER_UNAVAILABLE` | 没有可用 provider |
| `QUOTA_EXHAUSTED` | 请求、token 或成本配额已耗尽 |
| `QUOTA_CHECK_UNAVAILABLE` | 配额存储/校验不可用；请求已 fail-closed 阻断 |
| `MODEL_UNSUPPORTED` / `CAPABILITY_UNSUPPORTED` | 当前模型或 provider 不支持能力 |
| `PERMISSION_DENIED` | 调用方缺少所需权限 |
| `NETWORK_FAILURE` | provider 网络请求失败 |
| `INVALID_REQUEST` | 请求无效，不应引导用户修改 provider |
| `UNKNOWN` | 未分类失败，不得伪装成成功或 quota exhausted |

Assistant image scene、OCR 与 text-translate fallback 会保留这些语义以及 `reason/recovery`；只有无法分类的 scene/stage 异常继续使用各阶段兼容错误码。

Nexus token SSE 的 `error` frame 同样携带 canonical `code/message/reason/recovery`。CoreApp 在首个 delta 前或可见 delta 后抛错时都会保留这些字段；legacy message-only frame 仍兼容，但不会伪造 code。Nexus `/invoke` 显式设置 `captureErrorResponseData: true`，通过 `NetworkHttpStatusError.responseData` 恢复同一 typed failure，同时仍按失败进入 retry/cooldown policy；generic network request 默认不解析/保留非 2xx body，无法识别的 legacy body 保留原始 HTTP status error。guest/tokenMode guest preflight 在发起任何 invoke/stream request 前也直接抛出同一 typed `NEXUS_AUTH_REQUIRED` reason/recovery，不再只提供 message。

## 成本估算

内置主流模型价格 (可自动估算):

| 模型              | Prompt ($/1K) | Completion ($/1K) |
| ----------------- | ------------- | ----------------- |
| gpt-4o            | 0.005         | 0.015             |
| gpt-4o-mini       | 0.00015       | 0.0006            |
| claude-3-5-sonnet | 0.003         | 0.015             |
| claude-3-haiku    | 0.00025       | 0.00125           |
| deepseek-chat     | 0.00014       | 0.00028           |

## 数据库表

### intelligence_audit_logs

审计日志表，记录每次 AI 调用。

| 字段              | 类型    | 说明                |
| ----------------- | ------- | ------------------- |
| trace_id          | TEXT    | 唯一追踪 ID         |
| timestamp         | INTEGER | 时间戳              |
| capability_id     | TEXT    | 能力 ID             |
| provider          | TEXT    | 供应商              |
| model             | TEXT    | 模型                |
| prompt_hash       | TEXT    | Prompt 哈希         |
| caller            | TEXT    | 调用方              |
| prompt_tokens     | INTEGER | Prompt Token 数     |
| completion_tokens | INTEGER | Completion Token 数 |
| estimated_cost    | REAL    | 估算成本            |
| latency           | INTEGER | 延迟 (ms)           |
| success           | INTEGER | 是否成功            |
| error             | TEXT    | 错误信息            |

### intelligence_quotas

配额配置表。

### intelligence_usage_stats

用量统计表 (按日/月聚合)。

## 最佳实践

1. **传递 caller**: 插件和 host 内部调用都必须传递稳定 `metadata.caller`，以启用配额控制和审计追踪；legacy Agent channel 会覆盖插件 spoofed caller，并为未显式命名的 host 任务使用 `intelligence.agent-executor`
2. **合理设置配额**: 为插件和产品入口设置合适的配额，防止滥用
3. **使用流式响应**: 长文本生成使用流式响应提升用户体验
4. **按错误码恢复**: 捕获 typed `code/reason/recovery`；不要用字符串包含判断区分 quota、登录或 provider 失败

```typescript
import type { IntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'

try {
  await ai.text.chat({...}, {
    metadata: { caller: 'my-plugin' }
  })
} catch (error) {
  const failure = error as Error & {
    code?: IntelligenceErrorCode
    reason?: string
    recovery?: string
  }
  showIntelligenceFailure(failure.code ?? 'UNKNOWN', failure.reason, failure.recovery)
}
```
