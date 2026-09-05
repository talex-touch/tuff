# Design — 恢复渲染层的窗口类型判定

## 结论先行

不新增全局暴露面。preload 已有一条**同步**通道 `window.api.getStartupContextSnapshot()`，
其数据源正是 `parseWindowArgs(process.argv)`；缺的只是 `StartupContext` 没把解析出的
`WindowRole` 带过来。把它补上，再让 `useArgMapper` 从这条通道取值即可。

## 现状与可复用资产

```
preload（隔离世界，有 process）
  resolvePreloadStartupContext()            index.ts:75-90
    ├─ parseWindowArgs(process.argv) → WindowRole   ← 正确结果，此处产生
    └─ 只把 windowMode / metaOverlay 放进 StartupContext，touchType 等被丢弃
  startupContextSnapshot = resolvePreloadStartupContext(null)   :93  ← 同步求值
  api.getStartupContextSnapshot() → StartupContext              :133 ← 同步返回
  contextBridge.exposeInMainWorld('api', api)                   :208

渲染层（主世界，无 process）
  useArgMapper((globalThis as any)?.process?.argv ?? [])   arg-mapper.ts:49
    → 恒为 []，解析出 {}，写入 window.$argMapper 并被 :50 的短路永久锁定
```

`StartupContext`（`packages/utils/preload/loading.ts:16-20`）当前是：

```ts
interface StartupContext {
  startupInfo: StartupInfo | null
  windowMode: RendererWindowMode
  metaOverlay: boolean
}
```

`WindowRole`（`packages/utils/renderer/window-role.ts:14-20`）已有完整形状，
`touchType` / `coreType` / `assistantType` / `screenshotType` / `metaOverlay` 齐备。

## 改动契约

### 1. `StartupContext` 携带 `WindowRole`

```ts
interface StartupContext {
  startupInfo: StartupInfo | null
  windowMode: RendererWindowMode
  metaOverlay: boolean
  role: WindowRole          // 新增：parseWindowArgs 的原始结果
}
```

`resolvePreloadStartupContext` 已经持有 `role` 局部变量，直接放进返回值即可。

**暴露面约束（R2）**：只放结构化的 `WindowRole`，不透传 `process.argv` 原文。
`WindowRole` 的每个字段都经过 `isKnownTouchType` 等白名单校验，未知值被丢成 `undefined`，
不携带路径、用户数据或任意字符串。

### 2. `useArgMapper` 换源，并停止缓存空结果

```ts
export function useArgMapper(args?: string[]): IArgMapperOptions {
  const cached = window.$argMapper
  if (cached && Object.keys(cached).length > 0)   // 空结果不再算命中
    return cached

  // 优先：preload 经 contextBridge 同步提供的窗口角色
  const role = window.api?.getStartupContextSnapshot?.()?.role
  if (role) return window.$argMapper = roleToArgMapper(role)

  // 回退：显式传入的 argv，或仍有 process 的环境（preload 自身、测试）
  const resolved = args ?? (globalThis as any)?.process?.argv ?? []
  const mapper = parseArgs(resolved)
  return Object.keys(mapper).length > 0 ? (window.$argMapper = mapper) : mapper
}
```

三条契约：

- **空结果不写缓存。** 当前 `{}` 被写入后，`:50` 的真值短路让后续调用永远拿不到重试机会——
  这是"数据源缺失"升级成"永久错误"的关键一步。
- **preload 通道优先于 `process.argv`。** preload 自身调用时（`index.ts:786`）两条路都通，
  行为不变；渲染层只有前者可用。
- **保留 argv 路径。** preload 与既有单测依赖它，不能删。

### 3. 调用点不变

`useTouchType` / `isMainWindow` / `isCoreBox` 的实现与签名都不动——它们只是 `useArgMapper` 的薄封装，
换源后自动恢复。这是选择改 `useArgMapper` 而非逐个改调用点的原因：
受影响的 6 处调用点（`App.vue:14`、`main.ts:82`、`notification-hub.ts:22,30`、
`useAppLifecycle.ts:56`、`dialog-manager.ts:69,221`、`performance.ts:180`、`useUpdateRuntime.ts:131`）
无需改动即可一并修复。

## 时序：为什么同步这一点是硬要求

`App.vue:14` 与 `main.ts:82` 在 setup 期同步读 `isCoreBox()`，没有等待异步结果的结构。
`getStartupContextSnapshot()` 在 preload 加载时即已求值（`index.ts:93`），
preload 先于渲染层脚本执行，因此渲染层首次调用时快照必然就绪。

这正是不走 `requestStartupInfo()` 异步通道的原因（PRD D2）：那条路会引入
"窗口类型暂时为 undefined"的中间态，而这些调用点无法表达等待。

## 兼容性

- **纯增量。** `StartupContext` 新增可选字段；`useArgMapper` 签名不变，`args` 参数继续生效。
- **preload 侧行为不变**：它有 `process`，两条路径结果一致。
- **安全基线不动**：`SECURITY_BASE` 与 `window-security-profile.contract.test.ts` 均不涉及。
- **不影响插件视图**：`preload/plugin-view.ts` 有独立的 bootstrap 通道，不共用本路径。

## 权衡

**为何不在 preload 里直接写 `window.$argMapper`？**
preload 运行在隔离世界，其 `window` 不是渲染层主世界的 `window`——正是当前 bug 的成因之一。
写入不会跨世界可见。必须走 contextBridge。

**为何不放宽 `sandbox` 让渲染层拿到 `process`？**
`window-security-profile.ts:24-31` 是全窗口统一的安全基线且有契约测试锁定（#792）。
为一个身份判定降级整个渲染层的隔离，代价与收益完全不成比例。

**为何不给 `isMainWindow()` 单独打补丁？**
`isCoreBox()` / `useTouchType()` 共用同一失效缓存，单修一个会留下同类静默失效（PRD R4）。

## 回滚

改动集中在 3 个文件（`loading.ts` 类型、`preload/index.ts` 一行、`arg-mapper.ts` 取值逻辑），
互不依赖，`git revert` 单个提交即可完整回滚。分类逻辑为纯函数，无持久化状态需要清理。
