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
