# Context Execution And CoreBox Execution

## Order

1. 基于 governance child 的过滤 contract，定义 host context-aware invoke shared types 与 typed SDK。
2. 实现单一 ContextMessageAssembler，覆盖 token budget、redaction、citation trace 和最终 memory 复核。
3. 将 provider invoke/stream 接入同一 assembler，并补 plain invoke fail-soft fallback。
4. 迁移官方 `touch-intelligence` AI Ask，不再由插件 history/prompt 独立承载受治理上下文。
5. 在 CoreBox 增加 new/continue/stateless 控制与 boundary/degraded 安全摘要。
6. 补 Audit trace 关联和 controlled integration evidence。

## Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-context-hygiene.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts" "__tests__/intelligence-client-hard-cut.test.ts"
corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:web
corepack pnpm -C "apps/core-app" run typecheck:node
git diff --check
```

## Required Integration Cases

- retrieval citation 内容进入 provider messages，trace metadata 可关联。
- disabled/tombstoned/scope-mismatch memory 不进入 messages。
- new/continue/stateless、long-idle checkpoint、token prune。
- prepare/retrieval degraded 与 plain invoke fallback。
- streaming/non-streaming payload 等价性。

## Review Gates

- 不允许把完整 ContextPackage 原文经 plugin metadata 回传插件。
- 不允许 CoreBox renderer 成为 session/turn SoT。
- UI 和 evidence 不记录完整 prompt、turn、memory 或 retrieval chunk。

## 2026-07-11 Evidence

- `vitest`：context execution/hygiene/local knowledge、typed SDK 与官方插件共 6 files / 118 tests 通过。
- `touch-intelligence` production build 通过；context summary 在 action/meta/custom payload 间不再共享引用，经过 host strict serializer 后 widget 仍收到对象，不再退化为 `[Circular ...]` 字符串。
- macOS arm64 `--dir` packaged build 通过；隔离 profile 使用受控 Local/Ollama-compatible Provider 返回真实 `text.chat` 响应。
- packaged CoreBox 可见验证 `new`、`continue`、`stateless`，以及 `new / retrieval`、`stateless / retrieval`、item/token 计数和 `empty-fts-query` degraded 状态。
- 受控 Provider 请求证明：`continue` 携带宿主保存的 user/assistant turns；`new` 与 `stateless` 仅携带 system + current user input。
- SQLite FTS5 查询已按 Unicode token 加引号，`follow-up` 等带连字符输入不再被解析为列操作符并降级。

## 2026-07-12 Dispatch Closure

- CoreBox custom widget clicks stop at the widget boundary, so a widget host action no longer also retriggers the feature item.
- Plugin action dispatch accepts explicit widget `actionId` metadata even when the rendered idle item has no `defaultAction`; `touch-intelligence` 1.0.3 carries the fix.
- macOS arm64 packaged Electron with a precompiled official plugin and controlled local Provider visibly switched to `stateless`, returned `Controlled dispatch response.`, and showed `stateless / retrieval` with 1 item / 9 tokens.
- The controlled Provider captured exactly one `/api/chat` request for one Send click; the bounded payload contained two messages with roles `system`, `user`.
