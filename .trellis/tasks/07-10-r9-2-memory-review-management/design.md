# Memory Review Management Design

## UI Ownership

扩展现有 `IntelligenceMemoryReview.vue`，继续作为 Intelligence Audit 下的 host-side 管理面。使用 TuffEx 既有 input/select/toggle/dialog 控件与 i18n catalog，不增加 renderer 本地业务 SoT。

## Search

MVP 使用 typed `ListMemoriesInput` 扩展 query/status/page 语义，由主进程 SQLite 查询负责过滤和稳定排序；renderer 只维护当前筛选条件、分页与请求状态。关键词匹配 content/summary/tags，结果默认排除 tombstone，是否包含 disabled 由显式筛选控制。

## Edit State Machine

```text
view -> edit(dirty) -> evaluate
  -> suggested + unchanged -> explicit replace
  -> rejected/needs_review -> blocked
  -> any field change -> dirty, evaluation invalidated
```

替换建议由 host service 作为单一事务完成：保存新项、写替换来源 metadata、写旧项 tombstone/disable。若事务失败，两者都不提交。UI 不自行组合 save + delete 两个非原子请求。

## Source Audit

列表只暴露 MemoryItem 已有的 sourceSessionId/sourceTurnId、scope/type/privacy、createdAt/updatedAt/lastUsedAt/usageCount，以及安全的替换关系 metadata。来源原文仍由 session/turn SoT 保管，不在 Memory Review 拉取。

## Concurrency

- evaluate 返回后记录规范化 payload fingerprint；保存时 host 复核 fingerprint 或 expected updatedAt。
- 重复点击通过 loading gate 和 idempotency/expected version 拦截。
- 目标 memory 已被删除或更新时返回 conflict，UI 刷新列表并要求重新评估。
