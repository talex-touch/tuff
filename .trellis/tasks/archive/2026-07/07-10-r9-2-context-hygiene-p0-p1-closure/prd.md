# R9.2 ContextHygiene P0 P1 收口

## Goal

完成 AI 2.5.4 ContextHygiene P0/P1，使 CoreBox 与后续 AI 入口使用同一套 SQLite-backed session、checkpoint、ContextPackage、MemoryPolicy 和 CompressionSnapshot 治理链路。2.5.3 SQLite/FTS5 retrieval 与 citation 必须真正参与受控上下文执行，而不只停留在审计 metadata。

用户价值：新任务不会被旧会话污染；历史、记忆和本地知识的使用可解释、可禁用、可删除；敏感内容和跨 workspace/project 内容默认 fail-closed。

## Confirmed Facts

- SQLite 已有 session、turn、checkpoint、compression snapshot、memory、tombstone、context package log 表。
- CoreBox `text.chat` 已通过 host-owned context execution 真实消费受治理 ContextPackage，并保留 metadata-only package/citation trace。
- 官方 `touch-intelligence` 已迁移到 `contextInvoke/contextStream`，packaged CoreBox 已验证 new/continue/stateless、degraded summary 与 continuation/stateless provider payload。
- Memory scope/filter/revalidation 与插件 host-only 管理边界已完成；workspace/project 缺失或不匹配 `scopeRef` 时 fail-closed。
- Intelligence Audit 保持 metadata-only explain；Memory Review 已完成搜索、来源 metadata、编辑后重评估、启停和原子 tombstone delete。
- CompressionSnapshot 已完成结构化校验、source range、checkpoint、session CAS、fail-soft degraded 和 ContextPackage consumption 闭环。
- OmniPanel、Workflow、Assistant 已接入统一 host-owned ContextHygiene；CoreBox/Assistant/Workflow/OmniPanel 均有 isolated packaged Electron context evidence，真实用户 profile 明确保留 open。

## Requirements

### R1. Host-owned Context Execution

- ContextPackage 的实际 prompt 组装必须在 CoreApp host 内完成；插件不得读取跨作用域 memory/retrieval 原文后自行拼 prompt。
- text.chat 调用必须能受控消费 current input、recent turns、summary、memory 和 retrieval items，并保留 citation/package trace metadata。
- ContextHygiene 不可用时保持现有 AI 路径 fail-soft；secret/sensitive 或 policy-blocked item 不得注入。

### R2. Session And Boundary Controls

- 保持新 session 默认不注入旧 session 原文。
- 支持显式继续、显式新会话、不带历史和长空闲边界，并写可解释 checkpoint reason。
- CoreBox 至少提供可见的上下文模式/边界状态；不显示完整 prompt 或私有 turn 内容。

### R3. Memory Governance And Isolation

- disabled 和 tombstoned memory 不得进入 ContextPackage，删除与 prepare 并发时 tombstone 优先。
- global/session memory 必须按既有语义过滤；workspace/project memory 必须有稳定 scope reference，缺失时 fail-closed，不得跨作用域注入。
- Memory list/save/edit/enable/delete 属 host-owned 管理能力；第三方插件不得获得跨 workspace Memory 管理或原文读取能力。
- API key、token、恢复码、口令、secret/sensitive 内容不得进入普通 MemoryItem、普通日志、FTS 或同步载荷。

### R4. Memory Review MVP

- 已保存 memory 支持搜索、查看 type/scope/status/source session/turn metadata、编辑后重新 evaluate、enable/disable 和 tombstone delete。
- UI 只显示必要内容和来源 metadata；不得展示历史 prompt/response 原文。
- rejected / needs_review 继续 fail-closed；不引入自动长期保存。

### R5. CompressionSnapshot P1

- 实现结构化 snapshot 校验、source turn range、checkpoint 关联和 session summary CAS。
- 压缩失败不得删除原 turns；必须返回可解释 degraded reason。
- user-rejected、secret/sensitive 或低可信候选不得自动升级为长期 memory。

### R6. Entrypoints And Evidence

- CoreBox、OmniPanel、Workflow、Assistant 各至少有一条最近路径 ContextHygiene integration case。
- OmniPanel/Assistant 默认轻上下文；Workflow run 使用独立 session；入口之间不得自然继承完整历史。
- 保存一组受控本地 evidence，覆盖 package/citation、memory enable-disable/delete、checkpoint/compression 和 degraded/fail-closed 状态。
- 同步 TODO、PRD、CHANGES、Quality Baseline 和 R8/R9 execution plan。

## Acceptance Criteria

- [x] text.chat 的宿主调用真实消费安全 ContextPackage，而不是只记录 package metadata。
- [x] 新 session、显式继续、不带历史、长空闲、token prune 均有 focused integration evidence；CoreBox 三种模式另有 packaged 可见证据。
- [x] disabled、tombstoned、secret/sensitive、scope mismatch memory 均不进入 package。
- [x] 插件不能 list/edit/enable/delete host MemoryItem；官方插件仍可受控 evaluate/invoke。
- [x] Memory Review 支持搜索、来源 metadata、编辑后重评估、启停和 tombstone 删除。
- [x] CompressionSnapshot 结构化写入、CAS、失败不删 turns、checkpoint/package consumption 有测试。
- [x] CoreBox、OmniPanel、Workflow、Assistant 各有至少一条 integration case。
- [x] 全部子任务完成；parent focused tests、CoreApp renderer/node typecheck、SDK mirror tests 和任务 slice `git diff --check` 通过。全局 `git diff --check` 仍仅被 Nexus 非本任务 whitespace 变更阻断，未改写用户工作。
- [x] 受控与 packaged evidence 已明确标注来源；真实 profile 仍未验证，未宣称 production 完成。

## Constraints

- SQLite 是本地唯一业务 SoT；不得新增 JSON 业务 SoT。
- 跨层通信使用 typed transport/domain SDK；不得新增 raw IPC/channel。
- 不访问系统钥匙串、Electron `safeStorage` 或外部 tracing/vectorstore。
- 涉及 SQLite schema/data migration 前必须按 AGENTS 危险操作格式再次获得明确确认。
- 保留现有 API/插件兼容性；需要收紧的能力通过专用 facade/capability gate 实现。

## Out Of Scope

- embeddings、rerank、独立 vector DB。
- 自动长期记忆、记忆衰减、supersedes、多设备同步。
- R8 Domain Lexicon/Catalog、R9.3 本地模型、R9.4 ASR。
- 全量历史聊天 UI 或跨应用自动扫描私有数据。

## Task Map

1. `07-10-r9-2-memory-governance-scope`：Memory 注入回归、插件边界、scope 隔离。
2. `07-10-r9-2-context-execution-corebox`：宿主 context-aware invoke、CoreBox 模式控制和 explain。
3. `07-10-r9-2-memory-review-management`：Memory 搜索、编辑重评估、来源审计。
4. `07-10-r9-2-compression-snapshot`：CompressionSnapshot、CAS、checkpoint/package 消费。
5. `07-10-r9-2-entrypoints-evidence`：OmniPanel/Workflow/Assistant 接入和 evidence 收口。
6. `07-11-corebox-ai-dispatch-idempotency`：active widget 输入单次派发、latest-request-wins 和一次提交证据。

依赖顺序：1 -> 2；1 -> 3；1 -> 4；2/3/4 -> 5；5 -> 6。
