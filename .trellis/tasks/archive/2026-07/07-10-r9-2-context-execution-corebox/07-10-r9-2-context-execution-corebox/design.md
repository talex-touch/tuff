# Context Execution And CoreBox Design

## Data Flow

```text
CoreBox intent/input
  -> typed host context-aware request
  -> ContextHygieneService.prepareTurn
  -> final memory/tombstone recheck
  -> ContextMessageAssembler
  -> provider invoke/stream
  -> finalize turn + package/citation trace
  -> metadata-only Audit/CoreBox summary
```

## Contract Shape

优先增加宿主拥有的 context-aware invoke contract，而不是把完整 ContextPackage 返回插件再拼 prompt。request 只携带当前输入、session/context mode、provider capability 和 trace intent；response/stream metadata 携带 package id、session id、citation、安全摘要和 degraded reason。

现有 plain invoke 保留用于兼容和 fail-soft，官方 `touch-intelligence` 先迁移到新 contract。

## Message Assembly

- 统一 assembler 输入为已验证 ContextPackage，不接受插件提供的任意历史数组作为可信上下文。
- 推荐顺序：system policy -> structured summary -> recent turns -> memory -> retrieval context -> current user input。
- 每个 item 按 token budget 截断或排除，排除原因写 package log metadata。
- citation 保持 source id/document id/uri/range 等 metadata；不把原始 chunk 写入日志或 widget metadata。
- invoke 前再次检查 memory tombstone、TTL 和 scope；失效项从 messages 移除。

## CoreBox State

CoreBox 维护轻量 context intent，而不持有业务 SoT：

- `new`：创建新 session/checkpoint，不继承旧 session 原文。
- `continue`：继续显式选中的当前 session。
- `stateless`：不带 recent turns/memory，保留当前输入和允许的 retrieval/system context。

显示层只消费 session id 截断值、mode、boundary reason、token/item count、citation count 和 degraded 状态。

## Failure Handling

- prepare/assembler 失败：回退 plain invoke，并写 `context_prepare_failed` 或稳定 degraded code。
- retrieval 失败：继续 recent turns/summary/memory，标记 retrieval degraded。
- provider 失败：沿用现有 error contract，不伪造 finalize 成功。

## Compatibility And Rollout

- context-aware invoke 先以 CoreBox feature flag 启用。
- streaming/non-streaming 共享 assembler helper 和 tests。
- 回滚只关闭新执行路径；SQLite session/package 数据保留，不删除 turns。
