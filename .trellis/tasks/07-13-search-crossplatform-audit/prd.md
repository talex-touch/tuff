# Search & Cross-Platform Audit Backlog

> 定位：本任务是 **搜索系统 + 跨平台架构** 的最高层审计报告与问题 backlog。
> 每条发现是一个可独立验证的 TODO；具体修复以子任务承接。
> 生成日期：2026-07-13 · 分支：`TalexDreamSoul/optimization-integration`
> 方法：4 路并行 Explore 深潜（搜索引擎核心 / 文件索引子系统 / 跨平台搜索后端 / 跨平台应用架构）+ 主 agent 交叉验证。
> 关联审计：`docs/engineering/reports/optimization-dry-run-2026-07-11/`（扫 3,664 文件 / 74 万行，69 条发现）。

---

## 背景：本分支在做什么

`optimization-integration` 是一次**证据驱动的巨石拆分 + 跨平台适配统一**重构。核心文件已瘦身但**拆分只完成一半**：

| 文件 | master | 现在 | 已拆出 |
|---|---|---|---|
| `app-provider.ts` | 4007 | 3598 | index-maintenance / record-sync / managed-entry |
| `file-provider.ts` | 4045 | 3059 | asset-service / search-result-service |
| `search-core.ts` | 2795 | 1880 | query-orchestrator / usage-service / provider-health / event-router |
| `everything-provider.ts` | 2612 | 1854 | backend-service / install-service / parser |
| `app-launcher.ts` | 343 | 108 | app-launch-adapter（审计 OS-02 建议已落地） |

跨平台核心抽象是 `withOSAdapter<R,T>`（`packages/utils/electron/env-tool.ts:79`），但采用度低：仅 6 文件 / 11 调用点，主进程仍有 141 处 / 40+ 文件裸用 `process.platform`（其中很多是合法 backend boundary，非债务）。

---

## 架构速览（供后续任务定位）

**搜索引擎**：读写双抽象——搜索时 `ISearchProvider`（PULL，查 FTS5/bm25）/ 索引时 `IndexedSource`（后台 scan/watch/reconcile 写 SQLite）。分层搜索：Fast 层 80ms 保首帧、Deferred 层延后 50ms。`base`→`full` 二段富化。

**文件索引**：`file-provider.ts` 单例编排 ~25 service + 6 worker。三段式（cleanup → full-scan → reconciliation）+ 独立增量队列，`isInitializing` 单飞防冲突。**单写者** search-index-worker 消灭 SQLITE_BUSY，AIMD 自适应批调度。

**跨平台成熟度不对称**：

| 功能 | Windows | macOS | Linux |
|---|---|---|---|
| 文件搜索 | Everything 三级回退+自动安装+自愈 ✅ | Spotlight mdfind ✅ | locate/tracker/baloo，缺失时无感知 ⚠️ |
| 应用扫描 | 5 源并行（重依赖 PowerShell）✅ | mdfind+plist+mdls ✅ | 仅 .desktop（139 行）⚠️ |
| OCR | WinRT ✅ | Apple Vision ✅ | stub 未实现 ❌ |
| 截图 | Rust xcap 三平台统一（构建链存疑）| 同左 | 同左 |
| 更新安装 | msiexec/NSIS ✅ | .app 替换脚本 ✅ | 仅 shell.openPath（打开≠安装）❌ |

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

### 🟠 高危工程风险

- [ ] **R1 — Rust 截图模块疑似未接入 CI/安装构建链**
  - 位置：`packages/tuff-native/scripts/build-screenshot.js`（手动脚本）、`scripts/build-target/build-target.js:169`（`verifyNativeOcrModule` 只验 OCR）；`gypfile:true` 只触发 node-gyp（OCR+Everything），不含 cargo。
  - 风险：打包产物可能缺 `tuff_native_screenshot.node` → 截图静默降级 `ERR_NATIVE_SCREENSHOT_UNAVAILABLE`。**需实际打包验证**。

- [ ] **R2 — macOS 打包未签名 + 仅 arm64 + dir target，与 electron-updater 路径冲突**
  - 位置：`electron-builder.yml:100-119`（`sign/notarize/hardenedRuntime:false`、`identity:null`、`target:dir`、无 Intel）
  - 风险：Gatekeeper 拦截；`mac-auto-updater-adapter.ts` 依赖 app-update.yml + 签名 zip，实际不可用；`update-asset-utils.ts:33-38` 仍在给不产出的 .dmg/.pkg 打分。**需产品决策**（是否签名/公证/保留 Intel）。

- [ ] **R3 — 大目录扫描/对账内存峰值**
  - 位置：`addon/files/workers/file-scan-worker.ts:82`（scanDirectory 全物化）、`file-scan-worker-client.ts:132`（client 再累积）、`addon/files/services/file-provider-reconciliation-run-service.ts:122`（磁盘全集 + DB 全集 `LIKE` 无 LIMIT）
  - 风险：同一文件列表约 3 份同存，无分块流式落库；百万级根目录（整个 home）OOM。

### 🟡 中危架构债

- [ ] **R4 — `search-core.ts` 的 `search()` ~670 行巨型方法**
  - 位置：`search-engine/search-core.ts:595`+；`session.end` 的 builder+trace 重复 4+ 处；竞态靠手工 `latestSessionId !== sessionId` 比对散在 6+ 处，易漏检导致陈旧结果污染。

- [ ] **R5 — 过度分层反噬**
  - 位置：`addon/files/file-provider.ts:523-870`（347 行 DI 接线板）；30+ service 中大量薄适配层；`search-engine/indexing-write-*.ts`（3-9 行 re-export）vs `packages/utils/search/indexing-write-*.ts`（500+ 行实现）并存，grep 极易读错文件。

- [ ] **R6 — 平台分支散落、`withOSAdapter` 采用不足**
  - 位置：main 目录 141 处 `process.platform`（`touch-window.ts:83`、`update-system.ts:1445`、`capability-adapter.ts` 通篇内联三分支…），`withOSAdapter` 几乎只有 startup-guard 用。**注意**：审计 OS-04/OS-05 已判定并非全部是 bypass，迁移需逐项复核。

- [ ] **R7 — `getStatus` 轮询架空 worker 空闲关闭**
  - 位置：`addon/files/workers/file-scan-worker-client.ts:70`（getStatus 开头 cancel、结尾重排 60s 窗口）；任何 <60s 轮询 worker 状态的面板都会让空闲 worker 永不自杀，架空 `idle-worker-shutdown` 的内存回收。另：退出无 `will-quit` 优雅 drain，在途 FTS 写可能丢。

- [ ] **R8 — Linux 全面二等公民**
  - 应用扫描 139 行 / 图标暴力 360 次 stat 无缓存（`addon/apps/linux.ts:15`）/ 无 OCR / 更新只 openPath / Everything 无对等 / 无验收框架（仅 windows-acceptance-*）。

- [ ] **R9 — SQLite 单写瓶颈缓解逻辑分散 5+ 处**
  - `dbWriteScheduler` + `withSqliteRetry` + worker `directMode` + `AdaptiveBatchScheduler` + `UsageStatsQueue` 采样丢弃；同一痛点各自处理，新人难判断某次写走哪条路。

### 🟢 低危清理

- [ ] **C1 — 死依赖**：`tesseract.js`(~29MB)/`mathjs`(~13MB) 仍在 `apps/core-app/package.json`，靠打包排除（`electron-builder.yml:48-57` 注释已承认未使用）。
- [ ] **C2 — `expectedDuration` 死配置**：9 处 provider 声明，DSL 文档称按它排序，但 `search-gather.ts` 的 fast/deferred 层从不排序。
- [ ] **C3 — `searchCache` 收益存疑**：`search-core.ts:145`，5s TTL/100 LRU，cacheKey 依赖激活态易失效，命中率天然低。
- [ ] **C4 — 死代码**：`file-provider-watch-service.ts:79` 的 `handleFsAddedOrChanged/Unlinked` 从未订阅（真实增量走 `file-indexed-source.ts`）。
- [ ] **C5 — Windows OCR COM apartment**：`winrt_ocr.cpp:157` 每次 init 不 uninit → 线程复用下 `RPC_E_CHANGED_MODE` 风险。
- [ ] **C6 — Windows 全链路重依赖 PowerShell**：应用扫描 4 源 + Everything 装 PATH 全经 `powershell -Command`，ExecutionPolicy 受限时大面积降级且扫描侧无降级 UI。

---

## 子任务映射

| 子任务 | 覆盖 | 状态 |
|---|---|---|
| `07-13-fix-ranking-dead-features` | B1 + B2 | ✅ done（typecheck 0 err，46 相关用例通过） |
| (待建) | R1 打包验证 / R2 mac 签名 / R3 流式落库 … | backlog |

### 遗留 carve-out（B1 派生，未做）
- [ ] **延迟语义"重排"已渲染项**：当前只做召回追加。要让语义分改变已渲染项顺序，需改渲染端 `useSearch.ts` 合并语义或加 replace-mid-session 事件——属受保护用户改动，暂缓。

## 验收标准

- [ ] 每条 🔴/🟠 发现要么修复并验证、要么转化为有明确 owner 的子任务。
- [ ] 🟡/🟢 条目保留为可追踪 backlog，不要求本轮清空。
- [ ] 报告随代码演进更新（发现失效即勾除并注明原因）。
