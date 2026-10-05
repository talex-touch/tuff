# Design — 全局用量上限

以父任务 `design.md` §3 为准，本文件补实现细节。

## 文件

| 文件 | 改动 |
|---|---|
| `apps/core-app/src/main/modules/ai/intelligence-quota-manager.ts` | `getGlobalLimits()` / `setGlobalLimits()`：事务 upsert 保留行，提交后刷新缓存；`getAllQuotas()` 过滤 `__global__` |
| `apps/core-app/src/main/modules/ai/usage-ledger/usage-limits.ts`（新） | `checkUsageLimits(now)`：读全局桶 + 增量 + 在途放行数，返回 `{ allowed, limit?, used?, max?, resetsAt? }`；`buildUsageLimitsStatus(now)`（供 `getUsageInsights` 填 `limits`）；在途放行登记 / 释放 |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | `invoke()` / `stream()`：缓存未命中后、`checkQuota(caller)` 前调用 `checkUsageLimits`；拒绝时抛父 `design.md` §3.4 的错误；放行登记，在条目入账或调用中止时释放 |
| `apps/core-app/src/main/modules/ai/intelligence-error-normalizer.ts` | quota 分支前识别 `USAGE_LIMIT_REACHED`（显式 code 或消息 token `usage_limit_reached`） |
| `packages/utils/transport/events/types/intelligence.ts` | `INTELLIGENCE_ERROR_CODES` 增加 `USAGE_LIMIT_REACHED` |
| `packages/utils/transport/sdk/domains/intelligence.ts` + `packages/utils/plugin/sdk/intelligence.ts` | `getUsageLimits` / `setUsageLimits`（host-only，接线同账本） |
| `apps/core-app/src/main/modules/ai/intelligence-module.ts` | 注册两个 handler，首行断言宿主 |
| renderer 分类器 | 见下表 |
| 后台调用方 | `embedding-service.ts`、`ocr-service.ts`、`recommendation-engine.ts` |
| `plugins/touch-intelligence/index.js` | `AI_ERROR_MESSAGES` / `AI_ERROR_DETAILS` 加条目；消息分类分支（`:1470-1490`）在 quota 判断前识别 `usage_limit_reached` |

## renderer 分类器

| 入口 | 位置 | 新行为 |
|---|---|---|
| CoreBox AI 答案 / OmniPanel | `renderer/src/modules/intelligence/ai-error-recovery.ts:30-75` | 在 `QUOTA_CHECK_UNAVAILABLE` 与 `QUOTA` 分支**之前**加 `USAGE_LIMIT_REACHED` 分支，返回 `code:'usage-limit'`、`intelligence.errorRecovery.usageLimitTitle / usageLimitDetail`。调用方据 `code` 渲染「打开审计页」动作 |
| VoicePanel | `views/assistant/VoicePanel.vue:1006-1007` | 新文案键 `assistant.voicePanel.usageLimitReached` |
| Home 听写提示 | `views/base/home/composer/dictation-notice.ts:155,217` | 同上 |
| CoreBox 结果信号 | `components/render/sourceMeta.ts:49-51,80-82,117` | `coreBox.resultSignalReasons.usageLimitReached` + `coreBox.resultSignalActions.openUsageLimits` |
| Home 对话 | `modules/conversation/conversation-error-display.ts:29-40` | 识别 `[USAGE_LIMIT_REACHED:cap]` 前缀，给本地上限文案 |

- 中英文案同时加。文案统一表达「已达到你在『审计』里设置的 AI 用量上限，<本地时间> 重置」，时间由 `resetsAt` 格式化；取不到时省略时间。
- 匹配规则全是大写子串（`includesAny`），新 code 与消息不得包含 `QUOTA` / `CREDIT`。父 `design.md` §3.4 的消息格式已满足，加一条测试锁住。

## 在途放行

- 结构：`inflightAdmissions: Map<'day:<key>'|'month:<key>', number>`，只记请求数。
- 放行时 +1；以下任一发生时 −1，保证每次放行恰好释放一次：
  - 条目进入 `pendingGlobalDeltas`（由 logger 回调或 SDK 在写审计后调用）；
  - 调用在写审计前中止（取消、provider 抛错且不写审计的分支）。
- 测试覆盖：并发放行、取消、provider 失败三条路径都不泄漏计数。

## 后台降级

- `embedding-service.ts`：捕获 `USAGE_LIMIT_REACHED` → 停止当前批次，记 `pausedUntil = resetsAt`，在文件索引诊断（现有 degraded reason 机制）写「已达到 AI 用量上限」，`pausedUntil` 前跳过发起。
- `ocr-service.ts`（剪贴板 OCR agent）：任务以该 code 结束，不重试。
- `recommendation-engine.ts`：当日关闭语义层，回落非语义排序，`resetsAt` 后恢复。

## 插件

- `touch-intelligence` 的文案：「已达到你设置的 AI 用量上限，可在 设置 › 智能 › 审计 调整」。
- 改插件代码时评估是否同步升 `manifest.json` / `package.json` 版本（两者目前都是 1.2.0），按仓库惯例处理。
