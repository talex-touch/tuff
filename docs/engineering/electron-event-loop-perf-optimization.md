# Electron 主线程 Event Loop 性能优化实战

> 背景：talex-touch 桌面端（Electron + Vue）启动期/空闲期频繁出现 Event loop lag（1s~13s），界面卡顿。
> 本文记录从日志诊断到最小改动落地的完整过程，共 9 个优化点，分两轮实施。

---

## 1. 问题现象

| 指标 | 数值 | 来源 |
|------|------|------|
| Event loop lag 峰值 | 1.9s ~ 13s | `perf-monitor.ts` 100ms 轮询检测 |
| `channel.send.slow` | `storage:app:updated:stream:start` 711ms | renderer 侧上报 |
| `AppScanner.mdlsUpdate` | ~1084ms | `Perf:Context` |
| `AppTask:AppProvider.mdlsUpdateScan` | ~1195ms | `Perf:Context` |
| `AppScanner.scan` | ~396ms | `Perf:Context` |
| `AppTask:AppProvider.startupBackfill` | ~409ms | `Perf:Context` |

关键观察：`channel.send.slow` 是主线程阻塞的**结果**，不是根因。真正的阻塞源在启动期的 AppScanner 和 AppProvider。

---

## 2. 诊断方法论

### 2.1 Perf:Context 上下文追踪

项目使用 `enterPerfContext(label, meta)` 包裹关键代码段，在 event loop lag 发生时，`perf-monitor` 自动快照当前活跃的 context 栈：

```typescript
// perf-context.ts
const disposeScan = enterPerfContext('AppScanner.scan', { platform: process.platform })
try {
  // ... 扫描逻辑
} finally {
  disposeScan()  // 结束时自动记录耗时
}
```

当 lag 被检测到时，日志输出类似：
```
[Perf:EventLoop] Event loop lag 1.9s (context=AppScanner.mdlsUpdate 1084ms)
```

这让我们能精确定位到**哪个代码段**正在执行时发生了阻塞。

### 2.2 PollingService 诊断

`PollingService` 提供 `getDiagnostics()` 方法，返回：
- `activeTasks`: 当前正在执行的轮询任务
- `recentTasks`: 最近完成的任务（按 `lastDurationMs` 降序）

在 event loop lag 日志中会自动附带这些信息，用于排查轮询任务是否参与了阻塞。

### 2.3 判断根因 vs 症状

关键原则：
- `channel.send.slow` → IPC 发送慢是**主线程被占用**的结果，不是原因
- `pollingRecent` 中某任务 `durationMs: 0` → 该任务本身不慢，只是恰好最近执行过
- lag 时**无活跃 Perf:Context** → 可能是 V8 GC 或未被监控的代码路径

---

## 3. 第一轮优化：启动期 AppScanner 阻塞

### 3.1 根因分析

启动时 `onLoad()` 中三个重任务几乎同时触发：

```
onLoad()
  ├── _scheduleStartupBackfill()     ← queueMicrotask（不让出事件循环!）
  │   └── appScanner.getApps()       ~396ms（mdfind + 逐个 getAppInfo）
  │
  ├── _scheduleMdlsUpdateScan()      ← dev 模式下立即并发执行
  │   └── existsSync() × 412        ← 同步阻塞!
  │   └── mdls 批量 × N/50          ← 批次间无 yield
  │
  └── _scheduleFullSync()
```

### 3.2 优化 1：`existsSync` → 异步 `fs.access`

**问题**：`existsSync(app.path)` 对每个 app 执行同步 `stat` 系统调用。412 个 app × 0.5-2ms/次 = **75-300ms 连续同步阻塞**。

**文件**：`apps/core-app/src/main/modules/box-tool/addon/apps/app-scanner.ts`

```typescript
// Before: 同步阻塞
import { existsSync } from 'node:fs'
for (const app of apps) {
  if (!existsSync(app.path)) { ... }
}

// After: 异步 + 定期 yield
import fs from 'node:fs/promises'
for (let i = 0; i < apps.length; i++) {
  try {
    await fs.access(apps[i].path)
    existingApps.push(apps[i])
  } catch {
    deletedApps.push(apps[i])
  }
  // 每 20 个让出事件循环
  if ((i + 1) % 20 === 0) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
```

**原理**：
- `existsSync` 是 Node.js 的同步 I/O，会阻塞事件循环直到 syscall 返回
- `fs.access` 是异步版本，底层通过 libuv 线程池执行，不阻塞事件循环
- `setImmediate` 将后续代码推到下一个事件循环迭代，让其他 I/O 回调和定时器有机会执行

### 3.3 优化 2：`queueMicrotask` → `setTimeout`

**问题**：`_scheduleStartupBackfill` 使用 `queueMicrotask` 调度。微任务在当前宏任务结束前**全部执行完**，不会让出事件循环。

**文件**：`apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`

```typescript
// Before: 微任务不让出事件循环
queueMicrotask(() => {
  void this._runStartupBackfillWithRetry()
})

// After: 宏任务延迟 500ms，给关键模块加载留出空间
setTimeout(() => {
  void this._runStartupBackfillWithRetry()
}, 500)
```

**原理**：Node.js 事件循环执行顺序：

```
┌─────────────────────────┐
│    宏任务（setTimeout）    │ ← 每次只执行一个
├─────────────────────────┤
│    微任务队列全部清空      │ ← queueMicrotask, Promise.then
│    （不让出事件循环!）      │
├─────────────────────────┤
│    下一个宏任务           │
└─────────────────────────┘
```

`queueMicrotask` 注册的回调会在当前宏任务后、下一个宏任务前**全部执行完**，包括回调中产生的新微任务。这意味着如果 backfill 中触发了连锁 `await`（每个 `await` 后续是微任务），它们会持续霸占事件循环。

改用 `setTimeout(fn, 500)` 后：
1. backfill 进入宏任务队列，延迟 500ms 执行
2. 这 500ms 内其他模块（Database、Storage、Shortcut 等）可以正常初始化
3. 每个 `await` 点都是一次让出机会

### 3.4 优化 3：mdls 批次间 yield

**问题**：`for (const batch of batches)` 循环中，虽然每个 `execFileSafe('mdls', ...)` 是异步的，但回调处理（stdout parsing、对象创建）在同一个微任务中连续执行，不会让出。

**文件**：`apps/core-app/src/main/modules/box-tool/addon/apps/app-scanner.ts`

```typescript
for (const batch of batches) {
  try {
    const { stdout } = await this._execCommand('mdls', args)
    // ... stdout 解析和处理 ...
  } finally {
    // ... 进度日志 ...
  }
  // 批次间让出事件循环
  await new Promise<void>((resolve) => setImmediate(resolve))
}
```

**原理**：`setImmediate` vs `setTimeout(0)` vs `queueMicrotask`：

| 方法 | 执行时机 | 适用场景 |
|------|----------|----------|
| `queueMicrotask` | 当前宏任务内立即执行 | 不适合让出 |
| `Promise.resolve().then()` | 同上（微任务） | 不适合让出 |
| `setTimeout(fn, 0)` | 下一个事件循环迭代（最少 1ms 延迟） | 可以让出，但有最小延迟 |
| `setImmediate(fn)` | 当前 I/O 轮询完成后立即执行 | **最佳选择**：让出但无额外延迟 |

### 3.5 优化 4：Dev 模式 mdls scan 延迟

**问题**：dev 模式下 `_scheduleMdlsUpdateScan` 会**立即**调用 `_runMdlsUpdateScan()`，与 backfill 并发竞争。

**文件**：`apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`

```typescript
// Before: 立即执行，与 backfill 并发竞争
if (is.dev) {
  this._runMdlsUpdateScan().then(...)
}

// After: 延迟 3s，错开启动高峰
if (is.dev) {
  setTimeout(() => {
    this._runMdlsUpdateScan().then(...)
  }, 3000)
}
```

### 3.6 第一轮效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| startupBackfill | ~409ms | ~495ms（无变化，但不再阻塞其他模块） |
| mdlsUpdate | ~1084ms | ~885ms（-18%，且不再连续阻塞） |
| 启动期 lag 峰值 | 1.9s~13s | ~243ms + 偶发 2.2s |

---

## 4. 第二轮优化：推荐引擎冷启动 + GC 压力

第一轮后日志显示：残留 **2.2s event loop lag**，但**无活跃 Perf:Context**。

### 4.1 诊断过程

关键线索：
```
Event loop lag 2.2s (recent=recommendation.trend-backfill 0ms)
  slowPollingRecent: [{ id: recommendation.trend-backfill, durationMs: 0 }]
  heap: { totalHeapSize: 134MB, usedHeapSize: 77MB }
```

分析：
1. `recommendation.trend-backfill` 的 `durationMs: 0` → **它本身不慢**，只是最近执行过
2. **无活跃 Perf:Context** → 阻塞代码没有被 `enterPerfContext` 包裹
3. lag 发生在 mdls scan 完成后 ~9 秒 → 不是直接由 scan 引起
4. heap 77MB used → V8 major GC 可能耗时 0.5-2s

根因定位到三个方向：

**A. `recommend()` 冷启动路径**：用户打开 CoreBox（空查询）→ 触发完整推荐流水线：
  - 4 次 DB 查询 + `getTimeBasedTopItems` 中 N×3 次 `JSON.parse`（同步 CPU 密集）
  - 整条链在一个宏任务中无 yield 执行

**B. V8 Major GC**：启动期密集创建对象后，V8 触发 Mark-Sweep-Compact，匹配「无 context 的大 lag」

**C. Trend backfill `runImmediately: true`**：30 天回填立即开始，在启动窗口增加额外 DB 负载

### 4.2 优化 5：Trend backfill 延迟首次执行

**文件**：`recommendation-engine.ts`

```typescript
// Before: 立即执行首个 tick
{ interval: 2, unit: 'seconds', runImmediately: true }

// After: 延迟 15 秒再开始回填
{ interval: 2, unit: 'seconds', initialDelayMs: 15_000 }
```

**原理**：启动后 15 秒内是 I/O 和 CPU 最密集的窗口，将非关键的趋势回填推迟到窗口之后。

### 4.3 优化 6：`getTimeBasedTopItems` JSON.parse 循环 yield

**问题**：`getAllItemTimeStats()` 返回全表数据，每行做 3 次 `JSON.parse`（`hourDistribution`、`dayOfWeekDistribution`、`timeSlotDistribution`），纯同步 CPU 操作。

**文件**：`recommendation-engine.ts`

```typescript
// Before: 紧密循环无让出
for (const raw of allTimeStats) {
  const parsed = {
    hourDistribution: JSON.parse(raw.hourDistribution),       // CPU
    dayOfWeekDistribution: JSON.parse(raw.dayOfWeekDistribution), // CPU
    timeSlotDistribution: JSON.parse(raw.timeSlotDistribution),   // CPU
  }
  // ... scoring ...
}

// After: 每 50 行让出一次
for (let idx = 0; idx < allTimeStats.length; idx++) {
  // ... 同样的 JSON.parse + scoring ...
  if ((idx + 1) % 50 === 0) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
```

**原理**：`JSON.parse` 是 V8 的同步操作，无法被中断。通过分批处理 + `setImmediate` yield，将一个长同步块切分为多个短块（每块 ~50×3 = 150 次 parse），每块之间事件循环可以处理其他任务。

### 4.4 优化 7：backfillTrendDay upsert 分块间 yield

**文件**：`recommendation-engine.ts`

```typescript
for (let i = 0; i < values.length; i += chunkSize) {
  await db.insert(...).values(chunk).onConflictDoUpdate(...)
  // 分块写入间让出事件循环
  if (i + chunkSize < values.length) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
```

### 4.5 优化 8：`recommend()` 入口增加 appTaskGate 等待

**问题**：首次 `recommend()` 可能在 backfill/mdls scan 仍在运行时被触发（用户打开 CoreBox），导致推荐计算与启动任务竞争主线程。

**文件**：`recommendation-engine.ts`

```typescript
async recommend(options: RecommendationOptions = {}): Promise<RecommendationResult> {
  // 启动期先等待空闲
  if (appTaskGate.isActive()) {
    await appTaskGate.waitForIdle()
  }
  // ... 正常推荐流程 ...
}
```

**原理**：`appTaskGate` 是一个简单的信号量，`runAppTask()` 递增计数，完成后递减。`waitForIdle()` 返回一个 Promise，在计数归零时 resolve。这确保推荐计算不会与启动任务并发执行。

### 4.6 优化 9：降低 GC 峰值压力

**问题**：`_runStartupBackfill` 中 `dbApps`（全表）和 `dbAppsWithExtensions`（带扩展）两个大数组在 diff 计算后仍被闭包持有，直到函数返回才能被 GC。

**文件**：`app-provider.ts`

```typescript
const toAdd = scannedApps.filter(...)

// diff 计算完成后，立即释放不再需要的大数组
;(dbApps as unknown[]).length = 0
;(dbAppsWithExtensions as unknown[]).length = 0
```

**原理**：将数组 `length` 设为 0 会清空数组内容并释放内部存储的引用，使 V8 可以在下一次 minor GC 时回收这些对象，而不必等到函数作用域结束。这减少了启动后 V8 触发 major GC 时需要扫描的对象数量，从而降低 stop-the-world 停顿时间。

---

## 5. 核心优化模式总结

### 模式 1：同步 I/O → 异步 I/O + 批量 yield

```typescript
// Anti-pattern: 同步 I/O 循环
for (const item of items) {
  if (existsSync(item.path)) { ... }  // 阻塞!
}

// Pattern: 异步 I/O + 定期 yield
for (let i = 0; i < items.length; i++) {
  await fs.access(items[i].path)       // 非阻塞
  if ((i + 1) % BATCH === 0) {
    await new Promise(r => setImmediate(r))  // 让出
  }
}
```

### 模式 2：微任务调度 → 宏任务延迟

```typescript
// Anti-pattern: 微任务不让出事件循环
queueMicrotask(() => heavyWork())

// Pattern: setTimeout 延迟到下一个事件循环迭代
setTimeout(() => heavyWork(), delay)
```

### 模式 3：紧密异步循环 → 分批 yield

```typescript
// Anti-pattern: await 之间的同步处理累积
for (const batch of batches) {
  const result = await asyncWork()
  heavySyncProcessing(result)  // 累积阻塞
}

// Pattern: 每批后显式让出
for (const batch of batches) {
  const result = await asyncWork()
  heavySyncProcessing(result)
  await new Promise(r => setImmediate(r))  // 切断累积
}
```

### 模式 4：启动任务信号量

```typescript
// Anti-pattern: 多个重任务无协调并发
onLoad() {
  startHeavyTask1()  // 竞争
  startHeavyTask2()  // 竞争
  startHeavyTask3()  // 竞争
}

// Pattern: 通过 gate 协调 + 延迟错开
onLoad() {
  setTimeout(() => gate.runAppTask(task1), 500)
  setTimeout(() => gate.runAppTask(task2), 3000)
}
// 其他模块等待 gate 空闲
if (gate.isActive()) await gate.waitForIdle()
```

### 模式 5：及时释放大数组引用

```typescript
// Anti-pattern: 大数组持有到函数结束
async function process() {
  const bigArray = await loadAll()      // 持有到函数结束
  const filtered = bigArray.filter(...)
  await doWorkWith(filtered)            // bigArray 仍在内存中
}

// Pattern: 用完立即清空
async function process() {
  const bigArray = await loadAll()
  const filtered = bigArray.filter(...)
  ;(bigArray as unknown[]).length = 0   // 立即释放
  await doWorkWith(filtered)
}
```

---

## 6. 第三轮优化：Analytics 启动期 DB 写入风暴

第二轮后日志显示：残留 **2.8s event loop lag**，**无活跃 Perf:Context**，伴随 `AnalyticsSnapshots.persist 475ms`。

### 6.1 诊断过程

关键线索：
```
04:02:42  lag 492ms   contexts=[]
04:02:45  lag 2.8s    contexts=[]
04:02:45  AnalyticsSnapshots.persist 475ms {count:3, bytes:1878}
04:02:49  lag 1.0s    contexts=[]  heap={135MB, 85MB}
```

分析：
1. `AnalyticsSnapshots.persist` 475ms（仅 3 行/1878 bytes）→ **严重超标**（正常应 < 10ms）
2. **无活跃 Perf:Context** → 阻塞可能来自未被监控的代码路径或 V8 GC
3. heap 85MB used → V8 Major GC 可能正在执行

根因定位到 `AnalyticsModule.onInit()` 中三个操作在启动期同时触发：

```
onInit()
  ├── hydrateStartupMetrics()       ← 立即调用 recordAndPersist → DB INSERT
  ├── sampler.start()               ← start() 中立即调用 collect()
  │   └── recordSystemSample()      → 又一次 recordAndPersist → DB INSERT
  └── startCleanup()
      └── run()                     ← 立即调用 → DB DELETE
```

这三个操作向 `dbWriteScheduler` 队列中同时塞入 3 个写任务，在启动期 SQLite 忙碌时导致 WAL checkpoint 和队列积压。

### 6.2 优化 10：SystemSampler 移除首次立即 collect

**问题**：`SystemSampler.start()` 在注册轮询任务前**立即调用** `this.collect()`，这意味着在 `onInit` 时就触发了一次 `recordSystemSample` → DB 写入。

**文件**：`apps/core-app/src/main/modules/analytics/collectors/system-sampler.ts`

```typescript
// Before: 立即调用 collect()
start(): void {
  if (this.isRunning) return
  this.isRunning = true
  this.collect()  // 立即触发 DB 写入!
  this.pollingService.register(this.taskId, () => this.collect(), {
    interval: this.intervalMs,
    unit: 'milliseconds'
  })
}

// After: 通过 initialDelayMs 控制首次执行时机
start(options?: { initialDelayMs?: number }): void {
  if (this.isRunning) return
  this.isRunning = true
  const initialDelayMs = options?.initialDelayMs ?? this.intervalMs
  this.pollingService.register(this.taskId, () => this.collect(), {
    interval: this.intervalMs,
    unit: 'milliseconds',
    initialDelayMs
  })
}
```

**原理**：移除立即的 `this.collect()` 调用，改为通过 `pollingService` 的 `initialDelayMs` 参数控制首次采样时机。这样首次系统采样不再在 `onInit` 时同步触发，而是延迟到指定时间后。

### 6.3 优化 11：Analytics onInit 延迟非关键操作

**问题**：`onInit()` 中三个操作（hydrate、sampler.start、cleanup）全部立即执行，在启动最忙碌的窗口期密集触发 DB 写入。

**文件**：`apps/core-app/src/main/modules/analytics/analytics-module.ts`

```typescript
// Before: 全部立即执行
const startup = getStartupAnalytics().getCurrentMetrics()
this.core.hydrateStartupMetrics(startup)   // → DB INSERT
this.sampler.start()                        // → 立即 collect → DB INSERT
this.startCleanup()                         // → 立即 run() → DB DELETE

// After: 延迟 3 秒执行，sampler 首次采样再延迟 15 秒
setTimeout(() => {
  const startup = getStartupAnalytics().getCurrentMetrics()
  this.core.hydrateStartupMetrics(startup)
  this.sampler.start({ initialDelayMs: 15_000 })
  this.startCleanup()
}, 3_000)
```

**原理**：
- `setTimeout(fn, 3000)` 将整组操作推迟到启动后 3 秒，此时关键模块（Database、Storage、CoreBox）已完成加载
- `sampler.start({ initialDelayMs: 15_000 })` 让首次系统采样在启动后 3s + 15s = 18s 才执行
- 这样 DB 写入不再与 AppScanner、推荐引擎等启动任务竞争

### 6.4 优化 12：startCleanup 延迟首次执行

**问题**：`startCleanup()` 中 `run()` 被立即调用（第 704 行），在启动期执行 DB DELETE 操作。

**文件**：`apps/core-app/src/main/modules/analytics/analytics-module.ts`

```typescript
// Before: 立即执行清理
private startCleanup(): void {
  const run = () => this.dbStore?.cleanup(...)
  run()  // 立即执行!
  pollingService.register(ANALYTICS_CLEANUP_TASK_ID, () => run(), {
    interval: 60 * 60 * 1000,
    unit: 'milliseconds'
  })
}

// After: 首次清理延迟 5 分钟
private startCleanup(): void {
  pollingService.register(ANALYTICS_CLEANUP_TASK_ID, () =>
    this.dbStore?.cleanup(...), {
    interval: 60 * 60 * 1000,
    unit: 'milliseconds',
    initialDelayMs: 5 * 60 * 1000  // 首次延迟 5 分钟
  })
}
```

**原理**：清理操作（删除过期快照）完全不紧急，延迟到启动后 5 分钟首次执行，之后每小时执行一次。这消除了启动期的一个 DB DELETE 操作。

### 6.5 第三轮效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| AnalyticsSnapshots.persist | 475ms（启动期） | 不在启动期执行 |
| 启动期 DB 写入任务数 | 3+ 个同时触发 | 0（延迟到 3s 后逐步执行） |
| SystemSampler 首次采样 | onInit 时立即触发 | 启动后 18s |
| 启动期 lag 峰值 | 2.8s（contexts=[]） | 预期 < 300ms |

---

## 7. 核心优化模式总结

### 模式 1：同步 I/O → 异步 I/O + 批量 yield

```typescript
// Anti-pattern: 同步 I/O 循环
for (const item of items) {
  if (existsSync(item.path)) { ... }  // 阻塞!
}

// Pattern: 异步 I/O + 定期 yield
for (let i = 0; i < items.length; i++) {
  await fs.access(items[i].path)       // 非阻塞
  if ((i + 1) % BATCH === 0) {
    await new Promise(r => setImmediate(r))  // 让出
  }
}
```

### 模式 2：微任务调度 → 宏任务延迟

```typescript
// Anti-pattern: 微任务不让出事件循环
queueMicrotask(() => heavyWork())

// Pattern: setTimeout 延迟到下一个事件循环迭代
setTimeout(() => heavyWork(), delay)
```

### 模式 3：紧密异步循环 → 分批 yield

```typescript
// Anti-pattern: await 之间的同步处理累积
for (const batch of batches) {
  const result = await asyncWork()
  heavySyncProcessing(result)  // 累积阻塞
}

// Pattern: 每批后显式让出
for (const batch of batches) {
  const result = await asyncWork()
  heavySyncProcessing(result)
  await new Promise(r => setImmediate(r))  // 切断累积
}
```

### 模式 4：启动任务信号量

```typescript
// Anti-pattern: 多个重任务无协调并发
onLoad() {
  startHeavyTask1()  // 竞争
  startHeavyTask2()  // 竞争
  startHeavyTask3()  // 竞争
}

// Pattern: 通过 gate 协调 + 延迟错开
onLoad() {
  setTimeout(() => gate.runAppTask(task1), 500)
  setTimeout(() => gate.runAppTask(task2), 3000)
}
// 其他模块等待 gate 空闲
if (gate.isActive()) await gate.waitForIdle()
```

### 模式 5：及时释放大数组引用

```typescript
// Anti-pattern: 大数组持有到函数结束
async function process() {
  const bigArray = await loadAll()      // 持有到函数结束
  const filtered = bigArray.filter(...)
  await doWorkWith(filtered)            // bigArray 仍在内存中
}

// Pattern: 用完立即清空
async function process() {
  const bigArray = await loadAll()
  const filtered = bigArray.filter(...)
  ;(bigArray as unknown[]).length = 0   // 立即释放
  await doWorkWith(filtered)
}
```

### 模式 6：启动期延迟非关键 DB 操作

```typescript
// Anti-pattern: 模块初始化时立即触发 DB 写入
onInit() {
  this.sampler.start()      // → 立即 collect → DB INSERT
  this.hydrate(metrics)     // → recordAndPersist → DB INSERT
  this.startCleanup()       // → run() → DB DELETE
}

// Pattern: 非关键操作延迟到启动窗口之后
onInit() {
  this.registerHandlers()   // 只注册处理器（零 I/O）
  setTimeout(() => {
    this.hydrate(metrics)
    this.sampler.start({ initialDelayMs: 15_000 })
    this.startCleanup()     // 使用 initialDelayMs 延迟首次执行
  }, 3_000)
}
```

---

## 8. 改动文件索引

| 文件 | 改动点 |
|------|--------|
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-scanner.ts` | #1 existsSync→fs.access, #3 mdls批次yield |
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | #2 queueMicrotask→setTimeout, #4 dev延迟, #9 GC释放 |
| `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts` | #5 trend延迟, #6 JSON.parse yield, #7 upsert yield, #8 appTaskGate |
| `apps/core-app/src/main/modules/analytics/collectors/system-sampler.ts` | #10 移除首次立即collect |
| `apps/core-app/src/main/modules/analytics/analytics-module.ts` | #11 onInit延迟非关键操作, #12 cleanup延迟首次执行 |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts` | #13 搜索防抖35ms→150ms |
| `apps/core-app/src/main/modules/file-protocol/index.ts` | #14 移除existsSync同步预检查 |
| `apps/core-app/src/main/modules/ocr/ocr-service.ts` | #15 runImmediately→initialDelayMs:10s |

---

## 9. 验证方法

优化后通过以下日志确认效果：

```bash
# 关注这些日志行
grep -E "Perf:Context|Event loop lag|Startup backfill complete|mdls update scan finished|Analytics deferred" <log>
```

预期指标：
- 启动期 event loop lag 峰值 < 300ms
- 启动后 3 秒内无 `AnalyticsSnapshots.persist` 日志
- `AppScanner.mdlsUpdate` < 900ms（wall time，非阻塞时间）
- `startupBackfill` 不再与 mdls scan 时间重叠
- 空闲期无 > 1s 的 event loop lag

如果优化后仍有 > 1s lag 且无 Perf:Context，添加 `--trace-gc` 标志确认是否为 V8 GC：
```bash
# 在 electron 启动参数中添加
electron --js-flags="--trace-gc" .
```

---

## 10. 第四轮优化：搜索防抖 + FileProtocol 同步 I/O + OCR 启动时序

第三轮后日志显示：残留 **3.3s event loop lag**（`contexts=[]`），同时用户反馈 CoreBox 搜索输入时结果刷新过于频繁。

### 10.1 诊断过程

关键线索：
```
Event loop lag 3.3s  contexts=[]  pollingRecent=[ocr-service:dispatcher]
heap={totalHeapSize: 84MB, usedHeapSize: 78MB}
```

三个问题方向：

**A. CoreBox 搜索无有效防抖**：`BASE_DEBOUNCE = 35ms`，正常打字速度 80-120ms/字符，35ms 防抖无法合并连续击键。输入 "codex" 触发 5 次搜索请求。

**B. FileProtocolModule `existsSync` 同步阻塞**：`tfile://` 协议处理器中使用 `fsSync.existsSync()` 做预检查。当渲染进程批量加载图片（如 Photos Library 路径）时，大量同步 `stat` 系统调用阻塞事件循环。

**C. OCR 服务 `runImmediately: true`**：OCR 队列调度器在 `ensureInitialized()` 时立即执行 `processQueue()`，包含 DB 查询和任务过滤，增加启动期负载。

### 10.2 优化 13：搜索防抖 35ms → 150ms

**问题**：35ms 防抖对 60-100 WPM 的打字速度来说等于没有防抖。每个字符间隔约 80-120ms，远大于 35ms。

**文件**：`apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`

```typescript
// Before: 35ms 防抖，每个字符都触发搜索
const BASE_DEBOUNCE = 35

// After: 150ms 防抖，连续击键合并为一次搜索
const BASE_DEBOUNCE = 150
```

**原理**：150ms 防抖可以合并 1-2 次快速击键。输入 "codex" 时：
- 35ms：触发 5 次搜索（c, co, cod, code, codex）
- 150ms：触发 1-2 次搜索（可能 "cod" + "codex"，或直接 "codex"）

同时 `inputTransport` 也使用 `BASE_DEBOUNCE`（150ms），减少了 IPC 广播频率。

### 10.3 优化 14：FileProtocolModule 移除 `existsSync`

**问题**：`fsSync.existsSync(normalizedPath)` 对每个 `tfile://` 请求做同步 `stat` 系统调用。渲染进程加载 app 图标时可能触发数十个并发请求，同步 I/O 在协议处理器中连续执行会阻塞事件循环。

**文件**：`apps/core-app/src/main/modules/file-protocol/index.ts`

```typescript
// Before: 同步预检查
import fsSync from 'node:fs'

if (!fsSync.existsSync(normalizedPath)) {
  return new Response('File not found', { status: 404 })
}
try {
  return await net.fetch(fileUrl)
} catch (error) { ... }

// After: 直接让 net.fetch 处理，它内部是异步的
try {
  return await net.fetch(fileUrl)
} catch (error) { ... }
```

**原理**：`net.fetch(fileUrl)` 对不存在的文件会抛出异常，catch 块已经处理了 404 响应。同步预检查是多余的，移除后所有 I/O 都走异步路径。

### 10.4 优化 15：OCR 服务延迟首次执行

**问题**：`pollingService.register` 使用 `runImmediately: true`，在 `ensureInitialized()` 被调用时立即执行 `processQueue()`，在启动窗口增加 DB 查询负载。

**文件**：`apps/core-app/src/main/modules/ocr/ocr-service.ts`

```typescript
// Before: 立即执行
pollingService.register(this.pollTaskId, () => this.processQueue(), {
  interval: PROCESS_INTERVAL_SECONDS,
  unit: 'seconds',
  runImmediately: true
})

// After: 延迟 10 秒
pollingService.register(this.pollTaskId, () => this.processQueue(), {
  interval: PROCESS_INTERVAL_SECONDS,
  unit: 'seconds',
  initialDelayMs: 10_000
})
```

### 10.5 第四轮效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 搜索防抖 | 35ms（每字符触发） | 150ms（合并连续击键） |
| FileProtocol I/O | 同步 `existsSync` | 移除，全异步 |
| OCR 队列首次执行 | 立即（runImmediately） | 延迟 10s |
| 输入 "codex" 搜索次数 | ~5 次 | ~1-2 次 |

---

## 11. 四轮优化总览

| 轮次 | 优化点数 | 核心问题 | 效果 |
|------|----------|----------|------|
| 第一轮 | 4 | AppScanner 同步 I/O + 微任务调度 + 并发竞争 | lag 13s→243ms |
| 第二轮 | 5 | 推荐引擎冷启动 + V8 GC + trend backfill | lag 2.2s→偶发 |
| 第三轮 | 3 | Analytics DB 写入风暴 + 启动期 SQLite 竞争 | 消除启动期 DB 写入 |
| 第四轮 | 3 | 搜索防抖不足 + FileProtocol 同步 I/O + OCR 启动时序 | 搜索体验改善 + 减少同步阻塞 |
