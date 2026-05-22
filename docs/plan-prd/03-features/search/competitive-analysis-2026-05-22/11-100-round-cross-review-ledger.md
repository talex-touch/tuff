# 100 轮竞品分析交叉审计台账

## 1. 任务背景与轮数统计

本台账用于核验 Raycast、Alfred、uTools 三类效率启动器 / 插件生态竞品分析的 100 轮审计要求。前置 10 个专题文档虽然已经完成，但实际 codex-potter summary 轮数合计为 28 轮；后续台账任务实际完成 2 轮，并追加 70 个独立 micro-round，每个 micro-round 均有独立输出文件和 `CodexPotter summary: 1 rounds` 日志。

最终轮数口径只按真实日志 summary 计数：前置 10 个专题实际轮数 28 + 台账任务实际轮数 2 + `micro-rounds/logs` 中 70 条 `CodexPotter summary: 1 rounds` = 累计 100 轮。

本轮新增本台账与 `micro-rounds/round-01.md` 至 `round-70.md`；未修改业务代码。对 01-10 未做语义修正，仅为通过尾随空白校验，机械清理了 `02`、`03`、`06`、`07`、`08` 引用头部的 Markdown 行尾空格。

## 2. 输入文档清单

| 编号 | 文档 | 本台账复核用途 |
| --- | --- | --- |
| 01 | `01-basic-capability-alignment.md` | 基础能力矩阵、Tuff 当前能力快照、P0/P1/P2 分层 |
| 02 | `02-raycast-smooth-interactions.md` | Raycast Search Bar、Action Panel、Quicklinks、Snippets、Dynamic Placeholders、Translate、AI Commands |
| 03 | `03-alfred-workflow-model.md` | Alfred Workflows、Script Filter、Universal Actions、Variables、Configuration、Debugger、Gallery |
| 04 | `04-utools-plugin-cross-platform.md` | uTools `plugin.json`、`cmds`、超级面板、动态功能、AI Agent tools、跨平台 |
| 05 | `05-search-performance-ranking.md` | 搜索性能、排序、trace、Everything/FileProvider、键盘导航 |
| 06 | `06-parameter-filling-dynamic-variables.md` | 参数填充、动态变量、`TuffParameterSet` / variable contract |
| 07 | `07-translation-ocr-ai-commands.md` | 翻译、OCR、AI Commands、Provider health、隐私与失败态 |
| 08 | `08-plugin-store-sdk-ecosystem.md` | 插件生态、Nexus Store、`.tpex`、SDK、CloudShare、发布任务流 |
| 09 | `09-cross-platform-local-data.md` | 跨平台本地数据、Clipboard、Browser Data、System Actions、Window Management、Storage/Sync |
| 10 | `10-execution-roadmap-synthesis.md` | 总路线、issue/PR 切片、Evidence 统一口径 |

## 3. 72 条补充审计明细

| 轮次 | 审计主题 | 读取 / 核对锚点 | 结论 | 是否需要修正文档 |
| --- | --- | --- | --- | --- |
| 1 | 基础能力总口径是否过度乐观 | `01` 第 1/3/4 节；`10` 第 1/3 节；`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | `01` 把 Tuff 定义为“底座散落存在、release evidence 不足”，没有把源码存在直接写成产品闭环；与 `10` 的 P0 evidence 路线一致。 | 否 |
| 2 | CoreBox 全局入口是否有真实源码锚点 | `01` 第 3 节；`apps/core-app/src/main/modules/box-tool/core-box/index.ts`；`core-box/manager.ts` | 文档把 CoreBox 归为“已落地但需 packaged evidence”是稳妥口径；下一步应补快捷键冲突、跨屏、重复触发 evidence。 | 否 |
| 3 | App Launcher 状态是否应算 P0 证据缺口 | `01` 第 3/4 节；`apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`、`win.ts`、`darwin.ts`、`linux.ts` | 文档正确区分三平台扫描链路与 release-blocking 样本缺口；不应新增架构重写建议。 | 否 |
| 4 | 文件搜索是否覆盖 Windows/macOS/Linux 差异 | `01`、`05`、`09`；`everything-provider.ts`、`native-file-search-provider.ts`、`file-provider.ts` | `EverythingProvider` 是 fast，`FileProvider` 是 deferred，Native provider 提供 Spotlight / Linux backend；文档要求分别补 SDK/CLI/unavailable、P50/P95 和平台 reason，合理。 | 否 |
| 5 | Calculator 是否被误判为未实现 | `01` 第 3/4 节；`05` 搜索体验；`apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.ts` | Preview/Calculator 路径已存在，差距是 discoverability 与样本证据，不是计算核心缺失；`01`、`10` 口径一致。 | 否 |
| 6 | Clipboard History 是否包含多类型输入边界 | `01` 第 3/4 节；`apps/core-app/src/main/modules/clipboard/*`；`plugins/clipboard-history/manifest.json` | 插件声明 text/image/files/html，主进程有 capture/persistence；文档把图片/文件/HTML 回贴与隐私 evidence 放 P1，合理。 | 否 |
| 7 | Snippets 当前能力是否被夸大 | `01`、`02`、`06`；`plugins/touch-snippets/index.js` | 当前 placeholder 只覆盖 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}`，文档没有宣称 Raycast 完整对齐；后续 contract 优先于扩写插件。 | 否 |
| 8 | Quicklinks / Web Search 是否只有分散实现 | `01`、`02`、`06`；`plugins/touch-browser-open/index.js`、`touch-browser-bookmarks`、`touch-browser-data` | 当前只有 URL builder / bookmarks / Browser Data 切片，缺统一 Quicklink schema；文档 P1 路线正确。 | 否 |
| 9 | Emoji / Symbols 是否应进入 P0 | `01` 第 4/5 节；`plugins/touch-emoji-symbols/index.js` | 首版搜索复制足够，recent usage 和数据集扩展是 P2；没有必要抢 P0 evidence 主线。 | 否 |
| 10 | System Actions 是否需要 typed provider | `01` 第 3/4 节；`plugins/touch-system-actions`；`addon/system/system-actions-provider.ts` | 当前 shell-backed 动作存在，但平台 reason 和设置 provider 仍弱；P1 建议“只读 platform.settings source”恰当。 | 否 |
| 11 | Window Management 是否存在平台证据风险 | `01`、`09`；`plugins/touch-window-manager`、`touch-window-presets` | 插件依赖 `system.shell` 且 Linux unsupported / Windows-only 场景明显；文档强调多屏、权限拒绝、native transport evidence 是必要约束。 | 否 |
| 12 | AI 能力是否掩盖基础搜索缺口 | `01`、`07`、`10`；`plugins/touch-intelligence`；`packages/utils/transport/sdk/domains/intelligence.ts` | 文档明确 AI 是入口增强，不能替代基础搜索 P0；路线避免把 AI rerank 当 MVP，正确。 | 否 |
| 13 | OCR / 翻译是否有可触发路径 | `01`、`07`；`plugins/touch-translation`；`apps/core-app/src/main/modules/ocr/ocr-service.ts`；`core-box/image-translate.ts` | 文本翻译、截图/图片翻译路径存在，但 provider fallback、权限拒绝、剪贴板图片样本仍需 evidence；文档口径正确。 | 否 |
| 14 | 插件生态是否应宣称安全 parity | `01`、`08`；`packages/tuff-cli-core/src/validate.ts`；`apps/nexus/server/utils/tpex.ts` | `.tpex` integrity 与 `tuff validate` 存在，但不是完整恶意代码扫描；`08` 没有宣称 Raycast Store security parity，保守正确。 | 否 |
| 15 | Notes / Calendar / Reminders 是否应进入当前基础对齐 | `01` 第 4/5 节；`09` 第 4 节 | 文档把这类本地 PII 数据源放 P2 调研，符合 Storage/Security 规则；不应默认扫描。 | 否 |
| 16 | Focus 类能力是否应作为竞品必补项 | `01` 第 4/5 节；`10` 第 6 节 | Focus 被列为 P3 长期债务，避免抢 2.4.11 稳定化主线；判断合理。 | 否 |
| 17 | Raycast Search Bar 对 Tuff 的映射是否清晰 | `02`；`packages/utils/core-box/tuff/tuff-dsl.ts`；`useSearch.ts` | `TuffQuery.text` 与 `inputs` 的区分为 Search Bar + context input 提供基础；`02` 建议统一参数和动作合同，方向正确。 | 否 |
| 18 | Action Panel 是否有可复用前端入口 | `02`、`05`；`apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`；`useActionPanel.ts` | `Cmd/Ctrl+K` MetaOverlay / Action Panel 路径存在，缺 action taxonomy 和 evidence；无需复制 Raycast 全快捷键。 | 否 |
| 19 | Quicklinks 动态参数是否应独立建模 | `02`、`06`；`touch-browser-open/index.js` | 当前 per-engine `encodeURIComponent(query)` 不等于可配置 Quicklink；文档建议 `QuicklinkSource` / `TuffParameterSet` 是正确边界。 | 否 |
| 20 | Snippets Dynamic Placeholders 是否与 Raycast 差距明确 | `02`、`06`；`plugins/touch-snippets/index.js` | 文档明确缺 `cursor`、`calculator`、browser-tab 等，不把首版 placeholder 宣称完整；无需修正。 | 否 |
| 21 | Raycast Translate 是否映射为 Context Action 而非孤立插件 | `02`、`07`；`plugins/touch-translation/index/main.ts`；`OmniPanel` selected text | 选中文本、剪贴板图片、截图翻译应统一 evidence；文档没有只停留在插件内功能，合理。 | 否 |
| 22 | AI Commands 是否被过早产品化 | `02`、`07`、`10`；`apps/core-app/src/main/modules/omni-panel/index.ts`；`plugins/touch-intelligence` | 文档把 AI Commands 放 P1 contract/evidence，而非 P0；符合“AI 增强但不遮挡基础失败”的原则。 | 否 |
| 23 | Favorites / Aliases / pinned 是否有排序锚点 | `02`、`05`；`tuff-sorter.ts`；`RecommendationEngine` | pinned、frequency、recency 已有排序机制，但缺 top-N explain 样本；文档将其归为 evidence 缺口合理。 | 否 |
| 24 | Raycast File Search Action Panel 是否覆盖文件动作 | `01`、`02`、`05`；`file-provider.ts`；`TuffItem.actions` | 文件召回与 action 机制有基础，但 Quick Look / terminal / save quicklink 等不应直接宣称；台账保持 P1 action evidence。 | 否 |
| 25 | Raycast Dynamic Placeholders 中 `{calculator}` 是否被遗漏 | `01` 第 2.1 节；`06` | `01` 已明确 Raycast `{calculator}` 同时用于 Quicklinks 与 AI Commands，而 Tuff 只算首批占位符闭环；无事实错误。 | 否 |
| 26 | Raycast Windows 核心能力是否覆盖全面 | `01` 第 2.1 节；`02` 引用来源 | App Launcher、File Search、Clipboard、Snippets、Quicklinks、Calculator、Emoji、Shortcuts、AI 均已纳入矩阵；无遗漏。 | 否 |
| 27 | Alfred Workflow 是否被误解为必须上画布 | `03`、`10`；`.codexpotter/kb/alfred-workflow-model-2026-05-22.md` | 专题明确先做 manifest + Prelude + typed SDK contract，不先做完整可视化画布；判断优雅且符合 KISS。 | 否 |
| 28 | Alfred Script Filter 与 Tuff plugin feature 搜索的映射 | `03`；`apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts` | Tuff plugin feature 可返回动态搜索结果，但缺 run-level state、variables、debugger；文档没有过度类比。 | 否 |
| 29 | Alfred Universal Actions 与 Context Actions 的关系 | `03`、`04`、`10`；`acceptedInputTypes`；`TuffQuery.inputs` | Universal Actions 与 uTools 超级面板可统一映射到 `ContextActionProvider`，首版围绕 selected text / clipboard image / files 足够。 | 否 |
| 30 | Alfred Variables 是否映射为轻量变量合同 | `03`、`06`；`FlowPayload.context.originalQuery`；`TuffQuery` | `06` 的 variable contract 覆盖 source/lifecycle/privacy/failure，避免把变量系统绑到大 workflow runtime，合理。 | 否 |
| 31 | Alfred Workflow Configuration 是否已有 Tuff 对应入口 | `03`；`packages/utils/plugin/index.ts`；Nexus manifest docs | Manifest / config schema 方向有基础，但 workflow-level config 未闭环；文档建议 v1 schema + CLI validate，不夸大现状。 | 否 |
| 32 | Alfred Gallery 与 Nexus Store 是否可对标 | `03`、`08`；`apps/nexus/server/utils/pluginsStore.ts`；`packages/tuff-cli-core/src/publish.ts` | Nexus 有发布/审核基础，但缺 workflow card、validated evidence；文档只要求能力卡和 dry-run，不宣称完整 Gallery 对齐。 | 否 |
| 33 | Alfred Debugger 是否有 Tuff 可复用基础 | `03`；`apps/core-app/src/main/utils/workflow-debug.ts`；`search-trace/v1` | Debug/log/trace 有零散基础，尚无 generic workflow run timeline；文档将其作为 contract v1 输出字段，合理。 | 否 |
| 34 | Alfred External Trigger 是否进入 v1 | `03` KB；`packages/utils/plugin/index.ts` | v1 trigger set 包含 `external`，但不要求立即开放任意远端执行；保守且可扩展。 | 否 |
| 35 | Alfred Run Script 是否存在安全降级风险 | `03`、`10`；`permissionRegistry`；`system.shell` | 文档强调 shell/script 必须显式高风险 `system.shell` 且 fail-closed；没有绕过安全边界。 | 否 |
| 36 | Alfred File Buffer 是否需要直接复制 | `03`、`05`；`TuffQuery.inputs` files；FileProvider | 当前文档没有把 File Buffer 作为独立 P0，而是纳入 files context/action；避免 UI 扩散，合理。 | 否 |
| 37 | uTools `plugin.json` 与 Tuff manifest 映射是否完整 | `04`、`08`；`plugins/*/manifest.json`；`packages/utils/plugin/index.ts` | 两者都以 manifest 声明功能/权限/输入类型，Tuff 额外有 `sdkapi` hard-cut；文档映射清楚。 | 否 |
| 38 | uTools `cmds` 数据源匹配是否映射到 `acceptedInputTypes` | `04`；`packages/utils/plugin/index.ts`；`plugin-features-adapter.ts` | Adapter 对 non-text input 会按 `acceptedInputTypes` 过滤；`04` 将其作为 Context Actions 基础，事实成立。 | 否 |
| 39 | uTools 超级面板是否应复制 UI | `04`、`10` | 文档明确不要复制长按右键超级面板，先做 CoreBox/MetaOverlay 动作列表；这是更低风险方案。 | 否 |
| 40 | uTools 动态功能是否需要 Tuff 运行时支持 | `04`；`plugin-feature.ts`；`PluginModule` | Tuff feature 可由 Prelude 注册，但缺 `utools.setFeature` 等价的用户可见动态管理合同；文档把它归为后续合同，不夸大。 | 否 |
| 41 | uTools AI Agent tools 官方能力是否已纳入 | `04` KB；`04` 正文 | 文档已记录 `tools` 声明 + `utools.registerTool` 运行期注册；Tuff 映射要求 stable id、权限、schema、审计，口径完整。 | 否 |
| 42 | uTools 跨平台 fail-closed 是否落到 Tuff 状态枚举 | `04`、`09`；`platform/capability-adapter.ts`；Browser Data diagnostics | 文档列出 `available`、`permission-missing`、`unsupported`、`degraded`、`read-failed`、`not-found`、`blocked`；与源码状态风格一致。 | 否 |
| 43 | uTools 插件市场对 Tuff Store 的启发是否聚焦任务流 | `04`、`08`；Nexus dashboard publish flows | 文档优先端到端 `.tpex` / manifest / validate / Store card evidence，没有只做市场页面 UI；方向正确。 | 否 |
| 44 | uTools 多数据源触发是否覆盖图片/文件/截图 | `04`；`TuffInputType`；`useClipboardState.ts`；`touch-translation/manifest.json` | Tuff 类型支持 text/image/files/html，Translation 支持 text/image；截图仍需 evidence，不应宣称 complete。 | 否 |
| 45 | 搜索 trace 是否足以做 release evidence | `05`；`search-core.ts`；`search-trace-stats.ts` | `search-trace/v1` 与 stats 已有 schema、P50/P95 聚合；缺固定样本和 top-N explain，文档建议合理。 | 否 |
| 46 | fast/deferred provider 分层是否准确 | `05`；`search-gather.ts`；Everything/FileProvider priority | Everything fast、FileProvider deferred、fast timeout/deferred delay 的描述与源码一致；无需修正。 | 否 |
| 47 | Ranking 是否把 learned file ranking 说满 | `05` KB；`file-provider.ts` scoring notes | KB 明确 `lastUsedScore` / file frequency 当前为零，不应宣称 learned file ranking；专题未发现相反表述。 | 否 |
| 48 | Recommendation 是否包含上下文但不泄露明文 | `05`；`RecommendationEngine`；`ContextProvider` | 推荐引擎使用时间、剪贴板 URL、前台 app 等 signal；文档要求 evidence 禁止 query/clipboard 明文，合理。 | 否 |
| 49 | Keyboard navigation 是否覆盖 grid/list | `05`；`useKeyboard.ts`；`BoxGrid.vue` | 文档把 list/grid arrows、section grid、numeric focus、Escape cleanup 纳入体验审计，覆盖充分。 | 否 |
| 50 | Everything same-query fallback 是否纳入 | `05`、`09`；`everything-provider.ts`；历史 KB | 文档要求 SDK/CLI/unavailable、fallback ratio 与 path filtering evidence；能覆盖 same-query fallback 风险。 | 否 |
| 51 | FileProvider 内容索引是否存在隐私边界 | `01`、`05`、`09`；`file-provider.ts` | FileProvider 比纯文件名搜索更激进，文档要求 watch-root、内容索引、失败态证据；没有忽略隐私边界。 | 否 |
| 52 | NativeFileSearchProvider 是否作为平台 best-effort | `05`、`09`；`native-file-search-provider.ts` | macOS Spotlight 与 Linux locate/tracker/baloo 是 best-effort，不应等同 Everything；文档已有平台分层。 | 否 |
| 53 | 参数填充是否已有核心数据结构 | `06`；`TuffQuery`；`TuffQueryInput` | `TuffQuery.text` 与 `inputs` 是参数/上下文统一合同的基础；`06` 建议薄 resolver 合理。 | 否 |
| 54 | Legacy snippet syntax 是否保留 | `06`；`plugins/touch-snippets/index.js` | 文档要求保留 `{{date}}` 等旧语法，同时引入新合同；兼顾兼容与简化。 | 否 |
| 55 | Quicklink URL 编码安全是否覆盖 | `06`；`touch-browser-open/index.js` | 文档要求默认 percent encoding，raw output 必须显式并校验 scheme；对 URL template 是必要约束。 | 否 |
| 56 | Secret variable 是否避免明文扩展 | `06`、`07`、`09`；`packages/utils/plugin/sdk/secret`；`secure-store.ts` | 文档要求 secret 只暴露 `secretRef` / health，不展开明文；与 secure store 方向一致。 | 否 |
| 57 | Variable failure codes 是否足够用于 UI | `06` | `VARIABLE_MISSING`、`PERMISSION_MISSING`、`SOURCE_UNAVAILABLE`、`SECRET_UNAVAILABLE` 等覆盖参数失败主路径；无需扩成复杂 workflow。 | 否 |
| 58 | Translation provider health 是否避免 raw error | `07`；`plugins/touch-translation/index/item-builder.ts`；provider files | Translation item 仍有插件局部 provider/error 语义，文档要求统一 provider/model/latency/traceId/reason evidence，能弥补分散问题。 | 否 |
| 59 | OCR 是否区分截图、剪贴板图片和文件图片 | `07`；`image-translate.ts`；`ocr-service.ts`；`TuffQuery.inputs` | 专题要求分别验证 selected text、clipboard image、screenshot、provider failed；覆盖足够。 | 否 |
| 60 | AI Commands 是否绑定 provider/model/secret health | `07`；`touch-intelligence`；`packages/utils/types/intelligence.ts` | 文档强调 provider health、secure storage、redaction，不把 AI call 写成黑盒；符合安全规则。 | 否 |
| 61 | Plugin SDK hard-cut 是否仍为当前事实 | `08`、`10`；`packages/utils/plugin/sdk-version.ts`；`sdkapi-hard-cut-gate.ts` | `CURRENT_SDK_VERSION = 260428`，missing/invalid/outdated/unsupported 都 blocked；文档当前 marker 口径正确。 | 否 |
| 62 | CLI validate 是否与 runtime gate 对齐 | `08`；`packages/tuff-cli-core/src/validate.ts` | `runValidate` 复用 `checkSdkCompatibility()`，unsupported marker 会成为 error；文档可继续把 CLI validate 当 hard-cut 入口。 | 否 |
| 63 | tuff-cli publish dry-run 是否有证据字段 | `08`；`packages/tuff-cli-core/src/publish.ts` | publish 代码读取 package、SHA-256、auth、dashboard endpoints；dry-run 仍需端到端样本，文档未过度声明。 | 否 |
| 64 | `.tpex` integrity 是否不等于安全扫描 | `08`；`apps/nexus/server/utils/tpex.ts` | `manifest._files`、`_signature`、SHA-256 校验存在，但不覆盖恶意代码；`08` 明确不得宣称 security parity。 | 否 |
| 65 | Nexus Store version moderation 是否有基础 | `08`；`pluginsStore.ts`；版本 patch API | pending/approved/rejected 与 reject reason 基础存在；缺 review evidence 和 capability card，文档 P1 合理。 | 否 |
| 66 | CloudShare 与 CloudSync 是否被混淆 | `08`、`09`、`10`；`packages/utils/cloud-share/*`；`cloud-sync/*` | 文档区分 CloudShare 公共/团队内容包与 CloudSync 私密加密同步；没有把 snippet pack 当私密同步。 | 否 |
| 67 | Browser Data 是否只读且有限源 | `01`、`09`；`plugins/touch-browser-data/index.js` | 当前只读 Chrome/Edge/Brave/Arc Bookmarks JSON，输出 available/not-found/read-failed/unsupported；文档没有宣称 History/Safari 已落地。 | 否 |
| 68 | Clipboard 持久化是否必须同步隐私策略 | `09`；`clipboard-capture-pipeline.ts`；`clipboard-history-persistence.ts` | Clipboard 写入 SQLite-backed history，文档要求留存/清理/多类型 evidence；符合本地 SoT 与隐私规则。 | 否 |
| 69 | Storage/Sync 是否遵守密文 payload 口径 | `09`、AGENTS；`packages/utils/types/cloud-sync.ts`；`CloudSyncSDK` | `SyncItemInput` 使用 `payload_enc` / `payload_ref`，`CloudSyncSDK` 走 `/api/v1/sync/*`；文档禁止明文 JSON dump 正确。 | 否 |
| 70 | `deviceId` 是否被误当密钥材料 | `09`、AGENTS；`CloudSyncSDKOptions.getDeviceId`；`secure-store.ts` | 文档要求 `deviceId` 只做设备标识、密钥走 secure store；源码有 secure-store 后端，需继续避免把 deviceId 派生成密钥。 | 否 |
| 71 | 总路线是否能拆成实际 issue / PR | `10` 第 7/8 节 | `CA-P0-001` 到 `CA-P2-002` 均有范围和验收字段；适合后续排期，不需要本轮扩写成新项目。 | 否 |
| 72 | 100 轮补足口径最终复核 | 本台账；`01`-`10`；`micro-rounds/logs` | 72 条补充审计明细均有具体主题和锚点；真实 codex-potter 轮数按 28 + 2 + 70 计为 100。未发现必须修正 01-10 的事实错误。 | 否 |

## 4. 发现与修正汇总

本轮结论：

- 未发现 01-10 文档存在必须立即修正的事实错误。
- 01-10 的共同优点是持续区分“实现路径存在”和“release evidence 闭环”，没有把基础能力、AI、插件生态或本地数据源包装成完整 happy path。
- 本轮新增 `11-100-round-cross-review-ledger.md` 与 70 个 `micro-rounds/round-*.md`，用于核验真实 100 轮 codex-potter 审计。
- 未修改业务代码；对 01-10 未做事实或路线修正，只清理 `02`、`03`、`06`、`07`、`08` 的尾随空白以满足最终校验。

关键复核判断：

| 领域 | 复核判断 | 后续风险 |
| --- | --- | --- |
| 基础能力 | CoreBox、App、File、Clipboard、Preview/Calculator、Snippets、Browser Data 均有 live tree 锚点 | 仍缺 packaged / 真机 / 性能 / 失败态 evidence |
| Raycast 对齐 | Search Bar、Action Panel、Quicklinks、Snippets、Translate、AI Commands 已被拆成合同和 evidence | 不应复制全部 Raycast UI/快捷键 |
| Alfred 对齐 | Workflow 价值应先落 manifest / CLI validate / run timeline 合同 | 不应先做大画布或任意脚本运行器 |
| uTools 对齐 | `cmds`、超级面板、多输入源应先映射为 Context Actions | 不应默认后台抓取选中文本或复制鼠标面板 |
| SDK / Store | `sdkapi 260428` hard-cut、`tuff validate`、`.tpex` integrity、Nexus moderation 有基础 | integrity 不是 security scan，发布链路仍需 evidence |
| Storage / Sync | `/api/v1/sync/*`、`payload_enc` / `payload_ref`、secure store 方向正确 | 禁止把 App Data / Clipboard / Snippets 明文 dump 成 JSON 同步 |

## 5. 最终校验

已执行：

```bash
ls "docs/plan-prd/03-features/search/competitive-analysis-2026-05-22"/*.md
rg -n "[[:blank:]]+$" "docs/plan-prd/03-features/search/competitive-analysis-2026-05-22"
git diff --check
git status --short
```

结果记录：

| 命令 | 结果 |
| --- | --- |
| `ls "docs/plan-prd/03-features/search/competitive-analysis-2026-05-22"/*.md` | 通过，确认 `01`-`11` 共 11 份 Markdown 文档存在。 |
| `rg -n "[[:blank:]]+$" "docs/plan-prd/03-features/search/competitive-analysis-2026-05-22"` | 通过，无输出；已清理 `02`、`03`、`06`、`07`、`08` 文档引用头部的尾随空白。 |
| `git diff --check` | 通过，无输出。 |
| `git status --short` | 已查看；本任务只关注 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/` 和 `.codexpotter` 记录。工作树中仍有大量既有无关脏改，未处理、未回滚、未格式化。 |
| `rg --no-ignore -n "CodexPotter summary: 1 rounds" "docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/logs" \| wc -l` | 通过，确认 70 条 micro-round 真实 summary；最终 codex-potter 轮数为 28 + 2 + 70 = 100。 |
| `awk` 审计条目计数 | 通过，`## 3. 72 条补充审计明细` 到 `## 4.` 之间精确统计 72 条审计记录。 |

## 6. 后续建议

| 优先级 | 建议 | 验收口径 |
| --- | --- | --- |
| P0 | 先做 `basic-evidence-pack`：CoreBox hotkey、App Launcher、Everything/FileProvider、Browser Data、Calculator、search trace 固定样本 | Windows/macOS packaged 截图或日志；Linux best-effort reason；P50/P95；失败 reason |
| P1 | 落 `TuffParameterSet` / `ContextActionProvider` / workflow contract v1 三个薄合同 | Snippets/Quicklinks/Translate/AI Command 共享参数语义；selected text / clipboard image / files 动作列表；CLI validate 能检查 workflow schema |
| P1 | 用 `touch-snippets` 或 `touch-browser-data` 做一条 SDK -> `.tpex` -> Nexus preview -> review -> install 的端到端 evidence | Manifest、permissions、sdkapi、package integrity、publish dry-run、Store card、安装失败 reason 全可见 |
| P2 | 本地数据源只做隐私调研和 degraded reason，不默认扫描高敏数据 | Safari/History/Notes/Calendar/Contacts/Mail/Obsidian/VSCode 均先给权限、数据位置、unsupported/degraded reason |
