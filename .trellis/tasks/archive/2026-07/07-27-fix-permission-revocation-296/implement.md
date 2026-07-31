# Implementation Plan — 权限撤销会话失效 #296

## RED

- [x] 在 `permission-store.test.ts` 增加 session-only、persistent-only、combined、candidate/canonical、revokeAll 和 restart failures。
- [x] 增加 backend persist failure fixture，证明 revoke 回滚 persistent/session/audit。
- [x] 在 PermissionModule focused test 中断言成功顺序为 store state denied -> internal revoke event -> renderer broadcast，失败路径无事件/广播。

## GREEN

- [x] 复用 `getPermissionIdCandidates()` 集中处理 revoke candidate，避免新增与 registry 漂移的 alias 表。
- [x] 修改 store 方法返回实际 canonical revoked ids，并在一个 `commitPersistentMutation` 中删除 persistent/session grants、写去重 audit。
- [x] 增加 `TalexEvents.PERMISSION_REVOKED` 与 `PermissionRevokedEvent`。
- [x] PermissionModule 在 commit 后 emit，再 broadcast；保持外部 transport response compatible。

## REFACTOR

- [x] 确认 `PermissionGuard` 无 decision cache，不新增无效 invalidation abstraction。
- [x] 保持日志/事件 payload 只含 pluginId、permissionIds 和 scope；不含敏感数据。
- [x] 记录 #299 对该事件的 client-close dependency。

## Validation

```bash
pnpm -C apps/core-app exec vitest run \
  src/main/modules/permission/permission-store.test.ts \
  src/main/modules/permission/index.test.ts
pnpm -C apps/core-app run typecheck:node
pnpm -C apps/core-app exec eslint \
  src/main/modules/permission/permission-store.ts \
  src/main/modules/permission/permission-store.test.ts \
  src/main/modules/permission/index.ts \
  src/main/core/eventbus/touch-event.ts
git diff --check
```

若不存在 `permission/index.test.ts`，先建立 focused module test，不用 broad mock 替代 store state assertion。

## Review Gates

- Store rollback 与 alias normalization review 通过后才增加 event。
- #299 consumer 完成前，#296 可进入 review，但不关闭 GitHub Issue。
- 不提交、不 push，除非用户另行授权。
