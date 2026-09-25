# Design — Nexus 模板第二批

契约沿用 `.trellis/spec/frontend/nexus-docs-templates.md`（`TemplateFrame` 签名、行为矩阵、模板规则、验证）与第一批 `design.md` §5 / §6.11；本文只写第二批新增的部分。

## 1. 命名与落点

### 1.1 新章节（完整接入链路）

| slug | 标题 zh / en | category | 侧栏位置 | demo |
|---|---|---|---|---|
| `template-onboarding` | Onboarding 登录引导 / Onboarding | TemplateApp | settings 之后 | `TemplateOnboardingDemo` |
| `template-files` | Files 文件管理 / Files | TemplateContent | inbox 之后 | `TemplateFilesDemo` |
| `template-store` | Store 插件商店 / Store | TemplateContent | files 之后 | `TemplateStoreDemo` |
| `template-docs` | Docs 知识库 / Docs | TemplateContent | store 之后 | `TemplateDocsDemo` |
| `template-release` | Release 发布控制台 / Release | TemplateData | automation 之后 | `TemplateReleaseDemo` |

改动点：`scripts/recategorize-component-docs.py` 的 `TAXONOMY`（与页面同批落地）、`DocsSidebar.vue` 的 `SECTION_ORDER` templates 块、`demo-registry.ts`（与 demo 文件同批落地）。分组不新增，`docs-suites.ts` 与 i18n 不动。

### 1.2 新风格（已有章节页追加第二个 `###`）

| 章节页 | 风格名 zh / en | demo |
|---|---|---|
| `template-shell` | 顶栏控制台 / Top-nav console | `TemplateShellConsoleDemo` |
| `template-cms` | 看板排期 / Editorial board | `TemplateCmsBoardDemo` |
| `template-inbox` | 通知中心 / Notification center | `TemplateInboxNotificationsDemo` |
| `template-agent-chat` | 侧边 Copilot / Side copilot | `TemplateAgentChatCopilotDemo` |
| `template-dashboard` | 运营大屏 / Ops wall | `TemplateDashboardOpsDemo` |

页面改法（中英同构，`check-doc-parity` 按章节数校验，两边一起改）：

- `## 模板` 下，在第一种风格的 demo 块之后追加 `### <风格名>`：一段说明（这种风格适合什么、和第一种的区别）+ `:::TuffDemoWrapper{demo="Template<Chapter><Style>Demo" …}`（精简但真实的 `code:`）。
- `## 场景`：补一句提到第二种风格。
- `## 组成`：为新风格独有的区域追加行，区域名后加「（<风格名>）」；两种风格共用的组件不重复列。
- `## 交互要点`：追加 2–3 条，以「<风格名>：」开头。
- `## 改造建议`：可选追加 1 条。

第一种风格的 demo 与文字不改（R4）。

## 2. 实现约定

- 全部沿用 `nexus-docs-templates.md` §6：`@container template` 三档、数值尺寸取 slot `width/height`、`@enter` 开播、`defineExpose({ resetDemo })`、减弱动效直出终态、不碰页面滚动与焦点、快捷键挂模板根、`TxToastPanel` 反馈、不 import `Tx*`、图片代码生成、图标名校验、frontmatter 不写未加引号的 `: `。
- 同一章节的两个风格 demo 可以各自独立，也可以抽取共享 mock 数据——但共享数据只能放在 `.vue` 内（`demos/*.ts` 不在 UnoCSS 扫描范围，图标类名必须写在 `.vue` 里）；为避免耦合，首选各自独立。
- 同一页面上两个 `TemplateFrame` 并存：各自的 `@enter` / 展开互不影响（`TemplateFrame` 无全局状态，滚动锁只由展开的那个持有）。

## 3. 各模板组合设计

组件 API、ASCII 布局、时间轴与双语 mock 以 research/{app,content-a,content-b,ai-data}.md 为准（研究里的 demo 命名以本表为准）；本节只记采纳方案、主会话决策与偏离。

### 3.1 Shell · 顶栏控制台 — `TemplateShellConsoleDemo`（research/app.md，高 580）

- 两行顶栏：①产品切换（`TxDropdownMenu` 内 2 列应用格——面板宽度被组件限制在 ≤360px，不做真正的宽 mega 面板）、工作区切换（带「数据区域」子菜单）、⌘K（`TxCommandPalette`，绑模板根）、通知菜单、账户菜单；②`TxTabs` 下划线主导航 + 右侧在线 `TxAvatarGroup`。主区：面包屑页头 + 项目卡网格（`TxCard` + 进度条 + 状态 + 头像组），点卡下钻、面包屑回退。窄档：`TxNavBar` + `TxDrawer`。
- 演示（`@enter`）：成员上线 → 构建完成 → 铃铛 +1 并弹 `TxToastPanel`。

### 3.2 Onboarding 登录引导 — `TemplateOnboardingDemo`（research/app.md，高 560，新章节）

- 五步：登录 → 工作区 → 偏好（全局快捷键录制 / 主题 / 语言）→ 系统权限（辅助功能、屏幕录制，模拟开关 + 状态）→ 完成。文案取 core-app 真实首启引导（`beginner.*`、`setupPermissions.*`）与 Nexus 登录页。
- **登录方式照 Nexus 真实登录：Passkey / GitHub / LinuxDO / Magic Link，不做密码框**（真实站点没有密码登录；密码框会触发浏览器存密码提示，`TxSensitiveInput` 输入时是明文）。
- 特效每处一个：Passkey 按钮 `TxBorderBeam sm`；录快捷键时 `TxGradientBorder`；完成页描边文字 + 一次性 `TxGlowText` + `TxBorderBeam md` 包 CoreBox 预览；品牌栏 `TxTuffLogoStroke`。挂载即播的特效在 `@enter` 后用 `v-if` / `key` 挂载，重播换 key。`TxBorderBeam` 显式传站点当前主题，减弱动效下 `:active="false"`。
- 演示「看一遍流程」**停在权限步等读者点击**，不自动授予系统权限（安全闸门原则）。无价格、无套餐选择。

### 3.3 CMS · 看板排期 — `TemplateCmsBoardDemo`（research/content-a.md，高 580）

- 四列 草稿 → 审核中 → 已排期 → 已发布，卡片含封面条、栏目标签、作者、截止日、评论数；WIP 计数、快速筛选；宽档加一周排期泳道。卡片详情用 `TxModal`（区别于表格风格的抽屉）。
- **跨列拖拽**：`TxSortableList` 不支持（拖拽状态按实例隔离、无 `group`）。方案：每列一个 `TxSortableList` 负责列内排序、键盘与读屏播报，列与泳道格子之间用约 40 行原生 DnD 胶水，移动在看板根的 `dragend` 里提交（等源列先收尾）；键盘 / 触屏用卡片上的「移到 ▸」菜单 + ←/→。胶水出问题时退回只保留菜单与 ←/→。
- 坑：`TxSortableList` 会把卡片内按钮的 Enter / Space 当成「拿起」，卡片内每个按钮加 `@keydown.enter.stop` / `@keydown.space.stop`。

### 3.4 Inbox · 通知中心 — `TemplateInboxNotificationsDemo`（research/content-a.md，高 580）

- 按类型 / 日期分组的 `TxCardItem` 通知行（提及、构建、安全、插件更新；不含账单），未读点、批量已读、筛选纸片、每条快捷动作（打开 / 静音 / 批准类只由读者点击）；免打扰用 `TxModeChip`，静默时段用两个 `TxSelect`（tuffex 无时间选择器，`TxPicker` 会吞页面滚动）。
- 演示（`@enter`）：新通知陆续到达 + `TxToastPanel`；**脚本从不点「批准」**。

### 3.5 Files 文件管理 — `TemplateFilesDemo`（research/content-a.md，新章节）

- 设定：Tuff 工作区的本机同步文件夹（文档 / 截图 / 剪贴板导出 / 主题）+「插件存储」分区（每个插件一个文件夹，真实上限：每插件 100 MB、单文件 10 MB、最多 1,000 个文件，`plugin-business-file-storage.ts:20-23,95`）；配额条无「升级」入口。
- `TxTree` 文件夹树（行用 `#item` 插槽；整行点击是「选择」，展开由宿主接管——需浏览器确认）、`TxBreadcrumb` 路径、网格 ↔ 列表（`TxFlatRadio`）、多选批量操作、右键菜单（**一个** `trigger="manual"` 的 `TxContextMenu`，`openAt()` 打开，关闭后由模板归还焦点）、拖放上传（`TxFileUploader` 作整区投放层；逐文件进度放 `live="off"` 的 `TxToastPanel`）、快速预览（图片 / markdown / 文本）。图片全部代码生成。

### 3.6 Store 插件商店 — `TemplateStoreDemo`（research/content-b.md，新章节）

- 精选轮播、分类导航、带建议的搜索、插件卡（图标、名称、作者、评分、安装量、标签、认证徽章）、详情（截图灯箱、说明、申请的权限与理由、版本历史、评价）、安装流程（安装 → 进度 → 已安装 / 有更新 / 卸载，权限确认用 core-app 真实文案「始终允许 / 仅本次会话 / 拒绝安装」）、「已安装」页签与更新。
- **详情做成模板内视图 / 右侧栏，不用 `TxDrawer`**：抽屉在 document 上接管 Tab 与 Esc，详情里再开截图灯箱或确认框时焦点被拽回、一次 Esc 关两层。`TxModal` 只用于确认与截图灯箱。
- 真实数据：插件 id、版本、触发词、必需 / 可选权限与理由取 `plugins/*/manifest.json`；权限风险等级与中英名取 `packages/utils/permission`；评分、安装量、评价标注为示例。**无价格、付费、Pro 角标、金融分类；安装 / 更新 / 权限确认不由计时器触发。**

### 3.7 Docs 知识库 — `TemplateDocsDemo`（research/content-b.md，新章节）

- 左侧导航树、正文（`TxMarkdownView`：标题、提示块、代码、表格）、右侧「本页目录」随模板内滚动高亮（只滚模板自己的滚动容器）、⌘K / 站内搜索、面包屑、上一篇 / 下一篇、「是否有帮助」、相关文章、更新时间与贡献者。
- `TxMarkdownView` 实测：标题**没有 id 且不能加**（docs 页的 DocsOutline 会收集带 id 的标题并在 hashchange 时滚动整页）→ 目录从 markdown 源码解析、按序号对应 DOM；代码块不高亮（需要高亮就整篇换 `TxStreamMarkdown`）；链接是真 `<a>` → 外层委托拦截 `click` / `auxclick`，站内链接写 `#kb:<id>`（`kb:` 自定义协议会被 DOMPurify 删掉）。正文字号覆盖到 13–14px。

### 3.8 AgentChat · 侧边 Copilot — `TemplateAgentChatCopilotDemo`（research/ai-data.md，高 560）

- 宿主页：clipboard-history 插件的 README（普通 DOM，按段落分块）。划词 → `TxSelectionActions`（解释 / 润色 / 翻译，翻译走 action-icon 插槽）→ 右侧 Copilot 流式给出建议与删改对照 → **只有读者点「应用」才改页面**。上下文纸片显示 Copilot 看到了什么；追问建议；侧栏可折叠。
- 演示（`@enter`）：约 4.3s 生成建议后停住。脚本「选区」用模板自己高亮的段落构造，**不改浏览器真实选区**（会冲掉读者在别处的选中）。
- 高风险先验：`TxSelectionActions` 滚动时只按选区快照重算位置，页面一滚工具条会钉在视口上 → 在滚动、侧栏折叠、展开 / 收起时重新测量并 `updatePosition`；实现的第一步就在浏览器里验证。

### 3.9 Dashboard · 运营大屏 — `TemplateDashboardOpsDemo`（research/ai-data.md，高 600）

- **强制暗色**：模板根设 `data-theme="dark"` + `color-scheme: dark`，并重新声明 research 列出的 5 个派生 token；亮色文档页里它就是一块暗屏（大屏惯例，也与第一种风格拉开差异）。
- 大字 KPI（`TxTextMorph`）、城市气泡地图（`TxBubbleMap`，同源 `/geo/world-countries.geo.json`；只画城市气泡、不按国家着色；关闭缩放拖动以免吃掉页面滚轮）、`TxSankeyChart` 流向（CoreBox 搜索 → 插件 → 动作，守恒数据；英文 tooltip 自行替换）、事件滚动条、健康灯、自动轮播焦点卡；暂停开关 `TxModeChip`。减弱动效下显示静态快照、不跳数字。

### 3.10 Release 发布控制台 — `TemplateReleaseDemo`（research/ai-data.md，高 600，新章节）

- `TxSteps` 流水线（构建 → 签名 → 公证 → 预发 → 灰度）、版本胶囊、产物矩阵（macOS / Windows / Linux，大小 + sha256 可复制）、构建日志（`TxCodeStream` 外包滚动容器）、灰度档位（`TxSegmentedSlider`）与护栏（无崩溃率 `TxSignalMeter`）、发布说明预览、历史（`TxTimeline`）。
- 首次放量用 `TxToolConfirmation`，**一直等读者点**；其「记住」复选框（无法隐藏）改文案为「护栏失守时自动暂停」；晋级与暂停都在 `TxModal` 里确认。
- **示例数据**：版本号 `v2.5.0-demo.N`，sha256 / 签名全部标「示例」，不给任何下载链接（R1 Release Integrity）。

## 3a. 共享修复（阶段 A，第一批模板同样受益）

1. **展开 / 收起保留模板内滚动位置**：Teleport 移动节点会把所有滚动区的 `scrollTop` 清零且不派发 scroll 事件（ego 实测 600→0）。`TemplateFrame` 在切换 `expanded` 前快照 body 内所有滚动元素的 `scrollTop/scrollLeft`，`nextTick` + 一帧后写回（写回会触发 scroll 事件，虚拟列表随之重算）。模板无需各自处理。
2. **模板内的代码被文档页脚本接管**（列内状态下模板位于 `.docs-prose` 内；展开后 Teleport 到 body，不受影响）：
   - 点击复制（常驻）：`pages/docs/[...slug].vue:1908-1909` 在 document 上挂 click / keydown，`getInlineCodeElement`（`:1374`）命中任何不在 `pre` / 链接 / 按钮里的 `.docs-prose code` → 写入读者真实剪贴板 + 弹站点 toast，并 `stopPropagation`（模板自己的点击逻辑也收不到）。
   - DOM 改写（竞态）：`enhanceInlineCode`（`:1449`，给行内代码加 `role=button` / `tabindex=0` / 可复制样式）与 `enhanceCodeBlocks`（`:1790`，往 `pre` 首部插 `.docs-code-header`）只在页面加载与切文档时经 `scheduleCodeEnhance`（`:1924/1940/1970`，延迟 80 / 260ms）跑一次，无 MutationObserver；`app/plugins/highlight.client.ts:8` 在 `app:mounted` / `page:finish` 对全局 `pre code` 跑 highlight.js。模板若在这之前挂载（页首附近的舞台）就会被改写，之后挂载则不会。
   - 受影响：第一批 Launcher / Inbox / AgentChat / CMS / Research（markdown 行内代码）、Shell（`<code>`），其中 CMS、Inbox 还有围栏代码块；第二批 Docs（`TxMarkdownView` 正文含代码块）、Copilot（README）、Files（markdown 预览）。
   - **采用方案 A**（老板 2026-09-24 拍板，PRD D4）：让 docs 页的 JS 遵守它 CSS 早已遵守的约定——`[...slug].vue` 已有 34 处 `:not(:where(.not-prose, .not-prose *))` 把 `.not-prose` 子树排除在正文样式之外。改动：`getInlineCodeElement`、`enhanceInlineCode`、`enhanceCodeBlocks` 的排除条件各加 `closest('.not-prose')`，`highlight.client.ts` 的节点列表过滤掉 `.not-prose` 内的节点，共 4 行。`.not-prose` 只用于模板与 `DocsComponentsGallery` 的 specimen（`github-markdown.css` 是排除规则本身），两者都不该被当作正文。
   - 未采用的方案 B（不改 docs 页）：`TemplateFrame` 根上对落在 `code` 上的 click / keydown 调 `stopPropagation()`（document 监听在冒泡阶段，挡得住）。挡不住加载时的 DOM 改写与高亮，Docs 模板的代码块仍可能被插标题栏。

## 4. 约束复述

- Store：只有免费插件的安装 / 更新 / 卸载，不出现价格、套餐、购买、结算。
- Release：版本、sha256、签名、公证全是明显的示例数据，不暗示真实发布证据。
- 不改 tuffex 源码 / dist、docs 布局、`TuffDemoWrapper.vue`、`DocsComponentsGallery.*`；共享文件插入式改动、改前重读。

## 5. 回滚

- 新章节：删内容页 + demo + registry 行，再撤 TAXONOMY / SECTION_ORDER。
- 新风格：删 demo + registry 行，撤回对应章节页里新增的 `###` 段与追加行（第一种风格的内容保持原样，便于逐段撤销）。
