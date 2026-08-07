# Search & Cross-Platform Audit Backlog

> 定位：本任务是 **搜索系统 + 跨平台架构** 的最高层审计报告与问题 backlog。
> 每条发现是一个可独立验证的 TODO；具体修复以子任务承接。
> 生成日期：2026-07-13 · 分支：`TalexDreamSoul/optimization-integration`
> 方法：4 路并行 Explore 深潜（搜索引擎核心 / 文件索引子系统 / 跨平台搜索后端 / 跨平台应用架构）+ 主 agent 交叉验证。
> 关联审计：`docs/engineering/reports/optimization-dry-run-2026-07-11/`（扫 3,664 文件 / 74 万行，69 条发现）。

---

## 背景：本分支在做什么

`optimization-integration` 是一次**证据驱动的巨石拆分 + 跨平台适配统一**重构。核心文件已瘦身但**拆分只完成一半**：

| 文件                     | master | 现在 | 已拆出                                                              |
| ------------------------ | ------ | ---- | ------------------------------------------------------------------- |
| `app-provider.ts`        | 4007   | 3598 | index-maintenance / record-sync / managed-entry                     |
| `file-provider.ts`       | 4045   | 3059 | asset-service / search-result-service                               |
| `search-core.ts`         | 2795   | 1880 | query-orchestrator / usage-service / provider-health / event-router |
| `everything-provider.ts` | 2612   | 1854 | backend-service / install-service / parser                          |
| `app-launcher.ts`        | 343    | 108  | app-launch-adapter（审计 OS-02 建议已落地）                         |

跨平台核心抽象是 `withOSAdapter<R,T>`（`packages/utils/electron/env-tool.ts:79`），但采用度低：仅 6 文件 / 11 调用点，主进程仍有 141 处 / 40+ 文件裸用 `process.platform`（其中很多是合法 backend boundary，非债务）。

---

## 架构速览（供后续任务定位）

**搜索引擎**：读写双抽象——搜索时 `ISearchProvider`（PULL，查 FTS5/bm25）/ 索引时 `IndexedSource`（后台 scan/watch/reconcile 写 SQLite）。分层搜索：Fast 层 80ms 保首帧、Deferred 层延后 50ms。`base`→`full` 二段富化。

**文件索引**：`file-provider.ts` 单例编排 ~25 service + 6 worker。三段式（cleanup → full-scan → reconciliation）+ 独立增量队列，`isInitializing` 单飞防冲突。**单写者** search-index-worker 消灭 SQLITE_BUSY，AIMD 自适应批调度。

**跨平台成熟度不对称**：

| 功能     | Windows                              | macOS                | Linux                                 |
| -------- | ------------------------------------ | -------------------- | ------------------------------------- |
| 文件搜索 | Everything 三级回退+自动安装+自愈 ✅ | Spotlight mdfind ✅  | locate/tracker/baloo，缺失时无感知 ⚠️ |
| 应用扫描 | 5 源并行（重依赖 PowerShell）✅      | mdfind+plist+mdls ✅ | 仅 .desktop（139 行）⚠️               |
| OCR      | WinRT ✅                             | Apple Vision ✅      | stub 未实现 ❌                        |
| 截图     | Rust xcap 三平台统一，CI 构建链已验证；已签名打包运行证据待补 | 同左                 | 同左                                  |
| 更新安装 | msiexec/NSIS ✅                      | .app 替换脚本 ✅     | 仅 shell.openPath（打开≠安装）❌      |

---

## TODO Backlog（按严重度分级）

> 图例：🔴 已证实缺陷 · 🟠 高危工程风险 · 🟡 中危架构债 · 🟢 低危清理
> 勾选规则：修复合入并验证后打勾；标注承接子任务。

### 🔴 已证实缺陷（代码级验证过）

- [x] **B1 — 语义搜索接而未用** ✅ 已修（`07-13-fix-ranking-dead-features`，方向=延迟召回二段推送）
  - 位置：`addon/files/services/file-provider-search-result-service.ts:280`（`semanticScore: 0` 写死）、`addon/files/file-provider.ts:3008`（`scheduleSemanticEnrichment` fire-and-forget，结果不 await/不合并）
  - 现象：`semanticSearch` 唯一副作用是暖 30min query-embedding 缓存；其余纯烧 CPU（最多 1000 行 cosine 扫描），finalScore 公式无语义项 → 语义相关文件永不因语义进排序。
  - 交付：移除 fire-and-forget 浪费；新增 `FileProvider.semanticRecall` + search-core `scheduleDeferredSemanticRecall`，首帧后异步召回关键词/FTS 漏掉的语义相关文件，经既有会话推送合并追加，写入真实 `semanticScore`。
  - **约束carve-out**：渲染端 `search.update` 合并为 append-only（`mergeRenderedItems`）且 `useSearch.ts`/`CoreBox.vue` 为受保护用户改动，故延迟 pass **无法重排已渲染项**，仅能召回追加。"重排已渲染项"另记入下方 backlog。

- [x] **B2 — 补全权重被绕过** ✅ 已修（`07-13-fix-ranking-dead-features`）
  - 位置：`search-engine/query-completion-service.ts:191`（写 `item.scoring.match *= boost`）vs `search-engine/sort/tuff-sorter.ts:254`（排序用 `calculateMatchScore` 重算，只读 `scoring.recency/frequency`，**不读 `scoring.match` 或 `meta.completion`**）
  - 现象：`scoring.match` 与 `meta.completion` 在搜索引擎/渲染端零消费者 → 补全学习对最终排序**零效果**。
  - 交付：sorter 新增 `getCompletionBoostFactor` 消费 `meta.completion`（有界 ≤+50% match 乘子）；移除死写入 `scoring.match`；+2 回归测试。

- [x] **B3 — Usage 统计周期回放污染排序** ✅ 已修（`07-16-fix-usage-statistics-double-counting`）
  - 位置：`search-engine/usage-summary-service.ts` 旧 `summarizeUsageLogs()`、`search-engine/usage-stats-queue.ts`、`db/schema.ts` 的 `usage_logs.source` / `item_usage_stats(source_id,item_id)`。
  - 根因：日志只存 source type，旧周期汇总却把它当 provider id 并重复加计，形成 phantom rows；id=type 时直接放大原行。
  - 交付：queue/fallback 单写者；`0027_usage_stats_single_writer_repair.sql` 保守删除明确 phantom row、下调可证明过计；不猜 provider id、不全量重置。
  - 验证：3 files / 4 tests、scoped ESLint、CoreApp node typecheck、migration readiness 与临时数据库 execute→flush→maintenance smoke passed。

- [x] **B4 — 文件噪声过滤链路分裂** ✅ 已修（`07-16-unify-file-filtering-service`）
  - 位置：`packages/utils/common/file-scan-utils.ts` 全量扫描、`addon/files/file-provider.ts` 增量/提交、`native-file-search-provider.ts`、`everything-provider.ts` 与 `search-gather.ts`。
  - 根因：全量扫描、增量白名单和原生 Provider 各自维护过滤判断；Spotlight 仅过滤 `.app`，`.itdb` / `.tvdb` / `.localized` 可进入索引或首屏结果，且 Provider 自觉调用不是可靠边界。
  - 交付：新增 Worker-safe `FileFilterService` 单一规则源；扫描/Provider 提前过滤节省 I/O，索引提交与搜索聚合提交强制复核；旧索引、语义召回、推荐和缓存出站统一过滤；保留 `.zip` 与常规图片。
  - 验证：共享与 CoreApp 6 files / 83 tests、CoreApp node typecheck、两包 scoped ESLint、代表路径 smoke passed。

- [x] **B5 — context isolation 下 MessagePort 搜索结果丢失** ✅ 已修（`07-20-fix-search-messageport-delivery`）
  - 位置：`packages/utils/transport/port-handoff.ts:93`、`renderer-transport.ts:496`、`plugin-transport.ts:232`、`apps/core-app/src/preload/index.ts:31`、`plugin-view.ts:46`。
  - 根因：main 将端口交给 preload isolated world，旧 renderer/plugin transport 却依赖 contextBridge 暴露的普通 IPC 回调读取 `event.ports[0]`；main 收到确认后走 port-only，而 main world 没有可靠端口所有者。
  - 交付：共享 marker/guard/installer/subscriber 通过同窗口 `postMessage` transfer list 转交真实端口；两个 preload 与两个 transport 共用协议，保留 channel fallback，并清理失败、超时、销毁端口。
  - 构建约束：Electron sandbox preload 必须为 standalone CJS；`standaloneSandboxedPreloadPlugin` 消除 multi-entry Rollup shared-chunk `preloadRequire` 失败。
  - 验证：utils 4 files / 11 tests（真实 transfer、无 `openPort()` mock）、CoreBox 2 files / 23 tests、node/web typecheck、mac production build，以及默认 allowlist packaged Electron 中可见的已索引 TextEdit 结果。

- [x] **B6 — macOS 应用图标 unsupported enum / 资源字节边界** ✅ 已修（`07-24-harden-app-icon-self-healing`）
  - 旧结论失效：问题不是 Darwin 27 本身。commit `48be2d946` 将可工作的 `app.getFileIcon(..., { size: 'normal' })` 改为 macOS 不支持的 `large`；`c0e6045d7` 随后把 cache-miss hydration 移到后台，批量放大触发频率。
  - 崩溃证据：Electron 41.10.2 的 Chromium Mac IconLoader 在 ThreadPool 只处理 SMALL/NORMAL，unsupported enum 命中 `NOTREACHED()`，与三份 `ThreadPoolForegroundWorker + NSImage + EXC_BREAKPOINT/SIGTRAP` `.ips` 一致。最后一条 `SQLITE_BUSY` 是独立的已捕获缺陷，不是硬崩根因。
  - 架构修复：Darwin `.icns -> sips` 后使用 tuff-native AppKit main-thread helper；公开 Promise 先 `setImmediate` 让出事件循环，私有同步 N-API 断言主线程，在 `@autoreleasepool` 内调用 `NSWorkspace iconForFile:` 并原子写 PNG。completion 仅返回 path/尺寸；图片字节不经过 Node worker、IPC、MessagePort 或 preload。
  - 协议约束：`tfile` 是新本地资源的规范 data plane，并在 allowlist 后用 `bypassCustomProtocolHandlers` 流式转发 built-in `file:`；`atom` 仅 legacy；当前无 handler 的 `stream` scheme 不得成为隐式 blob tunnel。typed transport stream 只承载有界结构化 control/chunk metadata。
  - 验收：隔离 Electron profile 实际水合 227 icons 并存活 2m29s，无新 `.ips`；5 个独立 native 进程各处理 125 个真实 app（625/625）；descriptor 非 Buffer；107 focused tests、native build、node typecheck、scoped ESLint 通过；icon-only hydration 的 search-index delta=0。

### 🟠 高危工程风险

- [ ] **R1 — Rust 截图模块已接入 CI/安装构建链** ⚠️ **契约测试已接入，发布路径未接入**（2026-08-07 复验，原判「已修 / #321 已关闭」不成立——[#321](https://github.com/talex-touch/tuff/issues/321) 仍 open）
  - 修复：`native-protocol.yml` 在 macOS/Windows/Linux 安装 xcap 所需 Linux build deps，构建 ordinary screenshot addon，执行真实 dlopen/export contracts；随后构建 deterministic addon 跑 `.node -> NapiCarrier -> NativeTransport` integration，并在结束前恢复 ordinary addon。
  - 包合同：`@talex-touch/tuff-native.files` 显式包含 macOS/AX/stream/xcap production backend 源码与 `build/Release/tuff_native_screenshot.node`，继续排除 fixture、contract test backend 和 Cargo target。
  - 证据：本地 ordinary/deterministic 双构建、普通 addon strict macOS integration、31/31 Node contracts 和 `pnpm pack --dry-run` 通过；tarball 包含 addon 与全部 production backend，未包含 `test_backend.rs`/contract fixtures/target。
  - 边界：Windows/Linux authoritative native build 由新增 CI matrix 执行；signed Electron packaged runtime evidence 仍由 `07-29-screenshot-packaged-evidence` 独立承接。
  - ⚠️ **发布路径未接入**（2026-08-07 复验）：`build:screenshot` 的 3 处调用全在 `native-protocol.yml`——那是**契约测试**工作流，不产出发布物。真正的 `build-and-release.yml` 对 `screenshot` / `audio` / `cargo` / `rust` **零命中**（正对照：`packages/tuff-native` 命中 2 次），它在该包里只做 Windows 限定的 Everything 自检与 `pnpm run rebuild`（node-gyp）。且 `apps/core-app/scripts/` 里查不到 `tuff_native_screenshot`，preflight/afterPack 都不要求它。发布产物大概率不含该 addon。跟踪：[#321](https://github.com/talex-touch/tuff/issues/321)。
  - ⚠️ **同型风险仍在 audio addon 上**（2026-08-07 复验）：`packages/tuff-native/native-audio/` 存在且有 `build:audio` 脚本，但 `.github/workflows/` 里**没有任何 workflow 构建或加载它**（`native-protocol.yml` 对 audio 零提及）。也就是说截图模块修掉的那个「手工 Cargo 构建、CI 无验证」缺口，在 audio 上原样存在。跟踪：[#322](https://github.com/talex-touch/tuff/issues/322)。

- [ ] **R2 — macOS 发行架构范围未决**
  - 位置：`electron-builder.yml:100-119` 当前仅产出 darwin/arm64；下载与 OTA 选择必须与该架构策略一致。
  - 风险：未明确支持范围会让 Intel 用户收到不兼容资产，或迫使发行链临时引入未经签名、公证和真机验证的 x64/Universal 变体。**需产品决策**：保持 arm64-only 并显式告知，或新增完整 x64/Universal 发布矩阵。
  - 2026-07-21 进展：Developer ID 签名、App Store Connect API-key 公证、本机/GitHub Secrets 与 ZIP 信任验证已闭环；OTA 已移除 `electron-updater` 双路径。R2 仍保持 open：架构策略、发布清单、下载选择和真机证据尚未收敛。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。
  - 2026-08-07 复验：`electron-updater` 已不在任何 `package.json` 中声明，双路径确已移除——本条**只剩 Intel/Universal 范围这个产品决策**，不再含 artifact 冲突成分。#311 仍 open。

- [ ] **R3 — 大目录扫描/对账内存峰值** ⚠️ 结构问题已消除，**只剩实测未做**（2026-08-07 复验）
  - 原描述的三层物化**均已不成立**：worker 逐批 post 并等 `batchAckWaiters` 背压；client 的累积版 `scan()` 已删除（[#1091](https://github.com/talex-touch/tuff/pull/1091)），流水线只用 `scanBatches()`；reconciliation 改为消费 `AsyncIterable`、`reconcile()` 逐批调用、`getDbFilesByPaths(diskPaths)` 按批限定路径，行数统计改为 `countRootRows` 普查而非物化集合。
  - 仍开的部分：百万级 fixture 的峰值内存实测，以及「上界由 batch size 而非目录基数决定」的证明。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。

### 🟡 中危架构债

- [x] **R4 — `search-core.ts` 的全局巨型搜索会话状态** ✅ 已修（`07-09-scope-search-sessions-and-streams`）
  - 交付：新增 `SearchSessionRegistry` 与请求级 caller/activation/cache/sink/controller/trace 所有权；`SearchEngineCore.startSearch()` 政策化为每请求 fresh session，移除 `currentGatherController`、`latestSessionId`、current-window delivery 与渲染端全局 update/end 监听；CoreBox/ApplicationIndex/AI 改用 typed stream 或 collecting sink。并发 UI/AI、双 sender、真实 cache hit、stale/foreign cancel、early update、destroy 与 no-results session 隔离均有 focused 回归。

- [ ] **R5 — 过度分层反噬**
  - 位置：`addon/files/file-provider.ts:523-870`（347 行 DI 接线板）；30+ service 中大量薄适配层；`search-engine/indexing-write-*.ts`（3-9 行 re-export）vs `packages/utils/search/indexing-write-*.ts`（500+ 行实现）并存，grep 极易读错文件。
  - 2026-07-18 进展：将 worker 内嵌的文件持久化拆到 `SqliteFileIndexPersistenceRepository`，worker 只保留消息分派；repository 用 `BEGIN IMMEDIATE` 事务内父行校验跳过已删除 fileId，并为竞态补真实 SQLite 回归。R5 仍保持 open：FileProvider DI 接线板、薄 service/re-export 并存问题尚未整体收敛。

- [ ] **R6 — 平台分支散落、`withOSAdapter` 采用不足**
  - 位置：main 目录 141 处 `process.platform`（`touch-window.ts:83`、`update-system.ts:1445`、`capability-adapter.ts` 通篇内联三分支…），`withOSAdapter` 几乎只有 startup-guard 用。**注意**：审计 OS-04/OS-05 已判定并非全部是 bypass，迁移需逐项复核。

- [x] **R7 — `getStatus` 轮询架空 worker 空闲关闭** ✅ 已修（[#345](https://github.com/talex-touch/tuff/issues/345) / [PR #1089](https://github.com/talex-touch/tuff/pull/1089)，2026-08-07）
  - 根因比原描述窄：`IdleWorkerShutdownController.schedule()` 本就幂等，真正让截止时间可移动的**只有 `getStatus()` 开头那一次 `cancel()`**。移除后状态读取变为纯观察——不创建 worker、不移动截止时间；metrics 在途仍会推迟终止，但走 `shouldShutdown()` 读 `metricsPending`，而不是重置时钟。fake-timer 测试覆盖高频轮询/活跃任务/已终止客户端/shutdown 四类。
  - **未做**：退出时的有界 drain。`shutdown()` 仍是取消而非排空（provider 在更上层已 `drainIndexedSourceMutations('shutdown')`），若要改成有界排空需单开。

- [ ] **R8 — Linux 全面二等公民**
  - 应用扫描 139 行 / 图标暴力 360 次 stat 无缓存（`addon/apps/linux.ts:15`）/ 无 OCR / 更新只 openPath / Everything 无对等 / 无验收框架（仅 windows-acceptance-\*）。

- [ ] **R9 — SQLite 单写瓶颈缓解逻辑分散 5+ 处**
  - `dbWriteScheduler` + `withSqliteRetry` + worker `directMode` + `AdaptiveBatchScheduler` + `UsageStatsQueue` 采样丢弃；同一痛点各自处理，新人难判断某次写走哪条路。
  - 2026-07-18 进展：文件持久化统一复用 `withSqliteRetry`，flush runtime 复用共享 retry decision/backoff，并对重复失败日志做节流；worker error 传输保留 `cause/code/rawCode`，避免 SQLite 原因丢失。
  - 2026-07-21 进展（`07-20-unify-operational-error-reporting`）：新增统一 retry exhaustion observer 和 busy/queue/writer/WAL/FD 健康快照；App Provider 删除私有 busy retrier，已确认 add/update/delete、backfill、mdls、rebuild mutation 进入共享 scheduler/retry，file row + extensions 在生产 adapter 支持时同 transaction；文件重建使用 writer admission barrier，并完成真实 `BEGIN IMMEDIATE` 失败→脱敏上报→释放锁恢复验收。
  - 2026-07-26 复核：移除 icon-only FTS upsert 后，隔离首启仍出现 `app-provider.icon-hydrate-batch` / `Storage:Polling database is locked`。这不再造成图标硬崩，filesystem identity cache 仍成功生成 227 icons，但证明共享 `database.db` 的 writer 争用尚未闭环；后续必须单独验证 search split 默认开启与 statement-lifecycle batch，不能靠增加 retry/busy timeout。
  - 2026-08-03 深度运行复核：canonical macOS arm64 包在隔离 profile 运行 50+ 分钟、完成 145 次搜索并等待 Worker 空闲关闭后，主进程仍有 775 个 numeric FDs，其中 294 个指向 `database.db`、36 个指向 `database-aux.db`，最高 FD 1032，超过 `database/index.ts` 的 `DB_OPEN_FD_WARN_THRESHOLD = 256`。15 秒四次 `lsof` 采样保持平台且搜索无失败，本轮确认的是高句柄压力，不直接定性为线性泄漏；后续 R9 必须把 libSQL client/session owner registry 与 statement 生命周期纳入验收。
  - 2026-08-04 修复闭环证据：同一 146-app fresh-profile mdls 运行后，provider-level reconcile batching 将 `database.db` numeric FDs 从 148 降到 11；自然 mdls tick、搜索压力与隐藏回收后，全进程 numeric FDs 为 167，低于 `DB_OPEN_FD_WARN_THRESHOLD = 256`，且未使用 forced GC。CoreApp 保留 Windows/Linux 的 Chokidar 4 后端，仅在 macOS 选择 Chokidar 3.6 package alias 的原生 FSEvents 后端；canonical packaged 启动无模块解析错误，应用目录树仅保留 4 个 watcher descriptors。
  - R9 仍保持 open：App Provider 尚未迁入 search-index worker typed persistence port，`db/utils.ts` policy-free mutations、libSQL client/session owner registry 和 aux compatibility mirror 退场仍待后续收敛。
  - Remaining R9 search-index split write migration is owned by `07-28-migrate-search-index-split-write-paths`: the flag remains default-off until every 2d/2e writer and provider-before-`searchIndexWriter` readiness ordering have focused plus flag-on app evidence.

### 🟢 低危清理

- [x] **C1 — 死依赖** ✅ 已修（2026-08-07）：`mathjs` 已从两处 manifest、Vite externalize 例外与 electron-builder 排除项一并移除（[#338](https://github.com/talex-touch/tuff/issues/338) / [PR #1088](https://github.com/talex-touch/tuff/pull/1088)）；`tesseract.js` 在依赖树里已不存在，其残留的 build-allowlist 条目随 [#347](https://github.com/talex-touch/tuff/issues/347) / [PR #1084](https://github.com/talex-touch/tuff/pull/1084) 一并清除。
  - **顺带纠正原判断**：`electron-builder.yml` 那段注释称「只把约 2MB 的 mathjs/number 子集打进 bundle」——实测**从未发生**。移除前后 `out/main/index.js` 只差 **21 字节**（就是被内联 package.json 里的那串依赖声明），bundle 内 `createBigNumberClass` / `decimal.js` / `typed-function` 命中数全为 0。
- [x] **C2 — `expectedDuration` 死配置** ✅ 已修（[#333](https://github.com/talex-touch/tuff/issues/333) / [PR #1085](https://github.com/talex-touch/tuff/pull/1085)，2026-08-07）：10 处声明（9 provider + 1 插件适配器）、`ISearchProvider` 字段及其文档、设计文档引用全部移除。兄弟字段 `priority` 确有消费者（`search-gather.ts:364` 按 `p.priority === 'fast'` 分层），未动。
- [ ] **C3 — `searchCache` 收益存疑**（2026-08-07 复验，行号更新 + 部分前提修正）：定义在 `search-core.ts:186`，常量在 `:105-112`（TTL 5s / MAX 100 / ITEM 200），唯一读取点 `:887`。
  - **原判断「命中率天然低」未获证实**：渲染层只发 `{ text, inputs }`（`useSearch.ts:83`），不含时间戳或请求 id，相同查询**能**产生相同键。正确性面也比预想好——命中走 `materializeCachedSearchResult(entry, sessionId)` 用**新** sessionId，且按 `searchIndexCommitHub` 的 revision 失效。
  - **真正的问题**：`buildSearchCacheKey`（`search-core-utils.ts:133`）把 `TuffQuery` 上除 `text`/`inputs` 外的**所有**字段收进 `extras`，而**没有任何测试断言「相同查询 → 相同键」**（现有三条只断言不同输入键不同）。将来任何人往 `TuffQuery` 加一个每请求都变的字段，命中率会**静默归零**而套件全绿。跟踪：[#346](https://github.com/talex-touch/tuff/issues/346)（保留/移除阈值仍待拍板）。
- [x] **C4 — 死代码** ✅ 已修（[#342](https://github.com/talex-touch/tuff/issues/342) / [PR #1083](https://github.com/talex-touch/tuff/pull/1083)，2026-08-07）：两个 handler 连同只为它们存在的 `enqueueIncrementalUpdate` 依赖（声明/字段/构造赋值/上游传入的闭包）与三个类型 import 一并删除。确认路径：`file-provider.ts:2442` 传的是 `subscribeToFileSystemEvents: () => undefined`，真实增量在 `indexed-source-event-router.ts:93` 绑的是另一套命名的 `handleFileAddedOrChanged`。
- [ ] **C5 — Windows OCR COM apartment**：`winrt_ocr.cpp:157` 每次 init 不 uninit → 线程复用下 `RPC_E_CHANGED_MODE` 风险。
- [ ] **C6 — Windows 全链路重依赖 PowerShell**：应用扫描 4 源 + Everything 装 PATH 全经 `powershell -Command`，ExecutionPolicy 受限时大面积降级且扫描侧无降级 UI。

---

## 子任务映射

| 子任务                                         | 覆盖                                                                                                      | 状态                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `07-13-fix-ranking-dead-features`              | B1 + B2                                                                                                   | ✅ done（typecheck 0 err，46 相关用例通过）                       |
| `07-16-fix-usage-statistics-double-counting`   | B3                                                                                                        | ✅ done（单写者 + 保守迁移，4 tests + smoke）                     |
| `07-16-unify-file-filtering-service`           | B4                                                                                                        | ✅ done（统一策略 + 索引/发布双门，83 tests + typecheck + smoke） |
| `07-28-migrate-search-index-split-write-paths` | R9 remaining provider/file/embedding write migration; default-off, readiness-order, and flag-on app gates | planning                                                          |
| (待建)                                         | R1 打包验证 / R2 mac 签名 / R3 流式落库 …                                                                 | backlog                                                           |

### 遗留 carve-out（B1 派生，未做）

- [ ] **延迟语义"重排"已渲染项**：当前只做召回追加。要让语义分改变已渲染项顺序，需改渲染端 `useSearch.ts` 合并语义或加 replace-mid-session 事件——属受保护用户改动，暂缓。

## 验收标准

- [ ] 每条 🔴/🟠 发现要么修复并验证、要么转化为有明确 owner 的子任务。
- [ ] 🟡/🟢 条目保留为可追踪 backlog，不要求本轮清空。
- [ ] 报告随代码演进更新（发现失效即勾除并注明原因）。
