# 持久化 OTA 生命周期状态机

## Goal

以 SQLite 为唯一业务真源，为 CoreApp OTA 建立可持久化、可恢复、可审计的 lifecycle 状态机；shared types、transport、main service、DownloadCenter 引用和 renderer 只消费同一 snapshot，不再通过多个布尔值、task id 与 pending version 猜测状态。

## Requirements

### R1 — 持久化 Attempt

- 新增 `app_update_attempts`，一行表示一次从 candidate 到 healthy/recovered/failed 的尝试。
- attempt 至少记录 id、revision、phase、target/current version、source/channel、task id、install mode、previous version/recovery availability、稳定错误与时间戳。
- `app_update_records` 继续只负责 release 展示、忽略与稍后提醒；DownloadCenter 继续只负责字节进度。

### R2 — 单一 Exhaustive Reducer

- lifecycle phase 固定为 `idle/checking/available/downloading/verifying/ready/install-scheduled/handoff-started/awaiting-health/healthy/recovery-required/recovering/recovered/failed`。
- 所有转换由一个 reducer/command dispatcher 持有；非法前序状态、重复终态和过期 revision 必须拒绝。
- transition 在 SQLite 事务中同时写 phase、revision、payload/error 与 updatedAt。

### R3 — Typed Snapshot 与 Transport

- `UpdateGetStatusResponse` 返回 authoritative `UpdateLifecycleSnapshot`，不再暴露一组可互相矛盾的 ready/task/pending 布尔字段。
- renderer 只按 revision 接受新 snapshot；不得本地重建 host lifecycle。
- check/download/install/settings 动作返回最新 snapshot 或稳定 error code，不新增 raw IPC channel。

### R4 — 设置 Clean Cutover

- `autoInstallDownloadedUpdates` 一次性迁移为跨平台 `installOnNormalQuit`，默认 true，不保留双字段或 alias。
- 旧 true/false 值必须保留用户选择；缺失旧值使用新默认。
- 旧 `pendingInstallVersion` 只有在能关联可信 release/download task 时才能迁移为 attempt，否则清除并要求重新下载。

### R5 — 边界

- 本子任务不改变 macOS/Windows/Linux 的实际安装器或恢复 helper；只提供后续安装协调器可消费的状态、命令和持久化契约。

## Acceptance Criteria

- [x] schema/migration/repository 可创建、读取并恢复 active attempt；revision 单调递增。
- [x] reducer 覆盖全部合法转换，拒绝非法转换、过期 revision、重复 terminal command 和跨 attempt 更新。
- [x] 进程重启后 `getStatus` 返回与 SQLite 一致的 snapshot，不依赖 renderer cache 或内存 task map。
- [x] DownloadCenter 只通过 task id/progress 投影进入 snapshot，不成为 lifecycle 真源。
- [x] typed transport/SDK producer 与 consumer 使用同一 snapshot/error contract，renderer 丢弃旧 revision。
- [x] `autoInstallDownloadedUpdates` clean cutover 为 `installOnNormalQuit`；true/false/缺失迁移结果正确，旧字段无剩余调用。
- [x] 无完整可信元数据的旧 pending version 不会伪造 ready attempt。
- [x] lifecycle/repository/transport/renderer focused tests、web typecheck 与 OTA Node slice typecheck 通过。

## Verification

- CoreApp OTA lifecycle/provider/diagnostic focused tests：11 files，97 tests passed。
- packages/utils update contract：24 tests passed。
- `corepack pnpm run typecheck:node`：passed。
- `vue-tsc --noEmit -p tsconfig.web.json --composite false`：passed。
- CoreApp 与 packages/utils 定向 ESLint：passed。
- `0028_app_update_attempts.sql` 通过 SQLite 实际执行；repository tests 使用 production migration 验证进程 close/reopen、CAS 与 partial unique index。
- Electron 实例使用隔离 userData 与端口 5174 启动；`UpdateService`/repositories 初始化成功；实际设置页显示 `Install on Normal Quit`，开关 `checked=true`、`disabled=false`。

## Constraints

- 继承父任务 `.trellis/tasks/07-17-unify-ota-update-flow/` 与 Provider 子任务的 normalized candidate、fail-closed 安全门禁。
- SQLite 是业务真源；JSON 仅可作为设置迁移输入或后续 helper 协调载荷。
- 不引入强制更新、灰度、差分包、平台安装器或 recovery 执行逻辑。
