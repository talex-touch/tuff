# Memory Governance And Scope Design

## Boundary

将 Intelligence 能力分为两层：

- plugin-facing：invoke、stream、prepare context、evaluate explicit candidate，以及安全摘要。
- host-only：list/save/edit/enable/delete MemoryItem、读取 Memory 原文、scope 管理和迁移。

主进程 handler 使用现有 typed transport 与 `HandlerContext.plugin` 判定调用来源；renderer host UI 使用 host SDK，不新增 raw IPC。

## Filtering Pipeline

1. SQLite 查询先过滤 enabled、normal privacy、未 tombstone、未过期。
2. 应用精确 scope 规则：global；当前 session；匹配 scopeRef 的 workspace/project。
3. ContextPackage builder 只接收已过滤结果。
4. 在 package commit/provider invoke 前按 memory id 复核 tombstone、enabled 和 TTL，移除竞态期间失效项并记录 metadata-only excluded reason。

## Scope Identity

稳定身份缺失时先采用保守兼容策略：workspace/project memory 不参与注入，但仍可由 host UI 查看和治理。

若后续确认 schema 迁移，则：

- 为 MemoryItem 增加可空 `scopeRef` 或等价 ownership 字段，并同步 shared types、SQLite schema、migration 和 SDK。
- 新写入 workspace/project memory 必须携带稳定 identity。
- 旧行保持不可注入，直到用户显式重新分配；不做 implicit global promotion。
- preflight 输出旧行数量、scope 分布与处理建议；rollback 只回退 schema/新写入，不恢复已删除内容。

## Compatibility

- 现有 host UI 方法名可保持不变。
- plugin facade 在受限方法上返回稳定错误码，便于官方与第三方插件 fail-soft。
- 若宿主无法确定 scope identity，退化为 global/session-only package，并记录 `scope_identity_unavailable`。

## Security Notes

- 日志只记录 memory id、scope、reason、状态，不记录原文。
- secret/sensitive 判定继续沿用 MemoryPolicy；任何 bypass 都必须 fail-closed。
- tombstone 是删除优先级的事实源，不能被 snapshot/cache 重新激活。
