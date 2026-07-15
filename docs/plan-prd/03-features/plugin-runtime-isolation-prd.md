# 插件运行时隔离设计（C1-B / H2）

> 状态：设计讨论（不动代码）
> 关联安全发现：C1（插件 Prelude 主进程 RCE）、H2（插件 Surface 视图不安全默认）
> 前置已落地：C1-A（require 收紧，commit `3bd386741`）作为缓解；本设计为根治。

## 1. 目标与非目标

**目标**
- 根治 C1：即使插件 Prelude 通过 `vm` 逃逸（`constructor.constructor`），也**触不到主进程**——拿到的是隔离子进程的 `process`。
- 根治 H2：插件 Surface（renderer 视图）安全 profile 设为默认（`contextIsolation:true`），legacy compat 需显式声明 + 用户同意。
- 现有插件**尽量零改动**迁移（能力与生命周期契约不变）。

**非目标**
- 不改插件面向开发者的 SDK API 形状（`http`/`storage`/`clipboard`/`channel`/生命周期回调保持不变）。
- 不追求每插件独立进程的极致隔离（先做「插件宿主进程」，可后续按插件拆分）。

## 2. 现状与关键杠杆（调查结论）

四个事实让这次改动的工程量远小于「重写插件运行时」：

1. **SDK 已经是 transport（IPC）式的**。`getFeatureUtil()`（`plugin.ts:1800+`）返回的 `http`/`storage`/`clipboard`/`localization`/`screenshot`/`system`/`permission` 全部通过 `transport.invoke` / `pluginSdkTransport` 走 channel 到主进程——**不是主进程对象的直接引用**。移进子进程后，这些调用天然可以跨进程。
2. **生命周期返回值已支持异步**。`plugin.ts:816-824` 调用 `onFeatureTriggered` 后已有 `if (isPromiseLike(result)) result = await result`。跨进程把返回值变成 Promise **零成本接入**。
3. **`MessageChannelMain` 项目已在用**（intelligence / clipboard / ocr / omni-panel …）。消息桥有现成模式可复用。
4. **Prelude 可 bundle**（`bundlePluginPreludeFromContent`）。依赖内联后，子进程加载不需要复杂的 `node_modules` 解析。

## 3. 架构

```
┌─────────────── main process ───────────────┐        ┌──── plugin host (utilityProcess) ────┐
│ TouchPlugin                                 │        │  Prelude runtime                     │
│  ├─ pluginLifecycleProxy (main→plugin) ─────┼──MP1──▶│   vm.runInContext(preludeCode)       │
│  │    onFeatureTriggered/onInputChanged/... │◀─MP1───┤   returns IFeatureLifeCycle          │
│  ├─ transport (channel-core) ◀──────────────┼──MP2──▶│   getFeatureUtil() SDK stubs         │
│  │    http/storage/clipboard/...            │        │   (forward every call over MP2)      │
│  └─ permission gate (unchanged)             │        └──────────────────────────────────────┘
└─────────────────────────────────────────────┘        vm escape → only reaches THIS process
```

- **MP1（生命周期桥，main→plugin）**：主进程调用 `pluginLifecycleProxy.onFeatureTriggered(...)` → 序列化 → 子进程执行真实回调 → 回传结果（Promise）。`AbortSignal` 通过一个 abort 消息代理。
- **MP2（能力桥，plugin→main）**：子进程里的 SDK stub 把每次 `transport.invoke` 转成消息发回主进程的 channel-core（**权限校验、sender 校验仍在主进程执行**，插件跑在哪都一样受管）。
- 两条都用 `MessageChannelMain` 的 `MessagePort`，与项目现有用法一致。

## 4. 组件分解

| 组件 | 职责 | 备注 |
|---|---|---|
| `plugin-host-process.ts` | utilityProcess 入口：收 Prelude 代码 → `vm.runInContext` 跑 → 暴露生命周期 + 转发 SDK | 子进程侧 |
| `plugin-host-bridge.ts`（main） | 起 utilityProcess、建 MP1/MP2、序列化生命周期调用、把 SDK 请求接回 channel-core | 主进程侧 |
| `plugin-lifecycle-proxy.ts` | 实现 `IFeatureLifeCycle`，每个方法走 MP1；`onFeatureTriggered` 返回 Promise | 替换 `loadPluginFeatureContext` 的返回 |
| `plugin-sdk-shim.ts`（子进程） | `getFeatureUtil` 的 SDK 在子进程侧的 stub：调用转成 MP2 消息 | SDK 形状不变 |
| view 安全默认（H2） | `plugin-view-security-profile.ts` 把 `trusted-plugin-view` 设为地板；compat 需显式 + 同意 | 独立于进程隔离 |

## 5. 迁移路径（分阶段，每阶段可验证）

- **阶段 0（已完成）**：C1-A require 收紧（缓解）。
- **阶段 1**：搭 utilityProcess 宿主 + MP1/MP2 空壳，Prelude 仍在主进程；先验证「子进程能起、消息能通」。
- **阶段 2**：把 Prelude 执行搬进子进程（MP1 生命周期桥），SDK 暂时仍在主进程通过回调注入（过渡）。跑官方插件回归。
- **阶段 3**：SDK 走 MP2（子进程 stub → 主进程 channel）。此时 vm 逃逸已隔离。全插件功能回归 + 真机。
- **阶段 4（H2）**：视图安全 profile 默认化 + compat 开关 + 用户同意 UI。
- **阶段 5**：灰度 / feature flag（`TUFF_PLUGIN_ISOLATION`），默认关 → 官方插件验证 → 默认开。

## 6. 风险与权衡

- **同步生命周期回调**：`onInit`/`onInputChanged` 等是 `() => void`（fire-and-forget，跨进程简单）；`onFeatureTriggered` 返回值调用方已 `await`（见 §2.2）。**唯一要确认**：有无插件依赖回调的**同步副作用时序**（应无，回调本就异步触发）。
- **AbortSignal 代理**：`onFeatureTriggered(signal)` 的取消要通过 MP1 的 abort 消息透传到子进程。
- **性能**：utilityProcess 启动开销（首次触发插件时 ~几十 ms）+ 每次 SDK 调用一次 MP2 往返。缓解：进程预热（类似 DivisionBoxPool）、SDK 批处理。
- **进程模型**：先做**单一插件宿主进程**（所有插件共享一个 utilityProcess，进程内仍 `vm` 隔离各插件）；隔离强度不如「每插件一进程」，但资源省、够堵主进程逃逸。后续可按插件拆。
- **npm 依赖**：Prelude bundle 内联依赖 → 子进程不需 `node_modules` 解析；未 bundle 的走子进程的 require（同样受 C1-A 收紧管辖）。
- **破坏面**：依赖主进程 `vm` 特定行为、或不安全视图（nodeIntegration）的插件会受影响 → 需插件兼容清单 + 迁移期。

## 7. 测试计划

- 单元：MP1/MP2 序列化往返、生命周期返回值/异常/abort 透传、SDK stub 转发。
- 集成：每个官方插件（`plugins/*`）跑一遍 trigger / inputChanged / itemAction / storageChange，比对隔离前后行为。
- 安全回归：在子进程 Prelude 里跑 `constructor.constructor('return process')()` 断言拿到的是子进程、`require('child_process')` 仍被拒。
- 真机 + 性能：冷/热触发延迟、内存；`core:dev` 冒烟。

## 8. 任务分解

见任务系统 #12 的子任务（阶段 1–5 各一项 + H2 + 测试）。
