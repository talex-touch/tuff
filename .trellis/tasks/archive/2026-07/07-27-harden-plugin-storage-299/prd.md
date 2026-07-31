# 加固插件 SQLite 与 Secret #299

## Goal

在保留插件 SQLite 与 Secret 能力的前提下，建立 sender-bound、fail-closed、可撤销、可终止且有资源上限的宿主边界，消除跨数据库访问、权限运行时失效放行、不可终止 SQL、连接生命周期泄漏与 Secret 并发丢写风险。

## Confirmed Facts

- 当前 SQLite 默认文件位于插件 data 目录，但 raw SQL 可通过 `ATTACH` 访问其他数据库；隔离临时目录动态复现已确认。
- SQLite/Secret 在 PermissionModule 不可用时 fail-open；Secret health 完全无 caller/permission guard。
- `@libsql/client@0.17.4` 不暴露 authorizer、interrupt 或 sqlite runtime limits；`Promise.race` 不能停止执行。
- 仓库已有 electron-vite worker entry + `worker_threads` 运行模式，可通过终止 worker 实现真实 hard timeout。
- `#296` 已实现 committed `PERMISSION_REVOKED` event；`#300` 已落地 SQLite/Secret 所需的 raw IPC、invoke 与 port authoritative identity verifier，但其 plugin-host 全量验收仍独立保留。
- 官方插件当前没有 SQLite 消费者；`touch-translation` 使用 `storage.plugin` Secret 能力。

## Dependencies

- `07-27-fix-permission-revocation-296`：先完成并提供提交后撤权事件。
- `07-27-fix-transport-caller-identity-300`：至少 raw IPC、ipcMain.handle、local invoke 与 plugin port identity/verifier 必须通过；#299 不复制 key 校验。
- `07-27-release-v2-4-14-beta-1`：必须等待本任务及上述依赖通过发布门禁。

## Requirements

### R1. Authoritative And Fail-Closed Authorization

- 所有 SQLite 与 Secret handler（包括 health）只接受 `isAuthoritativePluginContext()` 签发的身份；不得从 payload 回退选择 plugin。
- context 的 plugin name、instance id、activation generation 必须与当前 loaded plugin 完全一致；stale/cross-plugin/结构伪造 context fail closed。
- 每次调用都执行现有 permission guard，permission runtime unavailable、permission denied 与 sdkapi mismatch 返回稳定、脱敏 code。

### R2. Killable SQLite Executor

- SQLite 在独立 `worker_threads` worker 中执行，Electron main 不持有 libsql Client。
- 每个 plugin activation 使用独立 worker/runtime record；同插件操作严格串行，跨插件受全局并发上限控制。
- read 2 秒、write/transaction 5 秒超时后必须 terminate worker，并拒绝 pending/queued 请求；后续调用创建新 worker并依赖 SQLite recovery。
- worker 需要 resource limits；异常退出、撤权、disable/reload/unload/crash/uninstall 与 module destroy 都必须销毁对应 worker。

### R3. SQL And Resource Policy

- 宿主与 worker 共享同一 SQL tokenizer/classifier；正确处理字符串、quoted identifier、line/block comment、terminal semicolon 与 malformed input。
- query 仅允许单条 SELECT；execute/transaction 仅允许受控 CRUD/DDL。拒绝 ATTACH/DETACH、PRAGMA、VACUUM、load_extension、显式事务控制、trigger/view/virtual table、RETURNING、多 statement 和 lane mismatch。
- 限制 SQL 64 KiB、params 256/合计 1 MiB、transaction 64 statements、query 1000 rows、result 4 MiB、每插件 queue 8、全局 active 4、open workers 16。
- 固定数据库文件名；canonical root/owner/db path 必须严格 containment，拒绝 owner/db symlink escape。
- worker 设置并验证每插件 main DB 64 MiB `max_page_count` 与 16 MiB retained journal limit；超额返回稳定 code，不删除或截断现有数据。

### R4. Secret Integrity And Lifecycle

- secure store read-modify-write 按 root 串行，使用同目录 temp file + chmod + atomic rename；失败不得覆盖旧文件。
- 增加 host-only prefix purge，uninstall 删除 `plugin.<canonical-name>.` 下的 Secret；revoke/disable/reload 保留值。
- concurrent Secret set/delete 不丢失其他 key；错误和日志不包含 secret value、key、path 或 envelope。

### R5. Stable SDK Contract

- shared event types增加稳定 `PluginStorageErrorCode`；SQLite SDK 抛出保留 `code` 的 typed error。
- Secret missing key 仍返回 `null`；鉴权、backend 和 malformed key 失败不得伪装成 missing。
- 现有成功响应 shape 保持兼容；`touch-translation` 对 denied/unavailable 保持可见且不回写明文配置。

## Acceptance Criteria

- [x] forged/stale/cross-plugin/payload-only identity 无法调用 SQLite/Secret；permission runtime unavailable 必须 deny。
- [x] ATTACH、PRAGMA、VACUUM、多 statement、obfuscated/quoted denied token 与 lane mismatch 均在 raw client 执行前拒绝。
- [x] long-running read 与 write/transaction 超时后 worker 被真实终止，旧请求不会产生迟到写入，新 worker 可恢复。
- [x] SQL/params/statements/rows/result/queue/global/open-worker/disk/journal/native heap 上限均有边界测试或 built-worker 验证和稳定错误 code。
- [x] canonical path、owner symlink、DB symlink、validation-to-open replacement 与 stale-generation replacement 有真实临时目录测试。
- [x] `PERMISSION_REVOKED`、disable/reload/unload/uninstall/module destroy 关闭正确 activation；uninstall 在删除目录前关闭 worker并只清理目标插件 Secret。
- [x] concurrent Secret writes、注入写失败、corrupt entry 与 prefix purge 测试证明无丢写、旧文件可恢复、无跨插件删除。
- [x] focused tests、CoreApp node/web typecheck、scoped lint、production build、worker artifact 检查、插件验证与 `git diff --check` 全部通过。

## Out Of Scope

- 完成 #297 的完整 Prelude 进程隔离或改变 plugin view security profile。
- 为第三方插件开放任意 PRAGMA、ATTACH、trigger、view、virtual table、FTS 或复杂 CTE。
- 新增数据库导出/迁移 UI、用户可配置配额或卸载保留选择；本 beta 采用卸载清除 plugin Secret、保留普通 revoke/disable 数据。
