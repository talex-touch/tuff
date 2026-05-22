# Tuff 竞品对齐执行路线总纲

> 日期：2026-05-22
> 范围：综合 Raycast / Alfred / uTools 竞品启发，以及本目录现有 `01`-`09` 文档与 Tuff 当前仓库证据，输出后续可拆 issue / PR 的执行路线。
> 约束：只做路线总纲；不修改代码；不改 `docs/INDEX.md`、`README`、`TODO`、`CHANGES`；不建议重写 CoreBox、搜索引擎或插件系统。

## 1. 总结论

Tuff 当前不是“竞品基础能力缺失型”项目，而是“底座已散落存在，但用户心智、统一合同和 release evidence 没闭环”的项目。CoreBox、App Launcher、File Search、Everything、PreviewSDK/Calculator、Clipboard、Snippets、插件 SDK、MetaOverlay/Action Panel、AI/OCR/Translation、Browser Data、Nexus Store 与 tuff-cli 都已有活跃路径或明确路线；真正阻塞竞品对齐的是：

1. **基础体验证据不足**：App Launcher、Everything/FileProvider、Browser Data、Calculator、AI/OCR/Translation 不能只凭源码宣称闭环，必须有 Windows/macOS packaged evidence、失败态和性能样本。
2. **Raycast 式“丝滑交互”缺统一合同**：Search Bar、Action Panel、参数填充、Quicklinks、Snippets、AI Commands、Translate 需要统一成 `TuffParameterSet`、`ContextActionProvider`、`EvidencePayload`，而不是继续散落在插件内。
3. **Alfred Workflow 价值应先落合同，不落大画布**：Tuff 应先定义 workflow contract v1、tuff-cli validate、run timeline、redaction 与 Nexus workflow card，不要先做完整节点画布或任意脚本运行器。
4. **uTools 插件跨平台启发应映射为 Context Actions**：Tuff 不应复制长按鼠标右键超级面板，而应把 selected text、clipboard image、files 等输入变成 CoreBox/MetaOverlay 可解释动作列表。
5. **搜索排序的下一步是 evidence 和 explain**：保留 `SearchEngineCore` / provider / `tuffSorter` 架构，补 `search-trace/v1` evidence pack、provider diagnostics、top results ranking explain 和固定样本。

最小路线：**P0 先补基础闭环与证据包，P1 再统一参数/上下文/Workflow/生态合同，P2 只做高风险本地数据源调研和长尾体验增强。**

## 2. 输入依赖状态

| 依赖 | 状态 | 本总纲处理 |
| --- | --- | --- |
| `01-basic-capability-alignment.md` | 已生成 | 作为基础能力矩阵、P0/P1 收敛与证据缺口基线 |
| `02-raycast-smooth-interactions.md` | 已生成 | 作为 Search Bar、Action Panel、参数填充、快速翻译路线基线 |
| `03-alfred-workflow-model.md` | 已生成 | 作为 workflow contract v1、debugger、publish/install 路线基线 |
| `04-utools-plugin-cross-platform.md` | 已生成 | 作为 Context Actions、跨平台 fail-closed、插件开发体验路线基线 |
| `05-search-performance-ranking.md` | 已生成 | 作为 search trace、ranking explain、P50/P95 与固定样本基线 |
| `06-parameter-filling-dynamic-variables.md` | 已生成 | 作为 `TuffParameterSet`、变量来源、隐私等级、失败码与参数 evidence 基线 |
| `07-translation-ocr-ai-commands.md` | 已生成 | 作为快速翻译、OCR、AI Command、provider health、secret storage 与隐私 redaction 基线 |
| `08-plugin-store-sdk-ecosystem.md` | 已生成 | 作为插件生态、Store、SDK、`.tpex`、发布 dry-run 与审核信任链基线 |
| `09-cross-platform-local-data.md` | 已生成 | 作为跨平台能力、本地数据源、隐私边界与 2.4.11/2.5.0 evidence 基线 |
| `README/TODO/CHANGES/AGENTS` | 已读 | 维持 2.4.11 稳定化与债务退场优先，不让竞品对齐抢占主线 |

## 3. P0 / P1 / P2 路线分层

| 优先级 | 目标 | 必须做 | 不做 |
| --- | --- | --- | --- |
| P0 | 让已有基础能力能被验收 | CoreBox/App Launcher/File Search/Everything/Browser Data/Calculator/Search trace evidence；失败态 reason；Windows/macOS release-blocking 样本；Linux best-effort 说明 | 不重写 CoreBox；不扩大 FileProvider 默认内容搜索；不新增隐式隐私扫描 |
| P1 | 建立统一产品模型 | `TuffParameterSet`、`ContextActionProvider`、`EvidencePayload`、workflow contract v1、Action Panel evidence、Quicklinks schema、SDK/Nexus 任务流 | 不做 Alfred 式大画布；不复制 uTools 鼠标超级面板；不开放任意 shell |
| P2 | 拓展高价值长尾 | macOS Notes/Calendar/Reminders 权限调研、Obsidian/VSCode/Epic 定义、Emoji recent usage、Focus 长期债务、AI Command 模板化 | 不默认扫描 PII；不把浏览器历史/剪贴板/片段明文 dump 成 JSON；不把 AI rerank 当搜索 MVP |

## 4. 2 周 / 4 周 / 8 周切片

### 4.1 2 周：基础 evidence 与失败态闭环

| 切片 | 用户价值 | 代码触点 | 文档触点 | 验收 evidence | 风险 | 不做事项 |
| --- | --- | --- | --- | --- | --- | --- |
| `basic-evidence-pack` | 用户能确认“启动、搜索、计算、文件、浏览器书签”这些基础路径真实可用 | `apps/core-app/src/main/modules/box-tool/core-box/*`、`addon/apps/*`、`search-engine/search-core.ts`、`addon/preview/preview-provider.ts` | 本目录 `01`、`05`；`TODO.md` P0 平台 evidence | Windows/macOS packaged：CoreBox hotkey、首显、App launch、`calc 2+2`、`计算 1m to cm`、失败 reason 截图或日志 | 当前工作树已有其他改动，证据应绑定路径和 commit/ref | 不改 CoreBox 架构，不新增 UI 大面板 |
| `everything-file-evidence-v1` | Windows 文件搜索可解释：可用、降级或不可用都清楚 | `everything-provider.ts`、`file-provider.ts`、`native-file-search-provider.ts`、`search-core.ts` | `APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` EV-010/060/070；本目录 `05` | SDK/CLI/unavailable 三场景；显式 `@file`；watch-root path filtering；P50/P95；fallback ratio | Everything SDK/CLI 策略未最终锁定 | 不承诺 SDK 随包，除非打包证据存在 |
| `browser-data-evidence-v1` | 用户能搜真实浏览器书签，并知道失败原因 | `plugins/touch-browser-data/index.js`、`touch-browser-open`、`touch-browser-bookmarks` | App Data roadmap；本目录 `01`、`04` | Chrome/Edge/Brave/Arc Bookmarks JSON 样本；`not-found/read-failed/unsupported`；打开/复制 URL action | Browser History 与 Safari 高隐私/权限风险 | 不读 History SQLite；不写回浏览器；不持久化完整书签 JSON dump |
| `search-trace-pack-v1` | 排序和速度不靠感觉验收 | `search-core.ts`、`search-gather.ts`、`sort/tuff-sorter.ts`、`search-trace-stats.ts` | 本目录 `05` | app/file/preview/plugin/context/empty/failure 固定样本；first.result/session.end；provider duration/status/sourceStats | trace 若记录过多会干扰性能或隐私 | 不记录 query 明文、剪贴板明文、文件内容 |

### 4.2 4 周：统一参数、动作与 Workflow 合同

| 切片 | 用户价值 | 代码触点 | 文档触点 | 验收 evidence | 风险 | 不做事项 |
| --- | --- | --- | --- | --- | --- | --- |
| `parameter-set-v1` | Quicklinks、Snippets、AI Command、Translate 不再各写一套填参语义 | `packages/utils/core-box/tuff/tuff-dsl.ts`、`packages/utils/plugin/index.ts`、`plugins/touch-snippets/index.js`、`plugins/touch-browser-open/index.js` | 本目录 `02`、`06`；Nexus SDK docs | `query.text`、`clipboard`、`selection`、`date/time/uuid/calculator` 参数样本；URL percent encode；placeholder 失败 reason | 模板引擎过度设计 | 只做描述/解析合同，不迁移全部插件 |
| `context-actions-v1` | 选中文本、剪贴板图片、文件路径能看到可执行动作列表 | `useClipboardState.ts`、`useSearch.ts`、`plugin-features-adapter.ts`、`MetaOverlayEvents`、`useActionPanel.ts` | 本目录 `04`、`06`、`09`；Nexus plugin-context docs | selected text、clipboard image、files 三类输入；每条 action 有 inputSource、permission/status/reason；执行返回 `started/blocked/failed/cancelled` | 隐式读取上下文会伤害隐私 | 不做鼠标超级面板；不后台常驻抓取选中文本 |
| `workflow-contract-v1-doc-validate` | 开发者可用一个合同表达“输入、参数、步骤、输出、失败、发布” | `packages/utils/plugin/*`、`packages/tuff-cli-core/src/validate.ts`、`apps/core-app/src/main/modules/plugin/*`、`apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts` | 本目录 `03`；Nexus manifest / plugin workflow docs | manifest schema 草案；`tuff validate --strict` 能检查 workflow id、trigger/input/config/step/permission；dry-run 输出风险摘要 | 与 AI Workflow、Flow、DivisionBox 概念重叠 | 不做可视化画布；不运行任意脚本；不把普通 workflow 强绑 AI runtime |
| `action-panel-evidence-v1` | 每个结果“还能做什么”可发现、可搜索、可失败提示 | `useActionPanel.ts`、`MetaOverlayEvents`、`CoreBoxRetainedEvents`、`TuffItem.actions` | 本目录 `02`、`05` | app/file/plugin/preview/image item 打开 Action Panel；action count、primary/secondary、shortcut、permission/failure toast | Action taxonomy 容易膨胀 | 不复制全部 Raycast 快捷键，只固化 Tuff 主路径 |

### 4.3 8 周：生态和本地数据源扩展

| 切片 | 用户价值 | 代码触点 | 文档触点 | 验收 evidence | 风险 | 不做事项 |
| --- | --- | --- | --- | --- | --- | --- |
| `quicklinks-v1` | 常用 URL、搜索引擎、浏览器书签、开发链接有统一心智 | `touch-browser-open`、`touch-browser-bookmarks`、`touch-browser-data`、plugin storage | 本目录 `01`、`02`、`06`、`09`；App Data roadmap | `QuicklinkSource` schema；manual/pinned/browser/dev source；URL template；open/copy action | 与 Browser Data/Bookmarks 边界不清 | 不写回浏览器；不做云同步 |
| `nexus-plugin-workflow-card-v1` | 开发者和用户能看懂插件/Workflow 权限、输入、配置与验证状态 | `apps/nexus/app/data/tuffSdkItems.ts`、Nexus Store dashboard、tuff-cli publish dry-run | 本目录 `03`、`04`、`08`；Nexus SDK docs | `.tpex` dry-run；Store card 展示 triggers/inputTypes/permissions/setup required/last validated | 发布链路已有大量在制改动 | 不重构审核系统；不绕过 `sdkapi` hard-cut |
| `local-data-source-research-v1` | 决定哪些本地数据源值得接入，避免误扫隐私 | future `plugins/touch-obsidian`、`touch-vscode`、macOS App Data provider | 本目录 `09`；App Data roadmap | Obsidian vault、VSCode recent workspaces、macOS Notes/Calendar/Safari 权限与 degraded reason 调研 | PII/TCC/数据库格式变化 | 不默认扫描 Notes/Calendar/Contacts/Mail；不接远端 API |
| `translate-ai-evidence-v1` | 文本、选中文本、剪贴板图片、截图翻译的 provider/failure 统一可见 | `plugins/touch-translation`、`image-translate.ts`、Assistant VoicePanel、Intelligence SDK | 本目录 `02`、`04`、`06`、`07`；`P1-TRANSLATION-IMAGE` | selected text、clipboard image、empty clipboard、provider failed、permission denied、traceId/latency/provider chips | Provider secret 与 secure-store degraded | 不记录原文到日志；不静默上传 selected text/image |

## 5. 最终能力地图

| 能力域 | 竞品启发 | Tuff 当前基线 | 下一步路线 | 优先级 |
| --- | --- | --- | --- | --- |
| 基础功能 | Raycast/Alfred/uTools 都把全局入口、App、File、Clipboard、Snippets、Calculator 作为基础 | CoreBox、AppProvider、FileProvider/Everything、Clipboard、Snippets、PreviewSDK 已存在 | 补 release evidence、失败态、Store discoverability | P0 |
| Raycast 丝滑交互 | Search Bar 一入口、Action Panel、参数填充、Favorites/Aliases、Quicklinks | `useKeyboard`、MetaOverlay、`TuffItem.actions`、PreviewProvider、插件 commands | `TuffParameterSet`、Action Panel evidence、Quicklinks contract | P1 |
| Alfred Workflow | Triggers/Inputs/Actions/Utilities/Outputs/Variables/Debugger/Gallery | Manifest/Prelude/Surface、Flow、DivisionBox、Intelligence Workflow、tuff-cli/Nexus | workflow contract v1、validate/dry-run、run timeline、redaction、workflow card | P1 |
| uTools 插件跨平台 | 功能指令、匹配指令、超级面板、多数据源、插件市场 | `acceptedInputTypes`、`TuffQuery.inputs`、sdkapi hard-cut、permission reason、Nexus Store | Context Actions v1、跨平台 fail-closed reason、SDK 任务流 | P1 |
| 搜索性能 | Raycast frecency、Alfred rolling knowledge/keyword latching、uTools 本地搜索分类 | `search-trace/v1`、sourceStats、`tuffSorter`、UsageStats、RecommendationEngine | evidence pack、topN ranking explain、fixed sample verifier | P0/P1 |
| 参数模型 | Raycast Dynamic Placeholders 横跨 Quicklinks/Snippets/AI Commands | Snippets placeholder、Browser Open URL builder、OmniPanel AI selected text | `TuffParameterSet` + resolver；旧语法兼容 | P1 |
| 翻译/OCR/AI | Raycast Translate/AI、uTools OCR/聚合翻译、Alfred Workflow 可扩 AI | `touch-translation`、OCR service、Image translate、Assistant clipboard image、Intelligence SDK | provider health/evidence、privacy policy、selected text/clipboard image Context Actions | P1 |
| 插件生态 | Raycast Extensions、Alfred Gallery、uTools 插件市场 | `.tpex`、tuff-cli validate/build/publish、Nexus Store、CloudShare | workflow/plugin capability card、publish dry-run evidence、Context Action 示例 | P1 |
| 本地数据源 | Raycast Chrome/VSCode/Calendar 等扩展；uTools 插件数据源 | `touch-browser-data` 首版、App Data roadmap、Everything roadmap | Browser History/Safari 调研、Obsidian/VSCode 插件、macOS App Data 权限模型 | P2 |

## 6. 明确不要做

1. **不要重写 CoreBox**：当前问题是合同和 evidence，不是入口底座不存在。
2. **不要重写搜索引擎**：保留 `SearchEngineCore`、provider、gatherAggregator、`tuffSorter`，先补 trace、diagnostics 和 ranking explain。
3. **不要默认扫描隐私数据**：浏览器历史、Notes、Calendar、Contacts、Mail、剪贴板、OCR 图片、选中文本都必须显式触发、显式授权、可清理、可降级。
4. **不要跳过 evidence**：源码路径、focused test、旧 Done 都不等于发布体验闭环。
5. **不要把源码存在等同产品闭环**：AI/OCR/Translation、App Launcher、Everything、Browser Data 都必须有 packaged 或真机样本。
6. **不要绕过 `sdkapi` / 权限 / secure store**：插件生态增长必须继续走 canonical sdkapi、permission reason、secure-store health、typed SDK。
7. **不要复制 uTools 鼠标超级面板**：先把多数据源匹配收敛为 Context Actions，不做 UI 大改。
8. **不要照搬 Alfred 完整画布和任意 Run Script**：先做 manifest contract、validate、run record；shell 必须 `system.shell` fail-closed。
9. **不要把 AI rerank 当搜索 MVP**：AI embedding/rerank 只能是可选增强，失败 fail-open，不改变基础排序可靠性。
10. **不要把 JSON 当本地数据 SoT**：SQLite / search index 是权威；JSON 只保存轻量配置或加密同步载荷。

## 7. 可直接拆 issue / PR 的任务清单

| 编号 | 标题 | 范围 | 验收 |
| --- | --- | --- | --- |
| CA-P0-001 | 建立 CoreBox 基础 evidence pack | CoreBox hotkey、首显、App launch、Calculator、Browser Data、File Search | Windows/macOS packaged 截图或日志；Linux best-effort 说明 |
| CA-P0-002 | Everything / FileProvider evidence verifier | SDK/CLI/unavailable、watch-root filtering、P50/P95、fallback ratio | 输出 evidence JSON；不记录 query 明文 |
| CA-P0-003 | Search trace fixed sample pack | app/file/preview/plugin/context/empty/failure 样本 | `first.result` / `session.end` 成对；provider status 和 degraded reason 可见 |
| CA-P0-004 | Browser Data 首版验收文档 | Chrome/Edge/Brave/Arc Bookmarks JSON、read-failed/not-found/unsupported | 不读 History，不写回浏览器，不持久化完整 JSON |
| CA-P1-001 | `TuffParameterSet` contract draft | 参数 source、modifiers、evidence 字段、旧 placeholder 兼容 | Snippets/Quicklinks/AI Command 三个样例 |
| CA-P1-002 | `ContextActionProvider` v1 contract | selected text、clipboard image、files；permission/status/reason | Translation/Snippets/Clipboard/Browser Open 首批匹配 |
| CA-P1-003 | Action Panel evidence | app/file/plugin/preview/image 五类 item | `Cmd/Ctrl+K`、primary/secondary、search actions、failure toast |
| CA-P1-004 | Workflow contract v1 docs + CLI validate | manifest `workflows[]` schema、trigger/input/config/step/permission | `tuff validate --strict` focused tests；dry-run risk summary |
| CA-P1-005 | Nexus plugin/workflow capability card | input types、platforms、permissions、setup required、last validated | `.tpex` dry-run + Store card visible evidence |
| CA-P1-006 | Translate/OCR/AI evidence unification | text/selected text/clipboard image/screenshot/provider failed | input source、provider/model、latency、traceId、permission/failure reason |
| CA-P2-001 | Local data source privacy research | Safari/History/Notes/Calendar/Obsidian/VSCode/Epic | 权限、数据位置、open target、unsupported/degraded reason |
| CA-P2-002 | Quicklinks schema v1 | manual/pinned/browser/dev links、URL template、parameter set | `touch-browser-open` 执行复用，不做 sync |

## 8. Evidence 统一口径

| Evidence | 必填字段 | 禁止字段 |
| --- | --- | --- |
| Search trace | sessionId、queryHash、queryLen、inputTypes、provider summary、duration、status、degradedReason、topN explain | query 明文、剪贴板明文、文件内容 |
| Provider diagnostics | providerId、layer、backend、resultCount、fallbackUsed、pathFiltering、lastError bucket | 原始 access token、secret、完整私有路径列表 |
| Context action | inputSource、inputTypes、pluginName、featureId、permission、capability.status/reason、execute result | selected text 明文长期日志、图片 base64 长期日志 |
| Workflow run | runId、workflowId、trigger、steps、redacted input/output、permissions、logs bucket | secret 明文、完整敏感文件内容、未脱敏 payload |
| Plugin publish dry-run | sdkapi、permissions、permissionReasons、inputTypes、platforms、setup required、risk summary | secure credential ref 明文、用户私有数据 |

## 9. 10 轮 enforce / review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只负责任务 10/10，总纲文档，不改代码 | 通过 | 只新增本文件和进度记录 |
| 2 | 输入 review：必须读取 01-09 | 通过 | `01`-`09` 已读；`07` 的 Translation/OCR/AI Command 合同与 provider evidence 已纳入路线 |
| 3 | 仓库基线 enforce：不能抢 2.4.11 稳定化主线 | 通过 | P0 聚焦 evidence 与债务退场，不把 AI/Workflow 长尾提前成阻塞 |
| 4 | 竞品事实 review：优先官方来源 | 通过 | 复核 Raycast Windows/Manual、Alfred Help、uTools 帮助中心/开发者文档 |
| 5 | Tuff live tree review：不能只信旧 Done | 通过 | 对照 SearchCore、tuffSorter、RecommendationEngine、MetaOverlay、acceptedInputTypes、sdkapi hard-cut、Everything/FileProvider/PreviewProvider |
| 6 | P0 enforce：必须小而可验收 | 通过 | P0 只收基础 evidence、Everything/FileProvider、Browser Data、search trace |
| 7 | P1 review：统一模型是否过度设计 | 通过 | `TuffParameterSet`、`ContextActionProvider`、workflow contract 均限定为 v1 合同 |
| 8 | 安全/隐私 enforce：不得默认扫描隐私数据 | 通过 | Browser History/Safari/macOS App Data 后置到 P2 调研 |
| 9 | 不做事项 review：必须覆盖用户指定禁区 | 通过 | 明确不要重写 CoreBox、不要跳过 evidence、不要绕过 sdkapi/权限/secure store |
| 10 | 可执行性 review：必须能拆 issue/PR | 通过 | 第 7 节输出 12 个可直接拆分任务 |

## 10. 引用来源

### 本仓库文档

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md`
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `AGENTS.md`

### Raycast 官方来源

- Raycast Windows: https://www.raycast.com/windows
- Raycast Manual - Search Bar: https://manual.raycast.com/search-bar
- Raycast Manual - Action Panel: https://manual.raycast.com/action-panel
- Raycast Manual - Dynamic Placeholders: https://manual.raycast.com/dynamic-placeholders

### Alfred 官方来源

- Alfred Help - Workflows: https://www.alfredapp.com/help/workflows/
- Alfred Help - Universal Actions: https://www.alfredapp.com/help/features/universal-actions/
- Alfred Help - Understanding Result Ordering: https://www.alfredapp.com/help/kb/understanding-result-ordering/

### uTools 官方来源

- uTools 帮助中心 - 超级面板: https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- uTools 开发者文档 - plugin.json: https://www.u-tools.cn/docs/developer/information/plugin-json.html
