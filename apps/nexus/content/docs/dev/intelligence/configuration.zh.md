# 配置

## 配置文件位置

运行时配置存储于：

- `<user-data>/config/intelligence.json`

主要包含：

- `providers`：Provider 列表 + 凭据 + 默认模型
- `capabilities`：按能力维度的路由绑定（providerId、priority、models）
- `globalConfig`：cache/audit/defaultStrategy 等

## Provider 配置

常见字段：

- `id`：用于路由绑定的稳定标识
- `type`：`openai | anthropic | deepseek | siliconflow | local | custom`
- `enabled`
- `apiKey`（非 local 必须）
- `baseUrl`（可选）
- `defaultModel`（可选）

## Capability 路由

每个 capability 可配置 provider 绑定：

- `providerId`
- `priority`
- `models`（偏好模型列表）

当 `options.allowedProviderIds` 为空时，会优先使用路由配置。
当 `options.modelPreference` 为空时，会从路由配置合并出模型偏好。

## 治理（重点）

- provider/model 不匹配会在发请求前直接拒绝。
- 缺失 API Key 的 provider 会在策略选择前过滤掉。
- `embedding.generate` 会统一执行 **normalize + chunking + truncation + 聚合**。
