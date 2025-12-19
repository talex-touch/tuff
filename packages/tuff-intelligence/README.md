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
