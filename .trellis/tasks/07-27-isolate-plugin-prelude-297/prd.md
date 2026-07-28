# 完成插件 Prelude 进程隔离 #297

## Goal

将每个插件 activation 的 Prelude 从 Electron main 进程硬切到独立 `utilityProcess`，只允许通过 main 签发且逐调用鉴权的 typed capability RPC 访问宿主能力，并以确定性的取消、超时、崩溃、重启和资源回收语义约束完整生命周期。

## Security Invariants

- Electron main 永不解析或执行插件 Prelude；生产、开发、测试设备均没有 main-process VM fallback 或环境变量逃生路径。
- 每个 activation 独占一个 utility process；不同插件、不同 generation 不共享进程、port、handle、callback、subscription 或 pending request。
- 权威身份仅来自 main 的 activation registry：`pluginName + pluginInstanceId + activationGeneration + key`，再绑定 main 签发的 opaque host handle 与 host generation。child 声明的 name、key、sdkapi、`verified` 或 generation 均不构成 authority。
- protocol 只接受 discriminated message union 与固定 capability ID；禁止任意 `chain: string[]` 反射调用 main 对象。
- 文件系统、SQLite、子进程、网络、剪贴板、搜索、storage、secret 及其他宿主能力必须走 typed capability；每次调用都在 main 校验当前 activation、输入 schema、permission 和 lifecycle state。
- child 不得直接 require Electron、文件系统、SQLite、child process、network 或 worker/runtime internals；纯计算模块和只读 platform snapshot 必须显式 allowlist。
- disable/reload/unload/uninstall/revoke/timeout/crash 会先失效 authority，再回收 main-owned resources，并等待 process 退出；迟到消息永不恢复资源或完成新 generation 的请求。
- crash diagnostics 只记录稳定 code、plugin name 和 generation；不得记录脚本正文、path、secret、key、opaque handle 或未脱敏 native error。

## Required Changes

### Dedicated Runtime

- 用 activation-scoped `PluginRuntimeHost` / manager 替代全局实验 bridge。
- `TouchPlugin.enable()` 在执行 Prelude 前完成 generation/key 签发，然后 fork、ready、load、awaited `onInit`；任一步失败都原子撤销 identity、终止 process 并置为稳定失败状态。
- `disable()` 与 error auto-disable 必须 cancel pending work、执行有界 teardown lifecycle、撤销 identity、释放 callback/subscription/storage/UI resources，并 await graceful shutdown / forced kill barrier。
- reload/restart 必须创建新的 activation generation、key、host handle 和 process；禁止复用旧 authority。

### Typed RPC

- 固定 protocol 覆盖 handshake、load、lifecycle、capability call/result、callback invoke/result、subscription dispose、cancel、shutdown、violation 和 crash。
- capability registry 显式声明 capability ID、request/result validator、permission、timeout、concurrency class 和 handler；未知 capability fail closed。
- 实现安全 wire codec：支持 JSON-like DTO、`undefined`、Error DTO、Buffer/typed arrays、callback handles、Abort/cancel tokens 和 disposable handles；拒绝 BigInt/Map/Set/class/function 等未声明值以及超深/超大/cyclic payload。
- callback、stream 和 disposer 只能通过 owner-bound resource ID 往返；activation teardown 统一释放。

### Official Plugin Migration

- 将所有同步依赖 main SDK 状态的调用迁移为 awaited typed capability；只读 manifest/platform 信息可在 load 时以冻结 snapshot 注入 child。
- 将 `fs`/`fs.promises`/`node:sqlite`、`child_process`/safe-shell、raw `fetch`/network 和 process mutable APIs 迁移到 permission-checked capability。
- 将 dictation/intelligence stream callback、channel registration 和 lifecycle `AbortSignal` 迁移到 typed callback/subscription/cancel protocol。
- 保留 `path`、纯 crypto、文本编码、timers 和明确 allowlisted pure modules为 child-local 能力；不得借此获得 host resource access。
- 更新所有官方 Prelude 生成产物/源码和测试；24/24 manifest validation 与逐插件 enable/trigger/disable smoke 必须通过。

### Limits

- 对 handshake/load/lifecycle/capability/callback 设置稳定 deadline；timeout 后 cancel，并在 grace period 后 kill activation process。
- 限制单消息/单结果字节数、结构深度、数组/对象成员数、并发 calls、pending callbacks/subscriptions、child heap 和 crash restart budget。
- 超限、malformed message、unknown capability、stale generation 和重复 request ID 都返回稳定错误；高风险 protocol violation 终止该 activation，不影响 main 或其他插件。

## Compatibility Contract

- 本任务是安全 hard cut，不保留 insecure compatibility profile。
- 跨进程后有返回值的 host SDK 为异步契约；官方插件必须迁移到 `await`，不得通过阻塞 main 或伪同步 RPC 维持旧语义。
- 插件不含 Prelude 时仍创建安全空 lifecycle，不执行 main VM。
- 不支持的新/旧 Prelude 以稳定 compatibility code 拒绝，并在 Electron constructor 或脚本执行前失败。

## Acceptance Criteria

- [ ] 真实插件加载路径默认且仅使用一 activation 一 `utilityProcess`；仓库不存在 `TUFF_PLUGIN_ISOLATION`、synthetic self-check 或生产 main VM fallback。
- [ ] Prelude 不能直接导入 Electron、main objects、fs/SQLite、child process、raw network 或 worker internals。
- [ ] protocol 无任意属性链 dispatch；所有 host access 使用固定 typed capability，并逐调用验证 authoritative activation、permission、schema 和 lifecycle。
- [ ] callback、subscription/disposer、Abort/cancel、timeout 与迟到 response 有覆盖测试和确定性资源回收。
- [ ] malformed/oversized/deep/cyclic message、unknown capability、duplicate ID、stale/cross-plugin/cross-generation请求 fail closed。
- [ ] child crash、hang、heap pressure或 crash loop 不终止/阻塞 main，也不影响其他插件；restart rotation 不接受旧消息。
- [ ] disable、reload、unload、uninstall、permission revoke 和 runtime error 会 await 对应 generation 的 termination/cleanup barrier。
- [ ] 所有官方插件移除 direct privileged Node access并通过隔离模式 enable/trigger/disable 回归；24/24 validation通过。
- [ ] CoreApp node/web typecheck、focused tests、production build、真实 Electron utilityProcess smoke、scoped lint 与 `git diff --check` 通过。
- [ ] 独立安全 review 未发现 P0/P1/P2 identity、permission、resource 或 fallback bypass。

## Out Of Scope

- OS 级容器、不同系统用户、seccomp/App Sandbox profile 等 utilityProcess 之外的强文件系统沙箱；本任务以禁止 direct privileged APIs 和 main-mediated capability 为边界。
- 第三方插件的自动源码重写；不满足新契约的插件稳定拒绝，由 migration guide 指导升级。
- 提交、发布或关闭 GitHub Issue；需要用户明确授权。

## Dependencies

- 复用 `#300` 的 activation registry、opaque host handle、host generation 和 `isAuthoritativePluginContext()`；不复制 key 校验。
- 复用 `#296/#299` 的 revoke teardown barrier、SQLite/Secret permission guard 和 resource owner，不在 child 内重新实现存储 authority。
- 保持 `#298` 的 secure view bridge 独立；Prelude host 不向 renderer 暴露 raw port、key 或 capability handle。

## External Blockers

- 无产品实现 blocker。
- `#213` 的 Ubuntu 复现资料与本任务无关，继续等待报告者。
