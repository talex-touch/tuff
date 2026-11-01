# Tuff 当前执行顺序

> Authority: this document is the sole global execution-order source. Confirm scope and acceptance with the user, then establish current status, blockers and handoff with the current owner using existing PRDs, engineering specifications and observed runtime evidence. Work planned before the 2026-10-03 cutover remains frozen in the [pre-cutover backlog](../engineering/workflow/backlog.md). `docs/comet/` preserves read-only pre-exit records and is not a source of live status or an execution entrypoint.

## Current order

1. **Close verified release and runtime blockers.** The OTA, macOS release-evidence, and application-icon acceptance work is frozen in the [pre-cutover backlog](../engineering/workflow/backlog.md); resume each one after confirming scope and acceptance with the user and handoff with the current owner, using its frozen record, PRD and evidence. The OTA parent was concurrently owned at cutover; this document does not restate its volatile child status.
2. **Complete the search and cross-platform remediation.** The [living audit](../engineering/reports/search-crossplatform-audit.md) owns the backlog; Windows productionization and the [search-index split write-path migration](../engineering/workflow/backlog.md#07-28-migrate-search-index-split-write-paths) are frozen records. The default-on topology is reconciled; the isolated-profile runtime evidence is still owed (see the [split acceptance record](../engineering/reports/search-index-split-write-acceptance.md)), and `=0` stays the emergency rollback.
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
- **R8-F CatalogService MVP** 的 domain-lexicon 产品触发仍暂停；已获执行授权的 `09-13-voice-provider-cloud-pack` 是独立 scoped extension，代码与本地验证已完成，待 review/landing。AI/Assistant/OmniPanel polish、desktop fireworks 与 broad search-class refactors 继续按原顺序暂停。
- **macOS 原生能力渠道化**先进入 AI topical backlog，不抢占当前 release/search blocker：评估机器本地能力的运行时发现、自动注入与平台降级，详细范围见 [`TODO-AI.md`](./TODO-AI.md#macos-原生能力渠道化候选)。

## Search index storage follow-ups

- [ ] **文件正文只存一份（方案 C，未开工，待单独设计）。** 2026-10-31 在一份 6.4 GB 的克隆索引库上用 `dbstat` 量到：同一份提取正文被存了三处——`files.content`（原文）、FTS `search_index` 的 `content` 列（自写入的 `toLowerCase()` 副本）以及它的 B-tree/docsize 页，加起来占库的一半以上。想让 `files.content` 不再存正文，需要同时改三件事，缺一不可：
  - FTS 的 `content` 与 `files.content` 内容并不相同（一个已小写、一个是原文），不能直接改成 FTS 外部内容表（`content=`），否则要改分词与写入路径，召回结果会变；
  - `embedding-service` 的写入栅栏（`files.content IS NULL` 且 `embedding_status = 'pending'`）、`search-index-service` 读取 `files.content` 的查询，以及 `file.search` 工具取片段的路径都要改成从别处取正文；
  - 改完必须做一次存量迁移与 `VACUUM`，否则文件不会变小，而 `VACUUM` 需要约两倍活数据的空闲磁盘。
  - 已经做掉的部分：超过 50,000 字符的文件整体不再做内容索引（`FILE_CONTENT_MAX_CHARS`，见 [search-hotpath-contracts](../engineering/specs/main-process/search-hotpath-contracts.md)），向量改存 float32 BLOB。方案 C 要在这两项落地并量过实际收益之后再决定值不值得做。
  - `content_chunks`（语义命中后定位片段用，约 344 MB）不是纯冗余，不在本条范围内。

## Version-planned work

- [ ] **2.5.1：文件搜索与文件动作融合。** P0 正文语义穿透已落地：目录结果与 `.app` 去重、⌘K 打开方式与 7 组文件动作、应用版本与真实创建时间摘要、权限/删除错误反馈；B9 文件名错字 n-gram；PDF/code 分段、页码/行号片段和受控 EmbeddingGemma 2 本地 runtime contract 已接入；P1 原生 Scanner 对比已在 20,000 文件下实测完成（19ms vs 285ms，7.5MB vs 114MB，支持取消）；P3 文件移动/复制/废纸篓已落地，支持单文件原子硬链接防同名覆盖与跨卷身份复核（46 项单测通过）；P4 显式源码正文检索 `file.search` 工具已落地（5 项单测通过）。仍待实施的是签名 helper 的 packaged release 验收；模型与运行边界见 [调研报告](../engineering/reports/file-search-integration-2.5.1-2026-10-11.md)。本条不改变前述全局执行顺序。
- [ ] **2.5.2：现代浏览器工作区（Beta / 实验室特性）。** 走路线 1（`WebContentsView` + Vue 3 自研现代外壳 + 核心能力原生内置），规避通用 Chrome 扩展与 DRM 授权包袱。功能设为 Beta，在设置中默认关闭（`betaFeatures.browserWorkspace: false`）；未开启时侧边栏无浏览器图标、路由拦截重定向，展示与行为完全保持现有启动器形态；开启后在侧边栏显示入口，进入包含垂直标签页管理、无边框视口与快捷导航的独立浏览工作区。PRD 见 [2.5.2 浏览器工作区规划](./03-features/browser-workspace-2.5.2-plan-prd.md)。本条不改变前述全局执行顺序。

## Release follow-ups

- [ ] **v2.4.14 发布说明有两处与代码不符：仓库和 GitHub 已改，Nexus 副本未改。** `notes/update_2.4.14.zh.md`、`notes/update_2.4.14.en.md` 和 GitHub Release 正文已于 2026-10-11 改正。Nexus 发布记录 `v2.4.14` 的 `notes` / `notesHtml` 是发版时同步过去的副本，同日用 `GET /api/releases/v2.4.14` 核对仍是旧措辞。改它要用发布同步密钥调 `PATCH /api/releases/v2.4.14`，或在管理台编辑；这属于对外发布，需先获授权。
  - 「尚未形成习惯时显示学习提示」不成立：`b8f2a2477`（10-03）先把学习提示换成空位占位网格，`0f6c75773`（10-07）又移除了习惯区的整个空态，tag 里已没有这段界面。已改为「尚未形成习惯时不填充虚构常用项目」。
  - 「支持从目录和网址直达常用操作」只对一半：目录成立，`system-actions-provider.ts` 给已存在的目录提供终端和文件管理器动作（`162809001`）；内核只把 `file://`、`tfile://` 解析成路径，普通网址直开由随应用内置的官方插件「浏览器打开」（`touch-browser-open`）提供。已改为「支持从目录直达常用操作，网址经内置 Browser 入口直开」。
- [ ] **PR #2120（全量琉光材质与概念文档对齐）及旁路问题收口。** 旁路 10+ 项修复（工区 `/private/tmp/tuff-side-issues-1017`，分支 `task/feat/refraction-surfaces-and-concept-docs`，31 文件）已完成：BottomDialog 150ms 截断修复、TxFlatRadio 强制颜色与高对比度选中态、TxBlowDialog/TBlowDialog 安全移除样式、TxModal/TxDrawer 焦点环抑制与防视口跳动、refractionRenderer="css" 毛玻璃降级修复、着色模式抽屉修复等，120 项单测通过且 CSS 预算受控；等待正式审查与合入授权。后续长尾债务（183.9 KiB 图标 safelist 局部 classGlyph 剥离、core-app 历史对话框副本平迁）已归档至 [TODO 长期债务池](./TODO-BACKLOG-LONG-TERM.md#a-架构与质量债务)。

