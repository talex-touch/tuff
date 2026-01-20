# Intelligence System Architecture

The Intelligence System provides a unified AI capability framework with multi-provider support, capability routing, and prompt management.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Intelligence SDK                         │
│  (Unified API for AI capabilities across all providers)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Capability Registry                        │
│  • 30+ registered capabilities (chat, vision, code, etc.)   │
│  • Capability metadata and type definitions                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Strategy Manager                           │
│  • Provider selection strategies                            │
│  • Model preference matching                                │
│  • Fallback provider chains                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Provider Manager                           │
│  • OpenAI, Anthropic, DeepSeek, SiliconFlow, Local, Custom │
│  • Provider lifecycle management                            │
│  • Dynamic provider registration                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Provider Adapters                          │
│  • Unified interface implementation                         │
│  • Provider-specific API calls                              │
│  • Response normalization                                   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

**1. Capability Registry**

**Location**: `apps/core-app/src/main/modules/ai/intelligence-capability-registry.ts`

Manages all available AI capabilities in the system.

```typescript
class AiCapabilityRegistry {
  register(capability: AiCapabilityDescriptor): void
  get(capabilityId: string): AiCapabilityDescriptor | undefined
  getByType(type: IntelligenceCapabilityType): AiCapabilityDescriptor[]
  getAll(): AiCapabilityDescriptor[]
}
```

**Registered Capabilities**:
- **Text**: chat, translate, summarize, rewrite, grammar-check
- **Code**: code-generate, code-explain, code-review, code-refactor, code-debug
- **Analysis**: intent-detect, sentiment-analyze, content-extract, keywords-extract, classification
- **Vision**: vision-ocr, image-caption, image-analyze, image-generate
- **Embedding**: embedding.generate
- **RAG**: rag-query, semantic-search, rerank
- **Agent**: agent execution

**2. Provider Manager**

**Location**: `apps/core-app/src/main/modules/ai/runtime/provider-manager.ts`

Manages AI provider instances and their lifecycle.

```typescript
class IntelligenceProviderManager {
  registerFactory(type: IntelligenceProviderType, factory): void
  registerFromConfig(config: IntelligenceProviderConfig): IntelligenceProviderAdapter
  getEnabled(): IntelligenceProviderAdapter[]
  get(providerId: string): IntelligenceProviderAdapter | undefined
  createProviderInstance(config: IntelligenceProviderConfig): IntelligenceProviderAdapter
}
```

**Supported Providers**:
- **OpenAI**: GPT-4, GPT-3.5, DALL-E, Whisper, TTS
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **DeepSeek**: DeepSeek-V2, DeepSeek-Coder
- **SiliconFlow**: Multi-model aggregation platform
- **Local**: Ollama, LM Studio, local models
- **Custom**: User-defined API endpoints

**3. Strategy Manager**

**Location**: `apps/core-app/src/main/modules/ai/intelligence-strategy-manager.ts`

Selects the optimal provider for each capability invocation.

**Selection Logic**:
1. **Explicit Provider Preference**: If `preferredProviderId` is specified, use it
2. **Model Preference Matching**: Find provider that supports preferred models
3. **Priority-Based Selection**: Select highest priority enabled provider
4. **Fallback Chain**: Return ordered list of fallback providers

```typescript
interface StrategySelectionResult {
  selectedProvider: IntelligenceProviderConfig
  fallbackProviders: IntelligenceProviderConfig[]
  reasoning?: string
}
```

**4. Intelligence SDK**

**Location**: `apps/core-app/src/main/modules/ai/intelligence-sdk.ts`

Main entry point for all AI capability invocations.

```typescript
class AiSDK {
  async invoke<T>(
    capabilityId: string,
    payload: any,
    options?: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<T>>
  
  updateConfig(config: Partial<IntelligenceSDKConfig>): void
  async testProvider(config: IntelligenceProviderConfig): Promise<TestResult>
}
```

**Key Features**:
- Unified invocation interface
- Automatic provider selection
- Fallback handling
- Response caching
- Audit logging
- Quota management

## Configuration System

**Storage Structure**

**Location**: `<user-data>/config/intelligence.json`

```json
{
  "providers": [
    {
      "id": "openai-default",
      "type": "openai",
      "name": "OpenAI",
      "enabled": true,
      "priority": 1,
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "defaultModel": "gpt-4",
      "models": ["gpt-4", "gpt-3.5-turbo"],
      "timeout": 30000
    }
  ],
  "capabilities": {
    "text.chat": {
      "providers": [
        {
          "providerId": "openai-default",
          "enabled": true,
          "priority": 1,
          "models": ["gpt-4"]
        }
      ],
      "promptTemplate": "You are a helpful assistant."
    }
  },
  "globalConfig": {
    "defaultStrategy": "adaptive-default",
    "enableAudit": true,
    "enableCache": false,
    "cacheExpiration": 3600000
  }
}
```

**Capability Routing**

Each capability can be configured with:
- **Provider Bindings**: Which providers can handle this capability
- **Model Preferences**: Preferred models for each provider
- **Priority**: Provider selection order
- **Prompt Template**: Custom system prompt for the capability

**Configuration Loading**

**Location**: `apps/core-app/src/main/modules/ai/intelligence-config.ts`

```typescript
export function ensureAiConfigLoaded(force?: boolean): void
export function getCapabilityOptions(capabilityId: string): {
  allowedProviderIds?: string[]
  modelPreference?: string[]
  promptTemplate?: string
}
export function getCapabilityPrompt(capabilityId: string): string | undefined
```

Configuration is loaded:
1. On module initialization
2. When explicitly reloaded via `intelligence:reload-config` channel
3. Real-time from storage on each invocation

## Invocation Flow

**1. Capability Invocation**

```typescript
// User code
const result = await intelligence.text.chat({
  messages: [{ role: 'user', content: 'Hello' }]
})
```

**2. SDK Processing**

```typescript
// intelligence-sdk.ts
async invoke(capabilityId, payload, options) {
  // 1. Validate capability exists
  const capability = aiCapabilityRegistry.get(capabilityId)
  
  // 2. Load capability routing config
  const routing = config.capabilities[capabilityId]
  
  // 3. Merge runtime options with config
  const runtimeOptions = mergeOptions(options, routing)
  
  // 4. Check cache (if enabled)
  if (enableCache && !stream) {
    const cached = getFromCache(cacheKey)
    if (cached) return cached
  }
  
  // 5. Get enabled providers that support this capability
  const availableProviders = filterProviders(capability, runtimeOptions)
  
  // 6. Select provider via strategy
  const { selectedProvider, fallbackProviders } = 
    await strategyManager.select({
      capabilityId,
      options: runtimeOptions,
      availableProviders
    })
  
  // 7. Invoke provider
  const provider = providerManager.get(selectedProvider.id)
  const result = await provider[capability.type](payload, runtimeOptions)
  
  // 8. Cache result (if enabled)
  if (enableCache) setToCache(cacheKey, result)
  
  // 9. Audit log (if enabled)
  if (enableAudit) await logAudit(...)
  
  return result
}
```

**3. Provider Execution**

```typescript
// providers/openai-provider.ts
async chat(payload: IntelligenceChatPayload, options: IntelligenceInvokeOptions) {
  const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: payload.model || this.config.defaultModel,
      messages: payload.messages,
      temperature: payload.temperature,
      max_tokens: payload.maxTokens
    }),
    signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
  })
  
  const data = await response.json()
  
  return {
    result: data.choices[0].message.content,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens
    },
    model: data.model,
    latency: Date.now() - startTime,
    traceId: generateTraceId(),
    provider: this.config.id
  }
}
```

## Prompt Management

**Prompt Templates**

**Location**: `<user-data>/prompts/`

Prompts are stored as JSON files with metadata:

```json
{
  "id": "summarize-article",
  "name": "Article Summarization",
  "category": "text",
  "description": "Summarize articles with key points",
  "content": "You are an expert at summarizing articles...",
  "variables": ["article", "maxLength"],
  "builtin": false,
  "createdAt": 1703001234567,
  "updatedAt": 1703001234567
}
```

**Prompt Manager**

**Location**: `apps/core-app/src/renderer/src/modules/intelligence/prompt-manager.ts`

```typescript
class PromptManager {
  loadPrompts(): void
  addCustomPrompt(prompt: Partial<PromptTemplate>): string
  updatePrompt(id: string, updates: Partial<PromptTemplate>): boolean
  deleteCustomPrompt(id: string): boolean
  getPrompt(id: string): PromptTemplate | undefined
  exportCustomPrompts(): PromptTemplate[]
  importPrompts(prompts: PromptTemplate[]): number
}
```

**Capability-Prompt Binding**

Prompts can be bound to capabilities in the configuration:

```json
{
  "capabilities": {
    "text.summarize": {
      "promptTemplate": "{{prompt:summarize-article}}"
    }
  }
}
```

## Testing System

**Capability Testers**

**Location**: `apps/core-app/src/main/modules/ai/capability-testers/`

Each capability has a dedicated tester:

```typescript
interface CapabilityTester {
  generateTestPayload(options?: any): Promise<any>
  formatTestResult(result: IntelligenceInvokeResult): CapabilityTestResult
}
```

**Example**: Text Chat Tester

```typescript
class TextChatTester implements CapabilityTester {
  async generateTestPayload({ userInput }) {
    return {
      messages: [
        { role: 'user', content: userInput || 'Hello! Please respond with a greeting.' }
      ],
      maxTokens: 100
    }
  }
  
  formatTestResult(result) {
    return {
      success: true,
      message: result.result,
      latency: result.latency,
      model: result.model,
      provider: result.provider
    }
  }
}
```

**Test Execution**

```typescript
// Main process
channel.regChannel('intelligence:test-capability', async ({ data, reply }) => {
  const { capabilityId, providerId, userInput } = data
  
  // Get tester
  const tester = capabilityTesterRegistry.get(capabilityId)
  
  // Generate test payload
  const payload = await tester.generateTestPayload({ providerId, userInput })
  
  // Execute test
  const result = await ai.invoke(capabilityId, payload, {
    allowedProviderIds: providerId ? [providerId] : undefined
  })
  
  // Format result
  const formattedResult = tester.formatTestResult(result)
  
  reply(DataCode.SUCCESS, { ok: true, result: formattedResult })
})
```

## Audit & Monitoring

**Audit Logger**

**Location**: `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`

Tracks all AI invocations for monitoring and debugging:

```typescript
interface IntelligenceAuditLogEntry {
  traceId: string
  timestamp: number
  capabilityId: string
  provider: string
  model: string
  usage: TokenUsage
  latency: number
  success: boolean
  error?: string
  caller?: string
  userId?: string
}
```

**Quota Manager**

**Location**: `apps/core-app/src/main/modules/ai/intelligence-quota-manager.ts`

Manages usage quotas and rate limiting:

```typescript
class IntelligenceQuotaManager {
  async checkQuota(caller: string): Promise<QuotaCheckResult>
  async recordUsage(caller: string, usage: TokenUsage): Promise<void>
  async getUsageStats(caller: string): Promise<UsageStats>
}
```

## IPC Channels

**Main Process Channels**

- `intelligence:invoke` - Invoke capability
- `intelligence:test-capability` - Test capability
- `intelligence:test-provider` - Test provider connection
- `intelligence:fetch-models` - Fetch available models
- `intelligence:reload-config` - Reload configuration

**Renderer Process Hooks**

```typescript
// useIntelligence composable
const { text, vision, code, analysis, embedding, rag, agent } = useIntelligence()

// Direct invocation
await text.chat({ messages: [...] })

// With options
await text.chat({ messages: [...] }, {
  preferredProviderId: 'openai-default',
  modelPreference: ['gpt-4'],
  timeout: 30000
})
```

## Best Practices

**1. Capability Configuration**

- **Always specify provider bindings** for production capabilities
- **Set appropriate timeouts** based on capability type (vision: 60s, text: 30s)
- **Use model preferences** to ensure consistent quality
- **Enable audit logging** for debugging and monitoring

**2. Error Handling**

- **Always handle errors** from AI invocations
- **Implement fallback logic** for critical features
- **Show user-friendly error messages**
- **Log errors with context** for debugging

**3. Performance Optimization**

- **Enable caching** for repeated queries
- **Use streaming** for long-form content generation
- **Set appropriate token limits** to control costs
- **Implement request debouncing** for user input

**4. Security**

- **Never expose API keys** in client code
- **Validate all user inputs** before sending to AI
- **Implement rate limiting** to prevent abuse
- **Use permission system** for sensitive capabilities

## Extension Points

**Custom Providers**

Create custom provider adapters:

```typescript
class CustomProvider implements IntelligenceProviderAdapter {
  async chat(payload, options) {
    // Custom implementation
  }
  
  async translate(payload, options) {
    // Custom implementation
  }
  
  // ... other capabilities
}

// Register factory
providerManager.registerFactory('custom', (config) => {
  return new CustomProvider(config)
})
```

**Custom Capabilities**

Register new capabilities:

```typescript
aiCapabilityRegistry.register({
  id: 'custom.capability',
  type: 'custom-type',
  name: 'Custom Capability',
  description: 'My custom AI capability',
  supportedProviders: [IntelligenceProviderType.CUSTOM]
})
```

**Custom Strategies**

Implement custom provider selection strategies:

```typescript
class CustomStrategy implements StrategyManager {
  async select(request: StrategySelectionRequest): Promise<StrategySelectionResult> {
    // Custom selection logic
  }
}

strategyManager.setDefaultStrategy('custom-strategy')
```
