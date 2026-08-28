# 实施计划

## 1. 流式审计与计费事实源

- 为 `TuffIntelligenceSDK.stream()` 增加与 `invoke()` 同构的 outer-governed、cancel 和唯一终态 commit 语义。
- 复用 success/failure audit helper；仅在需要承载 Provider 已报告的安全终态字段时扩展可选参数。
- 补 primary success、fallback success、pre-delta terminal failure、post-delta failure、cancel/early-return、outer-governed 负向测试。
- 增加真实临时 DB 的 audit -> usage stats -> quota snapshot 一致性测试。

验证：

```bash
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/ai/intelligence-sdk.test.ts" \
  "src/main/modules/ai/intelligence-audit-flush-backoff.test.ts" \
  "src/main/modules/ai/intelligence-audit-logger-caller-period.test.ts" \
  "src/main/modules/ai/intelligence-stream-ledger.integration.test.ts" \
  "src/main/modules/ai/intelligence-usage-stats-consistency.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
```

## 2. 工具错误脱敏与结构化审计

- 盘点 tool gateway、registry 与 MCP 错误出口，统一 stable error projector。
- 增加 call/decision/result correlation audit 和 token/apiKey/path/native-error canary。
- 保持逐次确认、remember scope、timeout、cancel 和原始业务错误传播的既有行为。

## 3. Plugin Intelligence 单一边界

- 从 facade 实际 domain SDK 推导显式 plugin-safe event 子集，修复 allowlist 静态扫描假绿。
- registrar 统一使用 verified plugin identity、sdkapi 与 permission guard，并在 runtime/permission 缺失时 fail-closed。
- 覆盖 unavailable、deny、revoke、forged identity、sdk mismatch、Provider-not-called 与允许成功路径。

## 4. Synthetic 全链路

- 通过 typed renderer/plugin transport 触发 synthetic invoke/stream。
- 验证 permission -> provider -> audit -> DB usage/cost -> quota 的成功、fallback、拒绝、失败和取消。
- evidence 仅记录状态、计数和固定 canary 结果。

## 5. Packaged 与真实 Provider

- 隔离 profile 验证 permission/tool confirmation UI、remember、timeout、cancel 和 secure-store save/relaunch/delete。
- 从用户可见入口执行至少一个真实 Nexus 或 Local/Ollama/Pi 文本与流式调用。
- 无可用 Provider/凭证/runner 的项保持 blocked，不写 fallback pass。

## 6. 最终门禁

- 运行 Core AI、Utils SDK、plugin-host、tool gateway 聚焦与集成测试。
- 运行 CoreApp node/web typecheck、scoped ESLint、privacy inventory 和 `git diff --check`。
- 将脱敏 evidence、验收矩阵与父任务状态同步；未完成真实环境证据时不归档。

## 7. Live MCP 与 durable Privacy 收口

- 增加 packaged `app.asar` 内显式 opt-in 的真实 stdio MCP smoke 入口，并保证
  client/process/profile 全部清理后才输出成功。
- 使用 shipped migration 全链补 owner/store 三页删除、取消、幂等、FK cascade 与
  0041 原子回滚证据；保留 production Privacy typed smoke 作为入口级正控。
- 增加同 hash 辅助 acceptance runner，自动执行两类 gate 并生成 verifier 所需的
  exact-schema 报告；禁止手工布尔报告升级整体状态。
