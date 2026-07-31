# 修复文件索引更新与错误脱敏 #476

## Goal

定位并修复 `files` 索引记录更新失败的根因，确保文件/应用索引写入失败只通过稳定错误码、可重试标记和 report ID 跨 transport 到 UI，原始 SQL、params、绝对路径、stack 和 cause 仅保留在受控主进程本地诊断中。

## Requirements

- 还原截图对应的 `UPDATE files ...` 写入路径、失败条件和 renderer 展示链路。
- 修复可确定复现的更新失败根因，保持 SQLite/FTS/SearchIndex 原子性和单写者合同。
- 所有文件索引 rebuild/update transport 结果使用稳定 `errorCode`、safe localized message、`retryable`、`reportId`；不得回传 `error.message`。
- renderer 不记录、展示或 telemetry 上传 raw SQL、params、绝对路径、stack/cause。
- 主进程本地日志保留 report ID 与完整诊断，远程 Sentry/Nexus 只接收稳定分类和 allowlisted primitive context。
- 使用临时数据库、隔离 profile 或 synthetic canary 进行验证，不触碰真实用户索引。

## Acceptance Criteria

- [x] 确定性回归复现旧 `UPDATE files` 失败并证明修复。
- [x] `FileIndexRebuildResult` / indexed-source reset 失败只包含 safe public fields。
- [x] serialized transport、renderer alert/log、Sentry/Nexus payload 不包含 SQL、`params:`、absolute path 或 stack。
- [x] 真实第二 SQLite connection `BEGIN IMMEDIATE` 验证 busy 失败、锁释放后恢复和 report ID 关联。
- [x] focused tests、CoreApp node/web typecheck、scoped lint、production build 与 `git diff --check` 通过。
- [x] 独立审查发现的 2 个 P1（Dashboard raw fields、renderer raw logger）均已修复并由 canary/source-contract 覆盖；无已知开放 P0/P1/P2。

## Out of Scope

- 重构完整 SearchIndex split-write 迁移或启用默认关闭的 feature flag。
- 修复无关搜索 ranking、扫描内存峰值或平台后端问题。
- 读取或删除真实用户文件索引数据。
