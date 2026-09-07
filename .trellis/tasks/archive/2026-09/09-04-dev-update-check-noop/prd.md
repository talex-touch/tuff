# dev 下检查更新按钮静默失效

> 父任务：[09-04-dev-update-flow-untestable](../09-04-dev-update-flow-untestable/prd.md)

## Goal

让渲染层能正确识别自己所在的窗口类型，从而恢复"检查更新"按钮与更新提示。

标题写的是 dev，但查实后影响范围更大：**生产环境同样失效**。见下方"影响范围纠正"。

## Background

### 现象

在更新设置页点击「检查更新」，按钮可用、点击事件正常派发，但没有任何网络请求，日志无更新检查记录，UI 状态始终停在"空闲"。

### 调用链

```
handleManualCheck()                       SettingUpdate.vue:530
  └─ checkApplicationUpgrade(true)        useUpdateRuntime.ts:409
       └─ if (!canShowUpdatePrompt()) return undefined      :410-412   ← 在此静默返回
            └─ isMainWindow()             :131
                 └─ useTouchType() === 'main'
                      └─ useArgMapper().touchType
```

### 根因

`useArgMapper` 的数据源是 `process.argv`，缓存写在 `window.$argMapper`
（`packages/utils/renderer/hooks/arg-mapper.ts:49-51, 91`）：

```ts
export function useArgMapper(args: string[] = (globalThis as any)?.process?.argv ?? []) {
  if (window.$argMapper)
    return window.$argMapper        // {} 为真值，空结果被永久缓存
  // …解析 args…
  return window.$argMapper = mapper
}
```

两个问题叠加：

1. **数据源在渲染层不存在。** `window-security-profile.ts:24-31` 对所有窗口强制
   `contextIsolation: true` / `sandbox: true` / `nodeIntegration: false`，且
   `window-security-profile.contract.test.ts` 锁定每个 profile 必须等于 `SECURITY_BASE`。
   渲染层主世界因此没有 `process`，默认参数恒为 `[]`，解析结果恒为 `{}`。
2. **空结果被当作有效缓存。** `{}` 是真值，第 50 行的短路使后续调用永远拿不到重新解析的机会。

全仓库除 `arg-mapper.ts:91` 自身外，没有任何位置给 `window.$argMapper` 赋值
（`grep -rn '\$argMapper'` 仅命中该文件与 `env.d.ts` 的类型声明）。

### 影响范围纠正

原始记录（`09-04-ota-fallback-net-error-classification` 的 F1）推断此问题仅影响 dev。**该推断错误。**
成因与 `app.isPackaged` 无关，纯粹是渲染层拿不到 `process.argv`，生产环境同样成立。

`preload/index.ts:786` 也调用 `isMainWindow()`，但 preload 运行在隔离世界、**有** `process`，
其 `window` 亦非主世界的 `window`。因此两个世界各持一份 `$argMapper`：preload 侧正确，渲染层侧为 `{}`。

### 用户可见后果：整条更新提示链路失效（定为 P0 的依据）

同一个闸门挡住了两条路径，而不只是手动按钮：

```
手动：  handleManualCheck → checkApplicationUpgrade → canShowUpdatePrompt()  :410  ← 拦截
自动：  主进程轮询发现新版本 → 推事件 → setupUpdateListener :657
             → presentUpdateDialog → canShowUpdatePrompt()  :351             ← 同样拦截
```

主进程的自动检查本身不受影响（`UpdateService.runStartupBackgroundTasks`），但它发现新版本后要靠渲染层
弹窗告知用户，而该弹窗被拦掉。**结果是用户既不能手动检查，也永远收不到更新提示**，
只会静默停留在旧版本。对一个依赖 OTA 分发的产品，这是 P0。

> 待确认：线上是否已有对应的遥测或用户反馈可佐证（父任务 QP1）。本任务不因该确认结果推迟开工。

## Decisions

- **D1** 优先级定为 **P0**，依据见上方"用户可见后果"。
- **D2** 窗口身份通过**扩展 preload 的 contextBridge 暴露**传给渲染层，不走 startup-info 通道。
  理由：preload 已在 `preload/index.ts:76` 用 `parseWindowArgs(process.argv)` 拿到正确结果，
  contextBridge 是同步的，首次 `isMainWindow()` 调用即可取到；startup-info 是异步的，
  可能晚于首次调用，会引入"窗口类型暂时为空"的中间态，而调用方（如 `App.vue:14` 在 setup 期）
  没有等待该异步结果的结构。代价是新增一个暴露面，须保持最小（只暴露窗口角色，不透传原始 argv）。

### 实测证据

CDP 连入运行中的 dev App，两个窗口（主窗口与 CoreBox）求值 `window.$argMapper`，结果均为 `{}`。
注入 `window.$argMapper = { touchType: 'main' }` 后，同一个「检查更新」按钮立即正常工作，
日志出现完整的检查与回退记录。

### 同源受影响的其它调用点

`isCoreBox()` / `useTouchType()` 与 `isMainWindow()` 共用这份失效缓存，在渲染层同样恒为 false：

| 位置 | 用途 | 恒 false 的后果（待确认） |
|---|---|---|
| `App.vue:14`、`main.ts:82` | `isLightweightWindow` 判定 | CoreBox 未走轻量路径 |
| `notification/notification-hub.ts:22,30` | CoreBox 通知呈现方式 | CoreBox 按主窗口规则呈现 |
| `hooks/useAppLifecycle.ts:56` | CoreBox 生命周期分支 | 待确认 |
| `mention/dialog-manager.ts:69,221` | CoreBox 对话框分支 | 待确认 |
| `telemetry/performance.ts:180` | `windowType` 标签 | 所有窗口都被标为 `main`，遥测失真 |

这些后果尚**未逐一验证**，仅由"该函数恒为 false"推得。CoreBox 功能表面上正常，说明部分分支的
退化是静默的。

## Requirements

- **R1** 渲染层的 `useTouchType()` / `isMainWindow()` / `isCoreBox()` 必须返回真实的窗口类型。
- **R2** 不得为此放宽窗口安全基线。`contextIsolation` / `sandbox` / `nodeIntegration` 保持
  `SECURITY_BASE` 不变——窗口身份通过 contextBridge 暴露传递（D2），preload 已经持有正确的解析结果
  （`preload/index.ts:76` `parseWindowArgs(process.argv)`）。新增暴露面须最小：只暴露窗口角色，
  不透传原始 `process.argv`。
- **R3** 缓存不得再把"解析失败/为空"当作有效结果长期保留；空结果要么不写入缓存，要么可被后续修正。
- **R4** 修复需覆盖 R1 列出的三个函数，而非只让 `isMainWindow()` 可用——它们共用同一失效路径。
  受影响的下游调用点（见上表）若本次不逐一验证，须在验收里写明残留风险。

## Acceptance Criteria

已实现并验证，提交 `2087770e3`（分支 `worktree-fix-window-role-p0`，基于 `origin/master`）。

- [x] **AC1** 单测：无 `process` 环境下 `useArgMapper` 不把空结果写入缓存，且能从桥接解析出窗口类型。
- [x] **AC2** 单测：`isMainWindow()` 在主窗口 `true` / CoreBox `false`；`isCoreBox()` 反之。
- [x] **AC3** 运行时（CDP，**无任何注入**）：主窗口 `touchType: 'main'`、CoreBox `touchType: 'core-box'`，
  且 `window.$argMapper` 由渲染层自行从桥接填充。修复前两者均为 `{}`。
- [x] **AC4** 运行时（无注入）：点击「检查更新」后日志出现
  `[UpdateService] Update check fetched source=Nexus Releases channel=BETA hasUpdate=true tag=v2.4.14-beta.22`。
  修复前该操作完全静默。
  > 本次官方源可用，故未触发 GitHub 回退分支；回退路径本身已在
  > `09-04-ota-fallback-net-error-classification` 独立验证。
- [x] **AC5** 运行时：检查发现新版本后主窗口出现可见弹窗（`visibleDialogs: 3`、页面提及新版本），
  即 `presentUpdateDialog` 在 `:351` 被拦的那条路径已通。
- [x] **AC6** `window-security-profile.contract.test.ts` 等 36 条通过；
  跨桥接的只有校验过的 `WindowRole`，不含原始 `process.argv`。
- [x] **AC7** 回归：`packages/utils` 1465 条全绿；`typecheck:node` 与 `vue-tsc` 在 `src/` 下 0 错误；
  两个包按包内 eslint 配置 lint 干净。

### 实施期的三处调整

1. **`StartupContext.role` 定为必填**而非可选，让类型保证 preload 不会漏填。
   代价是 `useStartupInfo.test.ts` 的 `createStartupContext` 需补一行——已改。
2. **`role.metaOverlay` 存合成值**（含 hash 判定）而非 argv 原值，避免渲染层对同一问题拿到两个答案。
3. **保留 argv 回退分支**：preload 自身调用 `useArgMapper` 时 `window.api` 并不存在
   （那是暴露给主世界的），只走桥接会改坏 preload 侧现在正确的行为。

### 守卫有效性证明

新增 8 条用例中有 **5 条在修复前失败**（桥接读取与空缓存两组），3 条 argv 回退用例本就通过。
在改动前后各跑一次确认，而非只验证修复后为绿。

## Out of Scope

- 上表中 `isCoreBox()` 恒 false 导致的各下游行为的逐一修复与验证。本任务只保证该函数返回正确值；
  若修复后暴露出此前被掩盖的分支问题，另行开单。
- F2（下载路径策略），见兄弟任务 `09-04-dev-update-download-root-mismatch`。
