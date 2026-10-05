# Research: 审计页数据层（`intelligence_audit_logs` 只读聚合）

- **Query**: 新审计页（区间总量 / 本地自然日趋势 / 按渠道·模型·能力·调用方拆解）在数据层能拿到什么、口径陷阱在哪：schema 与索引、caller 实际取值、metadata 白名单、provider 列语义、成本估算、语音洞察的本地自然日先例、transport 事件注册与契约测试、查询上限与计数、未落盘日志、隐私删除复用。
- **Scope**: internal（另做了本机 SQLite/libSQL 实测，临时库已删）
- **Date**: 2026-10-03

## Findings

### Q1 Schema 与索引；时间范围扫描成本

`intelligence_audit_logs`（`apps/core-app/src/main/db/schema.ts:867-894`；唯一建表迁移 `apps/core-app/resources/db/migrations/0014_sad_black_crow.sql:1-25`，之后没有迁移再动这张表）：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | integer PK autoincrement | |
| `trace_id` | text NOT NULL UNIQUE | 唯一索引 `intelligence_audit_logs_trace_id_unique` |
| `timestamp` | integer NOT NULL（毫秒） | 写入的是**请求开始时间**：`intelligence-sdk.ts:2373` `timestamp: startTime` |
| `capability_id` / `provider` / `model` | text NOT NULL | provider 的语义见 Q4 |
| `prompt_hash` | text | |
| `caller` | text **可空** | schema 注释写 “pluginId or 'system'”（`:877`），实际取值见 Q2 |
| `user_id` | text | |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | integer NOT NULL 默认 0 | |
| `estimated_cost` | real 可空 | 见 Q5 |
| `latency` | integer NOT NULL | |
| `success` | integer(boolean) NOT NULL | |
| `error` | text | 失败码 |
| `metadata` | text（JSON） | 见 Q3 |

索引（`schema.ts:888-893`，迁移 `:22-25`）：`idx_audit_timestamp(timestamp)`、`idx_audit_caller(caller)`、`idx_audit_capability(capability_id)`、`idx_audit_provider(provider)`。全部是单列索引；**`model` 没有索引，也没有复合索引**。

`intelligence_usage_stats`（`schema.ts:936-959`，迁移 `:43-61`）：主键 `(caller_id, caller_type, period)`，索引 `idx_usage_period(period_type, period)`。`period` 是 `'day:YYYY-MM-DD'` / `'month:YYYY-MM'`，由 `toISOString()` 切出，即 UTC（`intelligence-audit-logger.ts:97-102`）。`callerType` 只有 `callerId === 'system'` 时才是 `'system'`，其余一律记为 `'plugin'`，`core.voice.dictate` 这类内核调用方也算在内（`:64`、`:521`）。该表只在 flush 事务里 upsert（`:511-516`、`:539-601`）。

**时间范围扫描是否便宜？便宜。**
- 在迁移 0014 的 schema 上跑 `EXPLAIN QUERY PLAN`（本机 sqlite3 3.54）：
  - `WHERE timestamp >= ? AND timestamp < ? GROUP BY provider, model` → `SEARCH … USING INDEX idx_audit_timestamp (timestamp>? AND timestamp<?)`，外加 `USE TEMP B-TREE FOR GROUP BY`。
  - `COUNT(*)` 加同样的范围条件 → `USING COVERING INDEX idx_audit_timestamp`。
  - `ORDER BY timestamp DESC LIMIT 50` → 走同一个索引，不需要临时排序。
- 造了 20 万行、覆盖 30 天的数据（M4 Pro）：总量聚合 25 ms；按 provider 分组 36 ms；按 caller 分组 51 ms；按 `strftime(..., 'localtime')` 分日 75 ms；按 `json_extract(metadata,'$.operation')` 分组 69 ms。
- 现有测试已经断言保留期清理查询走 `idx_audit_timestamp`（`apps/core-app/src/main/modules/privacy/retention-migration.test.ts:234-239`）。
- 生产代码里已经有直接聚合原始行的先例：`intelligence-quota-manager.ts:217-227`，按 caller 和 `timestamp >= minuteAgo` 算 `count(*)` / `coalesce(sum(total_tokens),0)`。
- 会让行数膨胀的来源：
  - 文件内容 embedding，每次一行（`box-tool/addon/files/embedding-service.ts:145,315`）。
  - 剪贴板 OCR agent（`ocr/ocr-service.ts:880`）。
  - 推荐语义 embedding / rerank（需用户开启 `aiEmbeddingEnabled`，`recommendation-engine.ts:3148-3184,3241-3262`）。

### Q2 `caller` 的实际取值、调用点、能力 id 与标签

**写入路径**：生产环境里只有 `TuffIntelligenceSDK.invoke/stream` 会写审计行：
- invoke 成功 `intelligence-sdk.ts:811-825`、fallback 成功 `:859-873`、失败 `:892-909`；stream 成功/失败 `:1007-1054`。
- `caller` 原样取自 `runtimeOptions.metadata?.caller`，再经 `boundedAuditIdentifier` 处理（`intelligence-audit-logger.ts:149,167-178,228`）：不匹配 `^[\w.:/-]{1,128}$`、以 `/` 开头、像 URL 或含 `.`/`..` 段的值都变成 `'unknown'`；`undefined` 落库为 NULL。
- 以下路径在生产代码里没有调用方：`recordRuntimeAudit`（`intelligence-sdk.ts:2559`）、`DbTuffIntelligenceStorageAdapter.saveAuditLog/saveUsageDelta`（`tuff-intelligence-storage-adapter.ts:63-114`），以及 `markOuterGovernedInvocation`（只在测试里出现）。所以生产环境里任何调用都不会被判为 outer-governed，每次 invoke/stream 都会写一行。

| 原始 `caller` | 来源 | 能力 | 证据 |
|---|---|---|---|
| NULL | Home 对话轮（`metadata.operation='home-conversation'`，走 stream；起流失败时退回 invoke） | text.chat | `renderer/src/modules/conversation/useHomeConversation.ts:198-215,660` |
| NULL | 会话标题（`operation='conversation-title'`，`sdk.text.chat`） | text.chat | `conversation/conversation-title.ts:171-186` |
| NULL | Home 开场白（`operation='home-opening'`，stream） | text.chat | `home-push/opening.ts:282-292,588` |
| NULL | CoreBox 上下文动作。会带 `entry/actionId/inputType/inputSource`，但这些键都会被白名单丢掉 | code.review / text.summarize / text.rewrite / vision.ocr / text.translate / image.caption | `box-tool/addon/context-actions/context-actions-provider.ts:137-144,228-500` |
| NULL | 剪贴板 OCR agent（优先 `local-system-ocr`），以及 OCR 文本的 embedding | vision.ocr / embedding.generate | `ocr/ocr-service.ts:880-887,1146-1152` |
| NULL | 文件内容 embedding（含 `isAvailable` 的 `'test'` 探针） | embedding.generate | `embedding-service.ts:101,145,315` |
| NULL | 宿主 renderer 的 `ttsSpeak` / `chatLangChain` 没带 caller 时（`entry:'tts-speak'` 也会被丢掉） | audio.tts / text.chat | `ai/intelligence-module.ts:1510-1551`；`intelligence-tts-service.ts:106-125` |
| `'system'` | 能力测试（能力页 / 提示词页的 `testCapability`） | 任意 | `intelligence-module.ts:1893-1901`；`IntelligencePromptsPage.vue:99` |
| `'core.intelligence.capability-test'` | ASR 能力测试 → `streamDictation` → 只有润色 text.chat 入审计（实时 ASR 本身不入） | text.chat | `intelligence-module.ts:1861-1876` |
| `'plugin:<plugin.name>'` | 插件的四条入口，caller 都由宿主强制绑定、不信任 payload：①transport invoke/stream/ttsSpeak/chatLangChain；②host capabilities（正则 `^plugin:[A-Za-z0-9._-]+$`）；③context execution；④插件语音。`name` 取 manifest 的 `name`（例如 `touch-intelligence`），不是 `id` | 任意 | `intelligence-module.ts:421-441,521-534,1414,1452`；`plugin/host/plugin-intelligence-host-service.ts:349-412`；`plugin-intelligence-capabilities.ts:822`；`plugin-voice-capabilities.ts:516` |
| `'host:core-app'` | 宿主侧 context execution（目前 renderer 没有调用方） | text.chat | `intelligence-module.ts:421-426,1480-1508`；`intelligence-context-execution.ts:303-319` |
| `'core.voice.dictate'` | 语音：宿主 / 全局听写的一次性 STT、润色、划词改口 | audio.stt / text.chat | `voice/voice-service.ts:260,1132-1145,2107-2113,2229-2241` |
| `'core.voice.file-transcription'` | 文件转写 | audio.stt | `voice-service.ts:1349-1355` |
| `'core.voice.buffered-asr'` | 缓冲式 ASR 渠道 | audio.stt | `voice/buffered-stt-provider.ts:255-271` |
| `'core.voice.speak'` | 朗读 | audio.tts | `voice-service.ts:1386-1405` |
| `'core.assistant.screenshot-translate'` | 截图翻译的 OCR 回退链（`metadata.source='assistant-screenshot-ocr-fallback'`） | vision.ocr / text.translate | `assistant/module.ts:128-129,1381-1438` |
| `'core.recommendation.semantic-embedding'` / `'…semantic-rerank'` | CoreBox 推荐语义（需用户开启） | embedding.generate / search.rerank | `recommendation-engine.ts:3163-3184,3241-3262` |
| `'omni-panel'` | 划词面板 AI 动作（`metadata.source` 是 `OmniPanelContextSource`） | 多种 | `renderer/src/views/omni-panel/ai-actions.ts:377-391` |
| `'ai-cli-orchestrator'` | Pi agent runtime 发出的每一次模型请求（Agents / 工作流 / AI CLI 编排）。**写死，不随发起方变化** | text.chat | `ai/pi-agent-runtime-host.ts:687-699` |
| `'intelligence.orchestrator'`（缺省值） | tuff-intelligence-runtime 的 agent.run 节点 | agent.run | `tuff-intelligence-runtime.ts:1165-1187` |
| 透传发起方 | `agent.run` / `workflow.execute` 的**外层**行（宿主发起时通常为 NULL） | agent.run / workflow.execute | `intelligence-module.ts:1414-1431` |

**完全不进审计表的调用**：
- 渠道连通性测试 `testProvider`：直接调 `provider.chat()`（`intelligence-sdk.ts:2894-3030`）；`fetchModels` 同样不入。
- 实时流式 ASR：走语音 provider 适配器的 `provider.createStream`（`voice-service.ts:1442-1468,1537-1541`），端侧 `'local-offline'` 也在这条路上（`voice-provider-runtime.ts:69-79`）。
- Nexus scene：CoreBox 截图翻译（`box-tool/core-box/image-translate.ts:263-266`）、划词翻译（`omni-panel/index.ts:1449-1460`）、汇率（`currency-ability.ts:207,238`）。
- 缓存命中：SDK 结果缓存命中在审计之前就 return（`intelligence-sdk.ts:731-743`）；TTS 缓存命中同理（`intelligence-tts-service.ts:95-104`）。
- `text.chatStream` / `invokeStream`（`intelligence-sdk.ts:2446-2528`）：没写审计，也没找到生产调用方。

**能力 id**：`intelligence-module.ts:948-1275` 共注册 31 个——
- 文本：text.chat / translate / summarize / rewrite / grammar / classify
- embedding：embedding.generate
- 代码：code.generate / explain / review / refactor / debug
- 分析：intent.detect、sentiment.analyze、content.extract、keywords.extract
- 视觉：vision.ocr、image.caption / analyze / translate.e2e / generate / edit
- 音频：audio.tts / stt / asr / transcribe
- 检索：rag.query、search.semantic / rerank
- 编排：workflow.execute、agent.run

**标签**：
- `zh-CN.json` 里没有以能力 id 为键的文案。唯一的标签是 `DEFAULT_CAPABILITIES[*].label` 里写死的中英双语字符串（`packages/utils/types/intelligence.ts:2950-3400`，例如 `'对话 / Chat'`）。renderer 通过 `useIntelligenceManager().capabilities` 读到（`useIntelligenceManager.ts:122-133`），能力页显示的是 `capability.label || capability.id`（`IntelligenceCapabilitiesPage.vue:486`）。
- 调用方同样没有 i18n 标签。

### Q3 `AUDIT_METADATA_KEYS` 与来源信号

**白名单**（`intelligence-audit-logger.ts:152-165`）：`promptId`、`operation`、`source`、`retryCount`、`batchSize`、`cacheHit`、`fallbackUsed`、`reasoningEffort`、`reasoningApplied`、`reasoningStatus`。

`sanitizeIntelligenceAuditMetadata`（`:184-206`）的规则：
- 只读对象自身的数据属性。
- 保留布尔值、有限数字，以及匹配 `^[\w.:-]{1,128}$` 的字符串（**不允许 `/`**）；其余丢弃。
- 清洗后为空则返回 undefined，列值为 NULL。
- 上游入口是 `getAuditMeta`（`intelligence-sdk.ts:2331-2343`），清洗对象为 `{...runtimeOptions.metadata, ...reasoningAuditMetadata()}`（`:818-821`）。

**生产环境里实际写入的键**：
- `operation`：只有 Home 写，取值 `'home-conversation'` / `'conversation-title'` / `'home-opening'`（`packages/utils/types/intelligence.ts:487-501`）。
- `source`：
  - omni-panel：取值为 `shortcut|mouse-long-press|manual|command|corebox-local-ai|local-ai-shortcut|project-local-ai|unknown`（`shared/events/omni-panel.ts:23-31`）。
  - 截图翻译回退：`'assistant-screenshot-ocr-fallback'`。
- `reasoning*`：只有 chat 写（`reasoning-effort-runtime.ts:125-135`；契约见 `.trellis/spec/main-process/channel-transport-contracts.md:360-361`）。
- `promptId` / `retryCount` / `batchSize` / `cacheHit` / `fallbackUsed`：没有在用的写入方。`promptId` 只出现在无调用方的 storage adapter 里；TTS 的 `cacheHit` 写在返回结果上，不在 metadata 里。

**会被丢掉的常见键**：
- Home 的 `surface` / `autoContext` / `conversationId` / `projectId`。
- CoreBox 的 `entry` / `actionId` / `inputType` / `inputSource`。
- omni-panel 的 `entry` / `featureId` / `contextKinds`。
- 插件的 `featureId` / `aiCommandId`。
- 编排器的 `runId` / `sessionId` / `step`。
- `idempotencyKey`。
- `capabilityId`：在 `:1372-1375` 注入，但另有专门的列。

**结论**：
- 能比 `'system'` 更具体地命名来源的，主要是 `caller` 本身（语音 / 插件 / omni-panel / 截图翻译 / 推荐 / 编排器 / 测试）。
- 在 caller 为 NULL 的行里，**只有 Home 能靠 `metadata.operation` 区分出来**。
- CoreBox 上下文动作、OCR agent、文件 embedding 都是 caller 为 NULL 且没有 metadata，只能按能力粗略推断：`code.*`、`text.summarize/rewrite`、`image.caption` 在宿主代码里只有上下文动作会调；`vision.ocr` 和 `embedding.generate` 则有多个 NULL 来源。
- transport 类型 `IntelligenceAuditLogEntry` 没有 `metadata` 字段（`packages/utils/transport/sdk/domains/intelligence.ts:166-184`），但 `queryLogs` 运行时其实会返回它（`intelligence-audit-logger.ts:657`）。

### Q4 `provider` 列：配置 id、类型、Nexus 服务端 id 三者混存

| 路径 | 写入的 `provider` | 证据 |
|---|---|---|
| OpenAI 兼容系（openai/deepseek/siliconflow/custom/Ollama local）的 chat，以及经 `this.chat` 实现的 translate/summarize/rewrite/grammar/code.* | **渠道配置 id**（`this.config.id`） | `providers/langchain-openai-compatible-provider.ts:725-757,~854`；`runtime/base-provider.ts:221-260` |
| 同一系的 embedding / visionOcr / image* / tts / stt | **渠道类型**（`this.type`） | 同文件 `:785-833,911-947,952-977,982-1003,1008-1070,1074-1136,1140-1203,1269-1331` |
| Anthropic 的 chat / OCR / image | `'anthropic'`（类型） | `anthropic-provider.ts:221-246,350-440` |
| Ollama chat、系统 OCR | `'local'`；系统 OCR 的 model 是 `'system-ocr'`，渠道 id `local-system-ocr` 不落库 | `local-provider.ts:169-195,287-328` |
| Pi CLI chat（非流式） | `'local'` | `pi-cli-provider.ts:511-538` |
| Nexus invoke | 服务端返回的 provider（**Nexus 侧 provider 记录 id**）；没有时用 `'tuff-nexus-default'` | `nexus-provider.ts:347`；`apps/nexus/server/utils/tuffIntelligenceLabService.ts:2376` |
| Nexus stream | 服务端事件里的 provider，会覆盖本地值 | `nexus-provider.ts:404-418`；`intelligence-sdk.ts:1144-1148` |
| Nexus 图片翻译 / STT | `'tuff-nexus-default'` | `nexus-provider.ts:580,603` |
| 其它 stream（chunk 不带 provider 时） | 渠道配置 id | `intelligence-sdk.ts:998-1006,1097-1112` |
| invoke 失败行 | 选中渠道的配置 id；**model 固定为 `'unknown'`** | `intelligence-sdk.ts:895-908,2430-2436` |
| agent.run / workflow.execute 外层行 | `'tuff-pi-runtime'` / `'intelligence-runtime'` | `ai-cli-orchestrator.ts:1518-1521,1629-1632`；`intelligence-sdk.ts:1984-1987` |

带来的后果：
- 按 provider 直接 GROUP BY 时，同一渠道会被拆成好几个桶：成功的 chat 行记配置 id，embedding/OCR 行记类型，失败行记配置 id。
- 反过来，类型桶（`'openai'`、`'custom'`、`'local'`）会把同类型的多个渠道合并在一起。

renderer 能用来映射名称和图标的东西：
- **持久化的渠道列表**：`useIntelligenceManager().providers`，含 id/name/type/metadata（`renderer/src/modules/hooks/useIntelligenceManager.ts:96-110`）。
  - 默认 id：`openai-default`、`anthropic-default`、`deepseek-default`、`siliconflow-default`、`tuff-nexus-default`、`local-default`（`packages/utils/types/intelligence.ts:2867-2940`）。
  - 自建渠道的 id 形如 `custom-${Date.now()}`（`IntelligenceChannelsPage.vue:140,231`）。
- **只在运行时注入、renderer 存储里没有的渠道**：`local-system-ocr`（`intelligence-config.ts:57-71`），以及 `pi-cli-default` / `omp-cli` / `codex-cli` / `claude-cli`（`intelligence-config.ts:1195-1210`）。`getProviderModelOptions(capabilityId)` 会按能力返回运行时渠道集合的 `providerName` / `providerType`（`intelligence-provider-model-options.ts`）。
- **图标**：
  - `providerIconFor(type)`（`renderer/src/modules/intelligence/provider-icons.ts:11-18,44-48`；未知类型回落到 custom 图标）。
  - `providerIconForId(id, type)`，覆盖 CLI 的 id（`:64-91`）。
  - `resolveProviderIcon(provider)`，用户自选的图标优先（`provider-icon-override.ts:48-54`）。
  - Nexus 用 `TUFF_NEXUS_PROVIDER_ICON`（`renderer/src/modules/intelligence/nexus-provider.ts:18-22`），配合 `isNexusManagedProvider`（`packages/utils/intelligence/nexus-provider.ts:16-40`）。
- **已删除的渠道**：`provider-credential-service.ts` 不碰审计行，历史行保留旧 id，查表会落空。Nexus 服务端的 provider id 在本地也无法解析。

### Q5 `estimatedCost`

- 计算优先级（`intelligence-audit-logger.ts:311-313`）：显式传入的 `estimatedCost` → `usage.cost` → `estimateCost(model, usage)`（`:300-305`）。
- `estimateCost` 按 `MODEL_COSTS` 表计算（`:129-146`），每 1K tokens 分别计 prompt 与 completion：
  - 表里只有 11 个旧型号，必须**精确匹配**：gpt-4o / gpt-4o-mini / gpt-4-turbo / gpt-3.5-turbo / text-embedding-3-small / text-embedding-3-large / claude-3-5-sonnet-20241022 / claude-3-opus-20240229 / claude-3-haiku-20240307 / deepseek-chat / deepseek-coder。
  - 其他一律按 `default`：$0.001 / $0.002 每 1K tokens。所以**任何未知模型只要有 token 就会得到非零成本**，例如 `gpt-4o-2024-08-06`、新一代模型名、Nexus 模型名。
  - 结果保留 6 位小数；`queryLogs` 会把 0 变成 undefined（`:656`）。
- 成本恒为 0 的情况：
  - Ollama / 系统 OCR，因为显式写了 `usage.cost: 0`（`local-provider.ts:76-83`）。
  - token 为 0 的行，例如多数 STT/TTS/图片、没有 usage 的失败行。
- Pi CLI 会采用 Pi 上报的 `usage.cost.total`（`pi-cli-runtime.ts:505-532`）。
- 测试锚点：gpt-4o 1000/1000 tokens 算出 0.02（`intelligence-audit-logger-caller-period.test.ts:74-112`）。
- **Nexus**：
  - 本地 `normalizeUsage` 会丢掉 cost（`nexus-provider.ts:225-231`），于是本地按服务端返回的模型名和本地价目表估一个 USD 数。
  - 实际计费是 Nexus credits：服务端调用 `consumeCredits`（`apps/nexus/server/utils/tuffIntelligenceLabService.ts:22`），注释写明 FREE 账户每月 20,000 credits，约 1 credit/token（`:330-331`）。
  - renderer 已有现成的 credits 视图：`renderer/src/modules/nexus/credits-summary.ts`（`useCreditsSummary`）和 `components/account/CreditsSummaryBlock.vue`。credits 是账户级的，不按设备区分。
- **Agent / 工作流外层行**：
  - usage 等于内层模型调用的累加：worker 用 `addUsage` 累加（`pi-agent-runtime-worker.ts:386`），orchestrator 再透传（`ai-cli-orchestrator.ts:1266,1513-1517,1621-1627`），外层行不带 cost。
  - 外层行的 model 是 `'pi-agent-core'` 这类不在价目表里的名字，因此按 default 价重新计一次成本；而内层 `'ai-cli-orchestrator'` 行已经单独计过一次。
- 现状展示：`IntelligenceUsageStats.vue:64-68` 以 `$` 显示，标签是「成本」（`intelligence.usage.cost`），没有任何「估算」字样。

### Q6 本地自然日先例：`voiceSdk.getInsights`

- **事件**：`defineEvent('voice').module('api').event('get-insights').define<void, …>()`，**payload 是 void，不接受 renderer 传来的时区**（`packages/utils/transport/sdk/domains/voice.ts:576-577`）。SDK 侧 `transport.send(voiceApiEvents.getInsights, undefined)`（`:735-738`）。
- **handler**：`voice/voice-module.ts:266-279`。用 `withPermissionSafeApi(VOICE_PERMISSION)` 包装，插件来源直接抛 `VOICE_INSIGHTS_HOST_ONLY`，然后调 `voiceInsightsStore.getInsights()`。
- **分桶发生在写入时**，见 `voice/voice-insights-store.ts`：
  - `localDate(capturedAt)` 用 `Date#getFullYear/getMonth/getDate`，即主进程所在 OS 的时区（`:74-80`）。
  - `recordSuccess` 把结果按 `voice_insight_days.day = 'YYYY-MM-DD'` upsert（`:173,214-224`）。
  - 每次写入都会把 `Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'` 存进 `voice_insights_state.timezone`（`:103-105,192,230`）。
  - 日期加减在 UTC 空间里对 `YYYY-MM-DD` 做（`previousDate`，`:82-87`），不受 DST 影响。
- **读取**：`getInsights(now)` 先算 `today = localDate(now)`，取 `[today-364, today]` 区间内的稀疏 `days[]`，返回 `timezone: state.timezone || timezone()`（`:397-448`）。`VoiceInsights.timezone` 字段定义在 `voice.ts:134-153`。
- **renderer 侧**（`views/base/VoiceInsights.vue`）：
  - 先校验 `insights.timezone`（`:240-250`）。
  - 用 `Intl.DateTimeFormat('en', { timeZone })` 把时间戳转成 day key（`:265-273,290-294`）。
  - 展示格式化一律用 `timeZone:'UTC'` 处理 key（`:274-289,304-311`）。
  - 热力图在 UTC 空间里逐日迭代并补零（`:435-475`）。
  - 文案 `voiceInsights.report.calendarMethod` 会写明所用时区（`zh-CN.json:1388`）。
- **测试情况**：
  - `voice-insights-store.test.ts:21-70` 用临时目录里的真实已迁移 libSQL，mock 掉 `db-write`，并固定 `NOW = Date.UTC(2026,0,15,12)`。但它**只测了 polish telemetry**，`localDate` / `getInsights` 没有时区相关测试。
  - renderer 测试 `VoiceInsights.test.ts:56-81` 的夹具固定 `timezone:'UTC'`、用 `toISOString` 生成 key，并在 `:694` 断言 `getInsights` 发出的 payload 是 `undefined`。
  - `apps/core-app/vitest.config.ts` 没有固定 TZ，仓库里也没有任何测试设置 `process.env.TZ`。
- **另一个先例**：`db/utils.ts:76-79` 的 `toLocalDayKey`，按每个时间戳各自的 `getTimezoneOffset()` 计算，同样没有测试覆盖。
- **实测**：用仓库里的 `@libsql/client`，在 `TZ=America/Los_Angeles` 和 `Asia/Shanghai` 下，`strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime')` 与 JS 本地日期逐例一致，包括跨 UTC 日界的时间戳。

### Q7 事件定义与注册、权限、契约测试

- **定义**（`packages/utils/transport/sdk/domains/intelligence.ts`）：
  - 事件：`intelligenceApiEvents.getAuditLogs/getTodayStats/getMonthStats/getUsageStats` = `defineEvent('intelligence').module('api').event('get-audit-logs' …).define<Req, IntelligenceApiResponse<Res>>()`（`:1007-1039`），事件名形如 `intelligence:api:get-audit-logs`。
  - `IntelligenceSdk` 接口：`:703-717`。
  - 实现：`transport.send` 加 `assertApiResponse`（`:1697-1727`）。
  - 请求类型：`IntelligenceAuditLogQueryOptions`（`:249-258`）。
- **注册**：`intelligence-module.ts:1941-1974` 的 `registerStatsChannels(registerSafe)`。`registerSafe` 等于 `transport.on` 加 `safeApiHandler`（`:1314-1325`，`main/utils/safe-handler.ts:39`），**不做权限检查**。每个 handler 首行调 `assertHostOwnedIntelligenceControlPlane(context)`，`context.plugin` 存在就抛 `INTELLIGENCE_HOST_ONLY_CAPABILITY`（`:372-376`）。
- **插件能否调用？不能，有三层拦截**：
  1. 主进程 handler 是 host-only（上一条）。
  2. 这几个事件不在插件通道白名单 `PLUGIN_FACING_INTELLIGENCE_EVENTS` 里（`packages/utils/transport/security/plugin-facing-events.ts:27-42`）。
  3. 插件 SDK facade 把它们列为 host-only 并隐藏：`packages/utils/plugin/sdk/intelligence.ts:16-86` 的联合类型（`getAuditLogs` `:40`、`getUsageStats` `:43`），以及 `:88-158` 的 Record（`:112-115`）。
- **新增一个事件时会受影响的测试**：
  - `packages/utils/__tests__/plugin-facing-events.test.ts:292-305`（**会自动变红**）：它从真实 facade 枚举方法路径，并断言 `toEqual(APPROVED_INTELLIGENCE_FACADE_METHOD_PATHS)`（`:98-143`）。新方法如果没加进 `HostOnlyIntelligenceMethod` 和 `HOST_ONLY_INTELLIGENCE_METHODS`，就会出现在 facade 上，测试失败。
  - `packages/utils/__tests__/intelligence-client-hard-cut.test.ts:206-247`：手写的 host-only 清单（`'getAuditLogs'` `:219`），不会自动失败，惯例上需要补一条。
  - `apps/core-app/src/main/modules/ai/intelligence-admin-surface-boundary.test.ts:184-249`：`it.each` 逐项断言插件被拒（`'getAuditLogs'` `:205`、`'getUsageStats'` `:223`）。事件 mock 用 Proxy，新增事件本身不会让它失败，惯例上需要补一条。
  - `intelligence-plugin-channel-boundary.test.ts:402`（数 14 个插件可见事件）：只要新事件不是插件可见的，就不受影响。

### Q8 `getAuditLogs` 上限、计数查询、现有测试

- `queryLogs`（`intelligence-audit-logger.ts:606-659`）：
  - 过滤条件：caller / capabilityId / provider / startTime(gte) / endTime(lte) / success。**没有 model 过滤**。
  - 排序 `ORDER BY timestamp DESC`，`.limit(options.limit || 100)`、`.offset(options.offset || 0)`（`:633-635`）。
  - **没有上限，也不校验**：`limit` 不封顶；负数会按 SQLite 语义变成「不限」。
- handler 把 `data ?? {}` 原样传进去（`intelligence-module.ts:1948-1952`）。SDK 侧 `queryAuditLogs` 的形参类型更窄，但运行时照样透传 `provider/success/offset`（`intelligence-sdk.ts:2622-2632`）。
- **审计日志读取接口没有总数查询**。仓库里现成的 COUNT 只有两处：
  - 隐私 owner 的 `inspectAudit`：`SELECT COUNT(*) … SUM(bytes)`，统计全表（`privacy/owners/intelligence-retention-owner.ts:141-145`），renderer 可以通过 `privacySdk.summary.get(['intelligence-audit'])` 拿到。
  - 配额管理器统计分钟窗口（`intelligence-quota-manager.ts:217-227`）。
- **现有测试**：
  - `intelligence-audit-logger-caller-period.test.ts`：成本优先级、ingress 清洗、caller/period 聚合。
  - `intelligence-usage-stats-consistency.test.ts`：计数器 upsert 失败会回滚。
  - `intelligence-audit-flush-backoff.test.ts`：退避、pending 上限、并发 flush。
  - `intelligence-stream-ledger.integration.test.ts:27-56`：**真实已迁移 libSQL**，mock `databaseModule.getDb`，驱动 stream → audit + counters + quota。
  - `intelligence-typed-transport.integration.test.ts:387-409`：同样是真实 DB。
  - `privacy/intelligence-retention-owner.test.ts`：保留期、删除、导出。
  - `retention-migration.test.ts:234-239`：索引使用。
  - **没有任何测试直接调用 `queryLogs`**；聚合函数只测了内存里的 `aggregateUsageStatsByCallerAndPeriod`。

### Q9 未落盘日志

- 缓冲机制（`intelligence-audit-logger.ts:246-273,310-334,416-453,824-833`）：
  - `log()` 先把行放进 `memoryLogs`（最多 1000）和 `pendingLogs`（最多 5000，溢出时丢最旧的）。
  - 满 20 条后延迟 200 ms flush；否则靠 PollingService 每 30 s 触发一次 `scheduleFlush(0)`。
  - flush 走 `scheduleDbWrite('intelligence.audit.flush')`，即 `database.db` 的 primary 写入通道，审计行和计数器在同一个事务里（`:511-516`）。
  - 失败时指数退避，最长 30 s（`:365-369`）。
  - 显式调用 `flushToDB` 的只有两处：`cleanupRetentionPage`（`:750`）和 `destroy`（`:840`）。
- **`getAuditLogs` / `getUsageStats` / `getToday/MonthStats` 都只读数据库**（`:606-701,713-726`），不包含 `memoryLogs` / `pendingLogs`。`getRecentLogs` / `getRecentAuditLogs`（`:706-708`，`intelligence-sdk.ts:2615-2617`）没有任何 transport 出口。
- 后果：刚发出的调用最多要约 30 s 才出现在页面上，一次连发不到 20 条时尤其如此；数据库持续写失败时会更久。应用崩溃时，未 flush 的行会丢失。
- 其它会导致「刚调用却看不到」的原因：
  1. **全新安装时审计默认关闭**：`DEFAULT_GLOBAL_CONFIG.enableAudit = false`（`packages/utils/types/intelligence.ts:2942-2948`）。首次加载时按它写入种子配置（`intelligence-config.ts:839-855,1097-1100`），运行时的 `?? true` 兜底只在字段缺失时生效（`:1211`）。审计关闭时既不写行，也不更新计数器（`intelligence-sdk.ts:2355,2401`）。
  2. 结果缓存命中、TTS 缓存命中，以及 Q2 列出的不入审计路径。
  3. 手动删除后，`retentionFloorMs = now`（`intelligence-audit-logger.ts:318,747`）：删除前已发起、删除后才完成的调用会被静默丢弃。

### Q10 隐私模块的手动删除

- **owner**（`privacy/owners/intelligence-retention-owner.ts`），负责 `intelligence-audit` 与 `intelligence-context` 两个类别：
  - `previewDelete`：`manual-delete` 时截止点是 `request.nowMs`（`:221-262`）。
  - `delete`：注入了 `auditLifecycle` 时，循环调用 `intelligenceAuditLogger.cleanupRetentionPage(now, batch, signal, cursor, admissionFloor=now)`（`:323-402`）。这一步会先过滤 pending/memory、flush，再按 `(timestamp, id)` 游标分页删除，单次最多 200 行（`intelligence-audit-logger.ts:728-801`）。
  - **只删 `intelligence_audit_logs`**；`intelligence_usage_stats` 计数器、配额、渠道配置都保留，spec 对此有明确约定（`.trellis/spec/frontend/privacy-data-lifecycle.md:177`）。
  - 接线：`privacy/privacy-module.ts:114-116,180`。
- **对外接口**：`PrivacyEvents.category.deletePreview` → `category.delete`，两者都是 host-only（`privacy-transport-handlers.ts:146,279,330-342`）。
  - `deleteCategories(categories, 'delete-selected-data', previewId)` 要求一个由预览签发、**5 分钟内一次性使用**的 `previewId`，类别列表必须与预览一致，确认字面量也必须完全一致（`privacy-lifecycle-service.ts:133-134,1147-1260`；spec `privacy-data-lifecycle.md:278,297`）。
- **renderer 目前的唯一入口**：存储/隐私设置里的 `views/storage/PrivacyDataSection.vue`。通过 `createPrivacySdk(useTuffTransport())`（`:26,54`），流程是 `previewCategoryDelete`（`:545-573`）→ 确认框 → `deleteSelectedCategories`（`:617-666`，在 `:642` 调 `privacySdk.category.delete`）。
- **保留期**：
  - 用户可以按类别配置：`1-hour/1-day/7-days/30-days/90-days/180-days/365-days/permanent`（`packages/utils/transport/events/types/privacy.ts:24-33`），默认 30 天（`retention-policy.ts:55`）。
  - `privacySdk.policy.get()` 返回 `policy.categories['intelligence-audit'].retentionMs`（`privacy.ts:302-305`）。
  - 保留期清理每 24 小时跑一次（`retention-coordinator.ts:142-153`）。
- **语音这边的对照先例**：页面上的「清空」调用自己的 host-only 事件 `voiceSdk.clearInsights()`（`VoiceInsights.vue:688`；`voice-module.ts:311-321`），隐私 owner 委托的是同一个 `store.clearInsights(nowMs)`（`owners/voice-insights-privacy-owner.ts:66-76`）。

## Design implications（选项与取舍，不含实现）

1. **在哪里聚合**
   - (a) 新增一个 host-only 事件（例如 `intelligence:api:get-usage-overview`），由主进程用 SQL 按 `timestamp` 范围一次性算出总量、每日、各维度拆解。
     - 好处：走索引；一次往返；行数到 10⁵ 级仍在几十毫秒。
     - 代价：要改 domain、插件 facade 的 host-only 清单、handler 和契约测试（见第 10 条）。
   - (b) renderer 用现有的 `getAuditLogs` 拉原始行，在前端聚合。
     - 好处：不用新增事件。
     - 代价：行数可能很大；依赖 `limit` 不封顶这一行为；transport 类型缺 `metadata`；仍然拿不到总数。
   - 计数器表已被 PRD 排除：它按 UTC 切日、只按 caller 分、而且和配额耦合。
2. **本地自然日**
   - 先例是「主进程按 OS 时区出 day key，同时返回 `timezone`，renderer 补零」（Q6），不接受 renderer 传时区，没有这方面的先例。
   - 可选做法有两种：
     - 在 JS 里用 `new Date(y, m, d)` 算出 N 个本地零点边界，再按区间统计；DST 安全。
     - 直接 SQL `strftime(..., 'localtime')`；已实测与 JS 结果一致。
   - 测试需要自己处理时区：用跨本地零点的固定时间戳，并用同一个 helper 推导期望值，或者显式设置 TZ。真实 DB 的测试 harness 可以照搬 `intelligence-stream-ledger.integration.test.ts`。
3. **窗口 N 的上限**
   - 保留期是用户可配的（最短 1 小时，可设为永久），清理任务又是每 24 小时才跑一次，所以最早那一天可能不完整，也可能多出一部分。
   - 可以读 `privacySdk.policy.get()` 来约束 N，或者在文案里说明。
   - 审计开关在窗口内可能被切换过，也会让这段时间出现空洞。
4. **调用方命名**
   - 文档约束：caller 是不透明标识，不得按分隔符拆（PRD「文档里的硬约束」）。
   - 可选做法：
     - 先按原始 caller 分组；NULL 和 `'system'` 是两回事，后者其实是能力测试。
     - 内核 caller 用静态表映射显示名（Q2 表）。
     - 插件按已安装插件列表**构造** `plugin:${name}` 后精确匹配，而不是去拆 caller 字符串。
     - NULL 行再按 `metadata.operation` 拆出 Home，其余归为「应用内其他」。
   - 想让上下文动作、OCR、embedding 有名字，需要在写入端补 caller。这超出「只读聚合」的范围，而且历史行仍然是 NULL。
5. **渠道（provider）**
   - 只读方案可以分层映射：
     - 先按 id 在持久化渠道列表里精确查找。
     - 查不到且值本身是类型名，就显示类型并用 `providerIconFor`。
     - `tuff-nexus-default` 和 Nexus 服务端 id 归为 Nexus。
     - 运行时渠道（`local-system-ocr`、各 CLI id）用静态标签。
     - 剩下的显示原始 id，并标注「已删除或未知」。
   - 取舍：同一渠道的成功行（配置 id）、embedding 行（类型）、失败行（配置 id）仍会落在不同的桶里。要做到准确的按渠道归属，需要在写入端统一记录选中渠道的配置 id；这改动的是 SDK 或各 provider，而且修不了保留期内的旧行。
6. **成本**
   - (i) 不把成本作为主指标，改用 token 和请求数。
   - (ii) 标成「估算费用（USD）」，并附说明：价目表只覆盖 11 个旧型号；其余按默认价；本地模型为 0；Nexus 实际按 credits 计费。
   - (iii) Nexus 的行不计入 USD，另外引用 `useCreditsSummary()` 显示 credits。注意它是账户级数据，与本机审计口径不一致。
7. **重复计数**
   - `agent.run` / `workflow.execute` 的外层行，其 token 是内层 `'ai-cli-orchestrator'` 行的累加，成本还会按默认价再估一次。
   - 选项：
     - token / 成本合计时排除这两个能力的外层行（请求数是否计入要单独决定）。
     - 或者在拆解视图里单独展示它们。
   - 文档要求「generic Agent/Workflow outer wrapper 不得重复 inner governance」（`docs/plan-prd/03-features/ai-2.5.0-plan-prd.md:28`），但当前生产代码没有任何地方标记 outer-governed。
8. **数据新鲜度**
   - (a) 聚合前先 `await flushToDB()`（`cleanupRetentionPage` 有先例）。代价是会排在 primary 写入通道的其他写入后面，比如索引写入，页面加载可能被拖慢。
   - (b) 在内存里把 `pendingLogs` 并入聚合。不用等待，但聚合逻辑要写两份，还得遵守 `retentionFloor`。
   - (c) 维持现状，在 UI 上说明「约 30 秒内的调用稍后出现」。
   - 不管选哪个，`enableAudit=false` 都应该有单独的空态，而且这是全新安装的默认值。
9. **调用记录抽屉**
   - 分页需要总数，可以扩展 `getAuditLogs` 的返回值（会破坏现有类型），也可以新增一个返回 `{ rows, total }` 的事件。
   - 可补的过滤项：model（没有索引，但在时间范围内扫描问题不大）、时间范围。
   - 服务端可以给 `limit` 加上限。
10. **新增 transport 事件要改的地方**
    - domain：类型、`IntelligenceSdk`、`intelligenceApiEvents`、`createIntelligenceSdk`。
    - 插件 facade 的 host-only 联合类型和 Record（不改会让 `plugin-facing-events.test.ts` 变红）。
    - `registerStatsChannels`：handler 首行加 `assertHostOwnedIntelligenceControlPlane`。
    - 两个惯例清单测试：admin-surface-boundary、hard-cut。
11. **清空日志**
    - (a) 复用隐私的 `category.delete-preview` + `category.delete(['intelligence-audit'], 'delete-selected-data', previewId)`。
      - 好处：自带影响行数和一次性确认。
      - 注意：只清原始日志，计数器（也就是配额用量）不清；删除那一刻还在进行中的调用会被丢弃。
    - (b) 仿照语音的 `clearInsights`，新增一个 host-only 事件，内部复用同一个 `cleanupRetentionPage` 循环。
      - 好处：交互更轻。
      - 代价：确认语义与隐私流程各维护一份。

## Related Specs

- `.trellis/spec/frontend/privacy-data-lifecycle.md:147-181,257-297`：保留期、owner、预览与删除的契约；审计删除不动配额和用量聚合。
- `.trellis/spec/main-process/channel-transport-contracts.md:360-381`：reasoning 三个审计键只由主进程决定。
- `.trellis/spec/main-process/pi-provider-contracts.md:191-210`：审计行与日/月计数器在整数上必须精确一致；成本比较用机器精度容差。
- `.trellis/spec/main-process/database-write-contracts.md`：`database.db` 只有 primary 写入通道一个写者，flush 走这条通道。

## Caveats / Not Found

- 文档要求「Autonomous caller attribution 必须端到端保留」（`docs/plan-prd/03-features/ai-2.5.0-plan-prd.md:27`），但 `pi-agent-runtime-host.ts:693` 把 caller 写死为 `'ai-cli-orchestrator'`，与文档不一致。
- 插件 view 能否直接通过 transport 调用 `voiceApiEvents.dictate` 没有核实。`voice-module.ts:145` 会忽略 context，一律用 `'core.voice.dictate'`。
- 本地自然日相关逻辑（`localDate`、`toLocalDayKey`）都没有带时区的测试。上面的 20 万行耗时来自系统 sqlite3 CLI，不是 libSQL in Electron，只能当量级参考。
- `service/storage-maintenance.ts:373-390` 的 `cleanupIntelligence` 会删除审计行、计数器和**全部配额**，但目前没有调用方。
- 默认渠道列表里没有 CLI 渠道，它们由主进程在运行时注入，renderer 的存储里看不到。
