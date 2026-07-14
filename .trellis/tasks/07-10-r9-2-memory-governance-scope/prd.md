# R9.2 Memory 治理与作用域隔离

## Goal

建立 R9.2 可依赖的 Memory 安全边界：disabled、tombstoned、过期、敏感或 scope 不匹配的记忆不能进入 ContextPackage；Memory 管理能力只属于宿主；workspace/project 缺少稳定身份时默认拒绝注入。

## Requirements

### Filtering

- usable-memory 查询必须同时检查 enabled、privacy、tombstone、TTL、scope 和 scope identity。
- 删除与 prepare/invoke 并发时，tombstone 优先；在 package commit 或 provider invoke 前进行最终有效性复核。
- secret/sensitive 内容不得进入普通 MemoryItem、ContextPackage、日志、FTS 或同步载荷。

### Scope Isolation

- global memory 只按显式全局语义使用；session memory 必须精确匹配当前 session。
- workspace/project memory 必须精确匹配稳定 `scopeRef`；`scopeRef` 缺失、未知或不一致时 fail-closed。
- 现有无 `scopeRef` 数据不得隐式升级为 global；需要迁移时必须提供 preflight、旧数据处理策略与 rollback。

### Capability Boundary

- list/save/edit/enable/delete MemoryItem 是 host-owned 管理能力。
- 第三方插件不能读取宿主 Memory 原文或管理跨 workspace/project memory。
- 官方插件可以继续使用受控的 evaluate/prepare/invoke 能力，不因收紧管理面破坏现有 AI Ask。

## Dependencies

- 无前置子任务；这是 `context-execution-corebox`、`memory-review-management`、`compression-snapshot` 的共同前置。

## Acceptance Criteria

- [x] disabled、expired、secret/sensitive、scope mismatch 与 tombstoned memory 回归已覆盖；最终复核会更新 metadata-only package log。
- [x] 删除发生在 prepare 与 invoke 之间时，`revalidatePackageMemories()` 会在共享 assembler 前移除失效项；provider payload integration test 证明 tombstoned Memory 原文不会进入最终 messages。
- [x] workspace/project 缺少稳定 identity 时不注入；global 与精确 session 匹配规则有 contract test。
- [x] Plugin facade 已移除 raw context prepare 与 Memory list/save/enable/delete，主进程 handler 按 plugin actor fail-closed；五个 raw typed-event 拒绝均有 handler registration integration test。
- [x] 官方 CoreBox 的 evaluate/prepare/invoke 路径保持兼容，官方插件与 CoreApp AI 回归通过。
- [x] 本切片未执行 schema/data migration；`scopeRef` migration 继续保留显式危险操作确认、preflight 与 rollback 门禁。

## Constraints

- SQLite 是本地业务 SoT；不增加 JSON 业务 SoT。
- 不引入自动长期记忆、跨设备同步或隐式 scope 推断。
- 不在插件侧复制宿主 Memory 管理逻辑。
