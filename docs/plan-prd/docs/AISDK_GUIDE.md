# AI SDK 使用指南

## 概述

AI SDK 提供了一个统一的接口来调用多个 AI 提供商（OpenAI、Anthropic、DeepSeek 等），支持智能路由、自动回退、流式响应等功能。

## 快速开始

### 1. 配置 AI 提供商

在设置页面中配置您的 AI 提供商：

1. 打开应用设置
2. 找到 "AI SDK 设置" 部分
3. 为每个提供商启用并配置：
   - API Key
   - Base URL（可选）
   - 优先级
   - 速率限制

### 2. 基础用法

```typescript
import { ai } from '@talex-touch/utils'

// 简单的聊天调用
const result = await ai.text.chat({
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ]
})

console.log(result.result) // AI 的响应
console.log(result.usage) // token 使用情况
console.log(result.latency) // 响应延迟
```

### 3. 流式响应

```typescript
import { ai } from '@talex-touch/utils'

// 流式聊天
for await (const chunk of ai.text.chatStream({
  messages: [
    { role: 'user', content: 'Tell me a story' }
  ]
})) {
  if (!chunk.done) {
    console.log(chunk.delta) // 增量文本
  }
}
```

### 4. 高级选项

```typescript
import { ai } from '@talex-touch/utils'

// 使用高级选项
const result = await ai.text.chat({
  messages: [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Explain quantum computing' }
  ],
  temperature: 0.7,
  maxTokens: 1000
}, {
  strategy: 'adaptive-default', // 使用自适应策略
  modelPreference: ['gpt-4o-mini'], // 首选模型
  costCeiling: 0.02, // 成本上限
  latencyTarget: 2000, // 延迟目标（毫秒）
  timeout: 30000 // 超时时间
})
```

## 核心功能

### 能力注册

```typescript
import { aiCapabilityRegistry, AiCapabilityType } from '@talex-touch/utils'

// 注册新能力
aiCapabilityRegistry.register({
  id: 'text.chat',
  type: AiCapabilityType.CHAT,
  name: 'Chat Completion',
  description: 'Generate conversational responses',
  supportedProviders: ['openai', 'anthropic', 'deepseek']
})
```

### 策略管理

系统提供两种内置策略：

#### 1. 基于规则的策略（Rule-Based）

- 根据优先级和模型偏好选择提供商
- 简单直接，适合固定配置

#### 2. 自适应策略（Adaptive）

- 根据历史成功率和延迟动态选择
- 自动优化，适合生产环境

```typescript
import { strategyManager } from '@talex-touch/utils'

// 获取策略
const strategy = strategyManager.get('adaptive-default')

// 设置默认策略
strategyManager.setDefaultStrategy('rule-based-default')
```

### 提供商管理

```typescript
import { providerManager } from '@talex-touch/utils'

// 注册提供商
providerManager.registerFromConfig({
  id: 'openai-default',
  type: 'openai',
  name: 'OpenAI',
  enabled: true,
  apiKey: 'your-api-key',
  priority: 1,
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 90000
  }
})

// 更新配置
providerManager.updateConfig('openai-default', {
  enabled: false
})

// 获取所有已启用的提供商
const enabled = providerManager.getEnabled()
```

## 统一调用接口

### ai.invoke()

通用调用方法，适用于任何能力：

```typescript
import { ai } from '@talex-touch/utils'

const result = await ai.invoke('text.chat', {
  messages: [{ role: 'user', content: 'Hello' }]
}, {
  strategy: 'adaptive-default'
})
```

### 便捷方法

#### 文本能力

```typescript
// 聊天
await ai.text.chat({ messages: [...] })

// 流式聊天
ai.text.chatStream({ messages: [...] })

// 翻译
await ai.text.translate({
  text: 'Hello',
  targetLang: 'zh-CN'
})

// 总结
await ai.text.summarize({
  text: '长文本...',
  maxLength: 200,
  style: 'concise'
})
```

#### Embedding

```typescript
// 生成向量
await ai.embedding.generate({
  text: 'some text',
  model: 'text-embedding-3-small'
})

// 批量生成
await ai.embedding.generate({
  text: ['text1', 'text2', 'text3']
})
```

## 审计与监控

### 审计日志

```typescript
import { ai } from '@talex-touch/utils'

// 启用审计
ai.updateConfig({
  enableAudit: true
})

// 获取审计日志
const logs = ai.getAuditLogs(100)
logs.forEach((log) => {
  console.log(`${log.traceId}: ${log.success ? '成功' : '失败'}`)
  console.log(`模型: ${log.model}, 延迟: ${log.latency}ms`)
  console.log(`Token 使用: ${log.usage.totalTokens}`)
})

// 清除审计日志
ai.clearAuditLogs()
```

### 响应缓存

```typescript
import { ai } from '@talex-touch/utils'

// 启用缓存
ai.updateConfig({
  enableCache: true,
  cacheExpiration: 1800 // 30 分钟
})

// 清除缓存
ai.clearCache()
```

## 错误处理

### 自动回退

当主提供商失败时，系统会自动尝试备选提供商：

```typescript
try {
  const result = await ai.text.chat({
    messages: [{ role: 'user', content: 'Hello' }]
  })
}
catch (error) {
  // 所有提供商都失败了
  console.error('AI 调用失败:', error)
}
```

### 自定义错误处理

```typescript
try {
  const result = await ai.invoke('text.chat', {
    messages: [{ role: 'user', content: 'Hello' }]
  }, {
    timeout: 5000 // 5 秒超时
  })
}
catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('timeout')) {
      console.error('请求超时')
    }
    else if (error.message.includes('API key')) {
      console.error('API 密钥未配置或无效')
    }
  }
}
```

## 最佳实践

### 1. 配置多个提供商

为了提高可靠性，建议配置至少 2 个提供商作为备份。

### 2. 使用自适应策略

生产环境推荐使用自适应策略，它会根据实际表现自动优化。

### 3. 设置合理的速率限制

根据您的 API 套餐设置速率限制，避免超额使用。

### 4. 启用审计日志

在生产环境启用审计日志，便于追踪和分析。

### 5. 使用缓存

对于重复的请求，启用缓存可以显著降低成本和延迟。

## 扩展开发

### 添加新的提供商

```typescript
import type { AiChatPayload, AiInvokeResult, AiProviderConfig } from '@talex-touch/utils'
import { AiProvider } from '@talex-touch/utils/aisdk/providers/base'

class CustomProvider extends AiProvider {
  readonly type = 'custom' as const

  async chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    // 实现您的逻辑
    return {
      result: 'response text',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'custom-model',
      latency: 500,
      traceId: this.generateTraceId(),
      provider: this.type
    }
  }

  // 实现其他必需方法...
}

// 注册工厂
providerManager.registerFactory('custom', config => new CustomProvider(config))
```

### 添加新的策略

```typescript
import { AiStrategy } from '@talex-touch/utils/aisdk/strategy'

class MyStrategy extends AiStrategy {
  readonly id = 'my-strategy'
  readonly name = 'My Custom Strategy'
  readonly type = 'custom' as const

  async select(context: StrategyContext): Promise<StrategyResult> {
    // 实现您的选择逻辑
    return {
      selectedProvider: context.availableProviders[0],
      fallbackProviders: context.availableProviders.slice(1)
    }
  }
}

// 注册策略
strategyManager.register(new MyStrategy())
```

## 故障排除

### 1. "No enabled providers available"

- 确保至少有一个提供商已启用
- 检查提供商是否支持您调用的能力

### 2. "API key is required but not configured"

- 在设置页面配置提供商的 API Key

### 3. 响应延迟过高

- 检查网络连接
- 尝试切换到其他提供商
- 调整 `latencyTarget` 选项

### 4. 成本过高

- 启用响应缓存
- 设置 `costCeiling` 限制
- 使用更便宜的模型

## 参考

- [PRD 文档](../02-architecture/intelligence-power-generic-api-prd.md)
- [类型定义](../packages/utils/types/aisdk.ts)
- [核心实现](../packages/utils/aisdk/)
