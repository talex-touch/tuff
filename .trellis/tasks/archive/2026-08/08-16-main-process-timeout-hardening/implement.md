# 执行计划

## 顺序

按「共享包 → 调用方 → 独立热点」推进，每步可单独验证。

### 1. PollingService 默认超时（`packages/utils/common/utils/polling.ts`）

- [x] 导出 `DEFAULT_POLLING_TASK_TIMEOUT_MS = 30_000`
- [x] `register` 的 `timeoutMs` 类型放宽为 `number | null`，按 design A 的四分支归一化
- [x] `awaitWithTimeout` 超时告警补 `taskId / lane / timeoutMs`
- [x] 单测：省略 → 默认生效；`null` → 无超时；`0` → 无超时（回归当前 1ms 的坑）；显式值照用

验证：`packages/utils` vitest

### 2. 已知长跑任务显式配置

- [x] `service/temp-file.service.ts:351` → `lane: 'maintenance'` + 显式 `timeoutMs`
- [x] `modules/box-tool/addon/apps/services/app-index-maintenance-service.ts:41` → 显式放大 `timeoutMs`
- [~] `modules/sync/index.ts:1640` → **不改**：回调是 `void performPull(...)` 立即返回，polling 超时对它不可能触发，加了也是死配置

### 3. 网络 flush 整轮预算

- [x] `modules/analytics/startup-analytics.ts`：`flushQueuedReports` 与 `flushQueuedReportsFromDb` 两条路径都加 deadline + 失败即止
- [x] `modules/sentry/sentry-service.ts`：`flushQueuedNexusTelemetryOutbox` 同构处理
- [x] 单测：队列 N 条且请求全部失败时，尝试次数受预算约束且剩余项回写队列

### 4. active-app 超时退避（`modules/system/active-app.ts`）

- [x] 新增超时判定谓词 + `MACOS_TIMEOUT_BACKOFF_MS`
- [x] 兜底 ERROR 日志节流
- [x] 单测：超时后进入退避窗口，窗口内不再调用 execFile；成功后退避清零

### 5. 搜索路径有界等待

- [x] `modules/clipboard.ts:1027` → `waitForIdle(CLIPBOARD_APP_TASK_WAIT_MS)`，超时按 gate 仍忙跳过本次捕获
- [x] 单测：`waitForIdle` 必须带正数超时参数；返回 false（未排空）时放弃本次捕获而非硬等

### 6. fast 层并发（`modules/box-tool/search-engine/search-gather.ts`）

- [x] `fastLayerConcurrency: 3` → `6`

## 验证命令

```bash
pnpm lint
cd apps/core-app && npm run typecheck
# 相关包的 vitest（按改动范围跑，避免全量）
```

注意：CoreApp 有自己的 lint 配置（尾逗号等规则与根配置相反），只看本次改动引入的 delta，不整文件 `--fix`。

## 回滚点

六步彼此独立，任一步出问题可单独 revert。风险最高的是第 1 步（影响全部 48 个站点），若默认超时误伤，优先给受影响任务加显式 `timeoutMs`，而不是回退默认值。

## 执行结果（2026-08-16）

### 与计划的偏差

1. **`modules/sync/index.ts` 未改**：`AUTO_PULL_TASK_ID` 的回调是 `void performPull('polling')`，同步返回，`durationMs` 恒为 ~0，polling 超时永远不会触发。加显式 `timeoutMs` 是死配置，按范围纪律不动。
2. **active-app 改为「连续 N 次超时才退避」而非首次即退避**。原计划的无条件退避会打破既有测试 `macOS osascript 带超时,卡住的调用不会永久占住 in-flight 去重`（#770）——那个用例用的正是 `{killed:true, signal:'SIGTERM'}` 这一错误形状，并断言**下一次查询必须真的重跑**。阈值 3 同时满足两个契约：单次卡顿立即重试，持续失败在 ~4.5s 内收敛到 30s 退避窗口。
3. **未做「负缓存」**：改在退避窗口内直接返回，等效且不改动 `getActiveApp` 的 null 语义。

### 正向对照（每个新测试都在 HEAD 上验证过会失败）

| 测试 | HEAD 结果 |
|---|---|
| polling 默认超时 3 项 | 3 failed / 7 passed |
| active-app 退避 3 项 | 3 failed / 11 passed |
| startup-analytics 轮预算 | 请求被调用 **8 次**（每条队列项一次），修复后 1 次 |
| clipboard 有界等待 2 项 | 2 failed / 13 passed |

第一版 `applies the default bound when timeoutMs is omitted` 是**空断言**（HEAD 上两边都是 `undefined` 所以也通过），已改为断言字面量 30_000 后才真正区分。

### 验证结果

- `packages/utils` 全量：187 files / 1359 passed / 1 skipped
- core-app `box-tool` + `system` + `service`：175 files / 1465 passed
- core-app `database` `storage` `download` `update` `sync` `flow-bus` `utils` `channel`：59 files / 413 passed
- core-app `clipboard.transport` `system` `analytics` `sentry` `service` `search-gather`：21 files / 145 passed
- `npm run typecheck:node`：通过
- lint：只测改动文件的 delta。`polling.ts` 61 → 60（净减 1），`polling-service.test.ts` 22 → 22，core-app 9 个改动文件 0 error

## 第二轮：剩余 waitForIdle 收口（2026-08-16）

### 关键区分

`waitForIdle()` 无界等待并非一律是 bug，取决于调用方性质：

| 调用方 | 超时语义 | 处理 |
|---|---|---|
| 热路径可重复工作（每次按键的剪贴板捕获） | 跳过本次（还有下一次） | 上一轮已做，200ms |
| 一次性启动延迟工作（watcher / 缓存 / OCR） | **照常继续**（没有下一次，跳过 = 功能永不初始化） | 本轮，10s |
| 交互入口（空查询推荐） | **照常继续**（渲染层 400ms 就放弃） | 本轮，300ms |
| 后台索引工作（file-provider 等 14 处） | 无界等待是**正确的**——让位给 app 任务正是 gate 的目的 | 不动 |

新增 `APP_TASK_GATE_STARTUP_WAIT_MS`（导出自 `service/app-task-gate.ts`，就近承载 gate 自身契约）。

### 改动

- `clipboard.ts` 3 处收敛到私有 helper `waitForAppTasksBeforeStartupWork(label)`，超时打 warn 后继续：
  - `scheduleCoreBoxBaselineCapture`：`coreBoxBaselineCaptureQueued` 闩锁只在 `.then()` 里清；gate 永不排空则闩锁永久为 true，**整个会话再也无法安排基线捕获**——这处是四个里最严重的，不只是延迟。
  - `startClipboardMonitoring`：native watcher 起不来 → `shouldSkipUnchangedCapture` 失效 → 每次 CoreBox 显示都做主线程同步剪贴板读，**反过来拖慢搜索路径**。
  - OCR 启动。
- `clipboard-history-persistence.ts:215`：初始缓存 hydrate 加界。
- **额外发现并修复**：`recommendation-engine.ts` 的 `recommend()`（`search-core.ts:1018` 在空查询分支直接调用的公开入口）同样无界等待。索引扫描期间打开 CoreBox 会一直挂，而渲染层 400ms 就放弃并清空状态 → 用户看到空列表。加 300ms 上界（低于渲染层阈值）后照常计算。`runBackgroundRefresh` 是后台调用方，本身已无界等过，不受影响。

### 踩到的坑

1. **mock 缺少新导出 → 静默失效**。`vi.mock('../service/app-task-gate')` 工厂只导出 `appTaskGate`，模块新增 `APP_TASK_GATE_STARTUP_WAIT_MS` 后，读取该绑定在 helper 内抛错，而调用链自带的 `.catch()` 把它吞了——表现为 `waitForIdle` 压根没被调用，两个既有测试报 "spy never called"。已给 2 处 mock 补上导出。
2. **微任务节拍**：helper 多一层 async 帧。先按猜测把两个 `flushMicrotasks` 都调大，修完真正的 mock 问题后逐个回退验证，最终**只有一处**（baseline capture）真的需要 +2，另一处回退到原值，避免留下无用改动。
3. `appTaskGate` mock 默认值从 `undefined` 改为 `true`（真实 gate 未激活时即返回 true）。在新语义下 `undefined` 会被读成「超时」，导致每个启动测试都触发一次 warn 分支。

### 正向对照

| 测试 | HEAD 结果 |
|---|---|
| clipboard 有界等待 2 项 | 2 failed |
| recommendation 有界等待 | 1 failed |

`does not wait at all when no app task is active` 在 HEAD 上也通过——它守的是既有的 `isActive()` 短路，属行为保持断言，不是缺陷复现。

### 验证

- typecheck:node 通过
- core-app `box-tool` `clipboard*` `system` `service` `analytics` `sentry` `database` `storage`：209 files / 1665 passed
- lint：本轮 7 个改动文件 0 error

### 仍未动（有意）

`file-provider.ts`（9 处）、`file-provider-*-service.ts`（5 处）、`everything-icon-cache.ts`、
`store-api.service.ts`、`recommendation-engine.ts:runBackgroundRefresh` 的无参 `waitForIdle()`
**保持不变**：它们是后台索引/维护任务，无界让位给 app 任务正是 gate 的设计意图，加上界反而会
让索引与启动任务争抢主线程。
