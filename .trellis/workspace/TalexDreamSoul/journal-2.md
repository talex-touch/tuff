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
