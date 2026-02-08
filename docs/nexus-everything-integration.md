# Nexus Everything Integration

## Scope

- 目标：给 Nexus 侧提供 Everything 能力接入说明（文档呈现、对外说明、验证流程）。
- 边界：不重复维护 Core 侧的安装/排障细节，统一引用主文档。

## Source of Truth

- 主集成文档（安装、架构、排障、参数）：`docs/everything-integration.md`
- 落地状态与待办（Done/In Progress/Todo）：`docs/engineering/everything-sdk-rollout-status.md`
- 功能 PRD（规划与验收）：`docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md`

## Rollout Status

- 当前已支持：`sdk-napi -> cli -> unavailable` 回退链路。
- 当前已支持：设置页展示 `backend`、`fallbackChain`、`lastBackendError`。
- 发布前门禁：Windows 真机跑 SDK 自检并留存 JSON 结果。

## Nexus 侧职责

1. **文档入口管理**
   - 在 Nexus 文档站中保留 Everything 功能入口与安装入口。
   - 安装/排障正文不再复制，跳转到主文档维护。

2. **状态口径一致**
   - 页面说明必须与 `everything:status` 字段一致。
   - 仅使用下列后端枚举：`sdk-napi`、`cli`、`unavailable`。

3. **发布验证留档**
   - 每次发版前，在 Windows 记录自检结果（JSON）并附到发布记录。

## IPC 契约（Nexus 侧需同步口径）

### `everything:status`

```ts
{
  enabled: boolean
  available: boolean
  backend: 'sdk-napi' | 'cli' | 'unavailable'
  version: string | null
  esPath: string | null
  error: string | null
  lastBackendError: string | null
  fallbackChain: Array<'sdk-napi' | 'cli' | 'unavailable'>
  lastChecked: number | null
}
```

### `everything:test`

```ts
{
  success: boolean
  backend?: 'sdk-napi' | 'cli' | 'unavailable'
  resultCount?: number
  duration?: number
  error?: string
}
```

## Windows 验证流程（发布前）

1. 安装并运行 Everything（含 `es.exe`）。
2. 在仓库根目录执行：

```bash
pnpm -C "packages/tuff-native" run check:everything -- --query "*.txt" --max 10
```

3. 结果判定：
   - `ok=true` 且 `resultCount>=0`。
   - `version` 非空（可接受某些环境下返回 `null`，但需说明原因）。
   - 保存完整 JSON 到发布记录。

4. 应用内复核：
   - 设置页检查 `backend`、`fallbackChain`、`lastBackendError`。
   - 执行一次 `everything:test`，确认成功或有可解释失败信息。

## Nexus 内容建议结构

- 功能页：介绍“能力 + 适用平台 + 降级行为 + 入口”。
- 安装页：仅保留最短步骤，并引用主文档详细内容。
- FAQ：仅放 Nexus 特有问题（如文档入口、版本说明），技术排障统一跳主文档。

## 维护约定

- 涉及搜索后端、状态字段、错误码时，先更新 `docs/everything-integration.md`。
- 本文只同步 Nexus 视角差异，不复制大段技术细节。
- 状态变更优先更新 `docs/engineering/everything-sdk-rollout-status.md`。
