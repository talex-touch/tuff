# 实时索引链路诊断（app / file）

诊断日期 2026-08-05。只读取证：HEAD = `TalexDreamSoul/app-shell-v2` @ a1431ca42。
现场实例 = tuff-dev profile，PID 98801，启动于 18:32:10，取证时已运行 3h43m。
DB 一律以 `file:...?mode=ro` 打开，未写入任何数据，未触碰运行中的实例。

---

## 0. 结论速览

**豆包个案的直接根因不在 HEAD 代码，而是运行中的 dev 实例失去了自己的构建产物。**

`/Applications/Doubao.app` 的 watch 事件**正常到达了**——链路的前 5 环全部走通。断点在第 6 环
`AppScanner.getAppInfoByPath()`：它内部 `await import('./darwin')` 抛
`Cannot find module './chunks/darwin-DkXv7dnN.js'`，日志里同一条错误出现 **93 次**，覆盖
Doubao.app / Doubao Browser.app / MenuCue.app 三个应用。取证时
`apps/core-app/out/main/` 是**空目录**（mtime 20:34）——运行中的进程被人清空了它的
code-split chunk，任何尚未求值的 `await import()` 从此永久失败。

这是环境事故，**重启即消失**。但它像探针一样照出了 4 个真实的 HEAD 级缺陷：单点失败无重试
无降级、健康检查看不见文件系统、watch 事件零合并、`last_indexed_at` 恒为 0。这 4 个才是
"新装应用不实时进索引"在**生产环境**下会复现的原因，也是本文修复设计的对象。

**"重启能否自愈"的答案是：dev 环境下大概率不能立刻自愈**（详见 §4），得靠 24h 全量同步兜底。

---

## 1. 证据链

### 1.1 时间轴

| 时刻 | 事件 | 证据 |
|---|---|---|
| 18:00:11 | 上一个实例最后一次 `AppScanner Starting application scan` / `found 227 applications` | `D.2026-08-05.log` |
| 18:32:10 | 当前实例启动（PID 98801） | `ps -eo lstart`，`database.db.running` = 1785979931375 |
| 20:34 | `out/main/` 被清空 | 目录 mtime，内含 0 个文件 |
| 22:03:18 | 第一条 `Cannot find module './chunks/darwin-DkXv7dnN.js'`（Doubao.app） | 日志 |
| 22:03 | `/Applications/Doubao.app` 落盘 | 目录 ctime |
| 22:03:18 – 22:09:29 | 93 次同样的失败，间隔恒定 ≈1.5s | 日志 |

当前实例启动后**从未成功跑过一次 `AppScanner.scanApps`**——日志里 18:00:11 之后再无
`Starting application scan`。所以 5 分钟缓存（`app-scanner.ts:32`）在这条链上根本没机会咬人：
它连一次都没被填充过。

### 1.2 那个 1.5s 间隔就是 `_waitForItemStable`

`app-provider.ts:3521-3551`：`stat` → `sleep(500)` → `stat` → 相等 → `sleep(1000)` → return true。
**500 + 1000 = 1500ms**，与日志间隔精确吻合。这既证明事件确实一条条排队进来了，也量化了
每条事件在成功路径上的固定 1.5s 开销。

### 1.3 已排除的假设（逐条证伪）

| 假设 | 判定 | 证据 |
|---|---|---|
| noise filter 滤掉了豆包 | **证伪** | `app-noise-filter.ts:44-93` 三条规则（simulator / coreservices-helper / developer-support）对 `/applications/doubao.app` + `com.bot.pc.doubao` 全部不命中。且该过滤器只在**搜索时**调用（`app-provider.ts:3400-3426`），根本不在写索引路径上 |
| mdfind 查不到豆包 | **证伪** | 用 `darwin.ts:302-308` 的原查询串复刻：`mdfind -onlyin /Applications -onlyin /System/Applications -onlyin /System/Library/CoreServices -onlyin ~/Applications 'kMDItemContentType == "com.apple.application-bundle"'` → 命中 `/Applications/Doubao.app` 与 `/Applications/MenuCue.app` |
| watch root 没覆盖 /Applications | **证伪** | `app-scanner.ts:39` 明确含 `/Applications`；`_isWatchPathCandidate`（`app-provider.ts:3501-3519`）对该路径返回 true；且日志证明事件已到达 |
| A-M6（forceRefresh 被在飞扫描吞掉） | **本链无关** | `app-scanner.ts:76` 只影响 `getApps()`（全量/backfill 路径）。实时 watch 走的是 `getAppInfoByPath()`，不经过 `scanPromise`。A-M6 只在"backfill 与 full-sync 撞车"时咬人 |
| 入库了但索引投影没发 | **证伪** | `database.db` 的 `files` 表 0 行匹配 doubao/豆包；`search-index.db` 的 `search_index` 与 `keyword_mappings` 同样 0 行。链路在入库**之前**就断了 |
| 索引侧整体坏了 | **证伪** | `search_index` 里 `app-provider` 228 行、`file-provider` 3209 行，与 `files` 表 228 个 app 行一致。索引侧健康，只是没人喂新数据 |

### 1.4 `isNonUserFacingCoreServiceApp` 与 330 vs 228 的差额

mdfind 原查询返回 **330** 个 `.app`，而目录只有 228 行。差额的主因是设计内过滤：
`darwin.ts:133-141` 的 `isNonUserFacingCoreServiceApp` 在**写入前**丢弃
`/System/Library/CoreServices/` 下带 `LSBackgroundOnly` / `LSUIElement` 的 bundle（330 条里
138 条在 `/System/Library` 下），另有 13 条是嵌套在别的 `.app` 内部的子 bundle。这条过滤器
路径前缀写死在 CoreServices，**不可能命中 `/Applications/Doubao.app`**。

注意这是**索引期**过滤器，和 §1.3 那个搜索期的 noise filter 是两套独立机制——排查时容易混淆，
建议后续合并口径。

---

## 2. App 侧链路图（每环：触发条件 / 时延上限 / 失败静默点）

```
/Applications 变化
  │
  ├─① chokidar-fsevents (macOS)         file-system-watcher.ts:85-99, 197
  │    触发：FSEvents 流，depth=1（app-provider.ts:1135-1139 对 /Applications 返回 1）
  │    时延：FSEvents 合并窗口，典型 0.1–1s
  │    awaitWriteFinish: stabilityThreshold 2000ms —— 只作用于 file，不作用于 addDir
  │    ⚠ 静默点：EPERM/EACCES 被降级为 info 日志后 return（:127-132）
  │
  ├─② touchEventBus emit                file-system-watcher.ts:104/108/112
  │    FILE_ADDED / DIRECTORY_ADDED / FILE_CHANGED
  │
  ├─③ IndexedSourceEventRouter          indexed-source-event-router.ts:69-82
  │    ⚠ 无防抖、无合并、无节流：每条 chokidar 事件立刻 void this.route(...)
  │    实测一次装 app 产生 ~16 条事件，全部各跑一遍完整链路
  │
  ├─④ WatchEventRouter.route            indexing-watch-router.ts:82-120
  │    sourceMutationGate 按 sourceId 串行 → 16 条事件 × 1.5s ≈ 24s 串行占用
  │    eligibility 门（:220-231）：source 不健康/被禁用 → 静默 skip，只进返回值不进日志
  │
  ├─⑤ appProvider.handleIndexedSourceWatchEvent   app-provider.ts:1098-1133
  │    resolveAppPath（:2820-2858）：截断到 .app、_isWatchPathCandidate
  │    ⚠ 静默点：非 watch root 内的路径直接 return []（只在 logIgnore 时记一行 info）
  │
  ├─⑥ processAppPath                    app-provider.ts:2963-3005
  │    _waitForItemStable：固定 1.5s（500ms 探测 + 1000ms 尾睡眠），最坏 5 轮 = 3.5s
  │    getAppInfoByPath（app-scanner.ts:175-210）
  │    ★★★ 本次断点就在这里 ★★★
  │    ⚠ 致命静默点：getAppInfoByPath 内部 catch 一切 → return null
  │      → processAppPath 返回 { success:false, reason:'not-app' }（:2985-2988）
  │      → 只记一行 warning，不 report operationalErrorService，不重试，不降级全量扫描
  │      "模块加载失败"和"这压根不是个 app"被压成了同一个返回值
  │
  ├─⑦ upsertAppInfo                     app-provider.ts:2860-2961
  │    ⚠ insert 语句（:2925-2932）不写 lastIndexedAt → schema.ts:96 默认 new Date(0)
  │      → 228 个 app 行的 last_indexed_at 全是 epoch，无法判断上次扫描时间
  │
  ├─⑧ IndexedSourceRecord → store.applyDelta      indexing-watch-router.ts:102
  └─⑨ search-index worker → keyword_mappings / search_index
```

**理论时延（链路健康时）**：FSEvents 0.1–1s + 稳定等待 1.5s + getAppInfo ~50ms + 入库 + 索引投影
≈ **2–3s**，本来是达标的。真正把它推垮的是③的零合并 × ④的串行门：16 条事件排队后，
最后一条要等 ~24s 才轮到。

### 兜底路径（watch 失败后谁来救）

| 机制 | 代码 | 触发条件 | 能否发现**新**应用 |
|---|---|---|---|
| 启动健康检查 | `app-provider.ts:1954-2007` | 启动后 1s | **不能**。`getAppSearchIndexHealth`（:1678-1702）只比 DB app 行数 vs 索引行数，228 vs 228 判定 healthy，文件系统上多出来的应用它看不见 |
| 启动 backfill | `:2056-2088`, `:2136-2175` | 启动后 15s（dev +30s） | 能，但 dev 下被 6h `recent-backfill` 守卫拦截（`STARTUP_BACKFILL_MIN_INTERVAL_DEV_MS`，:314），且守卫的放行条件正是那个看不见文件系统的 health |
| mdls 轮询 | `:3610-3665` | 每 10 分钟检查 | 生产：距上次扫描 >1h 才跑，跑的是 `reconcile` → `_runFullSync(true)` → 真·mdfind 全量，**能**发现新应用。**dev：只在 `!lastScanTimestamp`（史上第一次）时跑，之后永远走 else 分支跳过** |
| 全量同步 | `:2375-2431` | 每 10 分钟检查 | 能，但 cooldown = `max(1h, 24h)` = **24h**（:362-364, :2404-2407） |

所以生产环境新应用的最坏可见时延是 **1 小时**（mdls 轮询），dev 环境是 **24 小时**（全量同步）。

---

## 3. File 侧链路

```
文件落盘
  ├─① chokidar depth：darwin = 5（indexing-watch-path-policy.ts:41）
  │    awaitWriteFinish stabilityThreshold 2000ms 对 file 生效
  │    ⚠ F-M5 仍然成立：scan 深度 24 vs watch 深度 5，第 6 层以下的文件进得了索引、收不到事件
  ├─② IndexedSourceEventRouter → FILE_INDEXED_SOURCE_ID（同样零防抖）
  ├─③ fileProvider.handleIndexedSourceWatchEvent   file-provider.ts:2340-2369
  │    isWithinWatchRoots 门（:3345）→ 不在 root 内静默 return []
  │    ⚠ 注意：这条 Runtime 路径**绕过了** incrementalQueueService，直接同步调
  │      handleIncrementalAddsOrChanges。合并队列只服务于手动添加（:2922/:2966）
  └─④ buildFileRecord → delta → 索引
```

`IndexingWatchDeltaQueueService.schedule()`（`indexing-watch-delta-queue.ts:109-119`）值得单独点名：
它**没有定时器**，只是一条 `taskChain` promise 串。所以它是"串行化器"，不是"防抖器"——
只有在上一次 flush 还在飞的时候后到的事件才会被 coalesce。全链路（app 侧 + file 侧）
**没有任何一处基于时间窗的事件合并**。

文件侧理论时延：落盘 → awaitWriteFinish 2s → 路由 → 增量写 → 索引 ≈ **2–3s**。
破坏点：深度 >5、不在 watch root 内、以及与 app 侧共享的③零合并放大效应。

---

## 4. 豆包个案：根因排序

**#1（确诊，置信度极高）dev 实例的 code-split chunk 在运行期被删除**
证据：93 条 `Cannot find module './chunks/darwin-DkXv7dnN.js'`；`out/main/` 空目录，
mtime 20:34 晚于进程启动 18:32。`app-scanner.ts:183-186` 的 `await import('./darwin')` 是
惰性求值，进程启动时没加载过，等到 22:03 第一次需要它时文件已经没了。
判定：**环境事故，非 HEAD 缺陷。**

**#2（并发成因，HEAD 缺陷）失败不重试、不升级、不可观测**
`app-scanner.ts:198-209` 把所有异常压成 `return null`；`app-provider.ts:2985-2988` 把 null 记成
`reason:'not-app'` 后丢弃。93 次失败没有触发任何一次全量扫描降级，没有进
`operationalErrorService`，没有任何一处告诉用户"有个应用我没索引进去"。
换成生产环境里的任何一种瞬时故障（Spotlight 尚未索引完、mdls 被限流、安装过程中 TCC 弹窗、
`.app` 正在被 `cp -R` 写入），结果完全一样——**永久丢失，直到 24h 全量同步**。

**#3（阻止自愈，HEAD 缺陷）健康检查的口径是 DB vs 索引，永远看不见文件系统**
`getAppSearchIndexHealth`（:1678-1702）返回 `healthy = appCount>0 && indexedItemCount>0`。
228 vs 228 → healthy。于是：启动健康检查不触发 backfill；dev 的 6h `recent-backfill` 守卫
（:2144-2158）以"health 健康"为由跳过 backfill。**缺失 2 个应用的状态，被系统一致地判定为健康。**

**#4（放大器，HEAD 缺陷）零事件合并 × 串行门**
一次安装产生 ~16 条事件，每条串行占用 1.5s。链路健康时这表现为"最后一条要等 24s"；
链路不健康时它表现为 93 次无谓的失败重试风暴。

### 重启后能否自愈？

- **模块错误本身：能**。重启会重新解析 `out/main`，`await import('./darwin')` 恢复正常。
- **豆包会不会立刻进索引：dev 下大概率不会。** 三道门同时挡着：
  1. 启动健康检查判定 healthy（#3）→ 不触发 backfill；
  2. dev `recent-backfill` 守卫要求距上次 backfill ≥6h，且放行条件是 health 不健康（#3 让它永远健康）；
  3. dev 的 mdls 10 分钟轮询只在"史上第一次扫描"时跑（`app-provider.ts:3654`），此后永久走 else 跳过。
  剩下唯一的兜底是 24h 全量同步（cooldown `max(1h, 24h)`）。
- **生产环境重启：能**，走 mdls 轮询的 `>1h` 分支 → `reconcile` → 真·mdfind 全量。最坏 1 小时。
- **立刻验证的办法**：重启后手动 `touch /Applications/Doubao.app` 触发一次 watch 事件，
  这条路径在 chunk 恢复后是通的。

---

## 5. 修复设计

按改动点列出。每项标注资源代价与预期时延贡献。

### F1 —— 失败要重试、要升级、要可观测（对应根因 #2，**最高优先级**）

**改动点**：`app-scanner.ts:175-210`（`getAppInfoByPath`）、`app-provider.ts:2963-3005`（`processAppPath`）

1. `getAppInfoByPath` 不再吞掉错误类型：区分 `ENOENT`（真·不是 app，终态）与其他异常
   （瞬时故障，可重试）。返回 `{ ok:false, retryable:boolean, error }` 而非 `null`。
2. `processAppPath` 对 retryable 失败进 **有界退避重试**：3 次，2s / 8s / 30s。
3. 3 次仍失败 → 进 `pendingAppPaths: Set<string>`，并 `operationalErrorService.report(...)`
   （已有基础设施，`:2994-3000` 已在用，只是 null 分支没走）。
4. `pendingAppPaths` 非空时才注册一个 10 分钟的清扫定时器；清空即注销。

**资源代价**：定时器 0→1 个，且**仅在有失败时存在**（空闲零轮询）。重试次数有界，
最坏 3 次 × 每次一个 `import` + 一次 plist 读 ≈ 可忽略。
**时延贡献**：健康路径 0；故障路径把"永久丢失"变成"最坏 40s 内自愈"。

### F2 —— 时间窗合并 watch 事件（对应根因 #4）

**改动点**：`indexed-source-event-router.ts:69-82`（`handleAppAddedOrChanged`）

在 route 之前加一层按"解析后的 `.app` 路径"聚合的合并窗：**400ms**（trailing edge）。
file 侧同理加在 `:49-57`，窗口可用 300ms（chokidar 的 awaitWriteFinish 已经吸收了大部分抖动）。

复用现成件：`IndexingWatchDeltaQueueService` 已经有 coalesce 逻辑，只缺一个定时器
（`indexing-watch-delta-queue.ts:109-119`）。给 `schedule()` 加可选 `debounceMs`，
两侧共用，比新写一套合并器更省。

**资源代价**：每个活跃合并窗 1 个 `setTimeout`，窗口结束即释放；空闲时零定时器、零轮询。
内存 = pending Map 的条目数。
**时延贡献**：+400ms 固定；但把 16 次 × 1.5s 的串行压成 1 次，净收益 −22s。

### F3 —— 削掉 `_waitForItemStable` 的固定尾睡眠

**改动点**：`app-provider.ts:3521-3551`

`:3532` 的 `await sleep(1000)` 是无条件的。chokidar 的 `awaitWriteFinish.stabilityThreshold`
已经是 2000ms（`file-system-watcher.ts:90-93`），F2 的 400ms 合并窗又加了一层。
建议：尾睡眠 1000ms → **250ms**，两次 stat 间隔 500ms → 300ms。

**资源代价**：负数（少睡 950ms）。
**时延贡献**：−0.95s / 事件。

### F4 —— 健康检查引入文件系统口径（对应根因 #3）

**改动点**：`app-provider.ts:1678-1702`（`getAppSearchIndexHealth`）

新增一个廉价探针：对每个 macOS watch root 做一次 `fs.readdir` 并数 `*.app`（`/Applications`
通常 100–200 项，一次 readdir ~1ms），与 DB 的 app 行数比较。差额 > 阈值（建议 3 或 2%）
判定 `healthy=false`，从而解锁：启动健康检查触发 backfill、dev 的 `recent-backfill` 守卫放行。

注意这是**计数级**探针，不是全量 stat，不读 plist，不碰 mdls。它只回答"数量对不对得上"。

**资源代价**：每次调用 2–4 次 `readdir`（≈2ms），只在启动 + backfill 决策点调用，**不轮询**。
**时延贡献**：让"重启后自愈"从 24h 变成"启动后 15s（backfill 延迟）"。

### F5 —— 补 `last_indexed_at`（可观测性）

**改动点**：`app-provider.ts:2925-2932`（insert）与 `:2873-2876`（update 的 `updateData`）

两处都补 `lastIndexedAt: new Date()`。schema 已有该列（`schema.ts:96`，默认 `new Date(0)`）。
file 侧已经在正确地写它（`file-provider.ts:3684` 等），app 侧是唯一的漏网。

**资源代价**：0（同一条 SQL 多一个列）。
**时延贡献**：0，但没有它就无法在真机上判断"上次扫描是什么时候"——本次取证正是卡在这。

### F6 —— dev 的 mdls 轮询恢复周期性（可选，dev-only）

**改动点**：`app-provider.ts:3651-3662`

`else if (isDevelopmentRuntime && !lastScanTimestamp)` 让 dev 在第一次扫描后**永久**跳过。
建议 dev 也走 `now - lastScanTimestamp > 6h` 的门，而不是 `!lastScanTimestamp`。

**资源代价**：dev 下每 6h 一次全量 mdfind（实测 ~0.2–1s）。生产不受影响。
**时延贡献**：dev 兜底从 24h → 6h。

### 推荐参数组合（实时性 ≤10s 且空闲零轮询）

| 参数 | 现值 | 建议 | 理由 |
|---|---|---|---|
| chokidar `/Applications` depth | 1 | 1（不变） | FSEvents 单流，空闲零 CPU，已是最优 |
| `awaitWriteFinish.stabilityThreshold` | 2000ms | 2000ms（不变） | 挡住 `cp -R` 中途事件 |
| app 侧事件合并窗 | 无 | **400ms** | 16 事件 → 1 |
| file 侧事件合并窗 | 无 | **300ms** | |
| `_waitForItemStable` stat 间隔 / 尾睡眠 | 500 / 1000ms | **300 / 250ms** | 上游已有 2s 稳定阈值 |
| 失败重试 | 无 | **3 次，2/8/30s** | 有界 |
| 失败清扫定时器 | 无 | **10min，仅在有 pending 时存在** | 空闲零轮询 |
| 健康探针 | DB vs 索引 | **+ readdir 计数** | 非轮询，只在决策点 |

**预期端到端时延**：FSEvents 0.1–1s + 合并 0.4s + 稳定 0.55s + getAppInfo ~50ms + 入库/索引 ~0.3s
≈ **1.5–2.5s**，相对 10s 目标有 4 倍余量。**空闲态新增轮询 = 0。**

---

## 6. 验收方案（真机可复现）

### 前置：把现场恢复干净

```bash
# 当前实例已失去 out/main，必须重启才有意义
# 1. 退出正在跑的 dev 实例（PID 98801）
# 2. 重新构建并启动
pnpm core:dev
```

### A. 冒烟：确认断点已消失

```bash
LOG=~/Library/Application\ Support/@talex-touch/core-app/tuff-dev/logs/D.$(date +%Y-%m-%d).log
grep -c "Cannot find module" "$LOG"   # 期望 0
grep -a "Starting application scan\|Scan complete" "$LOG" | tail -3  # 期望能看到本次启动的扫描
```

### B. 主验收：装一个 app ≤10s 可搜

```bash
DB=~/Library/Application\ Support/@talex-touch/core-app/tuff-dev/modules/database

# 1) 基线
sqlite3 "file:$DB/database.db?mode=ro" \
  "select count(*) from files where type='app';"

# 2) 造一个新应用（用现成 bundle 复制，避免签名/公证干扰）
sudo cp -R /System/Applications/Calculator.app "/Applications/ZZTestProbe.app"

# 3) 每秒轮询，记录首次可见的秒数
for i in $(seq 1 30); do
  n=$(sqlite3 "file:$DB/database.db?mode=ro" \
      "select count(*) from files where path='/Applications/ZZTestProbe.app';")
  k=$(sqlite3 "file:$DB/search-index.db?mode=ro" \
      "select count(*) from keyword_mappings where item_id like '%ZZTestProbe%';")
  echo "t=${i}s files=$n keywords=$k"
  [ "$n" -ge 1 ] && [ "$k" -ge 1 ] && break
  sleep 1
done
```

**通过标准**：`files` 与 `keyword_mappings` 均在 **t ≤ 10s** 内变为 ≥1。
补一条 UI 侧确认：CoreBox 输入 `ZZTestProbe` 能出结果。

### C. 事件合并验收（F2）

```bash
grep -ac "Fetching app info: /Applications/ZZTestProbe.app" "$LOG"
```
**通过标准**：修复前会是十几条，修复后 **≤2 条**。

### D. 故障注入验收（F1，核心）

在 `getAppInfoByPath` 里临时注入"前 2 次抛非 ENOENT 错误"，重跑 B。
**通过标准**：应用仍在 **≤40s** 内进索引（2s+8s 退避后第 3 次成功），
且日志有 retry 记录、`operationalErrorService` 有条目——而不是像现在这样静默丢弃。

### E. 自愈验收（F4）

1. 停掉实例；
2. 只读确认某个 `/Applications` 下的应用不在 `files` 表里（可用 B 步造的 probe，
   先用只读方式确认它还没进库就直接停实例）；
3. 重启；
4. **通过标准**：启动后 **≤60s**（backfill 延迟 15s + dev 30s + 扫描）该应用出现在 `files` 表。
   现状是不会出现，因为 health 判定 healthy 挡掉了 backfill。

### 清理

```bash
sudo rm -rf /Applications/ZZTestProbe.app
# 再跑一遍 B 的轮询，验证 delete 链路（handleItemUnlinked, app-provider.ts:3007）
```

---

## 7. 与既有 digest 的关系

- **A-M6**（`app-scanner.ts:76` forceRefresh 被在飞扫描吞掉）：本链路无关，只影响
  backfill / full-sync 撞车。降级为"批 C 顺手修"。
- **A-M7**（mdfind 单点，无 FS 兜底）：本次实测 mdfind 工作正常（330 命中）。但它和
  #2 是同一类病——**发现层失败时没有降级路径**。F1 修的是单条路径的重试，A-M7 修的是
  整个发现层的降级，建议同批。
- **A-M8**（watch roots 缺 `/System/Applications` 与 CoreServices）：确认仍然成立
  （`app-scanner.ts:39` 只有 `/Applications` 与 `~/Applications`）。但这两个目录在
  非越狱的 macOS 上基本不会有用户级变更，优先级低于 F1–F4。
- **F-M5**（watch 深度 5 vs scan 深度 24）：确认仍然成立，见 §3。
- **新增（本次）**：`last_indexed_at` app 侧从不写入（F5）；健康检查无文件系统口径（F4）；
  全链路无时间窗合并（F2）；索引期 / 搜索期两套独立的 app 过滤器口径未统一（§1.4）。
