# Design — 统一 app root 的单一来源

## 问题的准确形状

不是"求值太早"，而是**同一概念依赖了一个会被改写的可变状态**：

```
app.getPath('userData')          ← 可变，polyfills.ts:10-15 在 dev 下改写它
  ├─ precore.ts:172   innerRootPath = getRootPath()        求值早 → 改写前的值
  └─ download-target-policy.ts:36-44  resolveRuntimeRootPath(app)   求值晚 → 改写后的值
```

两处调用的是**同一个函数** `resolveRuntimeRootPath(app)`（`app-root-path.ts:20-27`），
只是它读的 `app.getPath('userData')` 在两次调用之间变了。任何"谁先谁后"的修法都只是把
当前顺序钉住，而顺序依赖依然隐式存在（PRD D1）。

## 约束：不能纯惰性化

`innerRootPath` 的消费方里，只有 `precore.ts` 自身在模块加载期就需要它：

| 消费方 | 时机 | 可惰性化 |
|---|---|---|
| `precore.ts:173` `checkDirWithCreate(innerRootPath)` | 模块加载 | ✗ 日志目录必须在 log4js 配置前就绪 |
| `precore.ts:175` `logs = path.join(innerRootPath, 'logs')` | 模块加载 | ✗ 同上 |
| `touch-app.ts:45` `readonly rootPath = innerRootPath` | 类实例化 | ✓ |
| `index.ts:279-280` databasePath / legacyRoot | 函数内 | ✓ |
| `privacy-module.ts` | 参数传入 | ✓ |
| `provider-credential-runtime.ts:150` | 动态 import | ✓ |

所以方案不能是"把所有人改成晚点求值"，而应是**让求值时机不再影响结果**。

## 最终方案（已实施，`1267e87bc`）

下面两版方案都被实施期的发现推翻了，保留在后面作对照。真正的修法是**记忆化**。

### 推翻它们的发现

`precore.ts:170` 有一个**刻意**的 userData 覆盖，就紧挨在 `:172` 求值 root 之前：

```ts
applyStartupBenchmarkUserDataOverride()   // :170  读 TUFF_STARTUP_BENCHMARK_USER_DATA_DIR
export const innerRootPath = getRootPath() // :172  紧接着求值——这个顺序是有意的
```

启动性能基准测试靠它拿到隔离的数据根。所以：

- **原案**（与 polyfills 共享 dev userData 规则）会把 root 变成 `tuff-dev/tuff-dev` 并需要数据迁移；
- **第一版修订**（从 `appData` + `app.getName()` 推导）会**忽略基准覆盖，破坏基准测试隔离**。

两者都错在同一点：试图重新定义 root 从哪来，而 precore 的捕获点**本来就是对的**——
它在刻意覆盖之后、在 polyfills 那个无关覆盖之前。

### 真正的缺陷与修法

缺陷只是 `getAllowedDownloadRoots()` 事后**重新求了一次**，而没有复用已捕获的值。

```ts
let memoizedRootPath: string | null = null

export function resolveRuntimeRootPath(appLike, fallbackBasePath = process.cwd()): string {
  if (memoizedRootPath !== null) return memoizedRootPath
  const userDataPath = safeGetUserDataPath(appLike, fallbackBasePath)
  const folderName = appLike.isPackaged ? APP_FOLDER_NAME : DEV_APP_FOLDER_NAME
  memoizedRootPath = path.join(userDataPath, folderName)
  return memoizedRootPath
}

export function resetRuntimeRootPathForTests(): void { memoizedRootPath = null }
```

首次求值即权威，其余调用方无需知道任何顺序。基准覆盖仍然生效（它先于首次求值），
polyfills 的 Chromium profile 覆盖不再影响 app root（它晚于首次求值）。取值与今天一致，无需迁移。

### 顺带修掉的同类缺陷

`database/index.ts:1323` 在迁移失败对话框里手写 `${userData}/tuff/logs/`。
dev 下该路径不存在——数据库不可用时用户看到的唯一提示指向了错误位置。改为
`path.join(resolveRuntimeRootPath(app), 'logs')`。这是新增的静态检查扫出来的。

### AC7 的静态检查

`check:app-root-single-source` 只在"读 userData **且**拼接 app-root 文件夹名"时告警。
初版对所有 `getPath('userData')` 告警，扫出 18 处——其中多数（壁纸、临时文件、hosts 备份）
是把数据直接放在 userData 下的合法用途，与重建 root 无关。收窄后精确命中 1 处真实违规。

`--self-test` 覆盖三种情形：合成违规必须被抓、owner 必须豁免、无关的 userData 读取不得误报。

---

## 已被推翻的方案（保留作对照）

### 第一版修订：从 appData + app.getName() 推导

> 下方原案「与 polyfills 共享 dev userData 规则」会把 dev app root 变成
> `@talex-touch/tuff-dev/tuff-dev`，既难看又要迁移现有 dev 数据。实施 F1 时把路径来源查清了，
> 有更好的解法。

**实测确认的三个路径**：

| 路径 | 取值 | 磁盘 |
|---|---|---|
| 生产 app root | `<Electron 默认 userData>/tuff` = `@talex-touch/core-app/tuff` | 存在 |
| dev app root（改写前，即今天的值） | `@talex-touch/core-app/tuff-dev` | 存在 |
| dev Chromium userData（polyfills 改写后） | `@talex-touch/tuff-dev` | 存在 |

`polyfills.ts:7` 的 `'../../../../package.json'` 经实测解析到**根** package.json
（`name = @talex-touch/tuff`），所以它把 Chromium userData 改成 `@talex-touch/tuff-dev`；
而 app root 用的是 Electron 默认 userData（`join(appData, app.getName())`，
`app.getName()` = `@talex-touch/core-app`）。已 grep 确认无人调用 `app.setName`
（`precore.ts:182` 的 `productName: 'TalexTouch'` 是 crashReporter 配置，与 app name 无关）。

**关键认识**：这两者本就是不同的东西——Chromium 的 profile 目录 vs 我们自己的数据根。
polyfills 改写前者是有意的（dev profile 隔离）；bug 在于后者**意外地**依赖了前者这个可变状态。

**修法**：让 app root 只依赖不可变输入，不再读被改写的 `app.getPath('userData')`：

```ts
/** Electron 默认 userData，不受后续 app.setPath('userData', …) 影响。 */
function resolveDefaultUserData(app: AppPathLike): string {
  return path.join(app.getPath('appData'), app.getName())
}

export function resolveRuntimeRootPath(app: AppPathLike): string {
  const folder = app.isPackaged ? APP_FOLDER_NAME : DEV_APP_FOLDER_NAME
  return path.join(resolveDefaultUserData(app), folder)
}
```

优点：

- **取值与今天完全一致**（dev 与生产都是），因此**无需数据迁移**。原设计里"dev 数据目录会换位置"
  的兼容性风险随之消失，implement.md 步骤 6 的相关提示与 PRD 的对应 Out of Scope 项都可以去掉。
- 求值时机不再影响结果——`appData` 与 `app.getName()` 都不被改写。
- `polyfills.ts` 保持原样，无需与 root 解析共享规则；两者职责反而更清楚。

前置确认：`AppPathLike` 需要能提供 `getName()`（当前类型可能只有 `getPath` / `isPackaged`，需扩展）。

记忆化与 AC7 的静态检查仍按下方原案执行——它们针对的是"不得再出现第二处独立求值"，与本修订不冲突。

---

## 原案（保留作对照，已被上方修订取代）

### 一个模块同时拥有 userData 覆盖与 root 解析，并记忆化

把"dev 下 userData 该是什么"这条规则，从 `polyfills.ts` 的副作用里，
移进 root 解析自身，使其成为**纯推导**而非对可变状态的读取：

```ts
// app-root-path.ts
let memoized: string | null = null

/** dev 下 userData 的规范位置。与 polyfills 的覆盖规则同源，不再各写一份。 */
function resolveUserDataPath(app: AppPathLike): string {
  if (app.isPackaged) return app.getPath('userData')
  return path.join(app.getPath('appData'), `${DEV_USER_DATA_NAME}`)
}

export function resolveRuntimeRootPath(app: AppPathLike): string {
  if (memoized) return memoized
  const folderName = app.isPackaged ? APP_FOLDER_NAME : DEV_APP_FOLDER_NAME
  return (memoized = path.join(resolveUserDataPath(app), folderName))
}
```

要点：

- **不再读可变的 `app.getPath('userData')`**（dev 分支下），而是按与 `polyfills.ts` 相同的规则推导。
  无论调用早晚，结果一致。
- **记忆化**是第二道保险，也让"只有一个可观测取值"（PRD R4）成为结构性事实而非约定。
- `polyfills.ts` 的 `app.setPath('userData', …)` 保留——Chromium 数据仍需落在那里；
  但它改为调用同一个 `resolveUserDataPath`，两处规则不再各自硬编码。

## 消除重复的规则定义

当前 dev userData 路径的规则写在 `polyfills.ts:11`：

```ts
path.join(app.getPath('appData'), `${packageJson.name}-dev`)
```

而 `app-root-path.ts` 完全不知道这条规则的存在——这正是两者能给出不同答案的根本原因。
改动后规则只有一处，`polyfills.ts` 从 `app-root-path.ts` 引入。

> 注意 `packageJson.name` 的取值歧义：实测磁盘上同时存在
> `@talex-touch/core-app/tuff-dev`（日志与配置）与 `@talex-touch/tuff-dev`（Chromium 数据），
> 说明两处读到的 `packageJson` 并不相同（polyfills 与 version-util 的相对路径深度不同）。
> 统一来源时必须**显式选定**用哪个包名，并在注释里写明，否则会再次分裂。

## 防回归：让根因不可复现（AC7）

单靠单测只能证明当前这一例修好了。补一条结构性检查：

- 静态检查：`app.getPath('userData')` 在 `src/main` 内不得出现在 `app-root-path.ts` 之外
  （比照仓库既有的 `check:search-index-writers` / `check:permission-api-mappings` 模式，
  这类脚本都带 `--self-test`）。
- 单测：模拟"求值后 `userData` 被改写"，断言前后两次 `resolveRuntimeRootPath` 返回同一值。

第二条直接对应 AC1，第一条对应 AC7 —— 没有它，下次有人新增一处独立求值不会有任何东西失败。

## 兼容性与迁移

- **生产环境取值不变**：`isPackaged` 为真时走 `app.getPath('userData')` 原路径，
  `polyfills.ts` 的 dev 分支本就不执行。
- **dev 环境取值会变**：`innerRootPath` 将从 `…/@talex-touch/core-app/tuff-dev`
  改为与 Chromium 数据一致的位置。这意味着**已有的 dev 日志、配置、数据库会"看起来消失"**
  （实际是换了目录）。属预期行为，但必须在 PR 描述里写明，让其他开发者知道
  首次运行会像全新环境；旧目录的迁移或清理不在本任务范围（PRD Out of Scope）。
- 无 IPC 协议变更、无 schema 变更。

## 权衡

**为何不让 `polyfills` 先于 `precore` 执行？**
改动最小，但顺序依赖仍是隐式的：没有任何测试会在有人调整 `main/index.ts` 导入顺序时失败，
下次复现时症状（下载被拒）与成因（导入顺序）依然隔着三层。PRD D1 已否决。

**为何不把观测到的第二个路径加进允许列表？**
`getAllowedDownloadRoots` 会随环境漂移，且掩盖了"两处求值不一致"这个真问题（PRD R2）。
下载策略的安全意图（#905，堵任意文件写入）也会因允许根集合无原则扩大而被稀释（R3）。

## 回滚

改动集中在 `app-root-path.ts`（解析逻辑 + 记忆化）与 `polyfills.ts`（改为复用规则），
外加一个检查脚本。`git revert` 单个提交即可回滚。

唯一有状态的副作用是 dev 数据目录位置变化——回滚后会切回旧目录，此前在新目录产生的
dev 数据不会自动迁回。dev 环境数据可重建，不构成阻塞。
