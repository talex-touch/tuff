# R9.2 Memory Review 搜索编辑与来源审计

## Goal

在现有手动评估/保存/list/启停/删除基础上，完成可治理的 Memory Review MVP：用户能搜索已保存记忆、核对来源 metadata、编辑后重新评估并显式替换，且任何拒绝或待审内容都不会写入。

## Requirements

### Search And Inspection

- 支持按关键词、type、scope、enabled 状态筛选已保存 memory。
- 展示必要的 content/summary/tags/type/scope/status，以及 source session/turn id、创建/更新时间等 metadata。
- 不读取或展示来源 prompt、response、完整 turn 内容。

### Edit And Replace

- 编辑任意会影响策略的字段后，旧 evaluation 立即失效，保存前必须重新调用 `contextEvaluateMemory`。
- 仅 `suggested` 且内容与最近一次评估一致时允许显式确认替换。
- 替换采用“创建新 MemoryItem + tombstone 旧 MemoryItem”的审计语义；失败时不得出现旧项已删、新项未保存的半状态。
- `rejected` / `needs_review` 保持 fail-closed，不保存、不覆盖旧项。

### Existing Governance

- enable/disable 与 tombstone delete 继续使用 host-owned typed SDK。
- automatic long-term memory 保持关闭；插件不能直接管理列表或执行替换。

## Dependencies

- 依赖 `07-10-r9-2-memory-governance-scope` 完成 host-only capability 与 scope fail-closed。

## Acceptance Criteria

- [x] saved list 可按关键词/type/scope/status 搜索，空态、错误态和刷新态可用。
- [x] 来源只显示 session/turn id 与时间等 metadata，不展示历史 prompt/response 原文。
- [x] 编辑后保存入口失效；重新 evaluate 为 `suggested` 后才可显式替换。
- [x] 替换成功后旧 memory 有 tombstone 且不再注入，新 memory 保留来源/替换关系 metadata。
- [x] 替换失败保持旧 memory 可用或完整回滚，不产生半状态。
- [x] rejected/needs_review、内容变更竞态和重复点击均有 UI/service tests。

## Out Of Scope

- 自动提取、自动保存、批量导入导出、语义搜索或跨设备同步。
