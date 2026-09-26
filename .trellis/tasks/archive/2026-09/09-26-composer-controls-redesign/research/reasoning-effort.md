# Research: 推理强度（模型胶囊里的「高」）——现状全链路与真实接入方案（D11）

- **Query**: 「Tuff 智能 高」里的「高」从哪来；从渲染层 `useHomeConversation` → `sdk.stream('text.chat', …)` → 主进程路由 → 各提供方（OpenAI 兼容 / Anthropic / DeepSeek / SiliconFlow / Tuff Nexus / 本地 pi·omp·Codex·Claude CLI / Ollama），哪一环今天能接住推理强度；给出档位、存储、传递、各提供方映射、路由接不住时的 UI、审计字段与测试。
- **Scope**: mixed（代码只读 + `node_modules` 里**已装** SDK 的类型与实现 + 本机已装 CLI 的 `--help` / 目录；没有凭记忆）
- **Date**: 2026-09-26

行号约定：`HomePage.vue` 正被其他会话持续改动（13:30 时 2664 行，半小时内变了 15 行），引用写「WT 13:3x」并同时给符号名；其余文件行号为当前工作区。

## 0. 结论

1. 「高」是**写死的文案**：`<span class="HomePage-ModelEffort">{{ t('home.effortHigh') }}</span>`（`HomePage.vue` WT 13:3x `:1549`，在 `<HomeModelMenu placement="top-end">` 的 `#trigger` 插槽里），文案在 `zh-CN.json:1526`「高」/ `en-US.json:1526`「High」。没有状态、没有存储、不随请求传出；`HomeModelMenu.vue` 里也没有任何推理强度控件（菜单只有筛选条、搜索、「自动选择」、模型行）。唯一「承诺」过这件事的是按钮的 aria 文案 `home.model` =「选择模型与推理强度」（`zh-CN.json:1455`）。
2. 全链路**没有任何推理强度字段**：`IntelligenceInvokeOptions`（`packages/utils/types/intelligence.ts:408-433`）、`IntelligenceChatPayload`（`:640-657`）、`IntelligenceHomeSurfaceMetadata`（`:461-477`）都没有。Home 可达的提供方里只有 omp 路径碰了推理——写死 `--thinking off`（`pi-cli-runtime.ts:410-411`）。
3. 每一家都**有现成的口子**（已按装在本仓库里的版本核对，见 §3）：OpenAI 兼容走 `ChatOpenAI` 的 `reasoningEffort`；Anthropic 走 `ChatAnthropic` 的 `thinking` + `invocationKwargs`；DeepSeek V4 走 `thinking` + `reasoning_effort`；Codex CLI 走 `-c model_reasoning_effort=…`；Claude Code 走 `--effort`；omp / pi 走 `--thinking`。Tuff Nexus 云端**目前接不住**（服务端适配器不读）。
4. 推荐方案：档位 **自动 / 低 / 中 / 高 / 极高**，默认「自动」= 不传参、每条路由保持今天的行为；**全局**存在 `appSetting.conversation.reasoningEffort`（与模型固定同一块）；作为类型化字段 `IntelligenceInvokeOptions.reasoningEffort` 传递；主进程在**选定提供方之后、发 `start` 之前**统一解析成「请求 / 实际 / 状态」三元组，提供方只负责把「实际」翻译成线格式；路由接不住时：菜单里的档位行**禁用并写明原因**，胶囊**不显示后缀**，回合信息里如实写「未应用」。

## 1. Files Found

| File Path | Description |
|---|---|
| `apps/core-app/src/renderer/src/views/base/home/HomePage.vue` | 胶囊：`modelPill`（WT `:163-173`，只含 `label` / `icon`）、`#trigger` 里写死的 `t('home.effortHigh')`（WT `:1549`）、`.HomePage-ModelEffort` 样式（WT `:2419`）；`useHomeConversation({ routing, autoContext, identity })`（WT `:138-148`） |
| `apps/core-app/src/renderer/src/views/base/home/HomeModelMenu.vue` | 两颗模型胶囊共用的菜单（`TxDropdownMenu`，`:391-518`）；「自动选择」按钮 `:438-447`；无推理强度 |
| `apps/core-app/src/renderer/src/views/base/home/HomeTopBar.vue` | 顶栏另一颗模型胶囊，只显示模型名（`:55-74`），不显示「高」 |
| `apps/core-app/src/renderer/src/modules/conversation/useModelOptions.ts` | 模型列表与固定：`resolvedChoice`（`:156-161`）、`routing`（`:163-166`，只有 `providerId` / `model`）、`select()`（`:168-170`） |
| `apps/core-app/src/renderer/src/modules/conversation/conversation-settings.ts` | `appSetting.conversation` 的读写入口：`ConversationSettings { model, favoriteModels }`（`:11-14`）、`writableConversationSettings()`（`:61-67`，缺块时现建） |
| `packages/utils/common/storage/entity/app-settings.ts` | `conversation: { model, favoriteModels }`（`:356-368`）；同文件已有「常量表 + normalize」的先例（`VOICE_POLISH_STRENGTHS` / `normalizeVoicePolishStrength`，`:3-11`） |
| `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts` | `resolveInvokeOptions()`（`:175-190`）组 `{ preferredProviderId, modelPreference, metadata }`；`sdk.stream(CHAT_CAPABILITY_ID, payload, handlers, invokeOptions)`（`:593`）；失败回退 `sdk.text.chat(payload, invokeOptions)`（`:506`）；`ConversationTurnMeta`（`:51-60`） |
| `apps/core-app/src/renderer/src/modules/conversation/turn-info-rows.ts` | 顶栏 `⋯` 的回合信息行（`buildTurnInfoRows`，`:29-66`）——显示「实际用了什么档」的天然位置 |
| `packages/utils/types/intelligence.ts` | `IntelligenceInvokeOptions`（`:408-433`）、`IntelligenceHomeSurfaceMetadata`（`:461-477`）、`IntelligenceStreamEvent`（`:584-599`）、`IntelligenceChatPayload`（`:640-657`）、默认提供方与 `text.chat` 路由（`:2877-2935`） |
| `packages/utils/transport/sdk/domains/intelligence.ts` | 渲染层 `stream()`：`options: { ...invokeOptions, stream: true }` 原样发出（`:1541-1562`）；`IntelligenceProviderModelOption`（`:217-225`，另有一份在 `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts:187-195`） |
| `apps/core-app/src/main/modules/ai/intelligence-module.ts` | 流式处理器 `registerProtectedStream(intelligenceApiEvents.stream, …)`（`:1440-1475`）；`bindPluginInvokeCaller`（`:519-532`，非插件原样透传） |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | `*stream()`（`:889`）；`prepareRuntimeOptions` 以 `{ ...options }` 起手（`:1313`）；`streamFromProvider` 复制出 `providerRuntimeOptions`（`:1028-1031`）、`applyModelPreference`（`:1436-1480`）、先发 `start`（`:1069-1080`）再调 `provider.chatStream`（`:1083`）；首个 delta 前失败换备选提供方（`:1222`）；审计 `getAuditMeta` / `writeSuccessAudit`（`:2246-2299`） |
| `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts` | 审计元数据白名单 `AUDIT_METADATA_KEYS`（`:152-160`：`promptId, operation, source, retryCount, batchSize, cacheHit, fallbackUsed`），值须匹配 `/^[\w.:-]{1,128}$/`（`:151`） |
| `apps/core-app/src/main/modules/ai/intelligence-service.ts` | 类型 → 提供方类注册（`:60-74`） |
| `apps/core-app/src/main/modules/ai/provider-factory.ts` | `CUSTOM` 在 Nexus / Custom 间分流；`LOCAL` 在 CLI / Ollama 间分流 |
| `apps/core-app/src/main/modules/ai/providers/langchain-openai-compatible-provider.ts` | OpenAI / DeepSeek / SiliconFlow / Custom 的共同基类；`createChatModel()`（`:685-705`）只传 `apiKey, model, temperature, maxTokens, streaming, timeout, configuration`；`chatStream` 只吐文本 delta（`:741-765`） |
| `apps/core-app/src/main/modules/ai/providers/{openai,deepseek,siliconflow,custom}-provider.ts` | 只覆盖默认 baseUrl / 默认模型：DeepSeek 默认 `deepseek-chat`（`deepseek-provider.ts:15`），SiliconFlow 默认 `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`（`siliconflow-provider.ts:10`） |
| `apps/core-app/src/main/modules/ai/providers/anthropic-provider.ts` | `createModel()`（`:164-190`）：`temperature ?? 0.7`、`maxTokens ?? 1024`，无 `thinking`；`chatStream`（`:234-256`）只吐文本 |
| `apps/core-app/src/main/modules/ai/providers/nexus-provider.ts` | 请求体显式挑字段：`options: { providerId, modelPreference, [allowedProviderIds], timeoutMs, metadata }`（`:282`、`:351`） |
| `apps/nexus/server/api/v1/intelligence/stream.post.ts` | 服务端 `parseRequest`（`:36-70`）只保留已知键，`metadata` 原样保留 |
| `apps/nexus/server/utils/tuffIntelligenceLangChainProviderAdapters.ts` | 服务端自建 `ChatOpenAI` / `ChatAnthropic`（`:256`、`:290`、`:321`、`:350`），不读推理强度 |
| `apps/core-app/src/main/modules/ai/providers/local-provider.ts` | Ollama `/api/chat`：`buildOllamaChatBody()`（`:126-139`）只有 `model, messages, stream, options{temperature,num_predict}` |
| `apps/core-app/src/main/modules/ai/providers/pi-cli-provider.ts` | 四个 CLI 共用的 `chatStream`：omp `buildOmpArgs`（`:354`）、codex argv（`:357-376`）、claude argv（`:381-406`）、pi `buildPiArgs`（`:408`） |
| `apps/core-app/src/main/modules/ai/providers/pi-cli-runtime.ts` | `buildPiArgs()`（`:349-385`，无 `--thinking`）、`buildOmpArgs()`（`:396-419`，写死 `--thinking off`）；CLI 提供方 id：`omp-cli` / `codex-cli` / `claude-cli`（`:21-28`），pi 为 `pi-cli-default`（`types/intelligence.ts:436`） |
| `apps/core-app/src/main/modules/ai/providers/pi-model-catalog.ts` | Codex 模型表（`listCodexCliModels`，`:118-155`）、Claude 别名表（`:157-190`） |
| `apps/core-app/src/main/modules/ai/intelligence-provider-model-options.ts` | `getProviderModelOptions()`（`:172-245`）——给菜单的选项，今天不带任何能力描述 |
| `apps/core-app/src/main/modules/ai/pi-agent-runtime-worker.ts` | 另一条路（host-governed coordinator，非 Home 对话）：`thinkingLevel: 'medium'`（`:495`） |

## 2. 现状：一次 Home 发送里「推理」经过哪些手（代码事实）

### 2.1 渲染层

- 胶囊文案：`modelPill` 只有 `{ label, icon }`（WT `:163-173`）；「高」是模板里独立写死的 span（WT `:1549`）。
- 路由：`useModelOptions().routing` = 已解析的固定模型的 `{ providerId, model }`，否则 `{}`（自动，`:163-166`）。固定值存在 `appSetting.conversation.model`，**解析不到时不清空**（`app-settings.ts:357-365` 注释）。
- 请求：`resolveInvokeOptions()`（`useHomeConversation.ts:175-190`）：

```ts
return {
  ...(routing?.providerId ? { preferredProviderId: routing.providerId } : {}),
  ...(routing?.model ? { modelPreference: [routing.model] } : {}),
  metadata  // { surface, operation: 'home-conversation', autoContext, conversationId?, projectId? }
}
```

  流式失败且尚无活动时，用**同一份** `invokeOptions` 走 `sdk.text.chat` 回退（`:504-517`）——新字段两条路都会带上。

### 2.2 传输与主进程

- 渲染层 SDK 原样展开：`{ capabilityId, payload, options: { ...invokeOptions, stream: true } }`（`transport/sdk/domains/intelligence.ts:1562`）。
- 主进程：`bindPluginInvokeCaller`（非插件原样返回，`intelligence-module.ts:519-525`）→ `applyHomeConversationInjection`（只改 payload）→ `tuffIntelligence.stream(capabilityId, payload, runtimeOptions)`（`:1463`）。
- 路由：`prepareRuntimeOptions` 以 `{ ...options }` 起手（`intelligence-sdk.ts:1313`），**顶层未知字段一路保留**；`streamFromProvider` 为每个提供方复制一份 `providerRuntimeOptions = { ...runtimeOptions, metadata: {...} }`（`:1028-1031`）并按该提供方裁剪 `modelPreference`（`applyModelPreference`，`:1436-1480`）；**先** yield `start`（带 `provider`、`model`、`metadata`，`:1069-1080`），**后**调 `provider.chatStream(nextPayload, providerRuntimeOptions)`（`:1083`）。首个 delta 前失败会按 `strategyResult.fallbackProviders` 逐个重试（`:1209-1254`），用的是同一份 `runtimeOptions`——所以「能否应用推理强度」必须**按每次选中的提供方**判断，不能在路由前判一次。
- 自动路由（胶囊「Tuff 智能」）：渲染层事先**不知道**会落到哪个提供方；`text.chat` 默认绑定顺序是 Nexus → OpenAI → Anthropic → DeepSeek → SiliconFlow（`types/intelligence.ts:2923-2931`，前三个默认禁用），再由策略挑选。能知道结果的最早时刻是 `start` 事件。

### 2.3 各提供方今天实际发出去的东西

| 路由 | 类 / 文件 | 推理相关参数（今天） | 流式里的推理内容 |
|---|---|---|---|
| OpenAI / Custom（OpenAI 兼容） | `OpenAiCompatibleLangChainProvider`（`langchain-openai-compatible-provider.ts:685-765`） | 无（温度未设 → 不发） | 不产出 `reasoning-*` 片段，只有文本 |
| DeepSeek | 同上，默认 `deepseek-chat` | 无 | 同上 |
| SiliconFlow | 同上，默认 `DeepSeek-R1-0528-Qwen3-8B`（本身必思考） | 无 | 同上 |
| Anthropic | `AnthropicProvider`（`anthropic-provider.ts:164-256`） | 无；而 LangChain 默认会**显式发送** `thinking: { type: 'disabled' }`（见 §3.2） | 只取文本块 |
| Tuff Nexus | `NexusProvider`（`nexus-provider.ts:282`、`:351`） | 无（服务端也不读） | 只有文本 delta |
| Ollama | `LocalProvider`（`local-provider.ts:126-139`） | 无 | 只有 `message.content` |
| pi CLI | `buildPiArgs`（`pi-cli-runtime.ts:349-385`） | 不传 → pi 用**用户自己的** `defaultThinkingLevel`（本机 `~/.pi/agent/settings.json` 为 `high`） | 有：`thinking_start/delta/end` → `reasoning-*`（`pi-cli-runtime.ts:581-586`） |
| omp CLI | `buildOmpArgs`（`:396-419`） | **写死 `--thinking off`**（规范表 `pi-provider-contracts.md:417` 同样写明） | 同 pi 解析器 |
| Codex CLI | codex argv（`pi-cli-provider.ts:357-376`） | 不传 → 用 `~/.codex/config.toml`（本机 `model_reasoning_effort = "high"`） | 解析器不产出推理片段 |
| Claude Code CLI | claude argv（`pi-cli-provider.ts:381-406`） | 不传 → Claude Code 自己的默认（本机 `settings.json` 未设 effort） | 解析器不产出推理片段 |

一个直接后果：今天同样选「Tuff 智能 高」，走 Codex / pi 的回合碰巧真在高强度上跑（用户自己的 CLI 配置），走 omp 的回合在「不思考」上跑，走 Anthropic 的回合显式关掉了思考——胶囊上的「高」对哪条路都不是事实。

## 3. 已装 SDK / CLI 的能力核对

### 3.1 OpenAI 兼容：`@langchain/openai@0.4.9` → `openai@4.104.0`

- core-app 解析到的版本：`@langchain/openai` 0.4.9、`@langchain/core` 0.3.80；LangChain 内部用 `openai@4.104.0`；core-app 自己直接依赖的是 `openai@6.26.0`（`package.json:188`，只被用来取 `ClientOptions['fetch']` 的类型，`langchain-openai-compatible-provider.ts:70`）。
- `ChatOpenAI` 构造参数有 `reasoningEffort`（`chat_models.d.ts:724`，构造器赋值 `chat_models.js:1283`），调用参数也有 `reasoning_effort`（`d.ts:121`）。Chat Completions 路径写成请求体 `reasoning_effort`（`chat_models.js:1467-1470`），Responses 路径写成 `reasoning: { effort }`（`:1418-1421`）。
- 类型上 `ReasoningEffort` 在 4.104.0 是 `'low' | 'medium' | 'high' | null`（`openai/resources/shared.d.ts:137`），6.26.0 是 `'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null`（`:193`）。LangChain 运行时原样透传字符串，所以 `xhigh` / `max` 能发出去，但要 `as` 过 4.104 的类型。
- 两个坑：`isReasoningModel()` 只认 `o1` / `o3` 前缀（`chat_models.js:458-459`），决定用 `max_completion_tokens` 还是 `max_tokens`——Home 不传 `maxTokens`，今天无影响；`temperature` 默认 `undefined`（`:1077-1082`、`:1269`），不会与推理模型冲突。
- 用量里已有推理 token：`completion_tokens_details.reasoning_tokens` → `usage_metadata.output_token_details.reasoning`（`:1702-1703`），可做遥测。

### 3.2 Anthropic：`@langchain/anthropic@0.3.34` → `@anthropic-ai/sdk@0.65.0`

- `ChatAnthropic` 有 `thinking?: Anthropic.ThinkingConfigParam`（`chat_models.d.ts:100-102`）和透传口 `invocationKwargs`（`:83-87`）。SDK 0.65.0 的 `ThinkingConfigParam` 只有 `{ type: 'enabled', budget_tokens }`（≥1024 且 < `max_tokens`）与 `{ type: 'disabled' }`（`resources/messages/messages.d.ts:506-535`）。
- 仓库里更新的 SDK（0.91.1 / 0.93.0 被 claude-agent-sdk、langsmith 引用；0.123.0 也在 store 里）已有 `{ type: 'adaptive', display? }` 与 `output_config: { effort: 'low'|'medium'|'high'|'xhigh'|'max' }`（0.123.0 `messages.d.ts:2065-2069`、`:2423-2469`）。**core-app 这条路拿到的是 0.65.0 的类型**，自适应 + effort 只能经 `invocationKwargs` 透传（它在 `invocationParams()` 里最后展开，能覆盖 `thinking`，`chat_models.js:725`、`:740`）。
- LangChain 的默认值与约束（`chat_models.js`）：`temperature` 默认 1（`:500`）、`topK` / `topP` 默认 -1（`:506`、`:512`）、`maxTokens` 默认 2048（`:518`）、`thinking` 默认 `{ type: 'disabled' }`（`:560`）且每次请求都带上（`:738`）。`thinking.type === 'enabled'` 时要求 `temperature === 1`、`topK === -1`、`topP` 未设，否则直接抛错（`:703-716`）——我们的 `createModel` 默认 `temperature: 0.7`，**开思考必须改成 1**。
- 流式：`coerceContentToString = !tools && !documents && !_thinkingInParams(payload)`（`:767-769`），而 `_thinkingInParams` 只认 `type === 'enabled'`（`:36-38`）。思考增量以 `{ type: 'thinking', thinking }` 数组块出现（`utils/message_outputs.js:125-130`），我们的 `extractTextContent` 只取 `text` / `content` 字段，**思考文本不会混进答案**，但也不会变成推理片段。
- 哪些模型走「自适应 + effort」、哪些走「预算」：见 §3.6 的 pi-ai 目录（`forceAdaptiveThinking`）。

### 3.3 DeepSeek / SiliconFlow / Ollama

- DeepSeek：pi-ai 目录（§3.6）里的 `deepseek-v4-flash` 支持 `off|low|high|max`，`deepseek-v4-pro` 支持 `off|high|max`，线格式 `thinkingFormat: 'deepseek'` = `thinking: { type: 'enabled' | 'disabled' }` + `reasoning_effort`（pi-ai `api/openai-completions.js:681-692`）；并标注 `requiresReasoningContentOnAssistantMessages: true`（开思考后回放的助手消息必须带空 `reasoning_content`）。经 LangChain 发出只能用 `ChatOpenAI` 的 `modelKwargs`（`chat_models.d.ts:701`）塞 `thinking`，`reasoning_effort` 用正式字段。**旧 id** `deepseek-chat` / `deepseek-reasoner`（我们的默认值）不在 pi-ai 目录里，行为没法在本地核对。
- SiliconFlow：pi-ai 目录没有这家；按 pi-ai 的方言说明，Qwen 系是顶层 `enable_thinking` + `thinking_budget`（`types.d.ts:489`、`:500-509`），需要按模型逐个确认，本次未核对。
- Ollama：原生 `/api/chat` 的 `think` 参数没有 SDK 装在仓库里，**未验证**。

### 3.4 CLI（本机实测 `--help` / 目录）

| CLI | 版本 | 推理参数 | 可取值 | 今天 Tuff 传什么 | 用户侧默认（本机） |
|---|---|---|---|---|---|
| omp（`~/.bun/bin/omp`） | — | `--thinking=<value>` | `off, minimal, low, medium, high, xhigh, max, auto`（`omp --help` 第 43 行） | 写死 `off` | `~/.omp/agent/config.yml:6` `defaultThinkingLevel: auto` |
| pi | **本机未安装** | 未能实测；omp 是 pi 的分叉且有 `--thinking`；pi 的设置文件有 `defaultThinkingLevel`；`@earendil-works/pi-agent-core@0.85.1` 的 `ThinkingLevel = "off"\|"minimal"\|"low"\|"medium"\|"high"\|"xhigh"\|"max"`（`dist/types.d.ts:261`） | 同上（待装 pi 后确认 flag 名） | 不传 | `~/.pi/agent/settings.json` `defaultThinkingLevel: "high"` |
| codex | 0.145.0 | 无专用 flag；`-c model_reasoning_effort=<v>`（`codex exec --help` 的 `-c, --config`；键名在二进制字符串里确认） | 按模型：`codex debug models` 给出 `supported_reasoning_levels[].effort` 与 `default_reasoning_level`（本机：`gpt-5.6-sol/terra` = low…xhigh, max, ultra；`gpt-5.6-luna` = low…max；`gpt-5.5 / 5.4 / 5.2` = low…xhigh） | 不传 | `~/.codex/config.toml:3` `model_reasoning_effort = "high"` |
| claude | 2.1.280 | `--effort <level>` | `low, medium, high, xhigh, max`（`claude --help` 第 80-81 行） | 不传 | `~/.claude/settings.json` 未设 |

`ultra` 在 Codex 目录里的描述是「Maximum reasoning with automatic task delegation」——带自动分派子任务，Home 的只答不做（`-s read-only`、`mcp_servers={}`）路径不应映射到它。

### 3.5 Tuff Nexus

- 客户端请求体只挑 `providerId, modelPreference, [allowedProviderIds], timeoutMs, metadata`（`nexus-provider.ts:282-288`、`:351-357`）；服务端 `parseRequest` 只认已知键，`metadata` 整体保留（`stream.post.ts:50-69`）；服务端适配器自建 `ChatOpenAI` / `ChatAnthropic` 时不读任何推理参数（`tuffIntelligenceLangChainProviderAdapters.ts:256-350`）。
- 所以 Nexus 路由**今天接不住**：客户端可以把请求放进 `metadata.reasoningEffort` 捎过去，但要服务端改完才会生效。

### 3.6 现成的「每个模型支持哪些档」数据源：`@earendil-works/pi-ai@0.85.1`

core-app 已直接依赖它（`package.json:94`，目前只内联进 `pi-agent-runtime-worker`，`electron.vite.config.ts:244-245`）。它自带按提供方拆开的模型目录（`dist/providers/data/*.json`，共 680K，`openai.json` 18K、`anthropic.json`、`deepseek.json` 很小；每个 `providers/<name>.models.js` 可单独导入，`package.json` 导出 `./providers/*`），以及：

- `getSupportedThinkingLevels(model)` / `clampThinkingLevel(model, level)`（`dist/models.js:551-581`）：不支持时**先往上找、再往下找**最近的档。
- 本地跑出的结果（节选）：

| 模型 | 支持的档（pi-ai） | 备注 |
|---|---|---|
| `gpt-4o`、`gpt-4.1*` | 仅 `off`（`reasoning: false`） | 非推理模型 |
| `gpt-5` / `-mini` / `-nano` | minimal, low, medium, high | `off` 不支持 |
| `gpt-5.1` | off(`none`), low, medium, high | |
| `gpt-5.2` … `gpt-5.5` | off(`none`), low, medium, high, xhigh | |
| `gpt-5.6-sol/terra/luna` | off(`none`), low … xhigh, max | |
| `gpt-5-pro` | 仅 high | |
| `o3`、`o3-mini`、`o4-mini` | low, medium, high | |
| `claude-*-4-5`（haiku/sonnet/opus） | off, minimal, low, medium, high | 预算制（`forceAdaptiveThinking` 为假） |
| `claude-opus-4-6`、`claude-sonnet-4-6` | off … high, max | 自适应 + effort |
| `claude-opus-4-7/4-8`、`claude-sonnet-5` | off … high, xhigh, max | 自适应 + effort |
| `claude-opus-5`、`claude-fable-5(-1)` | minimal … xhigh, max（**不能关**） | 自适应；`-5-1` 与 `opus-5` 还有 `supportsMidConvoEffort` |
| `deepseek-v4-flash` | off, low, high, max | `thinking` + `reasoning_effort` |
| `deepseek-v4-pro` | off, high, max | 同上 |

- 线格式参考实现：Anthropic 自适应 = `thinking: { type: 'adaptive', display: 'summarized' }` + `output_config: { effort }`，预算制 = `thinking: { type: 'enabled', budget_tokens }`，开思考时不发 `temperature`（`api/anthropic-messages.js:635-682`、`:829-870`）；默认预算 `minimal 1024 / low 2048 / medium 8192 / high 16384`，`xhigh` / `max` 夹到 high，并保证至少 1024 token 留给回答（`api/simple-options.js:37-65`）。

## 4. 方案

### 4.1 档位

| UI | 存储值 | 含义 |
|---|---|---|
| 自动（默认） | `'auto'` | **不传任何推理参数**，每条路由保持今天的行为（Codex / pi 用用户自己的 CLI 配置，omp 维持 `--thinking off`，Anthropic 维持 LangChain 默认） |
| 低 | `'low'` | |
| 中 | `'medium'` | |
| 高 | `'high'` | |
| 极高 | `'max'` | 「该模型最强的一档」：有 `max` 用 `max`，否则 `xhigh`，再否则 `high`；**永不**映射到 Codex 的 `ultra` |

- 「自动」算一个档，而且必须是默认：只有它能保证老用户升级后每条路由的花费与延迟不变，也不会悄悄覆盖用户在 CLI 里自己设的强度。
- 不支持的档按 pi-ai 的规则夹取（先上后下），与 pi CLI 自己夹取的结果一致；夹取后的档才是「实际」。
- 「关（不思考）」本次不做（见 §5 D11-c）：一半模型关不掉（`gpt-5`、`o3`、`claude-opus-5`、`fable-5`），做成档位会有大量禁用态。

类型放 `packages/utils`（与 `VOICE_POLISH_STRENGTHS` 同一写法）：

```ts
// packages/utils/common/storage/entity/app-settings.ts
export const REASONING_EFFORTS = ['auto', 'low', 'medium', 'high', 'max'] as const
export type ReasoningEffortSetting = typeof REASONING_EFFORTS[number]
export type ReasoningEffort = Exclude<ReasoningEffortSetting, 'auto'>
export const DEFAULT_REASONING_EFFORT: ReasoningEffortSetting = 'auto'
export function normalizeReasoningEffort(value: unknown): ReasoningEffortSetting
```

### 4.2 存储：全局，放在 `appSetting.conversation`

- `conversation: { model, favoriteModels, reasoningEffort: DEFAULT_REASONING_EFFORT as ReasoningEffortSetting }`（`app-settings.ts:356-368`）。
- 为什么全局而不是按会话：模型固定本身就是全局的、两颗胶囊共用一份（`useModelOptions.ts:56-60` 的注释），推理强度是「下一条消息怎么跑」的同一类偏好；按会话要改 `conversation-store` 的表结构、恢复路径和侧栏，收益小。每个回合**实际**用的档写进 `ConversationTurnMeta`（它随消息一起按自由记录持久化，`useConversationHistory.ts:85-96`），历史会话仍能看到当时用了什么。
- 为什么不按模型分别存：夹取已经处理「这个模型不支持」；按模型存会让用户在两个模型间切换时档位跟着跳，且要一张 `providerId\u0000model → effort` 的表。
- 读写入口加进 `conversation-settings.ts`：`readReasoningEffort()`（经 `normalizeReasoningEffort`，缺字段 → `'auto'`，因为水合是顶层浅合并，老档案的 `conversation` 块里没有这个键，`:5-10` 注释）；`writableConversationSettings()` 新建块时带上默认值（`:61-67`）。**切到不支持的模型不改写存储**（与模型固定「解析不到也不清空」同一原则）。

### 4.3 传递：`IntelligenceInvokeOptions.reasoningEffort`

```ts
// packages/utils/types/intelligence.ts（IntelligenceInvokeOptions，:408-433）
/** Requested reasoning depth; omitted = the route's own default. Mapped per provider in main. */
reasoningEffort?: 'low' | 'medium' | 'high' | 'max'
```

- `useHomeConversation` 新增一个 getter 选项 `reasoningEffort?: () => ReasoningEffortSetting`（与 `routing` / `autoContext` 同样「发送时读」），`resolveInvokeOptions()` 里 `'auto'` 时**省略**字段，否则写入。回退的 `sdk.text.chat` 自动带上。
- 用顶层类型化字段而不是 `metadata`：`metadata` 是 `Record<string, any>`，还会原样出现在 `start` 事件里；顶层字段已验证会一路展开到每个提供方（`intelligence-sdk.ts:1313`、`:1028-1031`），并随备选提供方重试（`:1222`）。
- `packages/tuff-intelligence/src/types/intelligence.ts:19` 用 `export type * from '@talex-touch/utils/types/intelligence'` 转出，类型字段自动跟上；只有新增的**值**导出（常量）才要加进 `:21-34` 的显式列表。
- Nexus 是唯一会丢字段的地方：`NexusProvider` 请求体是显式挑的（`:282`、`:351`），服务端 `parseRequest` 也只认已知键——客户端先放进 `options.metadata.reasoningEffort`，服务端改完再升成正式字段。

### 4.4 主进程：一个决策点 + 各提供方只做翻译

新文件 `apps/core-app/src/main/modules/ai/reasoning-effort.ts`（纯函数，可单测），在 `streamFromProvider` 里 `applyModelPreference` 之后、yield `start` 之前调用一次（`intelligence-sdk.ts:1028-1069` 之间；非流式 `invoke` 路径同理）：

```ts
interface ReasoningDecision {
  requested: ReasoningEffort
  /** Canonical level actually sent after clamping, or null when nothing is sent. */
  applied: ReasoningEffort | 'xhigh' | null
  status: 'applied' | 'clamped' | 'unsupported-provider' | 'unsupported-model'
}
resolveReasoning(providerConfig, model | undefined, requested): ReasoningDecision
```

结果写进 `providerRuntimeOptions.reasoning`（提供方只读它，不再自己判断）和 `start` 事件（新增类型化字段 `reasoning?: ReasoningDecision`，`IntelligenceStreamEvent`，`types/intelligence.ts:584-599`），并记进 `terminalAttempt` 供审计。支持表建议放 `packages/utils/intelligence/reasoning-effort.ts`，让渲染层（菜单禁用态、胶囊后缀）和主进程（映射）用**同一个函数**；数据可以直接取 pi-ai 的目录（§3.6），或在 utils 里维护一张小表（见 §5 D11-d）。

各提供方映射（`requested` → 线格式；「自动」一律不发）：

| 路由（判定依据） | 低 | 中 | 高 | 极高 | 写在哪里 |
|---|---|---|---|---|---|
| OpenAI / Custom，模型是推理家族（`o3*`、`o4*`、`gpt-5*`、`gpt-6*`；非推理 id 如 `gpt-4o` → `unsupported-model`；Custom 端点上未知 id 一律不发，免得 400） | `low` | `medium` | `high` | 该模型最高的 `max` / `xhigh` / `high` | `createChatModel()`（`langchain-openai-compatible-provider.ts:685-705`）加 `reasoningEffort` |
| DeepSeek，`deepseek-v4-*` | `low`（pro 夹到 `high`） | 夹到 `high` | `high` | `max` | 同上 + `modelKwargs: { thinking: { type: 'enabled' } }`（需验证回放消息的 `reasoning_content` 要求） |
| DeepSeek 旧 id（`deepseek-chat` / `deepseek-reasoner`） | `unsupported-model`（档位就是模型本身） | | | | 不发 |
| Anthropic 自适应（`opus-4-6+`、`sonnet-4-6+`、`claude-*-5`） | effort `low` | `medium` | `high` | `max` | `createModel()`（`anthropic-provider.ts:164-190`）：构造参数 `thinking: { type: 'enabled', budget_tokens: 1024 }` + `temperature: 1` 让 LangChain 走「思考分支」（不发 temperature / top_k / top_p），再用 `invocationKwargs: { thinking: { type: 'adaptive' }, output_config: { effort } }` 覆盖；思考同样计入 `max_tokens`，今天的默认 1024 会把回答截短，要一并抬高 |
| Anthropic 预算制（`*-4-5` 及更早） | `budget_tokens` 2048 | 8192 | 16384 | 16384（夹取） | 构造参数 `thinking: { type: 'enabled', budget_tokens }`、`temperature: 1`、`maxTokens` 抬到 `budget + 回答空间`（今天默认 1024 < 最小预算，必须改） |
| SiliconFlow | `unsupported-provider`（v1） | | | | — |
| Ollama（`LocalProvider`） | `unsupported-provider`（v1） | | | | — |
| Tuff Nexus | `unsupported-provider`（直到服务端接） | | | | 捎进 `metadata.reasoningEffort` |
| pi CLI | `--thinking low` | `medium` | `high` | `max` | `buildPiArgs()`（`pi-cli-runtime.ts:349`）；pi 自己夹取 → 状态记 `applied` |
| omp CLI | `--thinking low` | `medium` | `high` | `max` | `buildOmpArgs()` 把写死的 `off`（`:410-411`）换成参数，「自动」仍传 `off` |
| Codex CLI | `-c model_reasoning_effort="low"` | `"medium"` | `"high"` | 该模型的 `max` / `xhigh`（按 §3.4 的目录；不用 `ultra`） | codex argv（`pi-cli-provider.ts:357-376`） |
| Claude Code CLI | `--effort low` | `medium` | `high` | `max` | claude argv（`pi-cli-provider.ts:381-406`） |

推理内容的显示（可选，不属于 D11 必需）：OpenAI 兼容与 Anthropic 的 `chatStream` 今天只吐文本；要让思考链出现在 `TxChainOfThought` 里，需要把 LangChain 块里的 `thinking` / `reasoning_content` 翻译成 `reasoning-start/delta/end` 片段（pi 已经这么做，`pi-cli-runtime.ts:581-586`）。

### 4.5 UI

**菜单（`HomeModelMenu.vue`）**：在模型列表下方加一行「推理强度」分段控件（5 段：自动 · 低 · 中 · 高 · 极高），用 tuffex 现有的分段类控件（`TxFlatRadio` 或 `TxSegmentedSlider`，`packages/tuffex/packages/components/src/{flat-radio,segmented-slider}`），与模型行一样由菜单面板承载、Tab 可达。

| 当前路由 | 分段控件 | 说明行（一行，`--shell-text-muted`） |
|---|---|---|
| 固定模型、完全支持 | 全部可选 | 无 |
| 固定模型、部分支持（如 `gpt-5-pro` 只有 high，`deepseek-v4-pro` 无低 / 中） | 不支持的段 `aria-disabled` | 「此模型只支持：高」；已存值会被夹取时写「将按 高 运行」 |
| 固定模型、完全不支持（`gpt-4o`、`deepseek-chat`、Nexus、SiliconFlow、Ollama） | 整行 `aria-disabled`，**保留显示** | 写原因：「gpt-4o 不是推理模型」/「deepseek-chat 不思考，换 deepseek-reasoner 或 V4」/「Tuff 云端暂不支持调节」 |
| 自动路由（「Tuff 智能」） | 全部可选 | 「自动路由：落到支持的模型时生效」 |

为什么菜单里**禁用而不是隐藏**：菜单正是用户切换模型的地方，行随所选模型出现又消失会让设置「时有时无」；禁用 + 原因同时回答了「为什么没效果」。

**胶囊（`HomePage.vue` 的 `#trigger`）**：删掉写死的 `t('home.effortHigh')`，改为 `modelPill` 派生一个 `effort` 字段：

| 情况 | 胶囊后缀 |
|---|---|
| 「自动」 | 不显示（与「自动路由不显示图标」同一语汇，`HomePage.vue` WT `:159-162` 注释） |
| 固定模型支持 | 显示**实际**会发出的档（夹取后），如「高」 |
| 固定模型不支持 | 不显示——胶囊说的是「按发送会怎样」，说一个不会生效的档就是今天的问题 |
| 自动路由 + 显式档 | 显示存储的档（这是真实会发出的请求；落到不支持的路由时由回合信息说明） |

后缀用 `--shell-text-secondary`（`current-toolbar.md` 第 11 条：`muted` 在 `surface-2` 上亮色只有 2.99）；档位变化走 `ComposerChip` 的文字 + 宽度编排（`proposal.md` §3）。无障碍名：「选择模型与推理强度，当前：<模型>，<档>」。

**回合信息（`turn-info-rows.ts`）**：新增一行「推理强度」：`高` / `高（按 xhigh 运行）` / `高（此模型不支持，未应用）`；数据来自 `start` 事件的 `reasoning` 字段记进 `ConversationTurnMeta`。

### 4.6 审计 / 遥测

- `AUDIT_METADATA_KEYS`（`intelligence-audit-logger.ts:152-160`）加三个键：`reasoningEffort`（请求的规范档）、`reasoningApplied`（实际发出的原生值，如 `xhigh`、`16384`、`none`）、`reasoningStatus`（`applied | clamped | unsupported-provider | unsupported-model`）。三者都满足 `/^[\w.:-]{1,128}$/`。
- 注意流式审计用的是外层 `runtimeOptions.metadata`（`intelligence-sdk.ts` 的 `writeStreamSuccessAudit`），不是每个提供方那份——决策要记进 `terminalAttempt` 再并入审计元数据，否则备选提供方的实际档位会丢。
- 可选：`IntelligenceUsageInfo` 加 `reasoningTokens`（OpenAI 的 `output_token_details.reasoning`，§3.1），侧栏 token 行可拆成「输出（含推理 N）」。

### 4.7 测试

| 层 | 文件（新建或扩展） | 断言 |
|---|---|---|
| utils | `packages/utils/__tests__/reasoning-effort.test.ts` | `normalizeReasoningEffort` 真值表；共享支持函数对每个家族 × 典型模型 id 的结果（含 `gpt-4o` 不支持、`gpt-5-pro` 只有 high、`deepseek-v4-pro` 低→高、`claude-opus-5` 不能关、Custom 未知 id 不发） |
| 渲染 | `conversation-settings` / 新 `useReasoningEffort` 的测试 | 缺字段读成 `auto`；写入只改这一个键；切到不支持的模型不改写存储；胶囊后缀四种情况 |
| 渲染 | `useHomeConversation.test.ts`（扩展 `:634-659` 的 `toEqual`） | 显式档写入 `reasoningEffort`；`auto` 时**没有**这个键；回退 `text.chat` 带同一份 |
| 渲染 | `turn-info-rows.test.ts` | 三种状态的文案 |
| 渲染 | `HomeModelMenu` 组件测试 | 不支持时整行 `aria-disabled` 且显示原因；部分支持时逐段禁用 |
| 主进程 | `reasoning-effort.test.ts` | 夹取规则（先上后下）；每个提供方的决策 |
| 主进程 | `openai-provider.test.ts` / `langchain-openai-compatible-provider.*.test.ts` | `ChatOpenAI` 收到 `reasoningEffort`（推理模型）/ 收不到（非推理模型、`auto`） |
| 主进程 | `anthropic-provider.test.ts` | 直接断言 `model.invocationParams()`：预算制 `thinking.budget_tokens` 与 `max_tokens > budget`、自适应 `thinking.type === 'adaptive'` + `output_config.effort`，两者都**没有** `temperature` / `top_k` / `top_p` |
| 主进程 | `pi-cli-runtime.test.ts`、`pi-cli-provider.test.ts` | pi / omp 的 `--thinking <档>`（omp 在 `auto` 时仍是 `off`）；codex `-c model_reasoning_effort=…`；claude `--effort …` |
| 主进程 | `nexus-provider.test.ts` | 捎进 `metadata.reasoningEffort` |
| 主进程 | `intelligence-stream-ledger.integration.test.ts` 一类 | `start` 事件带 `reasoning`；首个提供方失败后备选提供方按**自己的**能力重新决策 |
| 主进程 | 审计清洗测试 | 三个新键通过白名单，非标识符值被丢弃 |

### 4.8 落地顺序

1. utils：类型、常量、`normalizeReasoningEffort`、共享支持函数 + 测试；`app-settings` 默认值。
2. 主进程：`reasoning-effort.ts` 决策点接进 `stream` / `invoke`；按 §4.4 逐个提供方翻译（先 CLI 四家和 OpenAI 兼容——改动小、最常用；再 Anthropic；DeepSeek V4 最后，需实测回放约束）；审计白名单。
3. 渲染层：`conversation-settings` 读写、`useHomeConversation` getter、菜单分段控件、胶囊后缀、回合信息行。
4. 规范：`pi-provider-contracts.md` 的参数矩阵（`:413-424`）加「推理强度」一行（由主代理走 `update-spec`）。
5. 实机：每条可用路由各发一条「高」，看回合信息的「实际」与提供方账单 / CLI 日志一致；切到 `gpt-4o` 看菜单禁用原因与胶囊无后缀。

## 5. 需要老板拍板

| # | 推荐 | 备选 |
|---|---|---|
| D11-a 「自动」时胶囊 | 不显示后缀（只显示模型名） | 显示灰色「自动」 |
| D11-b 存储粒度 | 全局一份，回合里记实际值 | 按会话（要改会话表与恢复路径） |
| D11-c 「关（不思考）」档 | 本次不做 | 加一档「关」，关不掉的模型禁用 |
| D11-d 支持表来源 | 主进程与渲染层共用 utils 里的一张小表（家族 + 模型前缀），测试钉住 | 直接用 `@earendil-works/pi-ai` 的模型目录（更全、随依赖升级自动更新，但它是 ESM-only、目前只内联给 worker，主进程与渲染层引入要改打包配置） |
| D11-e Tuff Nexus 路由 | 客户端先捎进 `metadata`，菜单写「云端暂不支持」，服务端另开任务 | 本任务一起改服务端适配器 |
| D11-f 推理内容展示 | 不在本任务（只接强度） | 顺手把 OpenAI 兼容 / Anthropic 的思考增量翻成 `reasoning-*` 片段 |

## Related Specs

- `.trellis/spec/main-process/pi-provider-contracts.md` — CLI 参数矩阵（`:413-424`），omp 的 `--thinking off` 是其中一格；加推理强度要改这张表。
- `.trellis/spec/main-process/channel-transport-contracts.md` — 新增类型化字段走现有 `intelligence:api:stream` 事件，不新增通道。
- `.trellis/spec/frontend/tuffex-design-rules.md` — 胶囊文字墨色与对比度（`:113-123`）、状态变化只在 `.is-morphing` 期间过渡（`:147-166`）。

## Caveats / Not Found

- **pi CLI 本机没装**：`--thinking` 这个 flag 名只在它的分叉 omp 上实测过；pi 的等价写法要在装了 pi 的机器上 `pi --help` 确认后再写进 `buildPiArgs`。
- **Anthropic 自适应 + effort 经 LangChain 0.3.34 的透传写法没有打过真实请求**：`invocationKwargs` 覆盖 `thinking` 的行为是读 `chat_models.js:701-742` 得出的；要在实现时用 `invocationParams()` 单测钉住请求体，并对一个自适应模型实发一次。更稳的备选是升级 `@langchain/anthropic`（需评估对 `zod` 3/4 分裂的影响，见记忆「zod 3/4 split」）或 Home 聊天直接用 Anthropic SDK。
- **LangChain 默认对 Anthropic 显式发 `thinking: { type: 'disabled' }`**（`chat_models.js:560`、`:738`）；而 pi-ai 目录说 `claude-opus-5` / `fable-5` 关不掉思考——这可能是一个与本任务无关的既有问题，未实测。
- **DeepSeek**：旧 id（`deepseek-chat` / `deepseek-reasoner`）在 V4 之后的实际行为、以及开思考后回放助手消息必须带 `reasoning_content` 的约束，都没有在本地验证；经 LangChain 的 `AIMessage` 回放不会带这个字段，多轮开思考可能被拒。
- **SiliconFlow / Ollama** 的思考参数（`enable_thinking` / `thinking_budget`、`think`）没有装在仓库里的 SDK 可核对，方案里列为 v1 不支持。
- Codex 目录来自 `codex debug models`（本机 0.145.0，会随 Codex 更新变化）；Claude Code 的 `--effort` 可取值来自 2.1.280 的 `--help`。
- `IntelligenceProviderModelOption` 在 `packages/utils` 与 `packages/tuff-intelligence` 各有一份定义；若决定由主进程随选项下发能力描述（而不是渲染层用共享函数自算），两份都要改。
- 没有对运行中的应用做任何 CDP / 实发请求（约束）；所有「今天实际发出什么」都是读代码与依赖实现得出。
