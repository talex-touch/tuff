# PRD: Intelligence Power 泛化接口与能力路由 (v1.1)

> 更新: 2025-12-10 - 统一命名为 Intelligence 模块

## 1. 背景与目标

- **Intelligence 服务碎片化**: 当前插件与系统各自接入不同的 LLM 模型与供应商，缺乏统一抽象，重复造轮子。
- **多模型策略**: 需要支持多家 LLM、Embedding、语音、视觉等服务，根据场景自动选择最优模型。
- **合规与成本控制**: 统一接口有利于集中控制调用权限、统计用量、优化成本。

## 2. 用户价值与场景

- **插件快速接入 Intelligence**: 开发者无需关注底层供应商细节，即可调用统一 Intelligence 能力（对话、补全、翻译、检测等）。
- **智能工作流**: 系统可将 Flow Transfer、DivisionBox 中的 Intelligence 功能复用，并按需切换模型。
- **企业级需求**: 企业可定制专用模型策略（私有部署、网络隔离），插件通过统一接口获得能力。

## 3. 功能需求

### 3.1 能力分类

- **文本能力**: 对话(chat)、补全(completion)、总结(summarize)、翻译(translate)。
- **结构化能力**: Embedding、语义检索、知识库问答。
- **多模态能力**: 图像理解、语音转文字(STT)、文字转语音(TTS)。
- **辅助能力**: Prompt 模版管理、上下文记忆、推理链记录。

### 3.2 接口设计

- 统一调用入口：`intelligence.invoke(capabilityId, payload, options)`。
- 支持同步与流式响应，流式采用可迭代 AsyncGenerator。
- 允许指定 `modelPreference`、`costCeiling`、`latencyTarget`，平台自动路由。
- 返回结构包含 `result`, `usage`, `model`, `latency`, `traceId`。

### 3.3 策略与路由

- 根据 `场景标签` + `用户设置` + `成本策略` 选择模型。
- 支持优先/回退列表，如 `['gpt-4o-mini', 'deepseek-chat', 'offline-llama']`。
- 提供可插拔的策略引擎：`RuleBasedStrategy`、`AdaptiveStrategy`。

### 3.4 安全与合规

- 敏感数据处理前支持脱敏策略；必要时强制本地模型。
- 所有请求记录审计日志，包含 prompt hash、调用方、模型、token 用量。
- 支持配额控制与速率限制，按插件/用户/工作空间细分。

### 3.5 开发者体验

- SDK 提供类型安全封装，如 `intelligence.text.chat({ messages })`。
- 内置 Prompt 库，可通过 `intelligence.prompt.render(templateId, variables)` 复用。
- 提供调试工具，实时查看模型选择、token 用量、响应内容。

## 4. 非功能需求

- **性能**: 本地策略计算耗时 < 10ms；首字延迟满足模型 SLA（默认 < 2s）。
- **可靠性**: 路由失败时自动切换备选模型；支持熔断与重试。
- **扩展性**: 容纳 20+ 能力类型与 10+ 模型供应商，配置不重启生效。

## 5. 技术方案概述

### 5.1 能力描述 & 注册

- 定义 `IntelligenceCapabilityDescriptor`：
  ```ts
  interface IntelligenceCapabilityDescriptor {
    id: string
    type: 'chat' | 'completion' | 'embedding' | 'tts' | 'stt' | 'vision'
    inputSchema: JsonSchema
    outputSchema: JsonSchema
    defaultStrategy: string
  }
  ```
- 所有能力注册到 `IntelligenceCapabilityRegistry`，并在设置中心可视化管理。

### 5.2 策略引擎

- 实现 `StrategyManager`，根据策略配置生成可执行路由：
  - `RuleBasedStrategy`: 由条件表达式定义（如 latency < 1s → use providerA）。
  - `AdaptiveStrategy`: 根据历史成功率、成本动态调整权重。
- 支持插件/用户覆盖策略。

### 5.3 Provider 适配层

- 适配 OpenAI、Anthropic、DeepSeek、本地模型、企业自建模型。
- 标准化响应格式，并统一错误码。
- 缓存模型能力元数据（上下文长度、速率限制）。

### 5.4 观测与计费

- 与平台能力的观测体系集成：
  - 指标：成功率、平均延迟、token 用量、成本。
  - 日志：traceId、提示词、响应、fallback 记录。
- 支持导出 CSV/JSON，便于财务结算与成本分析。

## 6. 伪代码示例

```ts
// 插件调用示例
const stream = await intelligence.invoke('text.chat', {
  messages: history,
  context: {
    source: 'translation-flow',
    locale: 'zh-CN'
  }
}, {
  strategy: 'adaptive-default',
  modelPreference: ['gpt-4o-mini', 'deepseek-chat'],
  costCeiling: 0.02
})

for await (const chunk of stream) {
  render(chunk.delta)
}
```

## 7. 实施计划

1. **[x] 能力描述体系**: 设计 `IntelligenceCapabilityRegistry` 与能力定义规范。 ✅
2. **[x] Provider 接入框架**: 搭建统一 Provider SDK，已接入 5 家供应商 (OpenAI, Anthropic, DeepSeek, Siliconflow, Local)。 ✅
3. **[x] 策略引擎**: 实现 RuleBased 与 Adaptive 基础策略 + 配置界面。 ✅
4. **[x] SDK 封装**: 提供 `intelligence.invoke`、语法糖方法、类型定义。 ✅
5. **[x] 观测 & 计费** ✅ (2025-12-10):
   - [x] 审计日志记录 (`intelligence-audit-logger.ts`)
     - traceId 生成与跟踪
     - prompt hash 记录
     - token 用量统计 + 成本估算
     - 调用方记录 (pluginId/userId)
     - 持久化到数据库 (`intelligence_audit_logs` 表)
   - [x] 配额控制 (`intelligence-quota-manager.ts`)
     - 按插件/用户配额
     - 请求数/Token/成本限制 (分钟/日/月)
     - 速率限制检查
   - [x] 用量统计聚合
     - 自动聚合到 `intelligence_usage_stats` 表
     - 日/月维度统计
   - [x] IPC 通道
     - `intelligence:get-audit-logs` - 查询审计日志
     - `intelligence:get-today-stats` / `intelligence:get-month-stats` - 统计
     - `intelligence:get-quota` / `intelligence:set-quota` - 配额管理
     - `intelligence:check-quota` - 配额检查
   - [x] 导出功能 (CSV/JSON) ✅
   - [ ] 用量统计 UI (待实现 - 图表组件)
6. **[x] Demo & 文档** ✅ (2025-12-10):
   - [x] SDK 使用文档 (`README.md`)
   - [x] Renderer Hooks (`useIntelligenceStats`)
   - [ ] 示例插件 `touch-intelligence-demo` (可选)

**已实现文件**:
```
modules/ai/
├── intelligence-module.ts         # 主模块
├── intelligence-sdk.ts            # SDK 封装
├── intelligence-audit-logger.ts   # 审计日志 ✨
├── intelligence-quota-manager.ts  # 配额管理 ✨
├── README.md                      # SDK 文档 ✨
├── intelligence-service.ts        # 服务层
├── intelligence-capability-registry.ts
├── intelligence-strategy-manager.ts
├── intelligence-config.ts
├── provider-models.ts
├── providers/                     # 5 家供应商
│   ├── openai-provider.ts
│   ├── anthropic-provider.ts
│   ├── deepseek-provider.ts
│   ├── siliconflow-provider.ts
│   └── local-provider.ts
├── capability-testers/
└── runtime/
```

## 8. 风险与待决问题

- **模型合规**: 跨境调用、数据隐私要求如何满足？需要法律团队评估。
- **成本波动**: 需与运营团队合作设置成本上限与预警机制。
- **多模型一致性**: 不同模型能力差异较大，是否提供统一 Prompt 模板约束？
- **本地模型性能**: 低资源机器可能无法满足要求，需要识别并禁用部分能力。

## 9. 验收标准

- 插件可通过统一接口完成 Chat、Embedding、TTS 三类调用。
- 策略引擎可根据配置自动选择模型，并在主控台可视化。
- 故障时回退成功率 ≥ 95%，错误码清晰。
- 审计日志可查询到近 24 小时内的所有调用记录。

## 10. 成功指标

- 接入统一接口的插件数量 ≥ 10，调用成功率 ≥ 98%。 (目标)
- 模型调用平均成本降低 20%。
- 开发接入效率提升（从 2 天降至 0.5 天）。

## 11. 后续迭代方向

- 引入自动化 Prompt 优化与可视化编辑器。
- 支持跨会话记忆、知识库增量学习。
- 打通 Flow Transfer，实现 AI 输出自动流转到目标插件。
