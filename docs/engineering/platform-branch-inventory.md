# 平台分支归类清单

> 2026-08-07 对 `apps/core-app/src/main` 的实测归类，服务于 [#349](https://github.com/talex-touch/tuff/issues/349)。
> 该 issue 明确要求「每一处受审分支都要归类；**不得使用只看数量的迁移目标**」，本文档因此按用途分类，而非按文件计数排序。

## 先纠正一个数字

`process.platform` 在 `src/main`（不含测试）共出现 **296** 次，但其中不是分支的占相当比例：

| 用途 | 次数 | 说明 |
|---|--:|---|
| 比较（`===` / `!==`） | **209** | 真正的分支 |
| `switch (process.platform)` | **2** | 真正的分支 |
| 作为数据传递（`platform: process.platform`） | **53** | 遥测/诊断字段，不是决策 |
| 模板字符串、日志、类型默认值 | 32 | 同样不是决策 |

**把 296 当作迁移目标会高估 41%。** 有 11 个文件的全部出现都属于数据传递，其中 `screenshot-service.ts` 一个就有 8 处——它们出现在「平台分支」统计里纯属统计口径问题，不该进任何迁移计划。

## 分类

### A. 原生/后端边界 —— 保持显式

平台切换发生在能力本身只存在于某个系统的地方。验收条 3 要求这类**保持显式并留档**。

- `modules/box-tool/addon/files/everything-provider.ts`（32）：Everything 是 Windows 独有产品，全部分支为 `=== 'win32'`，其余平台返回 `unsupported`。
- `modules/box-tool/addon/apps/{darwin,win,linux}.ts`：按平台拆分的应用扫描后端。
- `modules/native-capabilities/*`：原生 addon 的可用性判定。

**但其中混有可去除的重复**：`everything-provider.ts:325-330` 连续六行各自重新求值 `process.platform === 'win32'` 来拼一个状态对象。那是**一个**决策被写了六遍，属 D 类，不是六处边界。

### B. 策略/能力决策 —— 应归入具名 adapter

同一个三路判断在多处重复，且需要类型化结果。这是验收条 2 的目标。

- `modules/system/platform-permission-service.ts`（25）：darwin/win32/linux 三路权限判定，是**最典型的候选**。
- `modules/system/desktop-shortcut.ts`（4）、`modules/quick-ops/quick-ops-system-service.ts`（5）、`modules/clipboard/clipboard-autopaste-automation.ts`（5）：同型的三路能力判定。

### C. adapter 层自身 —— 位置正确

- `modules/platform/capability-adapter.ts`（22）：它**就是** adapter，分支写在这里是对的。注意它用的是裸 `process.platform` 而非 `withOSAdapter`。

### D. 偶发重复 —— 一个决策被写多遍

不是策略问题，是同一个布尔值没有提取。

- `everything-provider.ts:325-330`（6 处 → 1 个 `isWindows` 常量）
- `modules/box-tool/addon/apps/app-provider.ts`：已有 `private readonly isMac`（440 行，好写法），但 1469 / 1586 行仍重复 `!this.isMac && process.platform !== 'win32'`。

### E. 数据传递 —— 不是分支

上表 53 处。`plugin-module.ts` 的 14 处**全部**属于此类，它在「平台分支」排行里位列第六完全是误读。

## ⚠️ 结论：`withOSAdapter` 目前还不是合格的迁移目标

验收条 4 要求「平台能力结果暴露 supported/degraded/unsupported 以及稳定的 reason/recovery」。现有实现（`packages/utils/electron/env-tool.ts:79`）是：

```ts
export function withOSAdapter<R, T>(options: OSAdapter<R, T>): T | undefined {
  switch (process.platform) {
    case 'win32': return options.win32?.(arg)
    case 'darwin': return options.darwin?.(arg)
    case 'linux': return options.linux?.(arg)
    default: ...
  }
}
```

返回 `T | undefined`，**既没有类型化的三态结果，也没有 reason/recovery 码**。把 B 类分支搬进去，只会把 `if/else` 换成回调形式，得不到验收条 4 要的东西——`undefined` 无法区分「不支持」与「支持但本次没结果」。

**所以次序必须是：先给 `withOSAdapter`（或其继任者）补上类型化结果契约，再迁移 B 类。** 反过来做等于要迁两次。

## 当前采用情况

`withOSAdapter` 已在 5 个文件使用：`core/startup-version-guard.ts`、`modules/box-tool/addon/apps/app-launch-adapter.ts`、`modules/box-tool/addon/apps/app-scanner.ts`、`modules/system/active-app.ts`、`modules/system/wallpaper-adapter.ts`。
