# Raycast / uTools 能力差距矩阵

> 状态：Baseline / 执行矩阵
> 更新时间：2026-05-19
> 范围：CoreBox 常用能力、官方插件、SDK 文档、TuffEx 展示与 App Data / Everything 后续
> 非目标：复制竞品交互细节、一次性重做插件系统、绕过平台权限模型读取用户隐私数据

## 1. 基线来源

本矩阵只用于把 Tuff 当前能力和主流桌面效率工具的高频能力对齐，后续实现仍以 Tuff 的 local-first、typed SDK、权限诊断和可回滚原则为准。

- Raycast 官方 Windows 页面公开展示的核心能力包括 App Launcher、File Search、Clipboard History、Snippets、Quicklinks、Calculator、AI、Notes、Emoji & Symbols、Shortcuts、Window Management 和扩展生态。
- Raycast Store 公开导航把 Raycast AI、Raycast Notes、Raycast Focus、Clipboard History、Window Management、Snippets、File Search、Quicklinks、Calculator、Calendar、System、Emoji Picker 作为 Core Features，并展示 Chrome、VSCode、Google Translate、Notion、Slack、Linear 等高频扩展方向。
- Raycast Manual 的 Dynamic Placeholders 说明 Quicklinks、Snippets 与 AI Commands 可复用剪贴板、snippet、日期、时间、UUID、浏览器标签等动态占位符，Clipboard offset 依赖 Clipboard History。
- uTools 官网将“万能搜索框”“超级面板”和插件生态作为主入口，公开强调 Alt+Space 呼出搜索框、长按鼠标右键呼出超级面板、3000+ 插件应用、AI 制作插件应用与智能体。
- uTools 帮助中心列举的高频场景包括全局搜索、插件匹配、剪贴板/备忘快贴/本地文件匹配、快速翻译、随手计算、图片处理、聚合翻译、OCR、剪贴板、图片批量处理、JSON 编辑器、JavaScript 文档速查、启动软件、搜索系统设置和跨平台使用。

参考来源：

- Raycast Windows：`https://www.raycast.com/windows`
- Raycast Store / Core Features：`https://www.raycast.com/store`
- Raycast Dynamic Placeholders：`https://manual.raycast.com/dynamic-placeholders`
- Raycast Quicklinks：`https://manual.raycast.com/quicklinks`
- uTools 官网：`https://www.u-tools.cn/`
- uTools 帮助中心 / 为什么使用 uTools：`https://www.u-tools.cn/docs/guide/about-uTools.html`
- uTools 超级面板：`https://www.u-tools.cn/docs/guide/uTools-super-panel.html`
- uTools 功能指令：`https://www.u-tools.cn/docs/guide/what-is-keyword.html`
- uTools OCR：`https://www.u-tools.cn/docs/guide/plugin-ocr.html`
- uTools 剪贴板：`https://www.u-tools.cn/docs/guide/plugin-clipboard.html`

## 2. 当前仓库证据

| 证据 | 位置 | 结论 |
| --- | --- | --- |
| 官方插件清单 | `plugins/*/manifest.json` | 已覆盖 Clipboard、Snippets、Browser Open、Browser Bookmarks、Dev Utils、Text Tools、Translation、Intelligence、System Actions、Window Manager、Window Presets、Workspace Scripts、Batch Rename 等方向。 |
| PreviewSDK / Calculator | `packages/utils/core-box/preview/*`、`apps/core-app/src/main/modules/box-tool/addon/preview/*`、`apps/core-app/src/main/modules/calculation/*` | 表达式、单位换算、科学常数、时间差、百分比、颜色、文本统计等已有即时预览；CoreBox 已支持 `calc` / `calculator` / `calculate` / `计算` / `换算` 显式前缀并复用 PreviewSDK。 |
| App Data / Everything Roadmap | `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` | Browser Data、Obsidian、VSCode、macOS App Data、Epic 与 Everything 生产化已有收口路线。 |
| TuffEx 文档与 demo | `packages/tuffex/docs/components/*`、`packages/tuffex/README.md` | 组件文档覆盖面较广，但仍缺“桌面效率应用场景化组合 demo”和与插件开发文档的交叉入口。 |
| Nexus SDK 导航 | `apps/nexus/app/data/tuffSdkItems.ts` | 已列出 Box、Clipboard、Storage、Download、Platform Capabilities、Account、Feature、DivisionBox、Flow、Intelligence、System、Window、Store、Analytics 等 SDK 项；缺按“实现一个 Raycast/uTools 类扩展”的任务流串联。 |

## 3. 能力矩阵

| 能力 | Raycast / uTools 对照 | Tuff 当前状态 | 缺口 | 优先级 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 全局入口与 App Launcher | Raycast App Launcher；uTools Alt+Space 启动软件、系统设置 | 已有 CoreBox、AppProvider、App Index scanned/manual 管理；scanned app 可启用/禁用 | 缺 Windows/macOS release-blocking 人工 evidence；系统设置搜索仍未形成 typed provider | P0 | 补真机 evidence；把系统设置作为只读 source 进入 App Data/Platform capability 诊断。 |
| 文件搜索 | Raycast File Search；uTools 本地文件匹配 | FileProvider + Windows Everything；Everything 已支持 CLI 手动选择、诊断 evidence 与 watch-root 路径过滤 | Everything SDK/CLI 最终策略、Windows 真机样本、P50/P95 性能基线未闭环 | P0 | 按 EV-010/060/070 收口，真机覆盖 SDK/CLI/unavailable 三场景。 |
| 剪贴板历史 | Raycast Clipboard History；uTools 剪贴板 | `plugins/clipboard-history` 已存在，权限为 `clipboard.read/write` | 图片/文件/HTML 输入链路与 CoreBox 上下文动作需要产品化证据 | P1 | 对齐 TuffQuery 输入类型，补 clipboard item action、隐私留存策略与 smoke。 |
| Snippets / 片段库 | Raycast Snippets + Dynamic Placeholders；uTools 备忘快贴/插件匹配 | `touch-snippets` 已 canonical；text/code/prompt/template 搜索、保存、管理、CloudShare snippet pack 安装和 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}` 首批占位符已推进 | 光标位置、热字符串/autopaste、browser-tab 占位符和跨设备发布/安装 evidence 仍不足 | P1 | 固化 placeholder contract 与 evidence；后续再做 browser-tab、cursor 和 autopaste。 |
| Quicklinks / 链接导航 | Raycast Quicklinks；uTools 快捷关键词/插件启动 | `touch-browser-open`、`touch-browser-bookmarks`、`touch-dev-toolbox` 已覆盖打开 URL、网页搜索、自管理收藏、常用开发链接 | 缺统一 Quicklinks 数据模型、动态占位符、浏览器真实书签/历史导入 | P1 | 先把 Quicklinks 作为 Browser Data 的 manual/pinned 子源，复用 `touch-browser-open` capability diagnostics。 |
| Calculator / 单位换算 | Raycast Calculator；uTools 随手计算 | PreviewSDK 已覆盖表达式、单位换算、百分比、常数、时间差等即时预览；CoreBox 已支持 `calc: 2 + 2` / `计算 1m to cm` 等显式前缀 | 独立插件/Store discoverability 与更完整历史管理仍待补；复制动作已沿 PreviewProvider 默认执行链路复用 | P0 | 保持 PreviewSDK 为唯一计算核心；后续如需 Store 可见性，再给 `touch-dev-utils` 增加薄 feature 或新增 `touch-calculator` 壳层。 |
| Emoji & Symbols | Raycast Search Emoji & Symbols | `touch-emoji-symbols` 首版已新增，内置常用 emoji、箭头、标点、货币与数学符号，支持 CoreBox 搜索与复制动作 | 最近使用、更大数据集、分组浏览、Store 展示与真实安装 evidence 仍不足 | P1 | 固化首版插件测试与 Store metadata；后续补 recent usage 和扩展数据集，不做云同步。 |
| Notes / Calendar / Reminders | Raycast Notes / Calendar；uTools 备忘快贴类插件 | Roadmap 中 macOS App Data 已列 Notes/Reminders/Calendar 调研 | 涉及 TCC、PII、系统数据库格式，不能默认扫描 | P2 | 只做显式授权后的只读调研；先输出 permission/degraded reason，再决定是否建插件。 |
| Window Management | Raycast Window Management；uTools 可通过插件扩展 | `touch-window-manager`、`touch-window-presets` 已存在，并已推进 shell capability fail-closed | 真机多屏 evidence、native transport 替代 shell、Linux best-effort 仍不足 | P1 | 补 macOS/Windows 多屏 smoke；长期迁入 Native transport V1 能力诊断。 |
| System Actions / Settings | Raycast System；uTools 搜索系统设置 | `touch-system-actions`、`touch-quick-actions` 已有；shell capability 诊断已推进 | 系统设置搜索和平台差异未统一成 typed capability | P1 | 拆 `platform.settings` provider，只读列出可打开目标；执行前显示 capability reason。 |
| AI Ask / AI Commands | Raycast AI / AI Commands；uTools AI 制作插件应用/智能体 | `touch-intelligence`、CoreBox AI Ask、OmniPanel Writing Tools、Workflow Use Model 均在 dev 切片 | 缺 packaged answer/failure UI evidence、provider/skill 权限门控和 AI Command 模板化入口 | P1 | 先补 CoreBox AI Ask packaged evidence；再将 Prompt/AI Command 模板收口到 Plugin SDK 示例。 |
| Translation / OCR / 图片输入 | Raycast Google Translate 扩展；uTools 快速翻译、聚合翻译、OCR | `touch-translation` 支持翻译、多源翻译、截图翻译；2.5.0 Stable 目标只承诺文本 + OCR | OCR pipeline、截图输入、provider health、隐私策略和失败 reason 需要统一 | P1 | 把 OCR 作为 AI/Native capability 明确 health；翻译 provider secret 使用 secure store degraded 状态。 |
| Browser Data | Raycast Store 有 Google Chrome 扩展，搜索 tabs/bookmarks/history；uTools 通过插件生态扩展 | `touch-browser-bookmarks` 是自管理收藏；App Data roadmap 已规划 `touch-browser-data` | 真实 Chrome/Edge/Brave/Arc/Safari 书签/历史未接入 | P0 | 新建 Browser Data 插件，只读复制浏览器数据库，默认限制最近 N 天/N 条，支持 clear index。 |
| Dev Utils / Text Tools | Raycast Store 常见 Format JSON、Tailwind、VSCode 等扩展；uTools JSON 编辑器、JavaScript 文档速查 | `touch-dev-utils`、`touch-text-tools`、`touch-dev-toolbox` 已覆盖 UUID、时间戳、JWT、命名转换、Base64/URL/JSON/Hash、常用开发链接 | 缺统一 action taxonomy、示例数据与 README/Nexus 展示 | P1 | 整理插件 README + Nexus store metadata，补 focused fixtures，避免功能散落。 |
| Plugin Store / Extension Ecosystem | Raycast Store / Developers；uTools 插件应用生态/开发者工具 | Nexus Store、tuff-cli、CloudShare、plugin publish 与 snippet pack 安装已推进 | 真实 `.tpex` 上传、package policy/security scan、内容审核、SDK 文档任务流未闭环 | P1 | SDK 文档改成“从 manifest 到 publish”的路径；CloudShare 与 Store Content 增加端到端 evidence。 |
| Super Panel / 上下文动作 | uTools 超级面板会按文本/图片/文件自动匹配插件 | TuffQuery 支持 `acceptedInputTypes`，插件可声明 text/image/files/html；Translation/Snippets/Clipboard 已有部分输入处理 | 缺统一“当前选中文本/图片/文件 -> CoreBox context actions”的入口和可见诊断 | P1 | 设计 `ContextActionProvider` 最小合同，先接 selected text + clipboard image，不做全局鼠标面板重写。 |
| Focus / 状态专注 | Raycast Focus | 未发现独立 Focus 能力 | 缺 Do Not Disturb / app blocking / focus session 模型 | P3 | 先放长期债务；不要抢占 App/File/Clipboard/Snippets/Calculator 主线。 |
| Game / Epic Launcher | Raycast Windows 展示 One Game Launcher，含 Steam/Epic 等 | Roadmap 已有 Epic 澄清项 | Epic 指向不清：Epic Games、Unreal 项目还是项目管理 Epic | P2 | 先把 Epic 定义澄清；若是 Unreal 项目，优先索引本地 `.uproject`。 |

## 4. 优先级收敛

### P0 - 最小补齐竞品常用体验

1. **Calculator 显式入口**：CoreBox `calc` / `calculator` / `calculate` / `计算` / `换算` 前缀已接入 PreviewProvider；后续只补 Store discoverability / 历史管理，不重复实现计算核心。
2. **Browser Data 首版**：Chrome/Edge/Brave/Arc 书签只读索引，历史受限扫描；Safari 只做调研和降级 reason。
3. **Everything 生产证据**：Windows 真机 evidence + 性能基线 + SDK/CLI 决策。
4. **App Launcher evidence**：macOS/Windows 扫描、启用/禁用、搜索/推荐过滤闭环截图或日志。

### P1 - 提升留存与生态

1. **Snippets placeholders**：date/time/uuid/clipboard 首批已落地；browser-tab、cursor 和 autopaste 后置。
2. **Emoji/Symbol picker**：`touch-emoji-symbols` 首版已落地，复制为主；recent usage、扩展数据集和 Store evidence 后置。
3. **Quicklinks 统一模型**：manual/pinned quicklinks 与 Browser Data 分源展示。
4. **Super Panel 式 Context Actions**：先基于 selected text / clipboard image，不做鼠标面板 UI 重写。
5. **SDK 文档任务流**：补“创建插件 -> 声明权限 -> 使用 SDK -> 发布 -> 共享内容包”的一条龙文档。
6. **TuffEx demo 场景化**：补 CoreBox item、Settings diagnostics、Store content、Plugin permission、Empty/Error/Loading 等真实产品组合 demo。

### P2/P3 - 审慎推进

- macOS Notes / Calendar / Reminders：必须先做权限、隐私和降级原因调研。
- Epic / Game Launcher：先澄清需求，再决定本地项目索引还是游戏库。
- Focus：保持长期债务，不进入 `2.4.11` 稳定化窗口。

## 5. 文档与实现联动

- `TODO.md`：本矩阵只改变 P1 执行入口，不改变 `2.4.11` P0 稳定化主线。
- `APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md`：承接 Browser Data、macOS App Data、Everything 和 Epic 的细化执行。
- `packages/tuffex/docs/components/*`：后续 demo 优化优先补真实产品组合，不做纯视觉堆叠。
- `apps/nexus/app/data/tuffSdkItems.ts` 与 Nexus docs：后续 SDK 文档优化应从任务流组织，不只列 SDK 名称。
