# 插件 Prelude 隔离运行时迁移指南

本指南适用于在 CoreApp 隔离插件运行时中执行的 Prelude。现在每次 activation 都独占一个
Electron utility process，不再存在主进程 VM 或 legacy bridge fallback。

## 必须完成的迁移

1. 将 Prelude 构建到 `manifest.main` 或 `manifest.build.index.entry` 声明的规范产物。
2. 移除 Electron、文件系统、SQLite、`child_process`、`worker_threads`、native addon、
   可变 `process` 和 raw network client 的直接导入。
3. 在 manifest 中声明全部 required/optional permission。
4. 只使用当前 activation 固定 capability ID 投影出的 facade 方法。
5. await 每一次宿主操作和生命周期清理。

不兼容、缺失或 stale 的产物会以稳定错误拒绝 activation，CoreApp 不会退回主进程执行。

## 异步宿主调用

跨进程后的宿主操作全部是异步契约。

```js
// 错误：假设宿主 mutation 同步完成。
plugin.feature.clearItems()
plugin.feature.pushItems(items)

// 正确：显式保留 mutation 顺序。
await plugin.feature.clearItems()
await plugin.feature.pushItems(items)
```

storage、clipboard、HTTP、open URL、feature registry/items、process/system action、Voice、
Intelligence 和 teardown 都遵循同一规则。

## Capability 与 Permission 边界

宿主调用只有同时满足以下条件才会被接纳：

- activation manifest 中存在固定 capability ID；
- plugin manifest 声明了对应 permission；
- permission 当前已授权；
- plugin activation、host generation 和 lifecycle state 仍为当前状态；
- request 通过精确且有界的 DTO validator。

child 不能提供 caller identity、activation key、host generation、文件路径、SQL、可执行文件路径、
credential、provider endpoint 或其他宿主 authority。需要使用宿主资源时，应使用 opaque token 和
用途固定的 facade。

## 数据契约

wire 只接受有界的 JSON-like DTO。特殊值仅限运行时显式定义的 undefined、error、typed array、
callback、cancel 和 resource handle。禁止传递 class instance、未声明位置的函数、accessor、cycle、
`BigInt`、`Map`、`Set`、native handle、宿主路径或 secret。

插件可见结果都是脱离宿主原型的 child-realm value，不得依赖对象 identity 或 host prototype。

## 取消与资源生命周期

lifecycle work 必须观察 request-scoped `AbortSignal`。长生命周期 callback、stream 和 disposer
必须使用 owner-bound resource。

```js
const stream = await plugin.voice.startDictation({ onEvent })
try {
  await waitForCompletion(stream)
} finally {
  await stream.cancel()
}
```

cancel/dispose 必须幂等。disable、reload、permission revoke、crash 或 generation rotation 后，
迟到 callback/result 会被拒绝。不要用 `void` 脱离宿主工作；应在 lifecycle authority 有效期间
await 完整操作。

## Child 本地安全能力

运行时只暴露不可变的 platform/locale/manifest snapshot、timer、文本编码、有界 crypto helper、
logger 和显式 capability facade。不会暴露 `require`、`process`、`Buffer`、Electron、raw IPC、
filesystem、SQLite、process 或 network global。

## 验证

发布迁移后的插件前运行：

```bash
pnpm plugins:validate
```

插件本地测试应覆盖 enable、feature/action trigger、cancel、permission deny/revoke、disable 和第二代
activation。官方插件变更还必须通过 CoreApp production build 与 Electron isolation smoke。
