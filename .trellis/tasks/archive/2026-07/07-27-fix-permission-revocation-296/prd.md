# 修复权限撤销会话失效 #296

## Goal

让插件权限的显式撤销立即、原子地清理持久与 session grants，并提供提交后撤权事件，使后续调用与长生命周期 capability 都能基于同一已生效状态失效。

## Confirmed Facts

- `PermissionStore.revoke()` 当前在没有 persistent grant 时提前返回，因此 session-only grant 完全不会被撤销。
- `revoke()` / `revokeAll()` 只删除 `data.grants`，`checkPermissionAccess()` 却以 `sessionGrants || storedGrant` 任一成立为允许。
- `commitPersistentMutation()` 已快照 `data`、dirty state 和 `sessionGrants`，可在 SQLite persist 失败时整体回滚，适合作为原子边界。
- `PermissionGuard` 每次直接查询 store，没有 permission decision cache；无需新增伪 cache invalidation。
- 当前只有 `PERMISSION_GRANTED` internal event，没有提交后 `PERMISSION_REVOKED` contract；renderer `updated` broadcast 只携带 pluginId。

## Requirements

### R1. Atomic Revocation

- `revoke(pluginId, permissionId)` 删除 canonical permission 及所有 alias candidates 的 persistent/session grants；session-only、persistent-only 和 combined 均立即 denied。
- `revokeAll(pluginId)` 对 persistent/session grants 的规范化并集一次提交、一次清理；空 grant 保持幂等。
- SQLite persist 失败时 persistent data、session grants、audit logs 与 dirty state 全部恢复。

### R2. Audit And Notification

- Store 返回实际撤销的 canonical permission ids；同一 permission 同时存在于 persistent/session 时只记录一个 `revoked` audit entry。
- PermissionModule 只在 store commit 成功后发出 internal `PermissionRevokedEvent`，payload 仅含 pluginId、permissionIds 与 `all` 标记，不含用户内容。
- capability owner 的同步 listener 先观察到已 denied 的 store，再向 renderer 广播 `PermissionEvents.push.updated`；失败时不发事件、不广播成功。

### R3. Active Capability Contract

- 撤权后的任意新/后续 permission check 立即 denied，无需重启 app 或 plugin。
- 本任务建立 typed revoke event；`#299` 的 plugin SQLite/secret client lifecycle 必须消费该事件并关闭对应 active clients，之后 #296 才满足完整跨资源验收。
- 不在本任务中建立通用 stream registry 或取消与权限无关的任务。

## Acceptance Criteria

- [x] session-only grant 在 `revoke()` 后立即 denied。
- [x] persistent-only 与 combined grant 在 `revoke()` 后立即 denied，重启后保持 denied。
- [x] revoke 统一使用 `getPermissionIdCandidates()` 删除所有表示；当前 registry 的 normalize/candidates 为 identity-only，canonical contract 已覆盖，未来 alias 映射沿用同一删除路径。
- [x] `revokeAll()` 清空 persistent/session grants，并为每个实际权限产生一个去重审计项。
- [x] backend persist 失败会恢复 persistent/session 状态且不发 revoke event/update broadcast。
- [x] commit 后 listener 观察到 denied state，renderer update 在 internal invalidation 之后广播。
- [x] #299 通过同一 event 关闭 storage clients，并在后续操作前重新鉴权；联合回归与 GitHub #296/#299 closure evidence 已证明 active-client teardown。
- [x] focused permission tests、CoreApp node typecheck、scoped lint 与 `git diff --check` 通过。

## Verification Evidence

- RED：Store 的 session/combined/revokeAll 测试失败；Module committed-event 测试失败。
- GREEN：4 focused test files / 27 tests passed，覆盖 store、module event、permission guard、channel guard。
- CoreApp `typecheck:node` passed；scoped ESLint 0 warning/error；`git diff --check` passed。
- `PermissionGuard` 每次读取 store，无 decision cache；未添加无效 cache invalidation abstraction。
- Trellis implement/check subagents 因本机缺少 OpenRouter 凭据未运行，主会话完成实现与复核。

## Out Of Scope

- 修改权限 UI、默认权限或 manifest 语义。
- 实现跨所有模块的通用 stream cancellation runtime。
- 在撤权事件中记录 payload、SQL、路径或 secret。
