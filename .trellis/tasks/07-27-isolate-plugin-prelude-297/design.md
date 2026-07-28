# Design — Plugin Prelude Isolation #297

## Current Failure Model

真实 `TouchPlugin.enable()` 仍调用 `loadPluginFeatureContext*()`，后者在 Electron main 内执行 `vm.runInContext()`。`TUFF_PLUGIN_ISOLATION=1` 只启动一个全局 utilityProcess 并运行 synthetic self-check；该 host 未承载真实插件，而且所有 load 共用一个 child。现有 SDK proxy 使用 `chain: string[]` 反射 main context，JSON clone 丢失 callback、AbortSignal、typed arrays 与 error 语义。

官方 Prelude 中同时存在同步 SDK、filesystem/SQLite、child process、raw fetch、stream callbacks 与 cancellation。故默认开关翻转既不兼容，也不满足 capability-only 安全边界。

## Runtime Ownership

引入 `PluginRuntimeHost`，每个实例只绑定一个 activation：

```text
HostOwner = {
  pluginName,
  pluginInstanceId,
  activationGeneration,
  activationKey,       // 仅 main 保存
  activationHandle,    // main 随机签发，child 仅作 correlation
  hostGeneration,
  child,
  controlPort
}
```

`PluginRuntimeHostManager` 只按 plugin name 保存 current host，但 resolve 必须全量匹配 activation identity。替换 current host 前先 invalidate old binding，再 await old termination。child 发送的 plugin metadata 不能覆盖 owner。

Activation transaction：

```text
permission/preflight
  -> increment generation + request key
  -> create authoritative local context
  -> fork dedicated child with heap limit
  -> ready nonce handshake
  -> send load(script + immutable snapshot + capability manifest)
  -> await load
  -> await onInit
  -> status ENABLED
```

失败回滚按逆序撤销 key、capability/callback resources和进程。main VM loader保留为纯单元测试 helper 时必须移至 testing-only entry，任何 production import graph 不得引用。

## Protocol

`plugin-host-protocol.ts` 定义唯一 wire union，不接受 duck typing：

```text
main -> child
  host-init | host-load | lifecycle-call | capability-result
  callback-call | cancel | resource-dispose | shutdown

child -> main
  host-ready | load-result | lifecycle-result | capability-call
  callback-result | resource-dispose | violation
```

每条 activation 消息包含 `protocolVersion`、`activationHandle`、`hostGeneration` 和 owner-scoped `requestId`。握手前只接受 ready；shutdown 后不接受任何业务消息。main 为当前 port 闭包绑定 owner，message metadata 只用于 mismatch rejection。

固定错误 DTO：`{ code, message?, retryable? }`。生产 message 使用稳定 code；native message 只进入脱敏 debug telemetry。

## Capability Registry

删除 `resolveChain()` 与递归 proxy。child 根据 load 下发的 capability manifest 生成固定 ID proxy；main registry 维护：

```ts
interface CapabilityDefinition<Req, Res> {
  id: PluginCapabilityId
  permission?: PluginPermissionId
  timeoutMs: number
  concurrency: 'fast' | 'io' | 'stream' | 'process'
  validateRequest(value: unknown): Req
  validateResult(value: unknown): Res
  invoke(owner: AuthoritativePluginContext, request: Req, signal: AbortSignal): Promise<Res>
}
```

Dispatch 顺序固定为：wire validation -> current host ownership -> current activation registry -> authoritative context签发/验证 -> lifecycle state -> rate/concurrency limit -> permission check -> request schema -> handler -> result schema/size。

首批 capability families：

- `plugin.info.*`, `feature.registry.*`, `feature.items.*`
- `storage.file.*`, `storage.sqlite.*`, `secret.*`
- `clipboard.*`, `dialog.*`, `open-url`, `http.*`
- `channel.invoke`, `channel.subscribe`, `channel.unsubscribe`
- `intelligence.*`, `voice.*`, `flow.*`, `quick-ops.*`
- `filesystem.*`, `process.spawn`, `system.*`

已有 transport/SDK handler仍是业务实现的 source of truth；capability adapter只做 typed DTO转换和 owner context注入，不复制权限逻辑。对 privileged family 再在 registry 层声明 permission，实现 defense in depth。

## Wire Values And Resources

自定义 codec 遍历 cloneable DTO并限制 depth/member/bytes。只允许 primitives、plain object/array、`undefined` marker、Error DTO、ArrayBuffer/typed array DTO和以下 handles：

- callback：参数函数编码为 owner-scoped callback ID；接收侧创建 proxy，invoke/result 同样有 deadline和并发限制。
- cancel：AbortSignal 编码为 request cancel token；abort双向传播，teardown统一 abort。
- subscription/disposer：main 返回 resource ID；child disposer调用 `resource-dispose`。owner shutdown 时 main兜底 dispose。
- stream/controller：显式 stream resource ID和 event callback，不把任意 class/function结构化克隆。

拒绝 cyclic graph、symbol、BigInt、Map/Set、Date/class instance、accessor、prototype pollution keys和未声明 function位置。Buffer/typed arrays必须在计算大小后复制，避免 view/underlying buffer绕过。

## Lifecycle And Failure Semantics

- load、`onInit`、feature lifecycle和 teardown分别设置 deadline。
- lifecycle请求与 originating AbortSignal绑定；main abort时发送 cancel，child完成或超时后清 request。
- timeout先标记 request cancelled并拒绝 pending；grace period内未 ack则 kill process。
- unexpected exit立即 invalidate host binding、reject pending、dispose main resources并通知 `TouchPlugin`进入 `CRASHED`。
- restart只由 manager在显式 enable/reload或有界自动恢复策略中创建新 activation；新 generation/key/handle/process全部 rotation。crash-loop达到预算后保持 disabled/crashed，禁止 fallback。
- disable/reload/uninstall barrier：停止接收新 call -> cancel requests -> short awaited teardown lifecycle -> revoke authority -> dispose resources -> graceful shutdown -> forced kill。
- permission revoke只终止依赖被撤销 capability的 resources；高权限长生命周期资源（SQLite/Secret stream/process）必须在 revoke barrier内结束。若无法可靠细分，终止整个 activation fail closed。

## Resource Limits

初始上限作为常量并可测试覆盖：

- wire message/result：1 MiB；depth 32；array/object members 10,000。
- pending capability calls：32；active IO 8；active process 2；callbacks 64；subscriptions 32。
- load 10s；fast call 5s；IO 30s；feature lifecycle 60s；teardown 2s；kill grace 500ms。
- child V8 old-space 128 MiB；restart budget 3/30s stability window。

utilityProcess CPU/RSS watchdog以可用 Electron metrics为准；无法跨平台可靠测量时，heap flag、heartbeat和per-call deadline为 mandatory基线。超限日志不包含 payload。

## Official Plugin Migration

迁移顺序按阻塞程度：

1. empty/simple Prelude：code/text snippets、clipboard history。
2. invoke-only：dev toolbox/utils、emoji、quickops、bookmarks/snippets。
3. async registry/storage：quick-actions、browser-open、translation。
4. cancellation/stream：text-tools、dictation、intelligence。
5. privileged Node：batch-rename、browser-data、workspace-scripts、snipaste、system/window actions。

filesystem/process插件必须改为 capability，不允许以“已在 child”为理由保留 direct require。`path`、pure crypto、timers可在 child本地 allowlist；`process`只暴露冻结 `{ platform, arch, env allowlist }` snapshot，不暴露 mutable global。

## Build And Packaging

`electron.vite.config.ts`继续把 host输出为固定 `plugin-host.js`。production build contract测试确认 main bundle不包含 `vm.runInContext` plugin loader、host artifact存在、缺失 artifact时 activation fail closed。真实 Electron smoke至少启动两个独立插件 process，验证 crash/hang/oversize/stale generation隔离和 main存活。

## Rollout Rule

所有官方插件 capability迁移与真实 smoke完成前，不删除旧 loader调用；但 hard-cut landing commit/最终工作区状态必须一次性删除 production fallback和 env flag。不得以 dual-mode长期结束 #297。
