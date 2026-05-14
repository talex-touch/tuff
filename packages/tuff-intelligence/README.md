# @talex-touch/tuff-intelligence

LangGraph 驱动的智能编排包，统一封装能力、提供商、提示词、额度/审计与可插拔存储，供 Nexus / Core 应用和前端消费。

## 功能概述
- LangGraph 编排：能力路由、模型选择、提示词注入、后处理。
- 提供商注册：兼容 OPENAI/ANTHROPIC/DEEPSEEK/SILICONFLOW/CUSTOM/LOCAL，支持优先级与回退。
- 提示词与能力绑定：引用内置/自定义 PromptTemplate，按能力或 provider 覆盖。
- 额度与审计：请求/Token/成本上限，审计日志与用量聚合，可自定义适配器落库。
- 存储适配器：`TuffIntelligenceStorageAdapter` 可接入数据库、KV 或远程服务。

## 安装
```bash
pnpm add @talex-touch/tuff-intelligence
```

## 快速上手
```ts
import {
  buildGraphArtifacts,
  invokeGraph,
} from '@talex-touch/tuff-intelligence'
import type { TuffIntelligenceConfig } from '@talex-touch/tuff-intelligence'

const config: TuffIntelligenceConfig = {
  providers: [],
  capabilities: [],
  prompts: [],
  quota: {},
  enableAudit: true,
}

const artifacts = buildGraphArtifacts({ config })

async function run() {
  const context = await invokeGraph({
    artifacts,
    context: { capabilityId: 'text.chat', payload: { messages: [] } },
  })
  console.log(context)
}
```

## Tool Kit
`ToolKit` 提供 Tuff-native 工具定义、Zod 运行时校验和可插拔审批门禁。它不绑定 LangChain / DeepAgents，后续 adapter 可以消费同一套工具定义。

```ts
import { z } from 'zod'
import {
  createToolKit,
  defineTuffTool,
} from '@talex-touch/tuff-intelligence'

const kit = createToolKit({
  approvalGate: async request => ({
    approved: request.riskLevel !== 'critical',
    reason: request.riskLevel === 'critical' ? 'Critical tool requires HITL.' : undefined,
  }),
})

kit.register(defineTuffTool({
  id: 'text.uppercase',
  name: 'Uppercase',
  description: 'Uppercase input text.',
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
  }),
  execute: input => ({
    text: input.text.toUpperCase(),
  }),
}))

const result = await kit.invoke('text.uppercase', { text: 'tuff' })
if (result.ok) {
  console.log(result.output.text)
}
```

工具也可以桥接到既有 `CapabilityRegistry`：

```ts
import { CapabilityRegistry } from '@talex-touch/tuff-intelligence'

const registry = new CapabilityRegistry()
registry.registerTool(kit.get('text.uppercase')!)
```

## 存储适配器（接口）
`TuffIntelligenceStorageAdapter` 需实现：
- 审计：`saveAuditLog` / `queryAuditLogs`
- 用量：`saveUsageDelta` / `getQuota` / `setQuota`
- 配置：`saveProviderConfig` / `listProviders` / `saveCapabilityConfig` / `listCapabilities`
- 提示词：`savePrompt` / `listPrompts` / `deletePrompt`

存储需要由使用方注入（例如 Core 应用提供 DB 适配器）。

## 计划与对齐
- 后续将接入真实 LangGraph runner、能力节点与策略节点。
- 适配现有 Core/Nexus 的渠道与能力配置，保持 IPC/前端接口兼容。
