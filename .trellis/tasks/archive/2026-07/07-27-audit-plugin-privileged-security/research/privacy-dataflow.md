# 审计证据 — 敏感数据流与隐私

## 总体评估：现有控制较好

仓库已有多层敏感数据保护：
1. `telemetry-sanitizer.ts` — key-based filtering of sensitive field names (token/secret/password/credential/clipboard/content...) → `SAFE_EVENT_MESSAGE = 'redacted'`
2. `operational-error-service.ts` — 同样的敏感 key pattern 过滤 context，另有 UNSAFE_PUBLIC_MESSAGE_PATTERN 拒绝 SQL/路径/参数的 public message。
3. `secure-store.ts` — AES-256-GCM 加密本地存储，用于 auth token、API keys、proxy credentials、MCP credentials。
4. `intelligence-ai-import-runtime.ts` — SENSITIVE_SNAPSHOT_KEY pattern 拒绝在 import 卡中持久化 credentials。
5. `intelligence-context-hygiene.ts` — Bearer 令牌等模式匹配（测试覆盖：Bearer token 不透传到 storage/package/memory）。

## 🟡 关注点: P1 — 剪贴板内容全文存储在 SQLite（依设计）

**`file:line`**
- `apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts:589` — content 字段 `LIKE` 查询，全文内容、原始 HTML、metadata JSON 存储在 `clipboard_history` 表中。

**评估**：这是剪贴板管理功能的核心设计，不是泄露漏洞。数据库文件在 userData 目录下，同机其他进程可以看到文件但无解密密钥。clipboard-action-diagnostics.test.ts:65 确认"不 raw content 入诊断"。

**建议**：增加用户可见的剪贴板数据保留策略、历史操作日志和手动清理/导出入口。

## 🟡 关注点: P2 — 翻译/OCR/AI 输入数据流经 main process

**`file:line`**
- `plugins/touch-translation/index/main.ts:105-128` — `ensureNetworkPermission()` 获取 cache → 调用 remote translation API。
- `apps/core-app/src/main/modules/ocr/ocr-service.ts:147` — OCR 结果存储 meta JSON。
- `apps/core-app/src/main/modules/omni-panel/index.ts:982` — OmniPanel 读取剪贴板文本用于上下文。

**评估**：这些都是 feature-driven 数据流，数据进入 AI/翻译 provider。依赖 provider 的隐私条款与核心应用配置的 API key 管理。不存在跨插件泄露，因为没有共享数据接口。但敏感数据（翻译文本、OCR 内容、剪贴板上下文）进入 AI 提供商，需要用户可见的控制和日志。

**建议**：考虑在设置中增加"翻译/AI 请求不记录到远程"的开关（目前依赖 analytics 的匿名化和 provider 自己的政策）。

## 🟡 关注点: P3 — analytics 数据可能携带用户 agent 信息

**`file:line`**
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts:599` — 上报到 `/api/telemetry/record`
- `apps/core-app/src/main/modules/analytics/analytics-module.ts:447` — 上报到 `/api/telemetry/messages`

**评估**：上报内容是 startup metrics、window type、IPC duration 等结构化数据，不包含剪贴板内容、token、路径或用户文件内容。`telemetry-sanitizer.ts` 负责过滤。

## ✅ 已闭环: G3 — 插件 secret storage 已有权限门禁

**`file:line`**
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:196-214` — `ensurePluginSecretPermission()` 检查 `storage:plugin:secret`。
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:291-296` — getSecret 先检 isSecureStoreAvailable。
- `apps/core-app/src/main/modules/plugin/plugin-module.test.ts:311-321` — 测试覆盖 permission denied → 拒绝写入。

**评估**：插件 secret storage 有 permission gate + secure-store 加密。与其他 SQLite handler 不同，secret handler 没有 F2 问题（`ensurePluginSecretPermission` 在 `getPermissionModule()` 为 null 时返回 `{ success: true }`，但此时 `isSecureStoreAvailable` 会 fail → 不会泄露现有 secrets，只是允许读不存在的值）。

## 🔴 Confirmed: F8 — 插件 secret permission 与 SQLite permission 一样的 fail-open 模式

**`file:line`**
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:199-201`：
```ts
const permissionModule = getPermissionModule()
if (!permissionModule) {
  return { success: true }   // same fail-open as F2
}
```

与 F2 模式一致：permission module 不可用时 secret 操作被放行。实际影响低于 SQLite（因为 secureStore 本身还有 `isSecureStoreAvailable` 检查），但违反了 fail-closed 安全原则。
