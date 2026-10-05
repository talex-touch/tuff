# 全局用量上限

父任务：`../10-03-intelligence-audit-rebuild/`（需求 R-C1–R-C6、R-G3；决定 D9 / D11）。设计以父任务 `design.md` §3 为准。

## Goal

让用户能给本机所有 AI 调用设每日 / 每月的请求数、Token、估算费用上限；到顶即停，提示清楚是「你设的上限」而不是 Nexus 积分；后台功能体面地暂停，不重试风暴。

## Requirements

- **C1（R-C1）存储**：
  - `intelligence_quotas` 保留行 `('__global__','system')`，整行替换语义，`null` 清除，写入恒 `enabled=1`；
  - `getAllQuotas()` 不再列出保留行；
  - 不随同步。
- **C2（R-C2）接口**：host-only 的 `getUsageLimits()` / `setUsageLimits(limits)`。校验：请求与 Token 为正整数，费用 > 0，非法值返回 `INVALID_REQUEST`。
- **C3（R-C3）执行**：
  - 范围：`invoke()` / `stream()` 在缓存未命中后、逐调用方配额前，对所有调用检查；
  - 读数：全局桶 + 未落库增量 + 请求的在途放行数；
  - 判定：「已用 ≥ 上限」即拒绝；
  - 被拒请求不写审计、不计数；
  - 沿用 `enableQuota`。
- **C4（R-C4）错误码**：
  - 共享表新增 `USAGE_LIMIT_REACHED`；
  - 错误带 `usageLimit: { key, used, max, resetsAt }`，消息格式按父 `design.md` §3.4，不含旧 quota 子串；
  - 归一化器在 quota 分支前识别；
  - 六个 renderer 入口给本地上限文案 + 打开审计页入口；
  - 官方 `plugins/touch-intelligence` 若把未知 code 落到积分文案则补映射。
- **C5（R-C5）后台降级**：文件 embedding 停批次并在诊断写原因、`resetsAt` 前不发起；剪贴板 OCR 任务以该 code 结束；推荐语义当日关闭。都不重试循环。
- **C6（R-C6）状态**：在账本的 `getUsageInsights` 里填实 `limits: UsageLimitsStatus`（父 `design.md` §3.5），`warn` 阈值 0.8，`resetsAt` 为本地次日 / 次月 0 点。

## Acceptance Criteria

- [ ] AC-C1（父 AC-10）：
  - 设「每日 3 次请求」后读回一致；
  - 传 `null` 清除后不限；
  - 重启（重建 manager 与缓存）后仍一致；
  - 同步载荷里没有它：断言 `IntelligenceConfig` 不含上限字段，且配额表不在同步清单。
- [ ] AC-C2（父 AC-11）：「每日 3 次」下：
  - 第 4 次调用被拒，覆盖无 caller 的 Home 对话与 `core.files.embedding`；
  - 缓存命中不被拒、不计数；
  - 跨本地零点后恢复。
  - 「每日 Token」「每日费用」各一组；
  - 5 个并发、只剩 1 个名额 → 只放行 1 个。
- [ ] AC-C3（父 AC-12）：
  - 被拒错误 `code==='USAGE_LIMIT_REACHED'`，reason 含上限项与重置时间；
  - `ai-error-recovery` 给本地上限文案，`QUOTA_EXHAUSTED` 仍是原文案（改写 `ai-error-recovery.test.ts:64-70` 时保留原用例）；
  - VoicePanel、dictation-notice、sourceMeta、conversation-error-display 各有一条测试。
- [ ] AC-C4（父 AC-13）：embedding 服务触发上限后停止后续批次、无重试循环，诊断里能看到原因（单测 + 文件索引诊断截图）。
- [ ] AC-C5：`getUsageInsights().limits.items` 在 79% / 80% / 100% 三个点分别为 `ok / warn / reached`，`resetsAt` 为本地边界。
- [ ] AC-C6：
  - typecheck 本子任务范围 0 新错误；
  - 相关 vitest 全绿；
  - `translation-coverage.test.ts` 绿；
  - `git diff --check` 干净。

## Out of Scope

- 按插件设上限的界面（父 PRD Out of Scope）。
- 渠道级 `rateLimit` 生效（只报告）。
- 审计页上的上限卡与编辑抽屉（审计页子任务）。

## Dependencies

- 前置：`10-03-audit-usage-ledger` 已合入（全局桶、未落库增量、`getUsageInsights` 与契约类型）。
- 下游：审计页子任务的上限卡、编辑抽屉、提醒条。
