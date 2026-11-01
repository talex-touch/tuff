# Search & Cross-Platform Audit Backlog

> 迁移说明（2026-10-03）：本文是活审计，正文逐字保留自已冻结任务 `07-13-search-crossplatform-audit` 的
> [`prd.md`](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-13-search-crossplatform-audit/prd.md)。文中的「本任务」「子任务」指迁移前的 Trellis 任务，
> 其冻结记录见 [backlog](../workflow/backlog.md#07-13-search-crossplatform-audit)，身份登记见
> [retired-task-index.json](../workflow/retired-task-index.json)；新的修复先与用户确认范围和验收，核对现有 PRD、工程规格与真实运行证据，并与当前负责人确认交接。
> 发现修复或失效时，直接在本文勾除并注明原因。

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
| 文件搜索 | Everything 三级回退 + 自动安装 + 自愈 ✅ | Spotlight mdfind ✅  | locate/tracker/baloo，缺失时无感知 ⚠️ |
| 应用扫描 | 5 源并行（重依赖 PowerShell）✅      | mdfind+plist+mdls ✅ | 仅 .desktop（139 行）⚠️               |
| OCR      | WinRT ✅                             | Apple Vision ✅      | stub 未实现 ❌                        |
| 截图     | Rust xcap 三平台统一，CI 构建链已验证；已签名打包运行证据待补 | 同左                 | 同左                                  |
| 更新安装 | msiexec/NSIS ✅                      | .app 替换脚本 ✅     | 仅 shell.openPath（打开≠安装）❌      |

---

## TODO Backlog（按严重度分级）

> 图例：🔴 已证实缺陷 · 🟠 高危工程风险 · 🟡 中危架构债 · 🟢 低危清理
> 勾选规则：修复合入并验证后打勾；标注承接子任务。

### 🔴 已证实缺陷（代码级验证过）

- [x] **B1 — 本地 Provider 页级及图片写入与召回已验收** ✅（2026-10-11 PDF；2026-10-12 隔离模型及正式 dev 原图闭环；packaged helper 单独验收）
  - 位置：`addon/files/services/file-provider-search-result-service.ts:450-493`（hash 对应 chunk 生成真实 deepMatch 与 semanticScore）、`addon/files/embedding-service.ts:242-306`（chunk 生成、模型空间校验、版本 fence、单写者事务写入）。
  - 已交付（读侧，`cbbd6ba7a`）：`FileProvider.semanticRecall` + search-core `scheduleDeferredSemanticRecall`（`search-core.ts:875-912`，调用点 `:1413-1420`），首帧后异步召回并写入真实 `semanticScore`。这部分确实存在且可用。
  - **已接通（写侧，`09-29-bounded-fd-fzf-file-indexing` 工作树）**：`FileProviderEmbeddingIndexService.indexCommittedEntries` 在主进程 flush 后调用 `EmbeddingService.indexFiles`，能够访问 tuffIntelligence SDK；正文索引关闭时不调用，开启后只处理实际提取到正文的文件。
    - `contentIndexingEnabled` 默认 `false`。用户确认开启后，已有 metadata 通过 durable `file_index_progress` 分页补齐；关闭会清除 `files.content`、文件 embeddings、progress 和 FTS content，保留 metadata。
    - 2026-09-29 隔离 Electron 实测：开启后已有 `.txt` metadata 在不重扫目录的情况下达到 `content_length=97 / status=completed / FTS 正文命中=1`；关闭后 `content/embeddings/progress/FTS 正文命中` 均为 0，metadata 与标题 FTS 仍在。
  - **本轮端到端证据（2026-10-11 补证）**：从真实四页 FlateDecode PDF 经 `fileParserRegistry` 解码，再由 mapper/repository 将正文与页级 chunks 写入独立 SQLite 文件。真实 `LocalProvider` 调用固定版本 EmbeddingGemma 2，生成每页 768 维向量；`EmbeddingService` 经 split 单写者批事务落库，primary 向量表为空，文件状态为 `completed`。关闭并重开 search 库后，`semanticSearch` 断言胜出 hash 等于真实第 4 页 hash；`FileProviderSearchResultService.semanticRecall` 断言返回第 4 页和完整宠物条款。关闭正文开关的 public policy 经真实 repository 清掉正文、chunks 与向量，文件目录和无关图标元数据保留。真实模型 smoke 1/1 通过；未启动第二 Electron，未写正式 profile。SDK quota/audit 与禁止本地失败回云另由回归覆盖；正式 packaged helper 未验收。
  - **图片补证（2026-10-12）**：PNG／JPEG／WebP／GIF／TIFF 由显式开启的内容索引及既有目录／容量门禁准入；host-only 本地模型使用固定 media 权重、无符号链接的有界规范快照，文字与图片同空间，不调用云 fallback。真实 PNG 经 worker → repository → SDK → split 单写者 → 数据库关闭重开 → 实际 `semanticRecall`，`猫`／`宠物`／`一只猫`／`a pet cat` 均首位返回原图；正文保持 NULL，primary 无向量，无手工描述。补齐汉字短词门禁、官方查询任务提示词，以及首帧后推理在会话完成前发布的生命周期；此证据不代表旧 dev 主进程热替换或 packaged helper 已验收。
  - **正式实例前提与线程隔离（2026-10-12）**：用户当前 dev 未配置图像 helper、hash 或模型目录，目标图片的正式向量仍为 0，不能把隔离验收当成正式搜索已可用。向量扫描及评分已移入独立 semantic 读线程，只返回 top-K 文件和胜出分段 hash；正式库只读扫描 290 ms，隔离 Node 宿主心跳最大间隔 16 ms。实际 CoreBox 图片召回等待明确授权配置并重启后验收，不扩大正文授权、不自动下载模型。12 个套件／211 项相关回归及 Node 类型检查通过。
  - **正常启动接线（2026-10-12 后续）**：用户明确授权稳定安装和重启当前 dev，已有权重与 helper 已无重复副本迁入 Tuff 应用数据目录。固定位置的安装记录严格验证平台、架构、版本、绝对路径和 helper SHA；显式 helper 不能借用记录的 SHA。清空模型环境变量后，真实原 PNG 编码及 `cat` 向量对比通过（0.7299），正式实例已开始按原 opt-in 和目录规则发布图片向量。旧原图的 CoreBox 召回仍需等实际后台发布后取证；不扩大目录、不绕单写者、不手工填向量。Node／Web 类型、CoreApp 212 项及 Utils 51 项回归通过。
  - **正式原图闭环（2026-10-12 最终）**：用户授权的手动局部刷新保留元数据，在同一 mutation lease 内按原内容授权恢复旧 skipped 任务，再经正常 writer ack／worker／SDK／单写者生成正式向量。原图为 completed、正文 NULL、向量 1 行；正式语义读线程对 `cat` 排名第 1（0.7299）。移除 20 条字面候选关闭语义召回的门槛后，真实 CoreBox 当次 854 ms 追加原文件名，未重排已有结果。窗口临时固定以防协议验收被自动失焦隐藏取消，已恢复，不冒充原生全局键盘焦点验收。最终 Node 类型检查及 4 套件／105 项回归通过，正式发布资源仍未验收。
  - **历史取证保留**（2026-09-18，本机 4 个真实库）：当时 `embeddings` 表 0 行；`files` 合计 155,716 行，`embedding_status` 仅有 `none`/`pending`。该数据是修复前基线，不再表述当前工作树的写侧为零调用。
  - **默认排序补正（2026-10-12）**：用户反馈 `a pet cat` 的原图低于 `deploy.sh`。语义候选原先直接发布 0–1 相似度且一律追加，现经既有 full enrichment 和 sorter 发布同量纲 final；文件语义贡献最高 400 match 分，低于 stem exact 420 和完整名字 1000。未选择结果时，新语义项可插入弱项前，但保留所有已有更强／同分项、置顶项和已有相对次序；选择后仍追加。普通晚到结果和已有项重排不扩范围。
  - **新狗图正常入库闭环（2026-10-13）**：新 PNG 文件已存在，但无 progress／向量。真实库还出现 111 张已生成向量的图片被旧 pending 进度覆盖；flush 尾阶段现只确认原始终态，图片完成归向量事务所有。另有约 9,865 张旧 disabled-image skips 与普通任务混排，整页预标 pending 的溢出继续污染普通队列；最终分 fresh／retry／legacy 独立游标公平轮转，新文件不再等全库旧图补完。正常队列将原狗图写为 embedding completed／progress completed=100／向量 1／正文 NULL；真实 CoreBox 的 `dog` 默认第 1，当次 2026 ms。无手动重加或伪向量，原文件不改；临时固定窗口已恢复，不冒充全局键盘焦点与 packaged 验收。
  - **图片输入兼容修复（2026-10-13）**：实际待处理的 `.JPG` 包含 HEIC／HEVC 字节，Sharp 能识别头信息但缺少 HEVC 解码器。macOS 现使用 `/usr/bin/sips` 解码来自有界文件句柄的私有副本，按最长边 1024 缩小，再规范化为无原始元数据的 PNG；AVIF 使用 Sharp。不扩大扩展名或目录准入，不上传原图。输入仍限 32 MiB、单帧及 20 秒解码；像素限改为 67,108,864，另按通道和采样深度限制原始解码存储为 256 MiB，此预算不等同进程峰值内存。真实 HEIC-in-JPG、19,644,840 像素 JPEG 和 25,217,568 像素 PNG 经实际 runtime 与已安装模型均生成 768 维有限向量，原文件 SHA／大小／mtime 不变。未写正式 profile、未启动或重启 Electron；此证据不代表当前旧 dev 进程已加载新代码或后台队列已补齐。
    - 输入边界回归 30／30、Node 类型检查及相关 ESLint 通过。回归覆盖 EXIF 旋转、去元数据、小 HEIC 不放大、AVIF 真实解码、超像素／解码存储／文件大小拒绝，以及既有文件身份和符号链接保护。HEIC 原生回归仅在 macOS 执行；非 macOS 的 HEVC 支持取决于本机解码器，各解码步骤独立设 20 秒超时。

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

- [x] **B8 — 每个 `db.transaction()` 泄漏一个 SQLite 连接** ✅ 已修（2026-09-27）
  - 根因：`@libsql/client@0.17.4` 把每个事务的原生连接从 client 脱离，`commit()` / `rollback()` 后未关闭；真实写路径 60 次 `upsertFiles()` 将目标库句柄从 **1 增到 61**，长跑 worker 在 `search-index.db` 上累积到 **1,696** 个句柄。
  - 依赖修复：CoreApp 升到 `@libsql/client@0.18.0`；新版连接池在事务结束后回收连接。启动期 `PRAGMA busy_timeout` 改为 `createClient({ timeout })`，覆盖池中每根 primary / aux / search / worker 连接；跨 `execute()` 的裸 `BEGIN` / `COMMIT` 全部迁到正式 interactive transaction 或 `batch(..., 'write')`。
  - 忙锁恢复：0.18.0 仍受上游 [libsql-client-ts#352](https://github.com/tursodatabase/libsql-client-ts/issues/352) 影响——原生 statement 在 `SQLITE_BUSY` 后要等 GC 才 finalize，脏连接会让后续 `COMMIT` 报 `SQL statements in progress`。worker 直写与主进程 primary / aux 调度器现在都在 busy retry 前 `reconnect()`；主辅库随后重放 WAL / foreign_keys / synchronous / locking / mmap 配置。锁释放恢复契约重新 2/2 通过。
  - 永久回归：`file-index-persistence-repository.connection.test.ts` 对真实 libSQL 文件执行 60 次写路径，句柄增长阈值 ≤2；同时锁定 file-only pending fence 与 drizzle 映射结果。0.18.0 下 3/3 通过。
  - 写路径 A/B（同机、真实 repository、每轮 100 次 × 12 行）：0.17.4 **65.79ms / 1519.95 iter/s / +100 handles**；0.18.0 **56.74ms / 1762.50 iter/s / +0 handles**，吞吐约 **+16%**，没有以性能换资源收敛。
  - 验证：数据库/索引 18 files / 203 tests、插件 SQLite worker 7 tests、启动扫描一致性 3 files / 81 tests、Node typecheck、Electron Vite production build 全通过。开发与生产启动扫描走同一 eligibility gate，不再携带 dev-only force 分支。

- [x] **B9 — 文件名输错字召回不到：文件条目没有来自文件名的 n-gram** ✅ 已修（2026-10-11）
  - 位置：`search-engine/search-index-service.ts:1563-1571`、`:1668-1680`；`addon/files/services/file-provider-search-result-service.ts:279-291`。
  - 根因：`appendKeyword` 经 `normalizeSearchText` 把点号等分隔符替换为空格（`budget.xlsx` → `budget xlsx`），被 `!value.includes(' ')` 排除；分词与 compact 形式原先仅 1.0，过不了 `NGRAM_SOURCE_MIN_PRIORITY (1.1)` 门槛。
  - 修复：
    1. 从清洗后的标题和原始标题双向切分单词，排除扩展名后的主体单词赋予优先级 `1.15`（`>= 1.1`）；
    2. 无空格紧凑名称 `cleanCompact`（如 `budgetxlsx`）赋予优先级 `1.1`（`>= 1.1`）；
    3. `SEARCH_KEYWORD_SCHEMA_VERSION` bump 至 `3`，使哈希自动失效重写；
    4. `lookupByNgrams` 保持只在常规 0 候选时触发，零额外常驻性能负担。
  - 验证：`search-index-service.charset.test.ts` 新增回归测试，验证 `budget.xlsx` 产出 `ng:bu/ud/dg/ge/et`，错字 `budgte` 在 `lookupByNgrams` 下通过 overlap 成功召回（12/12 单元测试通过）。
  - 存储与重写代价（2026-10-11 实测）：在正式版索引库上，用修复前后两版 `prepareDocument` 重放全部 54,270 个文件。条目按基础发布路径 `mapFileToIndexedSourceRecord` 构建；修复前版本的重放结果与库内逐条一致（54,270/54,270）。
    - `keyword_mappings` 从 1,744,882 行增到 2,601,671 行（+49%），其中 `ng:` 行从 700,951 增到 1,440,924（+106%）；没有条目触及每条 256 的上限。
    - 现库这张表连同 5 个索引共 895.9 MB，约 536 B/行，所以增量约 +0.45 GB；`ng:` 行的关键词较短，实际会略低。
    - `SEARCH_KEYWORD_SCHEMA_VERSION` 升到 3 后，`FileProviderKeywordBackfillService` 会在升级后把全部文件条目的关键词重写一遍。

- [x] **B10 — 读 worker 加载的文件候选行，时间戳全落在 1970 年** ✅ 已修（2026-10-22）
  - 位置：`search-engine/search-index-service.ts` 的 `loadFileCandidatesByPaths` / `loadFileCandidatesByIds`。`101424b2e`（2026-10-13）把候选行读取交给读 worker 时引入。
  - 根因：`files.mtime` / `ctime` / `last_indexed_at` 是 drizzle `mode: 'timestamp'` 列，库里存整秒；drizzle 自己的 select 会乘 1000，原始 SQL 读回的却是秒，被直接当毫秒交给了 `new Date()`。对应回归测试种的是毫秒值（`1700000000000`），所以缺陷在测试里看起来正常。
  - 影响（dev 库 APFS 克隆，固定抽样 252 / 259 行）：
    1. 文本搜索与语义召回经 worker 加载的每一行都和 drizzle 回退路径不同，而且只差这三个时间戳：worker 给 `1970-01-21`，回退给真实日期。
    2. 文本搜索打分里 0.05 权重的 `lastModifiedScore` 恒为 0；结果的 `meta.file.modified_at` / `created_at` 也是错的。
    3. 图标缓存按 `mtime` 判新鲜度。文本搜索（worker 读）与按扩展名列出的结果（drizzle 读）拿到的 `mtime` 不同，同一个文件会在两种形式之间来回判过期、重新提取。库里 5,413 条 `iconMeta` 中有 1,839 条写成了秒值形式，约三分之一。`thumbnailStatus` 未受影响：带 `mtime` 的 155 条都是毫秒。
  - 修复：三列统一经 `fileTimestampFromSeconds()` 换算，enrichment-resume 分页也用它。写成秒值的 `iconMeta` 会在下次展示时再判一次过期，重新提取后就稳定了，不需要迁移。
  - 验证：`search-index-service.read-executor.test.ts` 改用整秒种子，并断言两种候选读取与 drizzle 回退逐字段相等；换回旧换算，该例失败。真实克隆上，修后 252 / 259 行与回退路径完全一致。
### 🟠 高危工程风险

- [ ] **R1 — 原生截图发布资源已接入，签名包截图运行验收仍开放**（2026-09-27 发布路径修复；2026-10-18 官方包资源复核）
  - 修复：`native-protocol.yml` 在 macOS/Windows/Linux 安装 xcap 所需 Linux build deps，构建 ordinary screenshot addon，执行真实 dlopen/export contracts；随后构建 deterministic addon 跑 `.node -> NapiCarrier -> NativeTransport` integration，并在结束前恢复 ordinary addon。
  - 包合同：`@talex-touch/tuff-native.files` 显式包含 macOS/AX/stream/xcap production backend 源码与 `build/Release/tuff_native_screenshot.node`，继续排除 fixture、contract test backend 和 Cargo target。
  - 证据：本地 ordinary/deterministic 双构建、普通 addon strict macOS integration、31/31 Node contracts 和 `pnpm pack --dry-run` 通过；tarball 包含 addon 与全部 production backend，未包含 `test_backend.rs`/contract fixtures/target。
  - 边界：Windows/Linux authoritative native build 由新增 CI matrix 执行；signed Electron packaged runtime evidence 仍由 `07-29-screenshot-packaged-evidence` 独立承接。
  - ⚠️ **发布路径未接入**（2026-08-07 复验）：`build:screenshot` 的 3 处调用全在 `native-protocol.yml`——那是**契约测试**工作流，不产出发布物。真正的 `build-and-release.yml` 对 `screenshot` / `audio` / `cargo` / `rust` **零命中**（正对照：`packages/tuff-native` 命中 2 次），它在该包里只做 Windows 限定的 Everything 自检与 `pnpm run rebuild`（node-gyp）。且 `apps/core-app/scripts/` 里查不到 `tuff_native_screenshot`，preflight/afterPack 都不要求它。发布产物大概率不含该 addon。跟踪：[#321](https://github.com/talex-touch/tuff/issues/321)。
  - ⚠️ **同型风险仍在 audio addon 上**（2026-08-07 复验）：`packages/tuff-native/native-audio/` 存在且有 `build:audio` 脚本，但 `.github/workflows/` 里**没有任何 workflow 构建或加载它**（`native-protocol.yml` 对 audio 零提及）。也就是说截图模块修掉的那个「手工 Cargo 构建、CI 无验证」缺口，在 audio 上原样存在。跟踪：[#322](https://github.com/talex-touch/tuff/issues/322)。
  - 2026-09-27 **用户面后果已实测（不再是"大概率"，是确定）**：安装版 `Tuff.app` 2.4.14-beta.47 的 `app.asar.unpacked/node_modules/@talex-touch/tuff-native/build/Release/` 只有 `tuff_native_everything.node` 与 `tuff_native_ocr.node`，**没有 `tuff_native_audio.node`**（同目录 `audio.js` 正是按 `__dirname/build/Release/tuff_native_audio.node` 加载）。因此该版本**所有语音输入入口全线不可用**：Fn 手势、VoiceDock HUD、输入框麦克风、⌘⇧U 都会在 `VoiceService.assertSupported()` 抛 `Voice capture is unavailable: Cannot find module '.../tuff_native_audio.node'`。
  - 发布路径为何拿不到：`pnpm install` 触发的包 `install` 钩子是 `node-gyp configure build`，而 `binding.gyp` 只声明 `tuff_native_ocr` / `tuff_native_everything` 两个目标；audio addon 是 Cargo 产物，只由 `packages/tuff-native/scripts/build-audio.js` 产出，而该脚本的调用方只有 `apps/core-app/scripts/dev-electron-wrapper.mjs`（dev 专属，`TUFF_DISABLE_NATIVE_AUDIO !== '1'` 时才跑）和 `native-protocol.yml`（契约测试，不产发布物）。`build-and-release.yml` 对 `audio` / `cargo` / `rust` 零命中，也无 Rust toolchain 步骤。本地 `build/Release/` 里能看到该 addon，**只是因为开发时跑过 dev wrapper**，与发布链无关。
  - 静默原因：`apps/core-app/scripts/build-target.js` 的 `verifyNativeModules()` 必需清单只有 `['tuff_native_ocr.node']`（win 另加 everything），audio 不在其中；函数注释明说了"Not covered"是给 screenshot 的，但 audio 同样落在覆盖外，所以缺件只降级成一条 warning，构建照过。
  - ✅ **2026-09-27 已修（三项同时落地，均有实测证据）**：
    1. **发布链真的构建 addon**：`build-and-release.yml` 新增 `Setup Rust` + `Swatinem/rust-cache` + `Build native addons and verify they load`（`build:audio` / `verify:audio-production` / `build:screenshot` / `verify:screenshot-production`），位置在 `Build Tuff App` 之前；`Install Linux Dependencies` 补上两个 Cargo crate 的 apt 依赖（与 `native-protocol.yml` 同一份清单）。`windows-everything-production.yml` 同样补了 Rust + 构建步骤——它用 `CI=true` 打包，会撞上新的必需清单。
    2. **打包前闸门**：必需 addon 清单移入 `scripts/build-target/runtime-modules.js` 的 `requiredNativeAddonNames(target)`（`ocr` + `audio`，win 另加 `everything`；**screenshot 仍不在清单内**，因为 `screenshot-protocol.js` 缺件时降级为 `binding-unavailable` 而非抛错，要求它会软化能力损失为硬构建失败）。`build-target.js` 的 `verifyNativeModules()` 改用它，于是 CI 缺 audio 即失败。
    3. **打包后校验 + 运行期能力信号**：`after-pack.js` 新增 `verifyPackagedNativeAddons()`（CI 严格、本地仅警告），校验 addon 真的活着走出 asar→`Resources/node_modules` 的搬运；主进程新增导出的 `captureUnavailableCode()`，把原生 reason 收敛成**封闭 code 集**（`VOICE_CAPTURE_UNAVAILABLE_CODES`，含 `componentMissing`），`assertSupported` 与 `getRecognitionStatus().capture` 共用它；渲染层按 code 分类（不再猜文案），并在 `componentMissing` 时**不给**输入框麦克风入口，而不是让用户点了才报错。
  - 实测证据（2026-09-27）：本地 `CI=true pnpm build:app --target=mac --type=snapshot` 跑完 `afterPack` —— 日志同时出现 `✓ Native module found: …tuff_native_audio.node` 与 `[afterPack] Verified packaged native addons: tuff_native_ocr.node, tuff_native_audio.node`；产出的 `dist/mac-arm64/tuff.app/Contents/Resources/node_modules/@talex-touch/tuff-native/build/Release/` 含 **4 个** addon（audio / screenshot / ocr / everything，对比安装版 beta.47 只有 2 个），`app.asar.unpacked` 同步含 4 个；直接 `require` 打包树里的 `tuff_native_audio.node` 返回 `{supported:true, platform:"macos"}` 且导出齐全。该次构建唯一失败点是 `forceCodeSigning` 找不到 Developer ID（本地无证书，CI 提供），发生在 `afterPack` 之后，与本项无关。
  - 仍未闭环：`screenshot` 的**打包运行时**证据（真的在有屏幕的会话里截一张）仍由 `07-29-screenshot-packaged-evidence` 承接；#321 / #322 需在下次 tag 发布后核对产物再关。
  - 2026-10-18 官方安装包只读复核：arm64 `2.4.15-beta.7` 的物理 `app.asar.unpacked` 包含 screenshot、audio、OCR、Everything addon 与 translation helper；Developer ID/deep strict codesign、Gatekeeper、公证与 RSA build-attestation/asar 摘要校验通过。未启动该安装包截图，也未把 Node/浏览器 smoke 当 packaged 原生运行证据。

- [ ] **R2 — macOS 双架构已发行，跨架构运行证据仍需核对**
  - 2026-10-18 当前源码及正式资产复核：`electron-builder.yml` 的 DMG/ZIP 均声明 `arm64` 与 `x64`。官方 `v2.4.15-beta.7` GitHub inventory 含两种架构的 DMG、ZIP 及签名；发布 manifest 为 `darwin/arm64` 与 `darwin/x64` 分别列出首选 DMG、SHA-256 和签名。
  - 本机已安装 arm64 beta.7 的 Developer ID、deep strict codesign、Gatekeeper、公证及 RSA 构建证明/物理 asar SHA 均实查通过。旧“仅 arm64、需先决定是否支持 Intel”判断失效；剩余为下载/OTA 架构选择与 Intel 真机运行证据，不把 arm64 验签冒充 x64 运行验收，也未新增 Universal 承诺。
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
  - 2026-09-27 **dev 分支与已发布 beta 漂移造成 writer 病态退化**：当前 dev PID 88881（master 尚缺 stage 上已发布的 `9ed43e307` / `bcac84591`）对 7.41GB `search-index.db` 保持 241 个描述符；`app-provider` 每 50 条写批次实测 52.7–94.8s，随后文件 enrichment 的 30s persist barrier 与 scheduler drain 连锁超时。含两笔修复的隔离 build 在同机 100k campaign 已推进 6.3 万文件时仅保持 10 个该库描述符。两笔已发布提交已同步回当前工作树；正在运行的旧 dev 进程需重启后才生效。

- [x] **R10 — indexing 期间主进程同步 SQLite 语句与每事件 diagnostics 扇出** ✅ 已逐项量化、修复或证伪（2026-09-27）
  - 2026-09-21 现场证据（dev 会话 `tuff-dev/logs/D.2026-09-21.log`）：fullScan 期间 `[Perf:EventLoop] Event loop lag` 连续 0.4–1.3s，并使一次 `storage:app:save` 的 IPC 请求超时——配置未落盘，UI 显示「存储服务返回失败（版本 71）」，而主进程日志里没有任何 storage 侧失败、DB revision 停在 71。
  - **归因修正（重要）**：日志里的 `context=FileProvider.fullScan 978s` 是 `utils/perf-monitor.ts:864-866` 取「存活最久的 perf context」当标签，**不是阻塞时长**；真实阻塞量是同一行的 `lagMs`。目录遍历与 stat 全程在 worker 线程（`addon/files/workers/file-scan-worker-client.ts:173-174`、`file-scan-worker.ts:110-127`），不占主线程。
  - 主进程同步语句三处（libSQL local binding 在调用线程同步执行，见 `modules/database/index.ts:48-56`；主库 busy_timeout 2s）：
    1. `FileProvider.computeIndexStats()` 的 6 条 `COUNT(*)` 打在主进程持有的 6 GB 索引句柄上（`addon/files/file-provider.ts:2583-2655`，`db/utils.ts:119`），调用方包含 diagnostics IPC、`getHealth`、`getIndexedSourceEvidence`，以及**每条 FS 事件**（`indexing-runtime.ts:486-494`）。单次成本取决于 best-effort perf index 是否建成（仓库自测：无索引 8.1–11.5s / 有索引 25–27ms，见 `db/schema.ts:110-113`）。
    2. `SqliteIndexingTaskStateStore.save()`（`indexing-task-state-store.ts:79-108`，主库同步 upsert）在同一会话执行 **18,257 次**（`DbWriteScheduler` label stats）。`drop=0` 证明队列从不积压，所以 `db-write-scheduler.ts:499-514` 的 `latest_wins` per-budgetKey 清扫在此**没有可合并对象**——修法是降低入队频率，不是加合并。
    3. 每批一次 `SELECT … WHERE path IN (…)`（`file-provider.ts:1157-1185`）。
  - 吞吐正反馈（历史 maxSize=20）：`upsertBatchScheduler` 曾显式限制为 `initialSize 5 / maxSize 20`（`file-provider.ts:335-341`，而 `AdaptiveBatchScheduler` 默认 maxSize 80），导致 15.5 万行切成 ≥7,800 块，每块支付 `appTaskGate.waitForIdle` + 两次 worker 往返 + `publishCommit` reader-visibility barrier；主线程拖延又被 AIMD 当拥塞信号。2026-09-27 实测 3k/10k A/B 后生产上限已调为 **10**；完整证据见 C 项。
  - 剩余候选修法与状态：每项仍须真实 profile 证据，禁止凭代码阅读宣称收益。
    - A ✅ **已修（2026-09-21）**：`FileProvider.getIndexStats()` 增加 1s TTL 快照（`FILE_INDEX_STATS_CACHE_MS`，与仓库既有 `INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS` 同值），返回值收敛到共享类型 `FileIndexStats`，所有出口返回副本以免调用方互相污染。定案数据：同一连接内 8 条 COUNT 合计 50 ms（单条 ~6 ms，13.7k 行、覆盖索引命中），而**新建连接**每次约 120 ms —— 所以成本在长连接下约 36 ms/次；配合 `indexing-runtime.ts:486-494` 的「每条 FS watch 事件一次 diagnostics」，一次事件风暴就等于一次扫描风暴。TTL 把调用频率压到 1Hz，单次成本不变。这也覆盖了 B 想解决的一半（降低单位时间内的调用次数），B 若仍要做只是为了减少调用**次数**本身。
    - 2026-10-22 **统计读取移出主线程**：10-21 dev 会话（7.62GB 库，写入并发）里这六条 COUNT 冷读一次阻塞主线程 340ms。现在合并成一条语句，由 `SearchIndexService.readFileIndexStats()` 交给 deferred 读 worker 执行。同一个 7.6GB 库的 APFS 冷克隆上：修前主线程整段阻塞 224ms（热读 4.6ms）；修后墙钟 204ms，主线程最长停顿 1.2ms（热读墙钟 4.4–7ms）。两边六个数逐项相同。
    - 2026-10-22 **enrichment-resume 分页读移出主线程**：每轮恢复按 fresh → retry → legacy 各读一页（`ORDER BY id LIMIT 200`）。legacy 车道，以及图像嵌入不可用时的 fresh / retry 车道，都带 `files.extension` 条件，而 `idx_files_type` 回答不了这个条件。这时如果没有匹配行，就要回表把 `files` 从游标处走到表尾（dev 库这张表 1.35GB）。现在这页由 `SearchIndexService.readFileEnrichmentPage()` 交给 deferred 读 worker。同一个 7.6GB 库的 APFS 冷克隆上，修前主线程整段阻塞 5131ms（热读 32ms），修后主线程最长停顿 4.1ms（热读 1.2ms）。查询本身的墙钟没变（冷 5.4s），只是改由读 lane 承担。新旧两路逐行相同，`mtime` / `ctime` 也相同；查询计划不变。
    - 2026-10-30 **subtree 对账的 HWM 与分页读移出主线程，并钉死查询计划**：`file-watch-subtree` 对账（截图落盘后触发）的高水位读和每页读原先都在主线程，且表没有统计，规划器对「小范围 + id 区间」会走 rowid 区间逐行回表。现在两者由 `SearchIndexService.readFileSubtreeBound()` / `readFileSubtreePage()` 交给 deferred 读 worker（实现在 `file-subtree-reads.ts`）：不超过 16,384 条路径索引条目的范围用自己的最大 id（索引覆盖探针，不回表）并把分页钉在 `files_path_unique`，更大的范围用表最大 id 并把分页钉在 rowid 遍历（`INDEXED BY` / `NOT INDEXED`）。同一个 6.4GB 库的 APFS 冷克隆（sqlite3 CLI，各数含约 25ms 进程基线）：HWM 旧 6,744ms（整个 home）/131ms（Pictures）/32ms（小目录）→ 新探针 ≤58ms、表级 max(id) 24ms。截图目录 `Pictures/PixPinAutoSave`（4,294 条）整趟清点（69 页）旧 5,388ms、最坏单页 2,433ms → 147ms、最坏单页 115ms，三种计划都是 69 页 4,294 行；小目录首页旧 5,475ms → 32ms。阈值取自交叉点冷测（路径索引 / rowid 整趟）：4.3k 条 0.15s / 5.4s，7.4k 1.2s / 5.3s，15k 2.8s / 5.6s，22k 5.1s / 5.4s。两套计划由 `file-subtree-reads.test.ts` 在真实迁移出的表结构上断言（去掉小范围的钉子后该断言失败）。**未归因**：2.2–2.8s 主线程卡顿是否出自这条链，仍待隔离 harness 抓 `sample` 栈确认。`quick_check` 无需改动：崩溃后只对主库 / 辅库执行，`search-index.db` 自 #295 起被刻意跳过。
    - 2026-10-30 **启动先追热目录；FSEvents 停机间隙重放评估后刻意不做**：停机或忙碌期间落盘的截图 / 下载，FSEvents 一条不补发，启动又不强制扫描，要等整个 home 的 reconcile 碰巧走到才可搜。现在 search index worker 就绪、文件监听注册之后，`FileProviderBootPassService.maybeRunHotCatchup()` 在 `scheduleFileMaintenance()` 之前起一次追赶（每次启动一次，失败只记 WARN，不会让启动链 reject，`file-provider.ts` 净 +1 行，棘轮仍为 2842/2842）。候选 = 监听根之下的 Desktop / Downloads / Documents / Pictures + 最近 30 天内创建的 200 个已索引文件所在目录（`idx_files_is_dir_ctime`）；`$HOME` 的直接子目录里未被点名的不要（`~/Workspace`、`~/Library` 不算热证据），祖先吃后代，stale 排除 / linked worktree 内的不入选；已知文件夹预留席位，其余按近期程度排序，最多 12 个范围，总预算 20s、单范围 8s，关停 250ms 内收手。每个范围是一次普通的 `file-watch-subtree` 对账，经 `IndexedSourceEventRouter.withHotSubtreeLane` 占 subtree 链的一个独占回合：排在尚未开始的 subtree 范围之前，不打断正在跑的那个，`unsubscribe()` 中止。已知缺口：整源 reconcile 占着 run gate 时热范围以「reconcile is already running」失败（计入 `failed`，不重试）；Windows / Linux 监听根本身就是已知文件夹，只有其下子目录经「最近文件」覆盖，根下直接放的文件不在内；热范围的耗时依赖上一条的 HWM / 分页读移出主线程。**不重放 FSEvents**：`fsevents@2.3.3` 的 `since` 不校验——NaN / 小数 / 过小的数重放整段保留日志（本机最老保留 id ≈5.02 亿、当前 ≈9.62 亿，约两个月），大于当前的 id 只发 HistoryDone，之后 live 事件的 id 反而小于水位（持久化即被污染），模块不暴露卷 UUID / 当前 id / 保留范围，被截断的历史无从察觉。重放本身不贵（约 20h 间隙 17.9 万条原始事件，4.4s，事件循环滞后 ≤ ~5ms，99.8% 被现有排除谓词滤掉，余约 423 条），成本不是理由；理由是它需要新的持久化水位 + 校验 + 污染检测，要改 `file-system-watcher.ts` 的实时摄入路径，且重放派生的根级 `event-loss` 会排到热追赶之前。热追赶已覆盖截图 / 下载场景，重放另立工作包（校验过的水位、热车道优先）。
    - B ✅ **watch 准入与完整诊断解耦（2026-09-25）**：显式 `sourceId` 的 watch 仅查询目标源的实时 health/roots；无 sourceId 时仍查询所有源的 health/roots；两条路均不再读取 evidence/progress。保留既有 1s 统计缓存、任务历史 hydration 和 root policy 更新；不缓存权限或 enabled 状态。完整 `getDiagnostics()` 的管理台契约不变。相关回归以修改前源码作控制，会因无关/可选诊断被调用而失败；隔离 Electron 中实际新增文件约 1.02s 发布到索引，同时人为挂起的无关 health 与目标 evidence/progress 调用次数为 0。
  - 2026-09-27 **source-scoped diagnostics path**：`AppEvents.indexedSource.diagnostics({sourceId})` 之前先执行全量 `IndexingRuntime.getDiagnostics()`，再过滤返回源；现在直接调用 `getSourceDiagnostics(sourceId)`，只读取目标源并更新该源 root/task 状态。真实 7.48GB APFS 克隆库（148,510 files）上，六条 stats 查询同连接中位约 4.5ms；旧隔离启动首个全量 diagnostics 因无关 app-provider fast read worker 超时耗时 1.237s，修后 file-provider scoped request 首次 10.9ms，未触发无关源读取。全量 diagnostics 契约保持不变。
  - 2026-09-27 **每批 `path IN` 读取量化**：在同一 7.48GB 克隆库上用 10 条真实路径重复 100 轮，现有「files 查询 + progress 按 id 查询」中位 **44.25ms**，合并为单个 LEFT JOIN 查询中位 **43.55ms**（约 1.6% 差异，P95 73.2/75.4ms）。没有足够收益承担跨层返回形状改动；该语句保留为可观测的低优先级边界，不凭代码阅读改写。
- [x] **C — `upsertBatchScheduler` 上限重配** ✅ 已用真实隔离 profile A/B 定案（2026-09-27）：仅改变 `maxSize`，保留 `waitForIdle`、250ms backoff、ordered publication 和其余代码不变。相同 10,000 个 Markdown 文件、同一构建条件：`maxSize=20` → 542 batches / **49,571ms**；`maxSize=10` → 1,002 batches / **36,042ms**（约 **−27.3%**）。3,000 文件重复轮：`20` 为 6,155ms / 6,131ms，`10` 为 5,917ms / 5,896ms；`maxSize=40` 为 6,802ms，反而变慢。10k 两轮均精确写入 10,000 rows、task succeeded；因此生产上限从 20 调到 **10**，不采用更大的窗口。该 A/B 只证明 fullScan upsert ceiling，不宣称已消除所有主进程同步 SQLite 成本。
  - **icon writer lane 最终复验**：默认 split-on 隔离 profile 的 50 条文件结果产生 120 个 `icon`/`iconMeta` rows，写入 worker-owned search DB，主进程约 0.6% CPU，`file-icon.persist=0`、lag=0。随后在 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 隔离 profile 复现两个 legacy 路径：普通测试文件的 `icon` + `iconMeta` 确实落入 primary `database.db`；Free Download Manager opener 同时把 `file-icons/...png` 写入 app 行与 `openers.json.torrent`。两次写入各 1 次，scheduler Top-5 摘要均未出现 `file-icon.persist` / `file-opener.icon.persist`，对应 16:54 与 17:02 时间窗无 event-loop lag；后续秒级 lag 明确伴随 startup-analytics/sync/polling，与 icon 写无关。历史「300+ slow tasks」无法在当前实现复现，因此不调低队列、不做无证据重构。
  - 可观测性已落地：`computeIndexStats`、`SqliteIndexingTaskStateStore.save`、`IndexingRuntime.getDiagnostics` 及每源诊断均有 perf context；fused file/FTS 写入记录 worker 持久化、FTS apply、IPC 往返与 visibility barrier。fullScan ceiling、watch task-state、source-scoped diagnostics、ack 查询和两条 icon lane 均已完成真实规模或隔离 runtime 取证，R10 关闭。
  - 2026-09-25 **退出链收口**：`search-core.destroy()` 在等待 session/router drain 前发出扫描取消并停止生产者，消除「watch 排队等待 scan mutation gate，但取消位于 drain 后」的等待环；所有已启动 drain 立即接拒绝处理，仍先排空再关闭 writer。实际隔离 Electron 在 scan 活跃时退出：search-core 163ms 收尾、整体约 1.92s、exit 0。首次验收暴露的开发态同步 `app.quit()` 重入与 Sentry 卸载后继续收事件也已修复；没有缩短超时、强杀 SQLite worker 或清空真实索引。
  - 2026-09-25 **最终复验（PID 25430）**：单测试根目录的 602 个文件全部完成并发布；人为挂起无关来源 health 时，真实新增文件仍在 2029ms 内发布，watch 不读取 evidence/progress。退出时仍有 1 个活动 file scan，收到 `INDEXED_SOURCE_SCAN_ABORTED`；search-core 31ms、44 个模块 1570ms、从请求退出到 quit 事件 2226ms，exit 0。该次新增错误日志为 0，无 `StorageModule not ready`、未处理 rejection、before-quit 或 DevProcessManager 强退超时。
  - **证据边界**：本轮使用全隔离数据与合成文件（前次 601 条、最终复验 602 条文件记录），未对用户的 2GB/8.7万行索引执行全量重扫 A/B；不据此宣称全部 R10 同步查询成本已消除。`blocking` perf-context 也可能包围 `await`，不能把它的墙钟存活时长当作同等长度的连续主线程阻塞。
  - 2026-09-27 **退出链二次闭环**：beta.47 packaged whole-home 扫描期间退出仍在 `search-engine-core` 卡满外层 8s。隔离复现用 20s `BEGIN IMMEDIATE` 锁住 `search-index.db`：修前 dev wrapper 5s 强退；修后 writer 在所有 scan drain 之前关闭 admission，500ms graceful close 后 terminate/unref，termination confirmation 只异步诊断、不占 quit critical path。同一被中断 profile 重启后数据库正常打开、无 malformed/corrupt；最终在完成 100,002 行的大库上再次持锁退出，44 个模块 2026ms、总 3.532s 完成，无 force-timeout。
  - 同轮修复把 fullScan fused worker 回复从完整 `persisted` rows 收敛为 `persistedCount`，主线程不再跨 root 累积 row payload；shutdown/AbortSignal 取消不再误报 `FILE_INDEX_SCAN_FAILED`。另修正 checkpoint 语义：child `scan_progress` 只证明可恢复进度，不能冒充 root 完成；隔离 profile 从 3400 行中断后重启实际续增到 6185 行，而不是被 24h interval 静默压住。
  - **计数口径修正**：`schedulerDeferredRecords` 是自启动累计拒绝量，不是当前 backlog；当前上界必须看 active/queued/pending 与 pending/inflight bytes。`context=FileProvider.fullScan Ns` 仍只是存活上下文标签；100k campaign 的一次 553ms lag 同时伴随 `startup-analytics.outbox.flush` 30s 与交互 IPC，不能归因成 748s 主线程 fullScan 阻塞。
  - 2026-09-27 **post-scan enrichment re-admission fixed**：runtime writer acknowledgements 仍刷新全部 base rows 的 extensions，但只把无 progress / pending / processing 行送回内容 worker；completed/skipped/failed 与 `worker-enrichment` publication 不再重入。隔离 300-file profile 的 schema-migration replay 为 104ms，保持 completed=300 / pending=0，10s CPU time 仅 +0.10s。
  - 2026-09-27 **watch task-state write coalescing**：200 个隔离 Markdown 文件同时变更，`indexing.task-state.save` 从 191 次降到 49 次（约 −74%），`queued=0/drop=0/fail=0`；内存态立即更新，shutdown 用 `drainTaskStateWrites()` 保证最新状态落盘，scan/reconcile 写仍 await。
  - 2026-09-27 **post-scan enrichment scoped drain budget**：真实 dev profile 的恢复页保留 `activeBatches=1` + `queuedBatches=1`，旧实现却给整页固定 30s，第二批仍在发布时 lease 已退出，随后触发 `INDEXING_SOURCE_MUTATION_LEASE_INVALID:file-provider` 并重复恢复。FileProvider 现在对 scoped lease 按 `max(1, activeBatches + queuedBatches) × 30s` 计算有界 drain 预算；没有保留批次时仍给一个窗口，unscoped source-wide drain 保持 30s。focused scheduler/startup tests、module-size ratchet 与 node typecheck 通过。`embeddings` 仍为 0 行是 B1 的独立写侧缺口，不纳入本次修复。
  - 2026-09-28 **低冲击冷索引 + event-only macOS watcher（PR #2006 集成复核）**：深度 24 的 macOS watcher 改为原生 FSEvents 注册，不再为挂 watcher 递归枚举已有树；fullScan 每个持久化 chunk 固定协作让出 100ms，慢 chunk 仍沿用 ≥250ms 的比例 backoff、maxSize=10 与 ordered publication。相同隔离 3,000 Markdown 文件：主线索引阶段 10.26s / busy CPU median 125.05% / p95 243.1%；候选 38.57s / 60.7% / 80.3%，即主动接受 3.76× 时长换取 median −51.5%、p95 −67.0%，两边均精确 3,000 行；主线有一次 593ms event-loop lag，候选测量窗无 `Perf:EventLoop`。共享过滤新增 `uvcache` / `__pycache__` / `site-packages`，读侧立即隐藏旧噪声行，`Documents/build` carve-out 保持。集成时发现直接 bundle `fsevents` 会让 native addon 变成 ESM namespace、`flags.SinceNow` 为空；现由 `electron.vite.config.ts` 显式 externalize，最终 source-built Electron 实测 add 1,280ms / delete 514ms、退出 0。签名 packaged-app 能耗仍未验收。
  - 2026-09-29 **冷插入 FTS 的 O(N²) 读取已修**：签名 `beta.53` 清 profile 首扫 30 分钟仍未完成，进程组 CPU 均值 **109.3%**、最后 5 分钟 **98.9%**、平均进程归因能耗 **3.82W**，18,906 行产生 **10.8GiB** 写入。20 秒 `sample` 证明 Electron 主线程仅 2.9% on-CPU；忙的是 `search-index` WorkerThread，99.8% on-CPU 且约 85% 栈落在 libSQL `index.node` 的 `pread`。根因是 `SearchIndexService.applyDocument()` 对每个文档都先执行 `DELETE FROM search_index WHERE provider=? AND item_id=?`，而两个字段都是 FTS5 `UNINDEXED`；冷库的新文档也会反复扫描不断增长的 `search_index_content`。修复复用 `(provider_id,item_id)` 主键元数据：每 provider 只做一次 FTS/meta 覆盖检查并缓存；覆盖完整且当前 item 无 meta 时直接 INSERT，已有 item 仍 DELETE+INSERT；旧 profile 若存在缺失 meta 的 FTS 行则保留原慢路径，provider replacement/clear 后恢复快速路径。20,000 既有文档 + 100 个真实 `SearchIndexService.applyProviderItems()` 冷插入 A/B：完整覆盖 **57.30ms / 60.86 CPU-ms**，强制缺 meta 回退 **938.43ms / 919.42 CPU-ms**，墙钟 **16.38×**；更新 10 项后仍为 100/100 distinct rows。隔离 Electron 3,000 文件为 **36.25s / CPU median 51.44% / p95 80.31% / peak 111.91%**，精确 3,000 files/FTS、2,655 completed，37s 出现 `Index process complete` 且无 `Perf:EventLoop`。SearchIndex 4 files / 41 tests、node typecheck 与 scoped ESLint 通过。

- [x] **R11 — 读 worker 客户端失败后永久不可用** ✅ 已修（2026-09-21）
  - 症状：`SearchIndexReadWorkerClient.failWorker()` 会置 `closed = true` 且**没有任何重建路径**（客户端只在 `search-core.ts:2048` 构造一次），于是一次超时或 worker exit 之后，该会话内所有文件/应用搜索永久失败，而写侧与 commit 一直正常。运行时证据：`D.2026-09-21.log` 中 `Search index commit has degraded reader visibility` 1475 次、`retry failed` 1277 次、`recovered` 0 次，跨 06:50:43 → 07:17:10 共 26.5 分钟零恢复；`SearchIndex:Writer` 的修复重试（100/500/2000ms）因此变成纯固定开销。
  - 修复：失败只 retire 当前 worker（`this.worker = null`），下一次 `all()` 经 `ensureWorker()` 重建；`closed` 现在只由显式 `close()` 设置，仍是终结态。新增 `consecutiveFailures` / `cooldownUntil`：worker 级失败计数达 3 次进入 30s 冷却（冷却期内直接 reject，不再重建），一次成功的读把计数归零——避免「永久坏」时每次尝试都泄漏一个只能被请求关停的线程。
  - 同时补上该文件此前完全缺失的日志（`createLogger('SearchIndex').child('ReadWorker')`，只在首次失败与触发冷却那次告警），这是原故障无法从会话日志回溯的直接原因。
  - 未做（仍 open）：读 worker 侧同样无日志（`search-index-read-worker.ts`），首次失败的真实原因（15s 慢查询 / worker OOM 退出 / 确定性 SQL 错误）仍需运行时证据；`waitUntilReadable(request)` 把 request 对象按位置传进 signal 形参（本文件被静默忽略）属既有 E-L8。


- [ ] **R12 — Search Engine 独立子进程/Worker 化架构待办**（2026-10-13 用户现场取证记账）
  - 现场现象：CoreBox 交互搜索（如 `a pet`）与后台文件索引/富化并发，主进程同时承受 Spotlight 654ms 子进程 I/O 物化、FTS 读 808ms、主线程同步 LibSQL 水合、以及 5.2s 慢写导致的 30s drain 超时，造成主进程事件循环卡顿。
  - 目标架构：将 Search Engine Core、文件 Provider（FileProvider、Spotlight、Everything 等）、FTS5 检索及候选数据水合整体移出 Electron 主进程，沉降至独立 Search Engine 子进程（或专用 Worker Thread）。
  - 边界收益：主进程彻底解耦所有搜索计算与 SQLite 连接，仅负责窗口呈现与 IPC 消息中继；搜索慢查询与底层 I/O 争用不再影响 CoreBox 前台响应与动画流畅度。
- [ ] **R13 — 安装版真实 profile 的持续低能耗验收未完成**（2026-09-30 实测，源提交 `d28dc473d`）
  - 补丁后另一 120 s 窗口仍为 CPU 116.171%、Energy Impact 4582.138；随后较安静窗口 3.564% / 85.559 不能抵消高负载，能耗问题未关闭。
  - 验收需在安装版真实 profile 上做持续窗口复测；research 原始 JSON 未入库，结论以本条为准。

### 🟢 低危清理

- [x] **C1 — 死依赖** ✅ 已修（2026-08-07）：`mathjs` 已从两处 manifest、Vite externalize 例外与 electron-builder 排除项一并移除（[#338](https://github.com/talex-touch/tuff/issues/338) / [PR #1088](https://github.com/talex-touch/tuff/pull/1088)）；`tesseract.js` 在依赖树里已不存在，其残留的 build-allowlist 条目随 [#347](https://github.com/talex-touch/tuff/issues/347) / [PR #1084](https://github.com/talex-touch/tuff/pull/1084) 一并清除。
  - **顺带纠正原判断**：`electron-builder.yml` 那段注释称「只把约 2MB 的 mathjs/number 子集打进 bundle」——实测**从未发生**。移除前后 `out/main/index.js` 只差 **21 字节**（就是被内联 package.json 里的那串依赖声明），bundle 内 `createBigNumberClass` / `decimal.js` / `typed-function` 命中数全为 0。
- [x] **C2 — `expectedDuration` 死配置** ✅ 已修（[#333](https://github.com/talex-touch/tuff/issues/333) / [PR #1085](https://github.com/talex-touch/tuff/pull/1085)，2026-08-07）：10 处声明（9 provider + 1 插件适配器）、`ISearchProvider` 字段及其文档、设计文档引用全部移除。兄弟字段 `priority` 确有消费者（`search-gather.ts:364` 按 `p.priority === 'fast'` 分层），未动。
- [x] **C3 — `searchCache` 缓存键稳定性与击穿防线** ✅ 已修（2026-10-18）：
  - 在 `search-core-utils.ts:buildSearchCacheKey` 中显式过滤了 `sessionId`、`requestId`、`timestamp`、`_traceId` 等每请求易失元数据键，防止字段扩充导致缓存命中率静默归零。
  - 对字符串化的 JSON `content` 引入结构化稳定解析，消除属性序列化顺序差异导致的假失效。
  - 新增 `search-core-utils.test.ts`（10 项单元测试），专门断言「相同查询 → 严格相同键」、键序列化顺序无关性、激活 Provider 顺序无关性、合法选项区分以及动态元数据隔离。61 项搜索契约套件全数通过。
- [x] **C4 — 死代码** ✅ 已修（[#342](https://github.com/talex-touch/tuff/issues/342) / [PR #1083](https://github.com/talex-touch/tuff/pull/1083)，2026-08-07）：两个 handler 连同只为它们存在的 `enqueueIncrementalUpdate` 依赖（声明/字段/构造赋值/上游传入的闭包）与三个类型 import 一并删除。确认路径：`file-provider.ts:2442` 传的是 `subscribeToFileSystemEvents: () => undefined`，真实增量在 `indexed-source-event-router.ts:93` 绑的是另一套命名的 `handleFileAddedOrChanged`。
- [ ] **C5 — Windows OCR COM apartment**：`winrt_ocr.cpp:157` 每次 init 不 uninit → 线程复用下 `RPC_E_CHANGED_MODE` 风险。
- [ ] **C6 — Windows 全链路重依赖 PowerShell**：应用扫描 4 源 + Everything 装 PATH 全经 `powershell -Command`，ExecutionPolicy 受限时大面积降级且扫描侧无降级 UI。
- [x] **C7 — CoreBox 对话搜索按每次按键全表 `instr` 扫消息** ✅ 已修（2026-10-18）：
  - 位置：`modules/conversation/conversation-store.ts:searchConversations`。
  - 根因与优化：原 `conversationMessages` 内容检索对整个消息表执行全表扫描（`SCAN conversation_messages`），长历史用户按键会带来同步 I/O 阻塞。
  - 修复：为消息内容检索引入有界的最近会话扫描窗口 `maxRecentThreads`（默认 150，`CONVERSATION_CONTENT_MAX_SEARCH_THREADS`）。SQLite 查询计划从无界全表扫描优化为利用 `idx_conversations_updated` 索引拉取最近会话，再由 `idx_conversation_messages_thread` 索引按 `conversation_id` 精准搜索消息。
  - 保证：标题检索仍然覆盖全部历史会话不受窗口限制；17 项单元测试及 25 项 Provider 单元测试全数通过。

---

## 子任务映射

| 子任务                                         | 覆盖                                                                                                      | 状态                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `07-13-fix-ranking-dead-features`              | B1 + B2                                                                                                   | ✅ B2 已修；B1 写侧接通且隔离真实 EmbeddingGemma 2 页级写入/重开/召回已验收；packaged helper 发布验收另列 |
| `07-16-fix-usage-statistics-double-counting`   | B3                                                                                                        | ✅ done（单写者 + 保守迁移，4 tests + smoke）                     |
| `07-16-unify-file-filtering-service`           | B4                                                                                                        | ✅ done（统一策略 + 索引/发布双门，83 tests + typecheck + smoke） |
| `07-28-migrate-search-index-split-write-paths` | R9 remaining provider/file/embedding write migration; default-on topology, readiness-order, isolated-profile evidence, and `=0` rollback gate | planning
| (待建)                                         | R1 打包验证 / R2 mac 签名 / R3 流式落库 …                                                                 | backlog                                                           |

### 遗留 carve-out（B1 派生，未做）

- [ ] **延迟语义重排已有项目**：2026-10-12 已按用户反馈支持未选择时的新语义项目插入，并统一评分；已有项目仍不互相重排，已选择时仍追加。全列表重排或 replace-mid-session 不属于本轮范围。

## 验收标准

- [ ] 每条 🔴/🟠 发现要么修复并验证、要么转化为有明确 owner 的子任务。
- [ ] 🟡/🟢 条目保留为可追踪 backlog，不要求本轮清空。
- [ ] 报告随代码演进更新（发现失效即勾除并注明原因）。
