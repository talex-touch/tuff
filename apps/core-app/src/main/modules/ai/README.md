# Intelligence Module SDK

> 统一的 AI 能力调用接口，支持多供应商、策略路由、审计计费

## 快速开始

### 基础调用

```typescript
import { ai } from '@main/modules/ai'

// 使用 invoke 方法
const result = await ai.invoke<string>('text.chat', {
  messages: [{ role: 'user', content: 'Hello!' }]
})

console.log(result.result) // AI 回复
console.log(result.usage)  // { promptTokens, completionTokens, totalTokens }
console.log(result.model)  // 实际使用的模型
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
  targetLanguage: 'zh-CN'
})

// 代码生成
const code = await ai.code.generate({
  prompt: '写一个快速排序函数',
  language: 'typescript'
})

// OCR
const ocr = await ai.vision.ocr({
  imageBase64: 'data:image/png;base64,...'
})
```

### 流式响应

```typescript
const stream = ai.text.chatStream({
  messages: [{ role: 'user', content: '写一首诗' }]
})

for await (const chunk of stream) {
  process.stdout.write(chunk.delta)
}
```

## Renderer 端使用

### useIntelligence

```typescript
import { useIntelligence } from '@talex-touch/utils/renderer'

const { text, isLoading, lastError } = useIntelligence()

// 调用 AI
const result = await text.chat({
  messages: [{ role: 'user', content: 'Hello' }]
})

// 响应式状态
watch(isLoading, (loading) => {
  console.log(loading ? '请求中...' : '完成')
})
```

### useIntelligenceStats

```typescript
import { useIntelligenceStats } from '@talex-touch/utils/renderer'

const {
  getTodayStats,
  getMonthStats,
  getAuditLogs,
  exportToCSV,
  downloadAsFile
} = useIntelligenceStats()

// 获取今日统计
const stats = await getTodayStats()
console.log(`今日请求: ${stats.requestCount}`)
console.log(`Token 用量: ${stats.totalTokens}`)
console.log(`成本: $${stats.totalCost.toFixed(4)}`)

// 导出审计日志
const logs = await getAuditLogs({ limit: 1000 })
const csv = exportToCSV(logs)
downloadAsFile(csv, 'audit-logs.csv', 'text/csv')
```

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
  costLimitPerDay: 1.0,
})

// 检查配额
const result = await checkQuota('my-plugin-id')
if (!result.allowed) {
  console.error(`配额超限: ${result.reason}`)
}
```

### 配额字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `requestsPerMinute` | number | 每分钟请求数限制 |
| `requestsPerDay` | number | 每日请求数限制 |
| `requestsPerMonth` | number | 每月请求数限制 |
| `tokensPerMinute` | number | 每分钟 Token 限制 |
| `tokensPerDay` | number | 每日 Token 限制 |
| `tokensPerMonth` | number | 每月 Token 限制 |
| `costLimitPerDay` | number | 每日成本限制 (USD) |
| `costLimitPerMonth` | number | 每月成本限制 (USD) |

## IPC 通道

### 核心调用

| 通道 | 说明 |
|------|------|
| `intelligence:invoke` | 调用 AI 能力 |
| `intelligence:invoke-stream` | 流式调用 |
| `intelligence:test-provider` | 测试供应商连接 |

### 审计 & 统计

| 通道 | 说明 |
|------|------|
| `intelligence:get-audit-logs` | 查询审计日志 |
| `intelligence:get-today-stats` | 获取今日统计 |
| `intelligence:get-month-stats` | 获取本月统计 |
| `intelligence:get-usage-stats` | 获取历史统计 |

### 配额管理

| 通道 | 说明 |
|------|------|
| `intelligence:get-quota` | 获取配额配置 |
| `intelligence:set-quota` | 设置配额 |
| `intelligence:delete-quota` | 删除配额 |
| `intelligence:get-all-quotas` | 获取所有配额 |
| `intelligence:check-quota` | 检查配额 |
| `intelligence:get-current-usage` | 获取当前用量 |

## 调用选项

```typescript
interface IntelligenceInvokeOptions {
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
  // 元数据
  metadata?: {
    caller?: string  // 调用方 ID (用于审计和配额)
    userId?: string  // 用户 ID
    [key: string]: any
  }
}
```

## 返回结构

```typescript
interface IntelligenceInvokeResult<T> {
  result: T          // 结果数据
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost?: number    // 估算成本
  }
  model: string      // 使用的模型
  provider: string   // 使用的供应商
  latency: number    // 延迟 (ms)
  traceId: string    // 追踪 ID
}
```

## 成本估算

内置主流模型价格 (可自动估算):

| 模型 | Prompt ($/1K) | Completion ($/1K) |
|------|---------------|-------------------|
| gpt-4o | 0.005 | 0.015 |
| gpt-4o-mini | 0.00015 | 0.0006 |
| claude-3-5-sonnet | 0.003 | 0.015 |
| claude-3-haiku | 0.00025 | 0.00125 |
| deepseek-chat | 0.00014 | 0.00028 |

## 数据库表

### intelligence_audit_logs

审计日志表，记录每次 AI 调用。

| 字段 | 类型 | 说明 |
|------|------|------|
| trace_id | TEXT | 唯一追踪 ID |
| timestamp | INTEGER | 时间戳 |
| capability_id | TEXT | 能力 ID |
| provider | TEXT | 供应商 |
| model | TEXT | 模型 |
| prompt_hash | TEXT | Prompt 哈希 |
| caller | TEXT | 调用方 |
| prompt_tokens | INTEGER | Prompt Token 数 |
| completion_tokens | INTEGER | Completion Token 数 |
| estimated_cost | REAL | 估算成本 |
| latency | INTEGER | 延迟 (ms) |
| success | INTEGER | 是否成功 |
| error | TEXT | 错误信息 |

### intelligence_quotas

配额配置表。

### intelligence_usage_stats

用量统计表 (按日/月聚合)。

## 最佳实践

1. **传递 caller**: 调用时传递 `metadata.caller` 以启用配额控制和审计追踪
2. **合理设置配额**: 为插件设置合适的配额，防止滥用
3. **使用流式响应**: 长文本生成使用流式响应提升用户体验
4. **错误处理**: 捕获配额超限错误并给用户友好提示

```typescript
try {
  await ai.text.chat({...}, {
    metadata: { caller: 'my-plugin' }
  })
} catch (error) {
  if (error.message.includes('Quota exceeded')) {
    showNotification('今日配额已用尽，请明天再试')
  }
}
```
