# 技术设计

## 现状与边界

`PollingService`（`packages/utils/common/utils/polling.ts`）已有完整的 lane / backpressure / 超时机制，问题不在机制缺失，而在**默认值**：

- `sanitizeLane` 未指定时回落到 `serial`（并发 1，`polling.ts:165` / `DEFAULT_LANE_CONCURRENCY`），
- `register` 未指定 `timeoutMs` 时存 `undefined`，`awaitWithTimeout` 直接 `await callbackPromise` 无界等待（`polling.ts:652`）。

两个默认值叠加，一个注册时省略参数的长跑任务会独占 serial lane 并无限期挂住后面所有任务——这正是 `temp-file.cleanup` 造成 12 深度积压的成因。

关键既有语义（**本次不改**）：超时只让 `awaitWithTimeout` 提前返回，`executeQueuedTask` 的 `finally` 随即释放 lane 槽位与 `taskInFlightCount`，但**不取消回调**。所以超时的收益是「停止阻塞调度器」，不是「停止做事」。网络类任务因此还需要在业务层加整轮预算。

## 方案

### A. PollingService 默认超时（覆盖 37 个未配置站点）

`packages/utils/common/utils/polling.ts`

```
DEFAULT_POLLING_TASK_TIMEOUT_MS = 30_000
timeoutMs?: number | null
  omitted  → DEFAULT_POLLING_TASK_TIMEOUT_MS
  null     → 显式无超时（存 undefined）
  <= 0     → 同 null（修掉当前 Math.max(1, 0) = 1ms 的坑）
  > 0      → 取整后照用
```

选 30s 的依据：既有实测最慢的正常任务（`database_wal_checkpoint_truncate` 714ms、`system-sampler` 732ms、`clipboard.active-app.refresh` 579ms）都远低于它，而全部问题任务（23s / 31.7s / 46s / 638s）都在其之上。当前 11 个显式配置站点最大值为 8s，不受影响。

超时日志补上 `taskId / lane / timeoutMs`，便于下次定位。

### B. 已知长跑任务的显式配置

| 站点 | 改动 | 理由 |
|---|---|---|
| `service/temp-file.service.ts` `temp-file.cleanup` | `lane: 'maintenance'` + 显式 `timeoutMs` | serial 并发 1 是 12 深度积压的直接原因；清理是纯 IO 维护任务，不需要 serial 语义 |
| `app-index-maintenance-service.ts` `app_provider_full_sync` | 显式放大的 `timeoutMs` | 全量应用索引同步合法地可能超过 30s；仍给上界，避免真卡死时占住 maintenance 槽位 |
| `modules/sync/index.ts` `AUTO_PULL_TASK_ID` | 显式放大的 `timeoutMs` | 网络同步合法长跑 |

其余 34 个站点靠默认值兜底，不逐个改，避免大面积 diff 与后续新增站点再次遗漏。

### C. 网络 flush 的整轮预算

`startup-analytics.ts` 与 `sentry-service.ts` 的 outbox flush 都是「串行遍历队列，每条一个带超时的请求」。单条 12s 是对的，但整轮没有上界：离线时 N 条 × 12s 就是观测到的 46s / 599s / 638s。

改法（两处同构）：
1. 进入循环前记录 deadline = `now + FLUSH_BUDGET_MS`，每次迭代前检查，超预算则把剩余项原样留在队列并结束本轮；
2. 出现网络类失败后不再继续本轮剩余项——同一个不可达 endpoint 逐条重试没有收益，留给下一个 flush 周期。

失败项保留原有重试计数与回写逻辑，不改变投递语义，只改变「一轮里最多花多久」。

### D. active-app 超时退避与负缓存

`modules/system/active-app.ts`

现状：权限错误 60s 退避、EBADF 10s 退避，**超时走的是 `if (!isEbadfError(...))` 兜底分支，只打 ERROR 就 `return null`**（`active-app.ts:281`）。而 `getActiveApp` 拿到 null 会清空两个缓存（`active-app.ts:594`），没有负缓存。配 1.5s 的刷新周期 → 每 1.5s spawn 一次 osascript，每次 1.5s 超时，永不收敛（今日 278 次）。

改法：
1. 新增超时判定（`killed` / `signal === 'SIGTERM'` / `ETIMEDOUT`）与 `MACOS_TIMEOUT_BACKOFF_MS` 退避窗口，与既有 permission / EBADF 退避同构，成功时一并清零；
2. 兜底分支的 ERROR 日志按间隔节流，避免每次把整段 AppleScript 堆栈写盘；
3. 退避窗口内 `resolveActiveWindowMacOS` 直接返回 null，不再 spawn。

负缓存不在 `active-app` 内做（会改变 `getActiveApp` 的 null 语义），而是靠退避窗口达到同等效果：窗口内的调用立即返回，不产生子进程。

### E. 搜索路径的无限等待

`modules/clipboard.ts:1023-1027`：`corebox-show-baseline` 是唯一不提前 return 而是 `await appTaskGate.waitForIdle()` 的来源，且不带超时（`app-task-gate.ts:55` 无参 = 无限等）。这个来源恰好就是每次 `executeSearch` 前置的剪贴板刷新（`useSearch.ts:1069`）。

改为 `waitForIdle(CLIPBOARD_APP_TASK_WAIT_MS)`；`waitForIdle` 超时返回 `false`，此时按「gate 仍忙」处理，跳过本次捕获而不是硬等——搜索拿到稍旧的剪贴板状态，远好于挂住。

### F. fast 层并发

`search-gather.ts:53-60` `fastLayerConcurrency: 3`，而 darwin 下 fast provider 有 7 个（main-window / system-actions / context-actions / app / mac-spotlight / plugin-features / preview），80ms 窗口内第三批基本进不来。提到 6，与 provider 数量匹配。

## 风险

- **默认超时误伤**：某个未在日志中出现的任务正常耗时 > 30s。缓解：超时不取消回调，业务仍会完成；`timeoutCount` 与新日志会暴露它，后续按需加显式配置。
- **超时后并发放大**：槽位释放但回调仍在跑，同一任务可能出现两个并发执行。这是既有 11 个带超时站点已有的行为，非本次引入；受影响任务多为 `latest_wins` + `dedupeKey`，重复执行代价可控。
- **`temp-file.cleanup` 换 lane**：maintenance 并发 2，清理任务本身有 `catch` 兜底，不依赖串行独占。
