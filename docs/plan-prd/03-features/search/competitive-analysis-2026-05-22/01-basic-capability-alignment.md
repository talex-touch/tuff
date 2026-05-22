# 基础功能对齐总览

> 日期：2026-05-22
> 范围：Raycast / Alfred / uTools 的桌面效率基础能力，与 Tuff 当前仓库能力对齐。
> 约束：只做产品与证据矩阵，不提出大而全重写；优先小切片、可验证、可回滚。

## 1. 结论

Tuff 当前不是“基础能力缺失型”项目，而是“最小路径已散落、证据与统一产品模型不足”的项目。CoreBox 全局入口、App Launcher、文件搜索、插件能力、剪贴板、片段、计算/单位换算、Emoji/Symbols、系统动作、窗口管理、AI、OCR/翻译都能在 live tree 找到实现或明确规划；真正阻塞竞品基础体验对齐的，是 Windows/macOS 真机 evidence、Browser Data / Everything / App Launcher 的 release-blocking 样本、Quicklinks 与 Context Actions 的统一模型、Store/SDK 任务流的端到端证据。

Raycast / Alfred / uTools 的共同基础能力可以收敛为四层：

1. 入口层：全局快捷键、搜索框、App Launcher、文件搜索、系统动作。
2. 内容层：剪贴板、Snippets/片段、Quicklinks/Web Search、计算与单位换算、Emoji/Symbols。
3. 上下文层：选中文本/剪贴板/文件/图片触发动作，窗口管理，OCR/翻译。
4. 生态层：扩展/Workflow/插件市场、开发者 SDK、AI 命令或智能体。

Tuff 的最小下一步不应是重做 CoreBox 或插件系统，而是把已有能力补成可验收的“基础体验闭环”：P0 先补 App/File/Everything/Browser Data/Calculator 的 evidence 与文档入口；P1 再统一 Quicklinks、Context Actions、Snippets placeholders、Emoji 数据集与 SDK 任务流。

状态口径如下，避免把源码存在误判为发版闭环：

| 状态 | 判定口径 |
| --- | --- |
| 已落地 | live tree 有活跃入口、执行路径和基础测试/文档，用户可通过 CoreBox 或插件触发 |
| 部分落地 | 有实现切片，但缺统一模型、跨平台覆盖、打包证据或关键边界 |
| 规划中 | Roadmap/TODO 已有明确方向，但 live tree 未形成可用路径 |
| 缺失 | 未发现当前产品入口或实现路径 |
| 需要 evidence | 代码路径存在，但缺真机、打包、失败态、性能或隐私证据，不能对外声明完整体验 |

## 2. 竞品共同基础能力

| 基础能力 | Raycast | Alfred | uTools | 共同模式 |
| --- | --- | --- | --- | --- |
| 全局入口 | 全局 command bar，Windows 页面强调 App Launcher、File Search、Clipboard、AI 等核心能力 | 输入框作为 launcher / search / action hub | Alt+Space 呼出万能搜索框，长按右键可触发超级面板 | 一个低摩擦入口承载搜索、执行与扩展 |
| App Launcher | 核心能力之一 | Applications search / System Commands | 启动软件、搜索系统设置 | 应用启动必须快，且支持别名/排序/常用项 |
| 文件搜索 | File Search | File Search / file actions / navigation | 本地文件匹配 | 文件召回、打开、动作是基础项，不是高级插件 |
| 系统动作 | System、Shortcuts、Window Management | System Commands、Universal Actions | 系统设置、插件指令 | 系统动作需要平台差异与权限边界 |
| 剪贴板 | Clipboard History | Clipboard History | 剪贴板插件 | 历史、搜索、回贴/复制、隐私策略 |
| Snippets / 片段 | Snippets + Dynamic Placeholders | Snippets / Text Expansion | 备忘快贴、插件匹配 | 模板、占位符、快速展开/复制 |
| Quicklinks / Web Search | Quicklinks 支持动态占位符 | Web Search / Custom Search / Bookmarks | 关键词、插件指令、网页搜索插件 | URL 模板、搜索引擎、常用链接、动态参数 |
| 计算/单位换算 | Calculator | Calculator | 随手计算 | 搜索框内即时结果，复制结果 |
| Emoji/Symbols | Emoji & Symbols | 可通过 snippets/workflows 扩展 | 可通过插件生态扩展 | 搜索复制常用字符，最好有 recent usage |
| 窗口管理 | Window Management | 可通过 Universal Actions / Workflow 扩展 | 插件生态扩展 | 多平台差异明显，需要 evidence |
| 扩展生态 | Store / Extensions / Developers | Workflows / Gallery | 插件应用市场、开发文档、AI 制作插件 | 能力增长主要靠生态和清晰 SDK |
| AI | Raycast AI、AI Commands | Workflows 可接 AI 服务，官方生态可扩展 | AI 制作插件应用、智能体 | AI 是入口增强，不应掩盖基础搜索失败 |
| OCR/翻译 | Store 扩展常见方向 | Workflow/Universal Actions 常见方向 | OCR、聚合翻译、快速翻译 | 图片/选中文本输入、Provider health、隐私策略 |

### 2.1 官方事实复核

- Raycast Windows 页面把 App Launcher、File Search、Clipboard History、Snippets、Quicklinks、Calculator、Emoji & Symbols、Shortcuts、AI 放在首屏核心叙事；Raycast Manual 进一步说明 File Search 面向索引内文件/文件夹名搜索，并可通过 Action Panel 扩展 Quick Look、Open in Terminal、Save as Quicklink、Send to AI 等动作。
- Raycast Snippets 已包含 tags、keyword auto-expansion、`{date}` / `{time}` / `{clipboard}` / `{cursor}` / `{random}` 与新增 `{calculator}`；`{calculator}` 同时可用于 Quicklinks 和 AI Commands。因此 Tuff 只做到 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}` 时，只能算首批占位符闭环，不能声明完整 Raycast Snippets 对齐。
- Alfred Help 把 Default Results、File Search、Universal Actions、Web Search、Web Bookmarks、Clipboard History、Snippets、Calculator、System、Terminal/Shell 列为常用 Features；其中 File Search 通过 `open` / `find` / `in` 关键词扩展搜索范围，Universal Actions 可对文件、URL、文本展示相关动作，并可由 Workflows 扩展。
- uTools 官方首页强调 3000+ 插件应用、AI 插件应用创作、Alt+Space 唤起万能搜索框；帮助中心的入门场景明确把剪贴板、备忘快贴、本地文件、快速翻译、随手计算、图片处理、聚合翻译、OCR、网页快开放在基础体验里。
- uTools 超级面板默认通过鼠标触发，能对选中文本、图片、文件、文件夹等数据源智能匹配功能选项；功能指令文档也说明文本、图片、文件路径、截图会触发不同插件推荐。这是 Tuff `ContextActionProvider` 最小合同的直接对标对象。

## 3. Tuff 当前证据快照

| 能力域 | 当前状态 | 证据路径 | 判断 |
| --- | --- | --- | --- |
| CoreBox 全局入口 | 已落地，需要 evidence | `apps/core-app/src/main/modules/box-tool/core-box/index.ts` 注册 `CommandOrControl+E`；`core-box/manager.ts` 控制显示/隐藏/UI mode | 产品能力已落地；发版前还缺 packaged 首显、快捷键冲突、跨屏隐藏/恢复证据 |
| 搜索编排 | 已落地，需要 evidence | `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` 注册 App/File/Plugin/Preview providers；`sort/tuff-sorter.ts` 注入 match/frequency/recency/pinned；`recommendation/recommendation-engine.ts` 读取时间、剪贴板、前台 app 等上下文 | 能力已落地；缺可读 search trace 证明排序、推荐与 provider health 没有伪成功 |
| App Launcher | 已落地但需 evidence | `addon/apps/app-provider.ts`、`app-launcher.ts`、`win.ts`、`darwin.ts`、`linux.ts`；TODO 仍要求 Windows/macOS 阻塞级人工回归 | 产品能力已落地，证据缺口 P0 |
| 文件搜索 | 部分落地，需要 evidence | `addon/files/file-provider.ts`、`everything-provider.ts`、`native-file-search-provider.ts`；`APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` | Tuff 具备 FileProvider、macOS Spotlight、Linux native、Windows Everything 链路；Everything SDK/CLI 策略、watch-root 过滤与 P50/P95 真机证据未闭环 |
| Clipboard History | 已落地 | `apps/core-app/src/main/modules/clipboard/*`；`plugins/clipboard-history/manifest.json`；`packages/utils/plugin/sdk/clipboard.ts` | 能力已落地，图片/文件/HTML 回贴与隐私 evidence 仍需补 |
| Snippets | 已落地但仍需产品化 | `plugins/touch-snippets/index.js` 支持 text/code/prompt/template、`{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}`、CloudShare pack 和敏感内容过滤；旧 `touch-text-snippets` / `touch-code-snippets` 已退为 placeholder | 搜索、复制、保存、分享包首版可用；hot string/autopaste/cursor/browser-tab/calculator placeholder 后置 |
| Quicklinks / Web Search | 部分落地 | `plugins/touch-browser-open`、`touch-browser-bookmarks`、`touch-dev-toolbox`、`touch-browser-data` | 有分散能力，缺统一 Quicklinks 数据模型 |
| Browser Data | 部分落地，需要 evidence | `plugins/touch-browser-data/index.js` 只读扫描 Chrome/Edge/Brave/Arc Bookmarks JSON，输出 source diagnostics；TODO 标记 history/Safari/UI/evidence 后置 | 书签首版已落地，但仍是即时扫描 + 结果 action；History SQLite、Safari、持久索引/清理和真机样本仍是缺口 |
| Calculator / 单位换算 | 已落地 | `packages/utils/core-box/preview/*`、`apps/core-app/src/main/modules/box-tool/addon/preview/*`、`calculation/*`；PreviewProvider 支持 `calc` / `calculator` / `calculate` / `计算` / `换算` 显式前缀 | 产品能力已落地，Store discoverability/evidence 待补 |
| Emoji/Symbols | 首版已落地 | `plugins/touch-emoji-symbols/index.js` 内置常用 emoji、箭头、标点、货币、数学符号，复制 action | 首版足够，数据集/recent/Store evidence 后置 |
| System Actions | 部分落地 | `plugins/touch-system-actions`、`touch-quick-actions`、`addon/system/system-actions-provider.ts`；TODO 记录 shell capability hardening 已推进 | 基础动作存在，平台差异与 typed settings provider 仍缺 |
| Window Management | 部分落地 | `plugins/touch-window-manager`、`plugins/touch-window-presets`；TODO 记录展示期 non-mutating permission check | 能力存在但依赖 shell/native 差异，真机多屏 evidence 缺口 |
| AI | 进行中 | `plugins/touch-intelligence`、`packages/utils/transport/sdk/domains/intelligence.ts`、`apps/core-app/src/renderer/src/views/base/intelligence/*`、TODO 的 `P1-AI-250` | dev 切片多，packaged answer/failure UI evidence 未闭环 |
| OCR / 翻译 | 部分落地，需要 evidence | `plugins/touch-translation`、`apps/core-app/src/main/modules/ocr/ocr-service.ts`、`core-box/image-translate.ts`；TODO 的 `P1-TRANSLATION-IMAGE` | 文本翻译、截图翻译、剪贴板图片翻译路径存在；真实剪贴板/截屏/Provider fallback/权限拒绝证据缺 |
| 插件生态 / SDK | 已落地但需端到端 evidence | `plugins/*/manifest.json`、`packages/utils/plugin/sdk/*`、`apps/nexus/content/docs/dev/api/*`、`tuff-cli` 文档入口、`P1-PUBLISHER` | SDK/API 面较完整，真实 `.tpex` 上传、审核、安装与任务流 evidence 未闭环 |

## 4. 差距矩阵

| 能力 | 竞品行为 | Tuff 现状证据路径 | 状态 | 缺口类型 | 缺口 | 优先级 | 最小下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 全局入口 | 三者都提供低摩擦全局入口 | `core-box/index.ts`、`core-box/manager.ts`、`global-shortcon` | 已落地 | 证据缺口 | 缺 packaged 启动、首显、快捷键冲突与隐藏/恢复 evidence | P0 | 在 Windows/macOS release-blocking 清单中补 CoreBox hotkey、首显、重复触发、app launch handoff 样本 |
| App Launcher | 快速启动应用，常用/最近排序 | `addon/apps/app-provider.ts`、`app-launcher.ts`、`search-processing-service.ts` | 已落地 | 证据缺口 | Windows UWP/shortcut/Steam、macOS localized display name、Linux best-effort 样本未完整闭环 | P0 | 输出 10 个常用 app 搜索/启动样本，记录 source、launchKind、失败 reason |
| 文件搜索 | Raycast Root Search/文件命令搜索索引内文件/文件夹并提供 Action Panel；Alfred 支持 `open`/`find`/`in` 与 File Buffer | `file-provider.ts`、`everything-provider.ts`、`native-file-search-provider.ts` | 部分落地，需要 evidence | 证据缺口 | Everything SDK/CLI 最终策略、P50/P95、watch-root 过滤真机 evidence 缺；FileProvider 内容索引比单纯文件名搜索更激进，因此更需要边界证据 | P0 | 使用 Windows acceptance verifier 覆盖 SDK/CLI/unavailable/target probe/路径过滤；补 macOS/Linux native/file-provider 样本 |
| 系统动作 | 关机、锁屏、设置、快捷动作 | `touch-system-actions`、`touch-quick-actions`、`system-actions-provider.ts` | 部分落地 | 产品 + 证据缺口 | 系统设置搜索没有统一 typed provider；shell-backed 动作需更多平台 reason | P1 | 新增只读 `platform.settings` source 设计，先列出可打开设置项和 unsupported reason |
| 剪贴板历史 | 历史搜索、回贴/复制、多类型 | `modules/clipboard/*`、`plugins/clipboard-history`、`plugin/sdk/clipboard.ts` | 已落地 | 证据缺口 | 图片/文件/HTML item action、自动粘贴失败 UI、隐私留存策略 evidence 不足 | P1 | 补 clipboard text/image/files/html 最近路径 smoke，输出留存/清理策略 |
| Snippets / 片段 | Raycast/Alfred 都支持 keyword expansion、动态占位符和集中管理；uTools 有备忘快贴/插件匹配 | `plugins/touch-snippets/index.js` | 已落地 | 产品缺口 | hot string、cursor/calculator/browser-tab placeholder、autopaste 还未进入首版 | P1 | 固化当前 placeholder contract 和测试；新增 cursor/calculator/browser-tab 前先做 contract 文档 |
| Quicklinks / Web Search | Raycast Quicklinks、Alfred Web Search/Bookmarks、uTools 网页快开/功能指令 | `touch-browser-open`、`touch-browser-bookmarks`、`touch-dev-toolbox`、`touch-browser-data` | 部分落地 | 产品缺口 | 能力分散，缺统一 Quicklinks 数据模型、占位符与管理面 | P1 | 先定义 `QuicklinkSource` 最小 schema，复用 `touch-browser-open` 执行与 Browser Data source diagnostics |
| Calculator / 单位换算 | 输入框即时计算、单位换算、复制 | `PreviewProvider`、`packages/utils/core-box/preview/*`、`calculation/*` | 已落地 | 证据 + 发现缺口 | 用户不一定知道 `calc` 前缀；缺 Store/帮助入口与样本 | P0 | 在文档/Store metadata 加 “Calculator powered by PreviewSDK”；补 `calc 2+2`、`计算 1m to cm` 截图/日志 |
| Emoji / Symbols | 搜索并复制字符 | `plugins/touch-emoji-symbols/index.js` | 首版已落地 | 产品缺口 | 数据集小、无 recent usage、无分组浏览 | P2 | 保持首版复制路径，后续只加 recent usage 和数据集，不引入云同步 |
| Window Management | 分屏、移动、置顶、窗口预设 | `touch-window-manager`、`touch-window-presets` | 部分落地 | 证据缺口 | 多屏、多平台、权限拒绝、native transport 替代 shell 未闭环 | P1 | 补 Windows 多屏 preset smoke；macOS 仅做明确 unsupported/best-effort reason |
| 搜索排序/推荐 | 常用、最近、上下文排序 | `tuff-sorter.ts`、`recommendation-engine.ts`、`usage-stats-*` | 已落地 | 证据缺口 | 缺可读排序样本说明 title/token/frequency/pinned 如何影响结果 | P1 | 产出 5 组 search trace 样本，覆盖 app/file/feature/preview/pinned |
| 扩展生态 | Store/Workflow/插件市场 | `plugins/*/manifest.json`、`packages/utils/plugin/sdk/*`、`apps/nexus/content/docs/dev/*` | 已落地但需闭环 | 证据缺口 | `.tpex` 上传、审核、安装、SDK quickstart 到 publish 真实链路缺 | P1 | 用 `touch-snippets` 做一条 dry-run + 本地安装 + Nexus content tab evidence |
| AI | AI Chat / AI Commands / 智能体 | `touch-intelligence`、`intelligence` SDK、TODO `P1-AI-250` | 进行中 | 证据缺口 | packaged CoreBox AI answer/failure、provider/model/latency/trace 可见 evidence 缺 | P1 | 先完成 CoreBox AI Ask answer/failure packaged capture，不扩 Workflow 范围 |
| OCR / 翻译 | 文本翻译、截图/OCR、图片翻译 | `touch-translation`、`ocr-service.ts`、`image-translate.ts` | 部分落地 | 证据缺口 | 剪贴板图片、截屏翻译、provider fallback、权限拒绝真机 evidence 缺 | P1 | 复用 `P1-TRANSLATION-IMAGE`，补 packaged Electron 截屏翻译和 fallback 样本 |
| Context Actions / Super Panel | Alfred Universal Actions 针对文件/URL/文本；uTools 超级面板对文本/图片/文件/文件夹智能匹配 | `acceptedInputTypes`、`resolveClipboardInputs`、`ContextProvider`、OmniPanel | 部分落地 | 产品缺口 | 当前有 clipboard/context/recommendation 信号，但没有统一“当前上下文 -> 可执行动作”列表合同，selected text 全局入口也未闭环 | P1 | 设计 `ContextActionProvider` 最小合同，先接 selected text 与 clipboard image，不做鼠标面板重写 |
| Notes / Calendar / Reminders | Raycast Notes/Calendar，Alfred/uTools 可扩展 | Roadmap 中 macOS App Data 调研 | 规划中 | 产品 + 风险缺口 | 涉及 TCC/PII/系统数据库，不应默认扫描 | P2 | 只做权限/隐私/降级 reason 调研，不写索引 |
| Focus / 专注 | Raycast Focus | 未发现独立 Focus | 缺失 | 产品缺口 | 非基础 P0，且会分散 2.4.11 稳定化 | P3 | 放长期债务，不进入当前主线 |

## 5. 优先级收敛

### P0：先补可验证基础闭环

1. App Launcher evidence：Windows/macOS 各 10 个常用 app，覆盖 path/shortcut/UWP/localized name/失败 reason。
2. 文件搜索 evidence：Windows Everything SDK/CLI/unavailable、target probe、watch-root 过滤、P50/P95；macOS/Linux native/file-provider 只记录当前支持边界。
3. Calculator discoverability：不新写计算核心，只补文档/Store 入口和 `calc` / `计算` 样本。
4. Browser Data 首版 evidence：Chrome/Edge/Brave/Arc Bookmarks JSON 只读扫描、read-failed/not-found/unsupported diagnostics、打开/复制 URL action。

### P1：统一模型，而不是扩散插件

1. Quicklinks：建立一个最小数据模型，统一 manual/pinned/browser/dev links，不动 CoreBox 主架构。
2. Context Actions：基于已有 `acceptedInputTypes` 和 clipboard/context signals，先做 selected text + clipboard image。
3. Snippets：固化已有 placeholder contract，再评估 hot string/autopaste/cursor/browser-tab。
4. AI/OCR/Translation：只补 packaged answer/failure、provider health、权限拒绝和 fallback evidence。
5. 插件生态：用 `touch-snippets` 或 `touch-browser-data` 做从 manifest、validate、build、publish dry-run、安装到 Store 展示的单条链路。

### P2/P3：谨慎推进

- Notes / Calendar / Reminders：先调研权限和隐私，不默认扫描。
- Emoji/Symbols：扩数据集与 recent usage 即可。
- Focus：暂不进入 2.4.11/2.5.0 主线。

## 6. 产品缺口 vs 证据缺口

| 类型 | 本轮判定 | 典型项 |
| --- | --- | --- |
| 产品能力缺口 | 没有统一模型或入口，当前用户无法形成稳定心智 | Quicklinks、Context Actions、系统设置 provider、Browser history/Safari、Focus |
| 证据缺口 | 代码/文档已有路径，但不能据此声明发布体验闭环 | App Launcher、Everything、File Search、Calculator、AI Ask、OCR/Translation、Window Management、插件发布 |
| 风险边界缺口 | 能力涉及权限、隐私或平台差异，必须先暴露 reason | macOS Notes/Calendar、OCR provider、shell-backed system/window actions、Browser Data read-failed |

## 7. 最小执行切片建议

| 切片 | 范围 | 验收证据 | 不做 |
| --- | --- | --- | --- |
| `basic-evidence-pack` | CoreBox hotkey、App Launcher、File Search、Calculator、Browser Data | Windows/macOS packaged 截图或日志；search trace；失败 reason；P50/P95 | 不改 CoreBox 架构，不新增 provider 大抽象 |
| `quicklinks-contract-v1` | manual link、browser bookmark、dev link、URL template、placeholder contract | 一个 schema、一个管理入口草图、`touch-browser-open` 执行复用测试 | 不做浏览器历史写回，不做跨设备同步 |
| `context-actions-v1` | selected text、clipboard image、clipboard file path | 输入类型、provider 匹配、权限拒绝、fallback UI | 不做 uTools 式鼠标桌面面板，不做全局自动读取隐私数据 |
| `snippets-placeholder-v1.1` | `cursor`、`calculator`、placeholder contract 文档 | focused unit + 插件最近路径 evidence | 不做热字符串系统级注入，除非先完成权限与失败策略 |

## 8. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只分析基础能力，不改代码 | 通过 | 输出限定到本文件 |
| 2 | 基线 review：对齐现有 `RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md` | 发现旧矩阵未覆盖 Alfred，且 Browser Data 状态已更新 | 新增 Alfred 维度；Browser Data 改为“部分落地，需要 evidence” |
| 3 | 竞品事实 enforce：优先官方源 | 通过 | 引用 Raycast Manual/Windows、Alfred Help、uTools Docs/Market/Update；补 Raycast File Search 文件名边界、Alfred Universal Actions、uTools 超级面板 |
| 4 | 仓库证据 review：不信旧 Done | 通过 live tree 扫描 | 以 `plugins/*/manifest.json`、CoreBox/Search/Preview/OCR/Browser Data 路径为准；补 snippets pack 敏感过滤与 Browser Data diagnostics |
| 5 | 状态分类 enforce：必须区分产品缺口和证据缺口 | 通过 | 新增第 6 节 |
| 6 | KISS/YAGNI review：是否提出大重写 | 未提出重写 | Quicklinks/Context Actions 均收敛到最小合同 |
| 7 | P0 review：是否把非阻塞能力抢进主线 | 发现 Emoji/Focus 不应 P0 | Emoji 降 P2，Focus 降 P3 |
| 8 | 证据 review：是否把 dev/源码等同发布闭环 | 发现 AI/OCR 多为 dev 与 focused tests，Browser Data 也是即时扫描首版 | 明确 packaged evidence 缺口 |
| 9 | 安全/隐私 enforce：App Data 是否默认扫描敏感源 | 通过 | Notes/Calendar/Reminders 仅保留调研，不默认索引 |
| 10 | 文档完整性 review：是否包含结论、矩阵、优先级、引用 | 通过 | 补状态口径、官方事实复核、最小执行切片与来源链接 |

## 9. 引用来源

### Raycast

- Raycast Windows: https://www.raycast.com/windows
- Raycast Store / Core Features: https://www.raycast.com/store
- Raycast Manual - Search Bar: https://manual.raycast.com/search-bar
- Raycast Manual - Windows File Search: https://manual.raycast.com/windows/file-search
- Raycast Manual - Clipboard History: https://manual.raycast.com/clipboard-history
- Raycast Manual - Snippets: https://manual.raycast.com/snippets
- Raycast Manual - Dynamic Placeholders: https://manual.raycast.com/dynamic-placeholders
- Raycast Manual - Quicklinks: https://manual.raycast.com/quicklinks
- Raycast Manual - Calculator: https://manual.raycast.com/calculator
- Raycast Manual - Window Management: https://manual.raycast.com/window-management
- Raycast Manual - AI: https://manual.raycast.com/raycast-ai
- Raycast Developers - Extensions: https://developers.raycast.com/

### Alfred

- Alfred Help - Features: https://www.alfredapp.com/help/features/
- Alfred Help - File Search: https://www.alfredapp.com/help/features/file-search/
- Alfred Help - Web Search: https://www.alfredapp.com/help/features/web-search/
- Alfred Help - Calculator: https://www.alfredapp.com/help/features/calculator/
- Alfred Help - Clipboard History: https://www.alfredapp.com/help/features/clipboard/
- Alfred Help - Snippets: https://www.alfredapp.com/help/features/snippets/
- Alfred Help - Universal Actions: https://www.alfredapp.com/help/features/universal-actions/
- Alfred Help - Workflows: https://www.alfredapp.com/help/workflows/
- Alfred Gallery: https://alfred.app/

### uTools

- uTools 官网: https://www.u-tools.cn/
- uTools 帮助中心 - 为什么使用 uTools: https://www.u-tools.cn/docs/guide/about-uTools.html
- uTools 帮助中心 - 超级面板: https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- uTools 帮助中心 - 功能指令: https://www.u-tools.cn/docs/guide/what-is-keyword.html
- uTools 帮助中心 - OCR: https://www.u-tools.cn/docs/guide/plugin-ocr.html
- uTools 帮助中心 - 剪贴板: https://www.u-tools.cn/docs/guide/plugin-clipboard.html
- uTools 插件应用市场: https://www.u-tools.cn/plugins/
- uTools 更新日志: https://www.u-tools.cn/changelog/
