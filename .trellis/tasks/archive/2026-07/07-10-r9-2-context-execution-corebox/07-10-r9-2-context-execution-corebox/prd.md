# R9.2 Context 执行与 CoreBox 控制

## Goal

让 R9.1 retrieval/citation、session history、summary 和受控 memory 真正通过宿主 ContextPackage 参与 CoreBox 模型输入，同时提供明确的新会话/继续/无历史边界和 metadata-only explain。

## Requirements

### Host-owned Execution

- provider 调用前由 CoreApp host 统一 prepare、budget、redact、assemble 和 trace ContextPackage。
- current input、recent turns、summary、memory、retrieval 按既定优先级进入 bounded messages；current user input 保持最终 user message。
- streaming 与 non-streaming 必须共享同一 assembler 和安全策略。
- 插件只能接收 context intent、安全摘要与 citation metadata，不接收跨 scope Memory/turn/retrieval 原文。

### CoreBox Controls

- 提供显式新会话、继续当前会话和不带历史模式；长空闲边界继续由 checkpoint reason 表达。
- UI 展示当前 context mode、session/boundary 状态和可解释来源摘要，不展示完整 prompt、turn 或 retrieval chunk 原文。
- ContextHygiene 不可用时 fail-soft 回退现有 plain invoke，并记录 degraded reason。

### Traceability

- invoke、package log、citation 与 audit trace 使用可关联 id。
- token prune、policy block、scope mismatch 和 retrieval degraded 均能在 metadata-only explain 中解释。

## Dependencies

- 必须在 `07-10-r9-2-memory-governance-scope` 的过滤与 capability 边界完成后进入主实现。

## Acceptance Criteria

- [x] integration test 证明 retrieval/memory 安全内容真实进入 provider messages，而不只进入 metadata。
- [x] 新 session 忽略调用方旧 user/assistant history；显式继续携带宿主 session；无历史模式排除 summary/recent turns/Memory，但保留调用方 system、允许的 retrieval 与当前输入。
- [x] streaming/non-streaming 使用同一 assembler，并保持 metadata-only citation/package trace 关联。
- [x] policy-blocked current input 不会绕过；scope mismatch、tombstoned、expired 与 token-pruned item 在 package/revalidation 后不进入 provider payload。
- [x] CoreBox widget 已提供 new/continue/stateless 控制，package log/Audit 保持 metadata-only；2026-07-11 在 macOS arm64 packaged Electron、隔离 profile 与受控本地 Provider 上可见验证三种边界、`empty-fts-query` degraded 状态及 metadata-only execution summary，连续调用的 provider payload 亦证明宿主 continuation 与 stateless current-only 语义。
- [x] prepare/revalidate 失败时 AI Ask 使用 system + current-input-only fail-soft payload，并返回 `context_prepare_failed` 安全摘要；controlled regression 已覆盖。

## Out Of Scope

- 自动长期记忆、agent 自主 scope 决策、embeddings/rerank。
- OmniPanel/Workflow/Assistant 接入；由最终 entrypoints 子任务处理。
