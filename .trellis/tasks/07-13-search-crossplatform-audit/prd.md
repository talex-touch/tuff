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

- [ ] **B1 — 语义搜索接而未用** 🔴 读侧已修，写侧仍然缺失 → 生产中仍是空操作（复核 2026-09-18）
  - 位置：`addon/files/services/file-provider-search-result-service.ts:320-327`（主路径 `semanticScore: 0` 仍写死）、`addon/files/embedding-service.ts:264`（`if (rows.length === 0) return []` 每次早退）
  - 已交付（读侧，`cbbd6ba7a`）：`FileProvider.semanticRecall` + search-core `scheduleDeferredSemanticRecall`（`search-core.ts:875-912`，调用点 `:1413-1420`），首帧后异步召回并写入真实 `semanticScore`。这部分确实存在且可用。
  - **未交付（写侧）**：`embeddings` 表在生产中恒为空，因此上面整条读链恒为空操作。
    - `EmbeddingService.indexFile/indexFiles/removeFiles`（`embedding-service.ts:123-229`）零生产调用点；唯一旧调用点在 `AD124A650` 随 `extractContentForFile` 迁入 worker 时被删除，无替代——worker 线程访问不到主进程 tuffIntelligence SDK。
    - 唯一的解析器式写入 `file-index-persistence-repository.ts:381` 守卫 `if (fileUpdate.embeddings && …)` 永不为真：仓库唯一注册的 parser `text-parser.ts` 四条 return 分支（`:66/:78/:90/:102`）都不产出 `embeddings`，故 `file-index-worker.ts:307-308` 的 `embeddingStatus` 恒为 `'pending'`。
  - **运行时取证**（2026-09-18，本机 4 个真实库）：`embeddings` 表 **0 行**；`files` 表合计 **155,716 行**，`embedding_status` 仅有 `none`/`pending`，**没有任何一行是 `completed`**。
  - 修复面（最小）：在主进程 persist 钩子补回向量生成——`file-provider-index-flush-executor-service.ts:88-93` 或 `file-provider-index-runtime-service.ts:39-43`；不能放回 worker（拿不到 SDK）。
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
  - 2026-08-13 回归闭环：`v2.4.14-beta.7` 的安全白名单收窄只保留应用扫描根、`userData` 与 temp，却漏掉 `IconService` 当前写入的 `app.getPath('cache')/app-icons`；文件存在且映射为 `tfile`，渲染请求仍统一返回 403，最终全部退化成 `EmptyAppPlaceholder.svg`。修复仅放行精确 `app-icons` 子目录，未重新开放 home/cache；策略与协议 21 个 focused tests、node/web typecheck 通过，隔离 CoreBox 7/7 图标均为 256px 且空占位数为 0。

- [x] **B7 — 剪贴板原图无界读取与 Base64 放大** ✅ 已修（`09-01-classic-utility-ai-plugin-suite`）
  - 位置：`search-engine/utils/resolve-clipboard-inputs.ts` 原先对剪贴板图片路径直接 `readFile()`，搜索解析与插件 execute 又会重复进入 resolver；文件大小在读入及 Base64 膨胀前没有上限。
  - 修复：改为 `O_NOFOLLOW` 打开、句柄 `fstat`、32 MiB 预分配上限、1 MiB 分块读取及读前/读后 dev/ino/size/mtime 复核；超限或漂移保留有界 preview，不物化原图。图片插件随后只接收 activation-local opaque token，Sharp 在可终止 Worker 内执行。
  - 验证：边界内/超限 sparse file 回归、图片 capability/renderer 测试、Node/Web typecheck、Electron production build 与独立 plugin-host smoke。

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
  - 2026-08-07 **已实测**（`apps/core-app/scripts/file-scan-memory-benchmark.mjs`，合成树 25k/100k/400k × batch 100/500/2000）：`retained` 全部 ≈ 0，无累积；**40 万文件在 `--max-old-space-size=64` 下完整跑完**，峰值堆 33.5 MiB、retained −0.8 MiB。取消在 10 批后立即生效（112ms 返回）。worker 侧在发下一批前 `await acknowledged`，在途未确认批次恒为 1。
  - ⚠️ **一处需要写清楚的观测**：无堆压力时峰值堆随文件数增长（batch=500 下 13.9 → 33.4 → 58.7 MiB），且**三种批大小在同一文件数下几乎相同**——所以「峰值由 batch size 决定」这句话按字面不成立。真实机制是 V8 有余量时惰性扩堆；施压后同一工作量只用三分之一空间即可完成，说明**上界是真的、只是不由 batch size 表达**。
  - 仍开的部分：reconciliation 分页与持久化落库的同类实测（本基准只覆盖 traversal）。跟踪：[#318](https://github.com/talex-touch/tuff/issues/318) / [#480](https://github.com/talex-touch/tuff/issues/480)。

### 🟡 中危架构债

- [x] **R4 — `search-core.ts` 的全局巨型搜索会话状态** ✅ 已修（`07-09-scope-search-sessions-and-streams`）
  - 交付：新增 `SearchSessionRegistry` 与请求级 caller/activation/cache/sink/controller/trace 所有权；`SearchEngineCore.startSearch()` 政策化为每请求 fresh session，移除 `currentGatherController`、`latestSessionId`、current-window delivery 与渲染端全局 update/end 监听；CoreBox/ApplicationIndex/AI 改用 typed stream 或 collecting sink。并发 UI/AI、双 sender、真实 cache hit、stale/foreign cancel、early update、destroy 与 no-results session 隔离均有 focused 回归。

- [ ] **R5 — 过度分层反噬**
  - 位置：`addon/files/file-provider.ts:523-870`（347 行 DI 接线板）；30+ service 中大量薄适配层；`search-engine/indexing-write-*.ts`（3-9 行 re-export）vs `packages/utils/search/indexing-write-*.ts`（500+ 行实现）并存，grep 极易读错文件。
  - 2026-07-18 进展：将 worker 内嵌的文件持久化拆到 `SqliteFileIndexPersistenceRepository`，worker 只保留消息分派；repository 用 `BEGIN IMMEDIATE` 事务内父行校验跳过已删除 fileId，并为竞态补真实 SQLite 回归。R5 仍保持 open：FileProvider DI 接线板、薄 service/re-export 并存问题尚未整体收敛。

- [ ] **R6 — 平台分支散落、`withOSAdapter` 采用不足**
  - 位置：main 目录 141 处 `process.platform`（`touch-window.ts:83`、`update-system.ts:1445`、`capability-adapter.ts` 通篇内联三分支…），`withOSAdapter` 几乎只有 startup-guard 用。**注意**：审计 OS-04/OS-05 已判定并非全部是 bypass，迁移需逐项复核。
  - 2026-08-07 **已完成归类**（[#349](https://github.com/talex-touch/tuff/issues/349)，清单见 `docs/engineering/platform-branch-inventory.md`）：现为 **296 处**，但**只有 209 处比较 + 2 个 switch 是真分支**；53 处是 `platform: process.platform` 数据传递、32 处是模板/日志。**把 296 当迁移目标会高估 41%**；11 个文件的全部出现都属数据传递（`screenshot-service.ts` 独占 8 处），`plugin-module.ts` 的 14 处**全部**如此——它出现在「平台分支」排行第六是误读。
  - 归类：A 原生/后端边界（保持显式，如 Windows 独有的 `everything-provider.ts`）· B 策略/能力三路判定（`platform-permission-service.ts` 25 处为首选候选）· C adapter 层自身（`capability-adapter.ts`，位置正确）· D 偶发重复（同一决策写多遍，如 `everything-provider.ts:325-330` 六行各自重算 `=== 'win32'`）· E 数据传递（非分支）。
  - ⚠️ **`withOSAdapter` 目前不是合格的迁移目标**：它返回 `T | undefined`（`packages/utils/electron/env-tool.ts:79`），**没有类型化的 supported/degraded/unsupported，也没有 reason/recovery 码**，而 #349 验收条 4 正要求这些。先补契约再迁移，否则要迁两次。`withOSAdapter` 现有 5 个采用点。

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
  - Remaining R9 search-index split write migration is owned by `07-28-migrate-search-index-split-write-paths`: the split has defaulted on since `cd39bdbf6`; `=0` is the emergency rollback. Every remaining 2d/2e writer and provider-before-`searchIndexWriter` readiness assertion still needs focused verification and isolated-profile runtime evidence.

- [ ] **R10 — indexing 期间主进程同步 SQLite 语句与每事件 diagnostics 扇出**
  - 2026-09-21 现场证据（dev 会话 `tuff-dev/logs/D.2026-09-21.log`）：fullScan 期间 `[Perf:EventLoop] Event loop lag` 连续 0.4–1.3s，并使一次 `storage:app:save` 的 IPC 请求超时——配置未落盘，UI 显示「存储服务返回失败（版本 71）」，而主进程日志里没有任何 storage 侧失败、DB revision 停在 71。
  - **归因修正（重要）**：日志里的 `context=FileProvider.fullScan 978s` 是 `utils/perf-monitor.ts:864-866` 取「存活最久的 perf context」当标签，**不是阻塞时长**；真实阻塞量是同一行的 `lagMs`。目录遍历与 stat 全程在 worker 线程（`addon/files/workers/file-scan-worker-client.ts:173-174`、`file-scan-worker.ts:110-127`），不占主线程。
  - 主进程同步语句三处（libSQL local binding 在调用线程同步执行，见 `modules/database/index.ts:48-56`；主库 busy_timeout 2s）：
    1. `FileProvider.computeIndexStats()` 的 6 条 `COUNT(*)` 打在主进程持有的 6 GB 索引句柄上（`addon/files/file-provider.ts:2583-2655`，`db/utils.ts:119`），调用方包含 diagnostics IPC、`getHealth`、`getIndexedSourceEvidence`，以及**每条 FS 事件**（`indexing-runtime.ts:486-494`）。单次成本取决于 best-effort perf index 是否建成（仓库自测：无索引 8.1–11.5s / 有索引 25–27ms，见 `db/schema.ts:110-113`）。
    2. `SqliteIndexingTaskStateStore.save()`（`indexing-task-state-store.ts:79-108`，主库同步 upsert）在同一会话执行 **18,257 次**（`DbWriteScheduler` label stats）。`drop=0` 证明队列从不积压，所以 `db-write-scheduler.ts:499-514` 的 `latest_wins` per-budgetKey 清扫在此**没有可合并对象**——修法是降低入队频率，不是加合并。
    3. 每批一次 `SELECT … WHERE path IN (…)`（`file-provider.ts:1157-1185`）。
  - 吞吐正反馈：`upsertBatchScheduler` 被显式压到 `initialSize 5 / maxSize 20`（`file-provider.ts:409-416`，而 `AdaptiveBatchScheduler` 默认 maxSize 80）→ 15.5 万行切成 ≥7,800 块，每块付 `appTaskGate.waitForIdle` + 两次 worker 往返 + `publishCommit` 的 reader-visibility barrier；主线程拖延又被 AIMD 当拥塞信号 → 窗口压回 minSize 2 → 块数继续上升。
  - 剩余候选修法（**每一项都需要在真实规模 profile 上做前后 A/B 才可判定**，不要凭代码阅读直接改）：
    - A ✅ **已修（2026-09-21）**：`FileProvider.getIndexStats()` 增加 1s TTL 快照（`FILE_INDEX_STATS_CACHE_MS`，与仓库既有 `INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS` 同值），返回值收敛到共享类型 `FileIndexStats`，所有出口返回副本以免调用方互相污染。定案数据：同一连接内 8 条 COUNT 合计 50 ms（单条 ~6 ms，13.7k 行、覆盖索引命中），而**新建连接**每次约 120 ms —— 所以成本在长连接下约 36 ms/次；配合 `indexing-runtime.ts:486-494` 的「每条 FS watch 事件一次 diagnostics」，一次事件风暴就等于一次扫描风暴。TTL 把调用频率压到 1Hz，单次成本不变。这也覆盖了 B 想解决的一半（降低单位时间内的调用次数），B 若仍要做只是为了减少调用**次数**本身。
    - B ✅ **watch 准入与完整诊断解耦（2026-09-25）**：显式 `sourceId` 的 watch 仅查询目标源的实时 health/roots；无 sourceId 时仍查询所有源的 health/roots；两条路均不再读取 evidence/progress。保留既有 1s 统计缓存、任务历史 hydration 和 root policy 更新；不缓存权限或 enabled 状态。完整 `getDiagnostics()` 的管理台契约不变。相关回归以修改前源码作控制，会因无关/可选诊断被调用而失败；隔离 Electron 中实际新增文件约 1.02s 发布到索引，同时人为挂起的无关 health 与目标 evidence/progress 调用次数为 0。
    - C 重配 `upsertBatchScheduler` 大小、把 `waitForIdle` 提到 worker 批粒度（影响首帧搜索体验与 AIMD 测试）——未做：需要一次完整 fullScan 的前后对比，且 `maxSize 20` 是显式压低（默认 80），改动会直接换掉时延/吞吐的取舍，应单独立项。
  - 另一条同场证据（未定位到具体生产者）：本机隔离实例在索引期间高频出现 `[DbWriteScheduler] DB write task waited 3.4–4.3s: file-icon.persist`（累计 300+ slow tasks），说明主库写 lane 在索引期同样被压满。icon 写队列上限 24（`FILE_ICON_WRITE_MAX_QUEUE`）值得单独复核。
  - 可观测性：给 `computeIndexStats`、`SqliteIndexingTaskStateStore.save`、`IndexingRuntime.getDiagnostics` 各包一层 `enterPerfContext(label, {mode:'blocking'})`，否则 lag 日志永远只能给出误导性的 `fullScan` 标签（本次只能靠读代码定案的原因）。
- 2026-09-22 **埋点细化已落地**：`FileProvider.computeIndexStats`、`IndexingTaskStateStore.save`、`IndexingRuntime.getDiagnostics` 及每源诊断均有 `blocking` perf context；fused file/FTS 写入记录 worker 持久化、FTS apply、worker 总耗时、IPC 往返与 visibility barrier 阶段，并仅向 diagnostics evidence 暴露数值/稳定枚举。**未改变调度与耗时策略**，R10 的性能 A/B 仍保持 open。
  - 2026-09-25 **退出链收口**：`search-core.destroy()` 在等待 session/router drain 前发出扫描取消并停止生产者，消除「watch 排队等待 scan mutation gate，但取消位于 drain 后」的等待环；所有已启动 drain 立即接拒绝处理，仍先排空再关闭 writer。实际隔离 Electron 在 scan 活跃时退出：search-core 163ms 收尾、整体约 1.92s、exit 0。首次验收暴露的开发态同步 `app.quit()` 重入与 Sentry 卸载后继续收事件也已修复；没有缩短超时、强杀 SQLite worker 或清空真实索引。
  - 2026-09-25 **最终复验（PID 25430）**：单测试根目录的 602 个文件全部完成并发布；人为挂起无关来源 health 时，真实新增文件仍在 2029ms 内发布，watch 不读取 evidence/progress。退出时仍有 1 个活动 file scan，收到 `INDEXED_SOURCE_SCAN_ABORTED`；search-core 31ms、44 个模块 1570ms、从请求退出到 quit 事件 2226ms，exit 0。该次新增错误日志为 0，无 `StorageModule not ready`、未处理 rejection、before-quit 或 DevProcessManager 强退超时。
  - **证据边界**：本轮使用全隔离数据与合成文件（前次 601 条、最终复验 602 条文件记录），未对用户的 2GB/8.7万行索引执行全量重扫 A/B；不据此宣称全部 R10 同步查询成本已消除。`blocking` perf-context 也可能包围 `await`，不能把它的墙钟存活时长当作同等长度的连续主线程阻塞。

- [x] **R11 — 读 worker 客户端失败后永久不可用** ✅ 已修（2026-09-21）
  - 症状：`SearchIndexReadWorkerClient.failWorker()` 会置 `closed = true` 且**没有任何重建路径**（客户端只在 `search-core.ts:2048` 构造一次），于是一次超时或 worker exit 之后，该会话内所有文件/应用搜索永久失败，而写侧与 commit 一直正常。运行时证据：`D.2026-09-21.log` 中 `Search index commit has degraded reader visibility` 1475 次、`retry failed` 1277 次、`recovered` 0 次，跨 06:50:43 → 07:17:10 共 26.5 分钟零恢复；`SearchIndex:Writer` 的修复重试（100/500/2000ms）因此变成纯固定开销。
  - 修复：失败只 retire 当前 worker（`this.worker = null`），下一次 `all()` 经 `ensureWorker()` 重建；`closed` 现在只由显式 `close()` 设置，仍是终结态。新增 `consecutiveFailures` / `cooldownUntil`：worker 级失败计数达 3 次进入 30s 冷却（冷却期内直接 reject，不再重建），一次成功的读把计数归零——避免「永久坏」时每次尝试都泄漏一个只能被请求关停的线程。
  - 同时补上该文件此前完全缺失的日志（`createLogger('SearchIndex').child('ReadWorker')`，只在首次失败与触发冷却那次告警），这是原故障无法从会话日志回溯的直接原因。
  - 未做（仍 open）：读 worker 侧同样无日志（`search-index-read-worker.ts`），首次失败的真实原因（15s 慢查询 / worker OOM 退出 / 确定性 SQL 错误）仍需运行时证据；`waitUntilReadable(request)` 把 request 对象按位置传进 signal 形参（本文件被静默忽略）属既有 E-L8。

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
- [ ] **C7 — CoreBox 对话搜索按每次按键全表 `instr` 扫消息**（2026-09-26 新增功能时记账）
  - 新增 `conversation-provider`（`addon/conversations/conversation-provider.ts`，`priority: 'fast'`）在**主进程同步**执行两条查询：`conversations` 标题 `instr(lower(title), ?)`，以及 join `conversation_messages` 的内容 `instr(lower(content), ?)`（`modules/conversation/conversation-store.ts:searchConversations`）。两列都没有索引，`instr` 只能全扫；查询文本按每次输入的 80ms debounce 触发一次。
  - 当前规模下不是问题：本机 dev 库实测 `conversations` 7 行 / `conversation_messages` 26 行 / 正文合计 946 字节。风险面在长历史用户：消息正文是主要成本项（助手长回答），且单字查询会让 `ORDER BY updatedAt, seq` 面对海量命中行排序。`fastLayerConcurrency` 也因该 provider 从 6 提到 7（`search-gather.ts:62`）——一旦这条查询超过 80ms 窗口，它会以 late result 到达，而不是拖慢首帧。
  - 修法（需要真实长历史 profile 的前后 A/B 才可判定，勿凭代码阅读直接改）：给 `conversation_messages.content` 建 FTS5 表或至少把内容检索限制在最近 N 个会话内；或把该 provider 移到 deferred 层。

---

## 子任务映射

| 子任务                                         | 覆盖                                                                                                      | 状态                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `07-13-fix-ranking-dead-features`              | B1 + B2                                                                                                   | ⚠️ B2 done；B1 只完成读侧——写侧（embeddings 生产写入者）仍缺失，生产中语义召回恒为空操作，见上方 B1 |
| `07-16-fix-usage-statistics-double-counting`   | B3                                                                                                        | ✅ done（单写者 + 保守迁移，4 tests + smoke）                     |
| `07-16-unify-file-filtering-service`           | B4                                                                                                        | ✅ done（统一策略 + 索引/发布双门，83 tests + typecheck + smoke） |
| `07-28-migrate-search-index-split-write-paths` | R9 remaining provider/file/embedding write migration; default-on topology, readiness-order, isolated-profile evidence, and `=0` rollback gate | planning
| (待建)                                         | R1 打包验证 / R2 mac 签名 / R3 流式落库 …                                                                 | backlog                                                           |

### 遗留 carve-out（B1 派生，未做）

- [ ] **延迟语义"重排"已渲染项**：当前只做召回追加。要让语义分改变已渲染项顺序，需改渲染端 `useSearch.ts` 合并语义或加 replace-mid-session 事件——属受保护用户改动，暂缓。

## 验收标准

- [ ] 每条 🔴/🟠 发现要么修复并验证、要么转化为有明确 owner 的子任务。
- [ ] 🟡/🟢 条目保留为可追踪 backlog，不要求本轮清空。
- [ ] 报告随代码演进更新（发现失效即勾除并注明原因）。
