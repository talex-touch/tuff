# R9.2 CompressionSnapshot 收口

## Goal

基于已有 SQLite 表和 shared type 完成 CompressionSnapshot P1：长会话可生成可验证的结构化摘要，关联 source turn range/checkpoint，并通过 CAS 安全更新当前 session summary；失败不删除原 turns。

## Requirements

### Structured Snapshot

- snapshot 使用现有 goal/currentState/decisions/constraints/artifacts/openQuestions/sourceTurnFrom/sourceTurnTo 结构。
- 持久化前进行 schema、长度、数组项和 source turn range 校验；未知字段不进入业务 SoT。
- 事实状态或置信信息放入受控 metadata，user-rejected、secret/sensitive、低可信候选不得自动提升为 MemoryItem。

### Lifecycle

- snapshot 必须属于有效 session，并关联 `compression_snapshot` checkpoint。
- session summary 更新采用 compare-and-swap；陈旧压缩结果不得覆盖更新后的 session。
- 压缩失败、结构化解析失败或 CAS conflict 均保留原 turns，并返回稳定 degraded reason。
- ContextPackage 可在预算内消费最新有效 snapshot；引用已 tombstone memory 的内容不得重新注入。

## Dependencies

- 依赖 `07-10-r9-2-memory-governance-scope` 的 tombstone 与隐私过滤语义。

## Acceptance Criteria

- [x] valid snapshot 可写入已有 SQLite 表并正确关联 session、source turn range 与 checkpoint。
- [x] malformed/oversized/invalid range snapshot 被拒绝，原 turns 不变。
- [x] 两个并发压缩结果只有基于最新 session summary version 的结果能完成 CAS。
- [x] compression failure/CAS conflict 有 degraded metadata，且不删除、截断或覆盖原 turns。
- [x] prepareTurn 可消费最新有效 snapshot，并排除 secret/sensitive、user-rejected 或 tombstoned 来源。
- [x] focused tests 覆盖写入、读取、CAS、checkpoint、package consumption 和失败回滚。

## Out Of Scope

- 自动长期记忆、删除原始 turns、模型供应商专用压缩协议、向量摘要。
