# dev 下更新下载被 destination-outside-roots 拒绝

> 父任务：[09-04-dev-update-flow-untestable](../09-04-dev-update-flow-untestable/prd.md)

## Goal

让更新包下载在开发环境不再被路径策略误拒，从而使下载与验签两段可以在本机验证。

## Background

### 现象

dev 模式下，更新检查成功拿到候选版本后点击「下载更新」，下载立即失败：

```
[WARN]  [DownloadCenter] Rejected download task target reason=destination-outside-roots module=app_update
[ERROR] [UpdateSystem]   Failed to download update tag=v2.4.14-beta.19 error=Error: Download target rejected: destination-outside-roots
[ERROR] [UpdateService]  Failed to download update error=Error: Download target rejected: destination-outside-roots
```

### 根因：两套 app root 定义不一致

写入方与校验方算出的根目录不同：

| 角色 | 取值方式 | 实测值 | 存在 |
|---|---|---|---|
| 写入（更新系统） | `ctx.app.rootPath`，即 `precore.ts:172` 的 `innerRootPath`；`update-system.ts:1165` 拼 `modules/update-packages` | `…/@talex-touch/core-app/tuff-dev/modules/update-packages` | 是 |
| 校验（下载策略） | `getAllowedDownloadRoots()` 调用 `resolveRuntimeRootPath(app)`（`download-target-policy.ts:36-44`） | `…/@talex-touch/tuff-dev/tuff-dev` | **否** |

两者用的是同一个函数 `resolveRuntimeRootPath(app)`
（`app-root-path.ts:20-27`，返回 `path.join(app.getPath('userData'), isPackaged ? 'tuff' : 'tuff-dev')`），
但**求值时机不同**，而 `userData` 在两次求值之间被改写了：

```ts
// polyfills.ts:10-15 —— 模块顶层执行
if (!app.isPackaged) {
  const devUserDataPath = path.join(app.getPath('appData'), `${packageJson.name}-dev`)
  if (app.getPath('userData') !== devUserDataPath) {
    app.setPath('userData', devUserDataPath)     // ← userData 在此被改写
  }
}

// precore.ts:172 —— 同样是模块顶层，先于上面执行
export const innerRootPath = getRootPath()       // ← 捕获改写前的 userData
```

`innerRootPath` 在模块加载时一次性求值并被 `ctx.app.rootPath` 沿用；
`getAllowedDownloadRoots()` 则在每次下载时才调用 `resolveRuntimeRootPath(app)`，读到的是改写后的值。
日志与配置落在 `@talex-touch/core-app/tuff-dev` 而 Chromium 数据落在 `@talex-touch/tuff-dev`，
正是这次改写留下的两个目录并存的痕迹。

### 影响范围

仅 dev。成因分支被 `!app.isPackaged` 包裹，生产环境不执行 `setPath`，两次求值结果一致。

与兄弟任务 F1 不同——F1 经查实影响生产，本条不影响。

## Decisions

- **D1** 根因消除采用**单一惰性求值来源**：让 `innerRootPath` 与 `getAllowedDownloadRoots()`
  共用同一个惰性求值的 app-root 来源，从根上消除"同一概念两处求值、时机不同"的结构。
  不采用"调整导入顺序让 `setPath` 先于 `innerRootPath`"——那只是把当前顺序钉住，
  顺序依赖仍然隐式存在，下次有人调整导入即会复现，且不会有任何测试拦住。
  实现时须逐一确认现有 `innerRootPath` 消费方能接受惰性化（模块顶层直接读取的位置需改为调用点求值）。

## Requirements

- **R1** 更新包下载在 dev 模式下不再被 `destination-outside-roots` 拒绝。
- **R2** 修复方式必须消除"同一概念两处求值、结果可能不同"这一根因，而不是把观测到的第二个路径
  追加进允许列表——后者会让策略随环境漂移，且掩盖真正的不一致。
- **R3** 不得放宽下载路径策略的安全意图。该策略是为堵住任意文件写入而加的
  （`download-target-policy.ts:57-67`，#905），允许根集合不得因本次修复而扩大到策略本意之外。
- **R4** 修复后 dev 与生产两种模式下，"app root"必须只有一个可观测取值。

## Acceptance Criteria

已实现，提交 `1267e87bc`（分支 `release/app-root-single-source-20260905`，基于 F1 分支）。

- [x] **AC1** 单测：`userData` 在首次求值之后被改写，写入方与校验方仍得到同一个 root。
  行为回归已单独证明——用旧实现跑同一场景得到 `core-app/tuff-dev` 与 `tuff-dev/tuff-dev` 两个值，
  正是线上观察到的那一对。
- [x] **AC2** 单测：`evaluateDownloadTarget` 对更新包目标返回 `allowed: true`（含"两次求值之间
  userData 被改写"这一缺陷场景的端到端用例）；既有的三类拒绝用例行为不变（14 条全绿）。
- [~] **AC3** 运行时：dev App 触发更新下载，产物落盘且日志无 `destination-outside-roots`。
  **后半已验证**（合并后 master 上复跑）：
  `[09:48:07] [UpdateSystem] Update download started tag=v2.4.14-beta.22 asset=…-macos-arm64.dmg`，
  日志中不再出现 `destination-outside-roots` —— 本任务修的缺陷已消除，下载能真正启动。
  **产物落盘未达成**：`DownloadError: NETWORK_HTTP_STATUS_403`，外部原因见父任务 AC-P1。
- [ ] **AC4** 运行时：下载完成后 sha256 与 `.sig` 校验通过，进入 `ready`。**未达到该阶段**，同上。
- [x] **AC5** 回归：`src/main/utils`、`download`、`update`、`network`、`database` 共 312 条全绿；
  `typecheck:node` 通过；改动文件按包内 eslint 配置 lint 干净。
- [x] **AC6**（**判定标准已修正**）app root 与 Chromium profile 目录**本就应当并存**，
  它们是不同的东西。原验收写的"不再出现两者并存"基于当时错误的方案假设。
  正确的判定是：**同一个 root 只有一个可观测取值**，由记忆化在结构上保证，并由 AC1 锁定。
- [x] **AC7** 新增 `check:app-root-single-source`（含 `--self-test`），
  在有人重新引入手工重建 root 时失败。实跑扫出并修复了 `database/index.ts:1323` 一处真实违规。

### 未完成项

AC3 的"产物落盘"与 AC4 需要真实的资产下载。合并后已在 master 上复跑一次，
**本任务修的那一环已通过**——下载不再被路径策略拒绝、`Update download started` 正常打出。
剩余失败来自两个源同时不可用（GitHub 未认证配额在该出口 IP 上恒为 `0/60`；
Nexus 对所有渠道返回 `release: null`），详见父任务
[09-04-dev-update-flow-untestable](../09-04-dev-update-flow-untestable/prd.md) 的 AC-P1。

替代证据：AC2 的端到端用例直接构造了缺陷场景——在两次求值之间改写 `userData`，
再让 `evaluateDownloadTarget` 校验更新系统实际使用的目标路径。这覆盖了判定逻辑本身；
仍未覆盖的是下载与验签的 I/O 链路。

补跑条件：GitHub 配额恢复或 Nexus 重新发布 beta 版本，无其它前置。

### 实施期推翻的两版方案

原案与第一版修订都被 `precore.ts:170` 的**刻意** userData 覆盖（启动性能基准）推翻——
它紧接在 root 求值之前，基准测试靠它拿到隔离数据根。两版方案都会破坏它。
详见 design.md「最终方案」。

## Out of Scope

- 已存在的两个 dev 数据目录的迁移或清理（本任务只保证今后一致；历史目录如何处置另议）。
- F1（渲染层窗口类型判定），见兄弟任务 `09-04-dev-update-check-noop`。
- 安装腿（`MAC_UPDATE_BUILD_UNTRUSTED` 之后）的验证，属父任务 AC-P1 范围。
