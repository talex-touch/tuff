# Design — Transport Caller Identity #300

## Security Invariant

`plugin.name` 只描述 actor scope，不等于 authenticated identity。Privileged authorization 必须同时满足：

```text
transport-issued identity
  + current activation registry match
  + lane-specific owner match (sender / port / host generation)
  + permission decision
```

payload `uniqueKey`、payload plugin name、`verified: true`、port request plugin 字段和 child `sdk-call.pluginName` 均视为 untrusted input。

## Identity Model

在 transport main 内增加 runtime-branded identity。Brand 由模块私有 `WeakSet` 保存，结构复制或手写对象不会通过 verifier：

```ts
interface PluginCallerIdentity {
  pluginName: string
  pluginInstanceId: string
  activationGeneration: number
  authority: 'web-contents' | 'message-port' | 'plugin-host' | 'local-host' | 'test'
  senderId?: number
  portId?: string
  hostGeneration?: number
}

interface PluginSecurityContext {
  name: string
  uniqueKey: string // legacy correlation only; never authorization
  identity?: PluginCallerIdentity
  sdkapi?: number
}
```

Production identity factories remain internal to `main-transport`; package main API只导出 `isAuthoritativePluginContext()`. Test factory 从明确的 testing entrypoint 导出，并在非 Vitest/test runtime 抛错。`verified` 字段从 production contract 移除；若兼容期必须保留，只能作为 derived deprecated getter，任何 guard 都不得读取它。

## Activation Registry

`PluginKeyManager` 扩展为 metadata registry：

```ts
interface PluginActivationIdentity {
  name: string
  pluginInstanceId: string
  activationGeneration: number
  key: string
}

requestKey(name, instance): PluginActivationIdentity
resolveIdentity(key): PluginActivationIdentity | undefined
resolveCurrentIdentity(name): PluginActivationIdentity | undefined
```

`Plugin` 构造时生成稳定 runtime instance id，每次 successful enable 前递增 generation。disable revoke current key，并清空本实例持有的 key；old key lookup 立即失败。保留现有 `resolveKey()` / `isValidKey()` 作为兼容 wrapper，但新 identity pipeline 不通过 name-only API 验证。

## WebContents Registry And Raw IPC

plugin view registration 保存：

```text
webContentsId -> registrationToken + name + instanceId + generation + key
```

`registerPluginWebContents` 返回 registration token；destroy callback 使用 `(webContentsId, token)` 条件删除。view 创建时从当前 plugin activation snapshot 注册，不从 preload/payload 读取 metadata。

`TouchChannel.__parse_raw_data`：

1. 根据真实 `e.sender.id` 查 plugin view registration。
2. registered sender 始终路由 PLUGIN；unregistered sender 若携带可识别 plugin key，也只进入 unverified PLUGIN lane，不能升级为 MAIN。
3. 检查 sender 未 destroyed，registration metadata 与 `resolveCurrentIdentity(name)` 全量一致。
4. payload key 若存在必须与 current registration key 一致；缺失不单独否定 sender proof，保留 legacy bridge 兼容。
5. 把 non-enumerable/internal `callerIdentityCandidate` 交给 main transport；reply serialization 不复制该字段。

`ipcMain.handle` lane 通过 `PluginKeyManager.resolveSenderIdentity(sender)` 使用同一 resolver，而不是默认创建无 plugin context。

## Main Transport

所有 context 构造集中到一个函数：

```ts
resolveHandlerPluginContext(input, lane): PluginSecurityContext | undefined
```

- channel/on/onStream：只接受 TouchChannel 已验证的 candidate，然后由 transport 签发 branded identity。
- ipcMain.handle：从 real event.sender 解析 candidate。
- local invoke：忽略 caller 的 `verified`/identity，只用 `{ name, uniqueKey }` 查询 current activation metadata 并签发 `local-host` identity。
- tests：只接受 testing factory 签发的 branded test context。

Main-local plugin SDK 在 `plugin.ts` 复用一个 `getTransportInvokeContext()`，消除所有重复的 `verified: Boolean(...)`。

## MessagePort

`PortRecord` 增加创建时 authoritative identity snapshot。plugin scope upgrade 必须存在 authoritative webContents identity；payload `plugin` 只能做 mismatch rejection，不能建立 scope。

port lookup 必须匹配：

```text
record.sender.id
record.identity.pluginName
record.identity.pluginInstanceId
record.identity.activationGeneration
current activation registry
requested portId/channel/scope
```

stream context 的 authority 为 `message-port`，由已确认 PortRecord 派生；fallback raw IPC 使用本次 sender identity。旧 activation 的 port record 不满足 current registry，返回 null/fail closed。

## Plugin-Host Protocol

`PluginHostBridge.loadPlugin()` 为每个 loaded context 生成 cryptographically random `pluginHandle`，entry 同时记录 host generation。`HostLoad` 把 handle/generation 交给 child 的 sandbox SDK proxy；`HostSdkCall` 移除 authoritative `pluginName`，改发 handle + generation。

main 收到 call 时先确认消息来自当前 control port/generation，再由 handle lookup entry；missing/stale/cross-generation handle 返回 `sdk-result` error。plugin unload/host exit/stop 清空 handles。Plugin name 仅来自 main-side entry。

这不是 `#297` 的完整隔离替代：one-plugin-per-process 和 VM escape 防护仍由 #297 完成；本任务只修 protocol authority 与 stale/cross-plugin routing contract。

## Privileged Guards

`withPermission(requireVerifiedPlugin)` 和 localization helper 改为：

```ts
if (!isAuthoritativePluginContext(context.plugin)) deny()
```

verifier 检查 private runtime brand、identity.pluginName/name 一致和必需 lane fields。Permission lookup 继续使用 `context.plugin.name`，但只有 verifier 通过后才允许 privileged branch。

## Compatibility And Rollback

- Renderer payload/reply/event names 不变；legacy `uniqueKey` 继续发送，权限意义被移除。
- First-party calls 保持 `context.plugin === undefined`。
- Key rotation semantics 不变，只扩充 metadata。
- 可按 activation registry -> sender/transport -> port/protocol -> guard hard-cut 顺序实施；guard hard-cut 只能在所有 production lanes 已能签发 identity 后落地。
- 回滚不得恢复 `Boolean(uniqueKey)` 或 child self-declared plugin name authorization。

## Sensitive Data

Identity brand、activation key、opaque host handle 不记录日志、不持久化、不进入 renderer response。诊断只允许 name、senderId、generation number 和拒绝 reason；生产日志不得输出 key/handle。
