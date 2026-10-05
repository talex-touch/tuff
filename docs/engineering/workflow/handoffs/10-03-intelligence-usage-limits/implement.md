# Implement — 全局用量上限

## 清单

1. [ ] 共享错误码：`INTELLIGENCE_ERROR_CODES` 加 `USAGE_LIMIT_REACHED`；跑 utils 的错误码相关测试。
2. [ ] 存储：quota manager 的 `getGlobalLimits / setGlobalLimits`，`getAllQuotas` 过滤；单测覆盖读后写一致与重启一致（重建 manager）。
3. [ ] 执行：`usage-limits.ts` + SDK 两处接入（缓存未命中后、`checkQuota` 前）+ 在途放行登记 / 释放。
4. [ ] 归一化器分支 + 测试（显式 code、消息 token、与 quota 分支的先后）。
5. [ ] 接口：`getUsageLimits / setUsageLimits` domain + facade host-only + handler + 契约清单测试。
6. [ ] `getUsageInsights` 填实 `limits`（`buildUsageLimitsStatus`）。
7. [ ] renderer 五处分类器 + 文案键（中英）+ 每处一条测试；改写 `ai-error-recovery.test.ts:64-70` 时保留原用例。
8. [ ] 后台降级三处 + 测试（embedding 停批次、无重试循环）。
9. [ ] 官方插件映射 + 版本评估。

## 验证

```bash
pnpm -C "apps/core-app" run typecheck
pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/ai/usage-ledger" \
  "src/main/modules/ai/intelligence-quota-burst.test.ts" \
  "src/main/modules/ai/intelligence-quota-boundary.test.ts" \
  "src/main/modules/ai/intelligence-error-normalizer.test.ts" \
  "src/main/modules/ai/intelligence-sdk.test.ts" \
  "src/main/modules/ai/intelligence-typed-transport.integration.test.ts" \
  "src/main/modules/ai/intelligence-admin-surface-boundary.test.ts" \
  "src/renderer/src/modules/intelligence/ai-error-recovery.test.ts" \
  "src/renderer/src/modules/lang/translation-coverage.test.ts"
pnpm -C "packages/utils" exec vitest run "__tests__/plugin-facing-events.test.ts" "__tests__/intelligence-client-hard-cut.test.ts"
git diff --check
```

- 真机闭环（隔离 dev 实例）：
  - 用 SDK 设「每日 2 次请求」，连发 3 次 Home 对话：第 3 次显示本地上限文案（截图），且不是 Nexus 积分文案；
  - CoreBox AI 答案同测一次；
  - 清除上限后恢复。

## 风险与回滚

- **风险**：
  - 在途放行泄漏会让请求数「卡死」在上限，必须用三条路径的测试兜底；
  - 后台降级若漏处理，会变成每次索引都报错刷日志。
- **回滚**：revert 本子任务；配额保留行会被旧代码 `getAllQuotas` 列出，renderer 无界面，无害。
