# Tuff 当前执行顺序

> Authority: this document is the sole global execution-order source. Confirm scope and acceptance with the user, then establish current status, blockers and handoff with the current owner using existing PRDs, engineering specifications and observed runtime evidence. Work planned before the 2026-10-03 cutover remains frozen in the [pre-cutover backlog](../engineering/workflow/backlog.md). `docs/comet/` preserves read-only pre-exit records and is not a source of live status or an execution entrypoint.

## Current order

1. **Close verified release and runtime blockers.** The OTA, macOS release-evidence, and application-icon acceptance work is frozen in the [pre-cutover backlog](../engineering/workflow/backlog.md); resume each one after confirming scope and acceptance with the user and handoff with the current owner, using its frozen record, PRD and evidence. The OTA parent was concurrently owned at cutover; this document does not restate its volatile child status.
2. **Complete the search and cross-platform remediation.** The [living audit](../engineering/reports/search-crossplatform-audit.md) owns the backlog; Windows productionization and the [search-index split write-path migration](../engineering/workflow/backlog.md#07-28-migrate-search-index-split-write-paths) are frozen records. The default-on split topology passed the `2026-11-23` `v2.4.15-beta.13` packaged 62/62 isolated run (see the [split acceptance record](../engineering/reports/search-index-split-write-acceptance.md), dev-launch path and remaining R9 AppProvider migration still open; `=0` stays the emergency rollback). Windows Everything hosted CI passed 26/26 in PR `#2319` (`6022abdce`, run `45913177460`, covering SDK and degraded CoreBox UI probes); strict Windows acceptance manifest backfill for `#308` remains open.
3. **Continue remaining independently-owned work** in the order recorded here only after the preceding blocker lane is resolved; use user-agreed scope and acceptance, existing PRDs and engineering specifications, observed runtime evidence, and the current owner's handoff.

## Non-negotiable safety gates

- `TUFF_DB_SEARCH_SPLIT_ENABLED` defaults **on** since `cd39bdbf6` (2026-08-05). The 2d.3 write-path migration landed with it, so `database.db` and `search-index.db` each have exactly one writer connection and the half-migrated failure mode this gate used to guard against no longer exists. Setting it to `0` is the emergency revert to the shared-file topology, not the safe default.
- That flip was proved by three app runs, not by typecheck: schema parity plus a first-launch bootstrap reindex of 4678 items, a second boot that correctly skipped it, and a V2 run with zero `SQLITE_BUSY`, zero cross-home FK failures and zero retry exhaustion. Any future change to the split topology owes the same class of evidence.
- Historical reports prove only their recorded environment. Packaged and production claims require exact observed artifacts or deployed surfaces; they are never inferred from source state.

## Work-state rules

- Confirm live status with the current owner against the relevant existing PRD, engineering specification and observed evidence. Do not copy active counts, branch names, HEADs, dirty-worktree state, or implementation snapshots into this document.
- Independently verify the agreed acceptance before recording completion and handing off. Frozen pre-cutover records are never completed or archived by editing the backlog.
- Roadmaps, PRDs, engineering specifications, frozen task records, historical Comet records, and topical TODOs may describe local scope or immutable history but must not define another global priority order.

## Local and historical references

- Search/cross-platform audit: [living audit](../engineering/reports/search-crossplatform-audit.md)
- AI: [TODO-AI.md](./TODO-AI.md)
- R3: [TODO-R3.md](./TODO-R3.md)
- Nexus: [TODO-nexus.md](./TODO-nexus.md)
- Long-term debt: [docs/TODO-BACKLOG-LONG-TERM.md](./TODO-BACKLOG-LONG-TERM.md)
- Historical completion facts: [01-project/CHANGES.md](./01-project/CHANGES.md)
- 2026-08-31 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-08-31.md).
- 2026-09-01 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-09-01.md).
- 2026-09-02 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-09-02.md).
- 2026-08-30 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-08-30.md).
- 2026-09-03 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-09-03.md).

## Topical guardrails

- **R2 AI Stable** remains `historical 13/13 / current recapture open`. Any current-version claim must use `--requireCurrentVersion` and a manifest baseline matching `apps/core-app/package.json`; historical artifacts do not become current proof.
- **R9.2 ContextHygiene** retains completed P0/P1 and isolated packaged-entrypoint evidence, while real-profile and later scope migration remain open.
- **R8-F CatalogService MVP** 的 domain-lexicon 产品触发仍暂停；已获执行授权的 `09-13-voice-provider-cloud-pack` 是独立 scoped extension，代码与本地验证（含 `catalog/` 与 `0026`/`0046` 数据库表结构）已合入主线（`ad49febb0`），仅剩生产签名配置与付费真机调用运维验收。AI/Assistant/OmniPanel polish、desktop fireworks 与 broad search-class refactors 继续按原顺序暂停。
- **macOS 原生能力渠道化**先进入 AI topical backlog，不抢占当前 release/search blocker：评估机器本地能力的运行时发现、自动注入与平台降级，详细范围见 [`TODO-AI.md`](./TODO-AI.md#macos-原生能力渠道化候选)。

## Search index storage follow-ups

- [ ] **文件正文只存一份（方案 C，未开工，待单独设计）。** 2026-10-31 在一份 6.4 GB 的克隆索引库上用 `dbstat` 量到：同一份提取正文被存了三处——`files.content`（原文）、FTS `search_index` 的 `content` 列（自写入的 `toLowerCase()` 副本）以及它的 B-tree/docsize 页，加起来占库的一半以上。想让 `files.content` 不再存正文，需要同时改三件事，缺一不可：
  - FTS 的 `content` 与 `files.content` 内容并不相同（一个已小写、一个是原文），不能直接改成 FTS 外部内容表（`content=`），否则要改分词与写入路径，召回结果会变；
  - `embedding-service` 的写入栅栏（`files.content IS NULL` 且 `embedding_status = 'pending'`）、`search-index-service` 读取 `files.content` 的查询，以及 `file.search` 工具取片段的路径都要改成从别处取正文；
  - 改完必须做一次存量迁移与 `VACUUM`，否则文件不会变小，而 `VACUUM` 需要约两倍活数据的空闲磁盘。
  - 已经做掉的部分：超过 50,000 字符的文件整体不再做内容索引（`FILE_CONTENT_MAX_CHARS`，见 [search-hotpath-contracts](../engineering/specs/main-process/search-hotpath-contracts.md)）、向量改存 float32 BLOB（`d4bd5f915`）、`0055_search_keyword_postings.sql`（A10 整数 `doc_id`，关键词表体积实测 −81.8%）、`PRAGMA auto_vacuum = INCREMENTAL` 以及 `FILE-AND-APP-INDEX-ROADMAP` 的 `A14`/`A15`/`A16` 低风险减容（不含按 R3 契约保留的 `file_fts`）均已落地。方案 C 评估应基于减容后的当前 profile 复测，不再以 10-31 前旧库容为唯一依据。
  - `content_chunks`（语义命中后定位片段用，约 344 MB）不是纯冗余，不在本条范围内。

## Version-planned work

- [ ] **2.5.1：文件搜索与文件动作融合。** 主要功能已随 `2.4.15-beta.x` 迭代合入主线：P0 正文语义穿透已落地（目录结果与 `.app` 去重、⌘K 打开方式与 7 组文件动作、应用版本与真实创建时间摘要、权限/删除错误反馈）；B9 文件名错字 n-gram；PDF/code 分段、页码/行号片段和受控 EmbeddingGemma 2 本地 runtime contract 已接入；P1 原生 Scanner 对比已在 20,000 文件下实测完成（19ms vs 285ms，7.5MB vs 114MB，支持取消）；P3 文件移动/复制/废纸篓已落地，支持单文件原子硬链接防同名覆盖与跨卷身份复核（46 项单测通过）；P4 显式源码正文检索 `file.search` 工具已落地（5 项单测通过）；Windows Everything 托管 CI 门禁已于 PR `#2319`（`6022abdce`，run `45913177460`）实现 `26/26` 通过（含 SDK 与 unavailable 降级 CoreBox UI）。仍待实施的是 `#308` 严格 Windows acceptance manifest 回填、签名 helper 的 packaged release 验收，以及 `D1`/`C1-C2` 后续评估；模型与运行边界见 [调研报告](../engineering/reports/file-search-integration-2.5.1-2026-10-11.md)。本条不改变前述全局执行顺序。
- [ ] **2.5.2：现代浏览器工作区（Beta / 实验室特性）。** 走路线 1（`WebContentsView` + Vue 3 自研现代外壳 + 核心能力原生内置），规避通用 Chrome 扩展与 DRM 授权包袱；实际默认开关自 `73e6a1b8c` 起已切换为默认开启（`packages/utils/common/storage/entity/app-settings.ts` 中 `betaFeatures.browserWorkspace: true` 且启动迁移自动开启，PR `#2317` 已同步整合顶栏舞台操作，[2.5.2 浏览器工作区规划](./03-features/browser-workspace-2.5.2-plan-prd.md) 已同步更新为默认开启）。Phase 1 与 Phase 2 主体（LRU 挂起与核心快捷键）已入主线，余网页选区 AI 菜单钩子、Phase 3（`adblock-rust`、智能暗色模式）及实机生命周期验收开放；本条不改变前述全局执行顺序。

## Release follow-ups

- [ ] **v2.4.15-beta.9 发布说明默认开关勘误登记（历史 tag 未原地改动，已在 v2.4.15-beta.15 发布说明明示）**：`notes/update_2.4.15-beta.9.{zh,en}.md` 的 Known Limitations 保留只读历史原文（“浏览器工作区默认关闭 / off by default”），而代码自 `73e6a1b8c` 起已默认开启（含一次性迁移）；`notes/update_2.4.15-beta.15.{zh,en}.md` 已明示默认开启状态，待 `v2.4.15-beta.15` 发布并同步至 GitHub/Nexus 后勾除。

- [x] **v2.4.14 发布说明两处勘误已全部闭环（仓库、GitHub 与 Nexus 同步完成）。** `notes/update_2.4.14.zh.md`、`notes/update_2.4.14.en.md` 和 GitHub Release 正文已于 2026-10-11（`64eb69853`）改正，`.github/workflows/sync-nexus-release-notes.yml`（PR #2213 / #2214）已合入主线；2026-11-22 已执行 `sync-nexus-release-notes.yml`（run `45011852117`）完成 `v2.4.14` 双语 `notes` / `notesHtml` 回写，并通过 `tuff.tagzxia.com` 线上 API 回读验证一致。
  - 「尚未形成习惯时显示学习提示」不成立：`b8f2a2477`（10-03）先把学习提示换成空位占位网格，`0f6c75773`（10-07）又移除了习惯区的整个空态，tag 里已没有这段界面。已改为「尚未形成习惯时不填充虚构常用项目」。
  - 「支持从目录和网址直达常用操作」只对一半：目录成立，`system-actions-provider.ts` 给已存在的目录提供终端和文件管理器动作（`162809001`）；内核只把 `file://`、`tfile://` 解析成路径，普通网址直开由随应用内置的官方插件「浏览器打开」（`touch-browser-open`）提供。已改为「支持从目录直达常用操作，网址经内置 Browser 入口直开」。
- [x] **PR #2120（全量琉光材质与概念文档对齐）已合入主线。** 旁路 10+ 项修复与全量琉光材质已通过 `154c61b48` / `20860d02b` 合入 `master`，TuffEx 已推进至 `0.9.4`。后续两条长尾子项拆分收口：183.9 KiB 图标 safelist 剥离与按需 `classGlyph` 渲染已完成，core-app 历史对话框统一收敛在独立重构中推进，见 [TODO 长期债务池](./TODO-BACKLOG-LONG-TERM.md#a-架构与质量债务)。

