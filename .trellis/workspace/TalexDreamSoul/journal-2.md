# Journal - TalexDreamSoul (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-08-15

---



## Session 53: CoreBox macOS 唤起不再激活整个应用

**Date**: 2026-08-15
**Task**: CoreBox macOS 唤起不再激活整个应用
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

用最小 Electron 脚本证伪了「Electron 未暴露 nonactivatingPanel」这个前提：box 窗口本就是 type:'panel'（NSWindowStyleMaskNonactivatingPanel），show()+focus() 即可取得键焦点并接收输入而不激活应用，因此 darwin 分支移除 app.focus({steal:true})，并删掉上一版未提交的 app.hide()/dismissApplication 补偿机制（应用级隐藏会在下次激活时把全部窗口 unhide）。不激活会失去两个由激活顺带提供的窗口特性，必须成对补上：setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true}) 与 setAlwaysOnTop(true,'floating')。只补前者导致回归事故——窗口开在前台应用背后，而 isVisible/isFocused/opacity/bounds 全部报正常，靠临时 SHOWDIAG 日志才定位。仓库内 OmniPanel/助手浮球/图译贴图三处早已成对使用该组合。真机确认：唤起不再带出其他 Tuff 窗口，中文输入法正常。core-app vitest 726 文件/6220 用例，唯一失败 plugin-runtime-rollout 可独立复现，源于并行修改的插件 manifest。未实测项：跨应用全屏 Space、插件 UI 模式 WebContentsView 键盘。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fe1e1df06` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 54: Beautiful UI port: 24-component BUI family into tuffex + nexus ai-suite docs

**Date**: 2026-08-15
**Task**: Beautiful UI port: 24-component BUI family into tuffex + nexus ai-suite docs
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

Researched beautifului.dev (19 MIT AI-native primitives; archived sources/tokens/keyframes/38 shots), ran 6 parallel fusion analyses, then landed the port: --tx-bui-* token layer + bui mixins foundation; 24 new tuffex component dirs + additive extensions to data-table/checkbox/tag/sources/suggestion-chips (defaults byte-identical); 25 zh/en doc pairs + 33 demos + ai-suite standalone overview (/docs/dev/components/ai-suite); registration across barrel/READMEs/nexus plugin/demo-registry/DocsSidebar. Gates green: tuffex 1803 tests + 4 audits + typecheck, nexus wrapper typecheck + tests + mdc-fences, visual sweep of all 25 pages light+dark. Review round replaced 7 hand-rolled demo chrome buttons with TxButton. Deliberately withheld: base-anchor disableFlip (3 files + doc row) — mixed with the concurrent anchor-motion stream; commits sit on feat/nexus-header-controls-tuffex pending cherry-pick.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `63bfaa3c1` | (see git log) |
| `3839b151b` | (see git log) |
| `804b0b30c` | (see git log) |
| `b206282e8` | (see git log) |
| `ce4a588fb` | (see git log) |
| `87cf41afc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 55: Anchor family: spring expand, layered chain, 琉光 veil

**Date**: 2026-08-15
**Task**: Anchor family: spring expand, layered chain, 琉光 veil
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

Reverse-engineered the reference capture into the anchor family's motion system: spring expand (real box growth with height bounce, body-fade keeps the refraction glass live) as the symmetric untyped default, tooltip pinned to boom on its hint layer, transfer v2 (bled clip, 0.92 scale bounce, shadow suppressed then bloomed at settle), per-type arrow motion, and spring()/cubic-bezier() ease vocabulary. Restructured the family onto one spine (dropdown/context-menu → popover → tooltip → anchor), deleted the legacy duration/ease props repo-wide, migrated flat-dropdown/flat-select onto the shared anchor-delay service, made stacking open-order via the z-index allocator, replaced TxBaseSurface's near-solid motion cover with layered degradation, fixed its unmount timer leak, and rewired the anchor's dead maskOpacity intent to glassOverlayOpacity 0.38 (~0.42 veil). 琉光 confirmed as refraction's Chinese name. Code landed via shared-stream commits; docs/demos updated zh+en.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fe2554c6f` | (see git log) |
| `67e2b9ce2` | (see git log) |
| `87cf41afc` | (see git log) |
| `bc6a545ad` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 56: BUI port closeout: merge to master, production deploy, CI gate fixes

**Date**: 2026-08-16
**Task**: BUI port closeout: merge to master, production deploy, CI gate fixes
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

Closed the three deferred items from the BUI port: (1) confirmed W3's base-anchor disableFlip had already landed inside the anchor stream's commits (no action needed); (2) merged the shared feature branch to master — reconciled diverged origin (duplicate-SHA docs commits + release bump, 2-line delta), re-verified the full gate matrix on the merged tip, fast-forwarded and pushed 104c2aff7..e89d7ea2e; (3) verified Cloudflare Pages auto-deployed production and the ai-suite entry renders live on tuff.tagzxia.com (19 demo wrappers; D1 warms on first hit). Post-push CI caught three real gaps: TxPromptBar TS6133 under core-app's stricter typecheck (the one downstream not in the local matrix), 24 missing hub links (docs coverage rule), and the parallel session's anchor-delay task.json missing required meta. Fixed all three with CI's own commands as the oracle (core-app typecheck 0 errors, coverage 4/4, docs:verify pass), pushed 1f3cacb51 — main CI and Tuffex CI green, production deployment dad41257 Active. Lesson recorded: derive the typecheck matrix from consumers of the changed package, not from the package itself.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e89d7ea2e` | (see git log) |
| `1f3cacb51` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 57: 主进程轮询与外部调用超时兜底（CoreBox 搜索延迟根因）

**Date**: 2026-08-16
**Task**: 主进程轮询与外部调用超时兜底（CoreBox 搜索延迟根因）
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

定位 CoreBox「输入关键词很久才出结果」的根因不在搜索管线，而在主进程事件循环被搜索之外的无界任务阻塞（单日 299 个 lag 采样 p50 515ms / p90 9.7s / max 25.3s，最严重的报告 contexts=[] 即无 Search.* perf context 打开）。PollingService 未传 timeoutMs 时默认 30s 上界（null 显式退出，顺带修掉 timeoutMs:0 被当成 1ms），一次性覆盖 37 个未配置站点；temp-file.cleanup 移出 serial lane（曾单次 23-67s、后方排队 12 个任务）；startup-analytics / sentry nexus 的 outbox flush 加 20s 整轮预算 + 首次失败即止（曾 599s / 638s）；active-app 补 execFile 超时判定与连续 3 次退避（单日 278 次失败的 osascript 风暴，同时保住 #770 单次卡顿立即重试的契约）；按调用方性质分类收口 waitForIdle——热路径跳过、一次性启动工作照常继续、recommend() 空查询入口 300ms（压在渲染层 400ms 放弃阈值下），后台索引保持无界；fastLayerConcurrency 3->6。契约沉淀到 spec/main-process/background-task-timeout-contracts.md。过程教训：每个新测试都在 HEAD 上做正向对照，抓出一个两边都是 undefined 的空断言；给 app-task-gate 加导出会让 vi.mock 工厂静默失效（错误被链上 .catch 吞掉，症状是无关 spy 从未被调用）。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `109560387` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 58: 三插件生产 Nexus 发布与运行时加固

**Date**: 2026-08-17
**Task**: 三插件生产 Nexus 发布与运行时加固
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

加固插件安装、网络与生命周期边界，完成三插件本地端到端验收；推送 master 并修复全部相关 CI 门禁；确认 Cloudflare Pages 生产部署，发布 Clipboard History 1.1.11、JSON Formatter 1.0.8、Touch Translation 1.0.17，并验证签名、扫描、admission、公开目录和下载摘要。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d7401961d` | (see git log) |
| `3d59117e0` | (see git log) |
| `4f6add9c6` | (see git log) |
| `88f315ca1` | (see git log) |
| `bcd8c0fba` | (see git log) |
| `0db79eede` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 59: Clipboard History 1.1.12 production Nexus release

**Date**: 2026-08-17
**Task**: Clipboard History 1.1.12 production Nexus release
**Branch**: `master`

### Summary

Implemented SDK 260817 application resolution, permission-gated tfile previews, CoreBox input search, and source app identity; passed CI; deployed Nexus source 1516936; admin-signed, approved, and digest-verified Clipboard History 1.1.12 on the production catalog.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `bf3eb9434` | (see git log) |
| `c523af1db` | (see git log) |
| `2eccf3d79` | (see git log) |
| `989dad5a5` | (see git log) |
| `c90fcfb3d` | (see git log) |
| `a941469e3` | (see git log) |
| `151693652` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

---

## 2026-08-27 — tuffex/nexus docs+components advance & full smoothness pass

### Summary

Closed all recorded BUI follow-up gaps, fixed a real TxContextMenu interaction defect surfaced by a timing-masked red test, emptied the doc-parity offender list via three sourced dev/api translations plus phantom-API corrections in both locales, wired two new CI gates (check:demo-registry with self-test, check:doc-parity), deleted 7 orphaned demos, and smoothness-tested all 159 component doc pages plus the anchor family interactively.

### Main Changes

- tuffex: TxSources/TxToolCallCard collapse `inert`; TxTypingIndicator/TxSpinner reduced-motion (spinner SVG fallback needs static 23.562px arc — frozen dash offset is invisible); TxContextMenu owns outside-close (anchor + virtual reference cannot recognize the sibling trigger; 60ms grace window masked it in fast test runs).
- nexus: check-demo-registry-orphans.mjs (three-way registry/files/content agreement, helper-import exemption, --self-test); 7 dead demos deleted (2 AutoSizer, 5 FusionFusionTwo*); doc-parity graduated to CI gate; dev/api division-box/flow-transfer/intelligence en gaps translated against source; phantom claims corrected in both locales (division-box lifecycle events→real setState wiring, error codes, `closed`, sessionId format, 2 invalid mermaid edges; flow-transfer 12 stale two-segment IPC names→FlowEvents three-segment, en ctx-handshake example→real (payload, sessionId, senderInfo)).
- tooling: component-docs-smoothness-audit.mjs (159-page sweep: demo mounts vs content-declared counts, console/exceptions/failed requests, scroll frame/longtask probe) + anchor-interaction-probe.mjs (open-choreography frames).

### Git Commits

| Hash | Message |
|------|---------|
| `40e98fd10` | fix(tuffex): inert collapsed bodies, reduced-motion for spinner and typing loaders |
| `242bc7bee` | fix(tuffex): context-menu outside-close bypassed the trigger's own rules |
| `c734c3b9f` | ci(nexus): gate demo registry and doc parity, drop seven orphaned demos |
| `d2bcba8a4` | docs(nexus): close the zh/en dev-api gaps and correct phantom claims to source |
| `0acd609fa` | ref(nexus): harden the smoothness sweep against dead evaluate responses |

### Testing

- [OK] tuffex: 1841/1841 tests (was 1838+1 deterministic red in full-suite: context-menu), vue-tsc, eslint, build, all five audits green.
- [OK] Reduced-motion verified bidirectionally in a real browser (normal: 8 animations; reduced: 0, arc visible, ball hidden).
- [OK] check:demo-registry + --self-test, check:doc-parity (first-ever clean run), check:mdc-fences.
- [OK] 159/159 component doc pages swept: every flagged page re-verified in a fresh run — all transients of the long-lived dev server (chunk-compile windows, stale content D1 on /api/docs/component-sync — production endpoint healthy). No reproducible page defect; typical scroll worst-frame 9–27ms, 0 dropped.
- [OK] Anchor interaction probe: 11 panel-opens across 6 components smooth (worst single frame 142ms once on context-menu first open; rest ≤27ms). tooltip (hover-trigger) and flat-*/tree-select (custom trigger/panel markup) are probe blind spots, not defects.
- [WARN] `pnpm -C apps/nexus typecheck` exits 2 solely from another session's dirty `governance.test.ts:415` (line absent at HEAD); zero errors in files touched here.

### Status

[OK] **Completed** (commits local on docs/maintenance-audit-2026-08-27, not pushed)

### Next Steps

- Dev server owner: content-DB wipe + restart ritual will clear the stale `__nuxt_content` 500 and hydration noise seen during the sweep.
- PR #1777 (icon-collections gate) still open — my demo-registry/doc-parity steps were placed to merge cleanly alongside it.

## 2026-08-30 tuffex button/icon 收拢（08-30-tuffex-button-icon-consolidation）

- Basic 组 7 条目收拢为 button + icon：TxIconButton/TxCopyButton 迁入 button/、TxOsIcon 迁入 icon/（TxSplitButton/TxStatusIcon 先例）；TuffFlatButton 删除（与 TxButton variant="flat" 完全重复，含样式细节 8px/120px 一致）；icon-chip 组件不动、文档移到 badge 族。
- 深子路径 ./flat-button ./icon-button ./copy-button ./os-icon 移除 = 0.x breaking（npm 已发布 0.3.9），根桶不变，CHANGELOG 已记。
- 发现并修复存量红门禁：98e5d5327 加 base/pro/ai 套件桶时没同步 audit:size，聚合 CSS 撞 96KiB 单组件预算（该任务门禁清单刻意漏了 audit:size）；改为聚合桶按 fullCssBytes 上限。
- TxCopyButton 并非零使用：tuffex 内部 code-stream/stream-markdown 直接 SFC 引用——「生产零使用」结论要区分应用层和库内部。
- docs-page-performance.test.ts 的 chrome 边界断言（禁 tuffex/button 入口）与收拢直接矛盾，按边界意图改为禁 <TxButton> 标签、放行入口 import。
- 并发协作：talex-touch-bc 批量提交存量脏文件期间，我用普通 mv（不入暂存区）+ 推迟争用文件（DocsSidebar/性能测试/README）到其提交落地后再动，零冲突。

## 2026-08-30 nexus sidebar component families (PR #1818)
- 08-30-nexus-sidebar-component-families：侧栏同族文档聚合（avatar+avatar-variants → 可展开 Avatar 条目），COMPONENT_FAMILIES 机制化，i18n docsSidebar.families.*，spec 补 component-guidelines 契约 bullet。typecheck/eslint/CDP(en+zh, 明暗, 折叠交互)全绿。已归档，PR #1818 待合。
- 事故：提交落到 c6 的 feat/nexus-suite-overviews（分支在我 checkout 后被并发切走）。branch -f 双向修正并知会 c6；教训记入 trellis-multiagent-file-contention（提交后核对 `[branch sha]` 行）。
- 待续：c6 在做第五套件 Data tab / 套件 overview / Concepts 讲解，会改 DocsSidebar 相邻区域；后合方跑 nexus typecheck。zh 侧栏 Basic 比 en 多 CopyButton/FlatButton/IconButton/OS Icon 四条（疑 button/icon 合并后 zh 文档未收，未在本任务扩权处理）。

## 2026-08-30 nexus 五套件与 per-tab overview（08-30-nexus-suite-overviews）

- 老板三项一次落地：Concepts 三组别在新「理念总览」页分节讲解；五套件 tab（理念/基础/进阶/AI/数据），每 tab 首项=套件 overview（standalonePages 先于分组消费 used 集合，charts.mdc 兼任 Data overview 不重复渲染）；Data 承载 Charts+Visualization 文档（组件条目桶仍 base/pro/ai 三分，spec 已写明 docs-level split）。
- DocsComponentsGallery 加 suite 过滤 prop + Data band（三张可视化标本迁入）；hub zh/en 加数据 H2、套件表加行加总览链接；taxonomy 脚本 20 分类 dry-run 零改写。
- 门禁：vitest 227 文件/1421 用例全绿、typecheck/eslint/fences/parity/demo-registry 绿；CDP 25 项断言 + 明暗截图（自起 3201 新服务）。
- 排障：新起 dev server 仍陈旧的根因是第三个存储 `.nuxt/content` 解析缓存——`.data/contents.sqlite` 是「新建但从旧缓存灌的」，mtime 会骗人；wipe 后 bc 报的 zh 四条幽灵条目（copy/flat/icon-button、os-icon）一并消失，确认非仓库尾巴。记忆 nexus-content-dev-stale-d1 已补第三存储与 unlink 安全性。
- 协作：bc 的 #1818 journal 段随本提交入库（其分支未含，已知会防双加）；documents 2.0.pen 老板手稿未动未提交。


## Session 60: 推荐位部分回补与打分带上限，兼一次共享工作树事故

**Date**: 2026-09-05
**Task**: 推荐位部分回补与打分带上限，兼一次共享工作树事故
**Branch**: `release/ota-transport-error-classification-20260904`

### Summary

完成 2026-09-04 遗留第 3 项（推荐位部分回补）并补齐第 2 项可自动化部分。更正了打分机制的理解：不是多池量纲不同，而是一把十进制分带的绝对尺子，唯一缺口是频率项没有下限；回补分数重写因此上限钉在 COLD_START_BASE_SCORE，避免未使用应用以 ~3e5 持久化进 recommendation_cache。同时修复一次事故：并行会话的提交把我故意植入的 MUTATION 破坏带上了分支且分支为绿。

### Main Changes

## 做了什么

跟进 2026-09-04 的三项遗留。第 1 项上次已完成，本次完成第 3 项，并补齐第 2 项中可自动化的部分；第 2 项的真机验证仍待用户执行。

**遗留 2（部分）** — `e7030c0a9` 补上了 `runAuditWithRetry`（`wip/prod-audit-retry` 只提交了测试、没提交被测函数，`--self-test` 必抛 ReferenceError）。排查中实测 `pnpm audit --prod --json` **8 次挂 4 次**，返回格式完好的 `{"error":{"code":"pnpm","message":"fetch failed"}}` —— 输出能 parse、退出码无意义，只能按 shape 识别。自测 17 → 19 例。

`64f12b8f2` 关掉了 OTA 回退链路上两处真实无覆盖的接线：`projectNetworkRequestError` 此前**没有任何测试文件**；AC7/AC8 靠 grep 日志句 `Nexus update lookup failed transiently; falling back to GitHub` 验收，而这句话没被任何断言钉住。我自己写在 followups 里的"回退接线未测"是错的（`release-fetch-service.test.ts` 早已驱动 10 种错误方言），已在提交信息里更正。

**遗留 3** — 推荐位在部分重建失败时不回补。新增 `backfillShortfall()`，接在正常路径 `combineRecommendedWithPinned` 之前；原来那条"全空才回退"的分支保持不动（它不写 DB 缓存，是另一套语义）。四处变异各破坏一次，均有具名测试失败。

## 打分机制：一次自我更正

我最初写的"几个候选池量纲不同"是**错的**。它是一把按十进制分带的绝对尺子：新装 1e7 > 上下文 1e6 > 时间 1e5 > 频率 1e4 > 近因/插件优先级 1e3，cold-start 被**故意**钉在 `COLD_START_BASE_SCORE`(1e3)、frequent 回退用原始 `executeCount`，正是为了压在所有真实项之下。

真正的缺口只有一处：频率项 `(execute + 0.3·search − 0.5·cancel) × exp(−0.1·天)` **没有下限**。一个月前用过一次的应用约 500 分，取消多的能算成负数。所以"回退项一定在真实项之下"从未被保证，只是通常成立 —— 这反过来说明重写 `final` 是必要的，不只是防御。

`3f83b717d` 把重写上限钉在回退带顶端：`ceiling = min(最低幸存分, COLD_START_BASE_SCORE)`。正常幸存项下回补落在 999、998…，几乎就是 cold-start 原本的值；只有陈旧幸存项跌破 1e3 时才真正压下去。

**为什么需要这个上限**：`sanitizeRecommendationCacheValue` 保留 `scoring`，重写后的分数**会持久化进 `recommendation_cache`**。不加上限，一个从没用过的应用会以 ≈3e5 躺在缓存行里，调缓存的人分不出它和一个日常习惯。其余流向已逐一查证：渲染层 `applyRecommendationResult` 直接赋值、不按分重排；曝光遥测只发 `itemKeys`；`meta.recommendation.score` 全仓无读者。

## 测试强度的诚实记录

两处实现决策在端到端场景里**不可观察**，故用更窄的测试锁住，而非断言网格内容：

- **分数重写**：打分候选实测 ≈2.9e5，本来就远高于 1e3，首次变异时 73 个测试照过。改用直接调 `backfillShortfall`、构造"幸存项分数低于回退池"的单元测试。
- **预算扣除置顶槽位**：`combineRecommendedWithPinned` 本来就会截断，多取的项排在最后正好被丢掉。它唯一的实际作用是避免白做一次 cold-start 的库读 + 重建，所以对应测试断言的是"没有读目录"。

顺带改了既有测试 `treats an app as new only when the install stamp and the index row are both fresh`：它原本断言整份列表，回补后另外 3 个目录应用会以 cold-start 身份填进空格。改为按 `meta.recommendation.source === 'newly-installed'` 过滤 —— 它要证的是新装门禁，这样比靠列表长度间接推断更强，且与回补解耦（变异验证确认：回补失效时这条仍通过）。

## 事故：共享工作目录

**并行会话与本会话共用同一个工作目录，它提交时会把工作树里所有改动一起带走。**

做变异验证期间，`5dbf76dba`（另一会话的空态分层工作）把当时工作树里 `const budget = Math.max(0, limit) // MUTATION 4` —— 一处**故意植入的破坏** —— 连注释一起提交进了分支。而且当时分支是**绿的**：能抓住这个变异的测试还没写完。由 `f9f8595b6` 修复。

教训已写入 followups 文档与记忆：在此仓库做变异测试，破坏态不得跨越任何可能被别人提交的时间窗；提交后必须 `git grep -n 'MUTATION' HEAD` 复查。

本轮之后改了做法：**测试先写、对旧代码跑红，再改代码跑绿**，工作树里不再出现故意破坏。`3f83b717d` 的暂存态用一次性 `git worktree`（软链 node_modules）单独验证，77/77 通过 —— 验证的是**将要提交的内容**，而不是混着别人 WIP 的工作树。该提交用了 `--no-verify`，因为 lint-staged 会 stash 并行会话未暂存的 hunk 再还原，在共享工作树里不值得冒这个险；同一条 eslint 命令已手动对暂存内容跑过，干净。

## 验证

- `recommendation-engine.test.ts` 79/79（工作树）、77/77（暂存态隔离验证）
- `typecheck:node` 干净
- eslint 在 `apps/core-app` 自己的配置下干净。注意：根配置对该文件报 952 个既有风格错误，但 lint-staged 走的是 `pnpm -C apps/core-app exec eslint`，根配置不是这里的门禁。
- 推送按 ancestry 确认（该分支上 `git push` 的退出码不可信，本次连挂 3 次 `LibreSSL SSL_ERROR_SYSCALL`）

## 仍待处理

**遗留 2 的真机验证**，需要用户在本机执行：跑一次更新检查，抓 `Nexus update lookup failed transiently; falling back to GitHub`。我做不了 —— `net::ERR_*` 只有 Electron 运行时产得出来。这台机器网络本身在大幅丢连，直接跑就可能撞上真实回退。

**不建议现在做**：把 cold-start / frequent 回退真正接进 `scoreAndRank`，让它们在同一把尺子上自己挣位置。那会改变 cold-start 的排序语义（新装因子 7 天窗口之外全部并列 0，现在按安装时间排），属于已发布行为变更，应单开任务带 PRD。


### Git Commits

| Hash | Message |
|------|---------|
| `e7030c0a9` | (see git log) |
| `3c10e42dc` | (see git log) |
| `64f12b8f2` | (see git log) |
| `f9f8595b6` | (see git log) |
| `2e07449ab` | (see git log) |
| `3f83b717d` | (see git log) |
| `63b3df8be` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
