# 技术设计：持久化 OTA 生命周期状态机

## 1. 所有权

- `app_update_records`：release、ignored/snoozed/acknowledged。
- `download_tasks`：字节下载和文件路径。
- `app_update_attempts`：唯一 lifecycle 真源。
- renderer：snapshot 镜像，不持久化、不反推 host 状态。

## 2. Schema

`app_update_attempts` 使用 text id，包含：

- `revision INTEGER NOT NULL DEFAULT 0`
- `phase TEXT NOT NULL`
- `current_version`、`target_version`
- `source`、`channel`
- `release_tag`
- `download_task_id`
- `install_mode`
- `previous_version`
- `recovery_available INTEGER NOT NULL DEFAULT 0`
- `error_code`、`error_message`、`error_retryable`
- `created_at`、`updated_at`、`terminal_at`

同一时间只允许一个非 terminal active attempt。以 partial unique index 或 repository transaction guard 实现；SQLite/LibSQL 支持不足时使用固定 active key + 事务检查，禁止只靠内存锁。

## 3. 状态机

共享 `UpdateLifecyclePhase` 和 `UpdateLifecycleSnapshot` 放在 `packages/utils/types/update.ts`。

合法主路径：

```text
idle -> checking -> available -> downloading -> verifying -> ready
ready -> install-scheduled -> handoff-started -> awaiting-health -> healthy
awaiting-health -> recovery-required -> recovering -> recovered
任何非 terminal -> failed
```

允许的恢复边：

- `checking -> idle`（无更新）
- `downloading -> available`（用户取消，可重试）
- `failed -> available/downloading` 只能通过显式 retry command 创建新 revision 或新 attempt。

terminal：healthy、recovered。failed 是否 terminal 由 `retryable` 决定，但不能原地跳过安全阶段。

Reducer 输入必须包含 attempt id、expected revision、command 和 typed payload。Repository 使用 compare-and-transition；更新条件包含 id + revision + expected phase，受影响行数不是 1 即冲突。

## 4. Snapshot

Snapshot 至少包含：attemptId、revision、phase、currentVersion、targetVersion、source、channel、taskId、installMode、installOnNormalQuit、recoveryAvailable、previousVersion、error、updatedAt。

`idle` 也由 main 构造完整 snapshot，renderer 不设置默认布尔值。Download progress 是 snapshot 的可选 projection；DB attempt 只保存 task id，不复制 chunk/progress 行。

## 5. Transport

- `getStatus` 返回 snapshot。
- check/download/install 响应增加 snapshot；失败返回稳定 code + message + retryable。
- available event 携带 snapshot/release display，不传播 provider private payload。
- SDK 类型定义在 packages/utils，main handler 在边界归一化 unknown。

## 6. 设置迁移

Shared `UpdateSettings` 使用 `installOnNormalQuit?: boolean`，默认 true。读取旧设置时：

1. 新字段存在 → 使用新字段；
2. 否则旧 `autoInstallDownloadedUpdates` 为 boolean → 原值迁移；
3. 两者都无 → true；
4. 保存时只写新字段并删除旧字段。

`pendingInstallVersion` 不再作为长期状态。初始化时只有找到匹配 release record、完成 download task、文件存在并具备 checksum/signature metadata，才创建 ready attempt；否则清除旧值。

## 7. 并发与恢复

- check single-flight 可保留，但最终状态提交必须经过 reducer。
- Download completion、manual action、startup restore 同时到达时以 revision CAS 决胜。
- renderer 只接收 revision 更大的 snapshot。
- clear cache 不能删除 active install attempt；必须显式 cancel/transition 后再清理 release/cache。

## 8. 后续边界

平台安装协调器只调用 lifecycle command：scheduleInstall、markHandoffStarted、markAwaitingHealth、markHealthy、requireRecovery、markRecovered。它不直接改 DB phase。
