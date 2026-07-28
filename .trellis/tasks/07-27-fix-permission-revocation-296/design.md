# Design — 权限撤销会话失效 #296

## Store Contract

将 `PermissionStore.revoke` 和 `revokeAll` 的返回值改为实际撤销的 canonical permission id 列表。

```ts
revoke(pluginId: string, permissionId: string): Promise<string[]>
revokeAll(pluginId: string): Promise<string[]>
```

算法：

1. `ensureWritable()` 保持 fail-closed，包括 no-op revoke。
2. 使用 `getPermissionIdCandidates()` 收集 canonical/alias 表示，并从 persistent map 与 session set 判断实际存在性。
3. 在 `commitPersistentMutation()` 内同时删除两个 store；session set 为空后删除 plugin key。
4. 按 canonical id 去重写 audit；persist 失败时利用既有 snapshots 回滚。
5. 返回稳定排序的 canonical ids；no-op 返回 `[]`。

## Event Contract

在 `TalexEvents` 增加 `PERMISSION_REVOKED` 与只读 event：

```ts
class PermissionRevokedEvent {
  pluginId: string
  permissionIds: readonly string[]
  all: boolean
}
```

PermissionModule 顺序固定为：

```text
await store.revoke*
  -> touchEventBus.emit(PERMISSION_REVOKED)
  -> transport.broadcast(permission:updated)
  -> return success
```

EventEmitter listener 同步执行，因此 subscriber 读取 store 时必须已经 denied。若 store 抛错，三个后续步骤均不执行。事件只表示实际 state transition；no-op 不发 internal revoked event，但可保留 UI refresh broadcast 的现有幂等行为。

## Active Resources

本任务不伪造一个全局 cancellation registry。长生命周期 owner 使用 `PERMISSION_REVOKED`：

- #299 的 SQLite client map 关闭匹配 plugin/permission 的 client，并使后续 request 重新走 fail-closed guard。
- 其他 handler 没有 retained client 时，下一次标准 permission guard 直接读取 store 并 denied。
- 若后续发现实际 retained stream 不重新鉴权，按 capability owner 增加 subscriber，而不是把 payload 或 transport internals塞进 PermissionStore。

## Compatibility

- Renderer SDK payload/response 不变；store 返回值仅 main 内部消费。
- Existing grant/revoke audit schema 不变。
- No migration：session grants 为进程内状态，persistent grants 仍由现有 SQLite backend 全量事务写入。

## Rollback

Store change、internal event、consumer subscriptions 可分开回滚；任何 rollback 都不能恢复“session grant 优先于 explicit revoke”的旧语义。
