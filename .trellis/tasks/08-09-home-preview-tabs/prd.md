# 右侧 Tabs 预览区

父任务：`08-09-home-panel-layering-v2`

## Goal

顶栏 `panel-right` 按钮展开的右侧区域，从一块静态的会话元数据展示，变成一个可切 tab 的**内容预览区** —— 会话里产出过的东西（文件、图表/表单、工具调用、引用来源）都能在这里快速看到，不用在长对话里往回翻。

## 用户原话

> 这个应该是会展开一个右侧 tabs 区域 可以快速预览各种内容

选定的四个 tab：**产物 / 文件**、**Widget（图表 / 表单）**、**工作过程 / 工具调用**、**引用 / 来源**。

## 现状

- `HomeSidePanel.vue` 现在是两段死板块：「本轮信息」（由 ④ 搬走）+「工作过程」空状态。
- 面板宽度 280px，开合动画由外层 `.HomePage-PanelSlot` 收窄裁剪实现（`HomePage.vue:1544`），面板自身保持定宽以免逐帧重排。这套机制要保留。
- 四个 tab 的数据**全部已经存在于 `ConversationMessage.parts` 里**，不需要任何新的主进程通道（详见 `design.md` 的派生表）。

## Requirements

### 通用

1. 面板变成 tab 容器：四个 tab 头 + 一个内容区。切换 tab 不改变面板宽度、不影响开合动画。
2. **每个 tab 的数据只能来自 `message.parts` 里真实存在的东西。** 没有就是明确的空状态，不许摆看起来像真的假行 —— 这条规矩是 `HomeSidePanel.vue:6-12` 立的，本任务继续遵守。
3. tab 头必须显示各自的条目数（如「产物 3」），让用户不点进去也知道哪个有内容。计数为 0 时 tab 仍然可见可点（不隐藏），点进去是空状态。
4. 作用域是**整个会话**，不是单轮 —— 用户要的是"不用往回翻"，只看最后一轮解决不了这个问题。
5. 面板宽度 280px 偏窄，本任务允许调整默认宽度，但必须同时改 `--home-panel-width` 这一个来源（`HomePage.vue:1505`），不许在面板里写第二个宽度常量。

### 产物 / 文件

6. 列出会话中 `tuff_write_file` 成功创建的文件（该工具输出形如 `Created <path>`，且永不覆盖已有文件，所以每条都是一个真实新产物）。
7. 每条显示文件名与所在目录，点击调用既有的打开路径能力，不自己实现打开逻辑。
8. 用户上传的附件（`message.attachments`）也算产物，与生成文件分组显示，不要混成一堆。

### Widget（图表 / 表单）

9. 列出会话里所有渲染成功的图表与表单（`tuff:chart:` / `tuff:form:` 前缀的工具结果）。
10. 点击条目**定位回它在对话里的位置**，而不是在面板里再渲一份 —— 280~360px 宽的面板放不下一个可用的图表，复制一份还会带来两处状态不同步。

### 工作过程 / 工具调用

11. 列出会话里所有 `tool-call` part：工具名、状态（pending / running / done / error）、摘要。
12. 出错的调用要能一眼看出来。

### 引用 / 来源

13. **`AiSourcesPart` 这个类型在 tuffex 里存在，但全仓库没有任何地方产生它** —— 不能假装有数据。本 tab 的来源改为从工具调用派生：被读过的文件（`tuff_read_file`）、搜索命中的路径（`tuff_search_files`）、调用过的 MCP 服务器/工具（`tuff_mcp_call`）。
14. 若将来真的接入 `AiSourcesPart`，本 tab 要能直接消费它而不用重写 —— 派生逻辑与渲染分离。

## Acceptance Criteria

- [x] 四个 tab 均可切换，tab 头带真实计数（计数放在 `TxTabItem` 的 `#name` 插槽里，tab 的 `name` 保持稳定标识 —— 把计数写进 `name` 会让计数一变就重置选中项）
- [x] 空会话下四个 tab 全是空状态，四句空状态各自独立，**没有任何一条假数据**
- [x] 派生规则有单测断言：写文件 → 产物、图表/表单前缀 → Widget、全部 tool-call → 工作过程、读文件/搜索/MCP → 引用
- [x] 产物条目走 `appSdk.openApp({ path })`，次级操作 `showInFolder`；Widget 条目 emit `locate` → `streamRef.scrollToIndex`
- [x] 引用 tab 的条目全部由真实工具调用派生，`AiSourcesPart` 的分支已就位但当前无生产端
- [x] 面板开合动画机制未动（仍是外层 slot 收窄裁剪）；`TxTabs` 显式关掉 size 动画避免抢帧
- [x] 派生逻辑单测 15 条；`src/renderer/src/modules/conversation/` 全套 111 条全绿
- [x] zh-CN / en-US 的 `home.preview` 21 键、`home.panel` 9 键，集合一致且无孤儿
- [x] eslint 退出码 0、`vue-tsc` 退出码 0、prettier `--check` 通过
- [ ] 人工走查（见 implement.md 的走查脚本）

## 非目标

- 不在面板内重新渲染图表 / 表单（见第 10 条）
- 不实现文件内容预览（读文件内容是另一个能力，本轮只做定位与打开）
- 不改 `tuff_write_file` / `tuff_read_file` / `tuff_search_files` 的输出格式来方便解析 —— 解析要容错，不能反过来绑架主进程契约
- 不接入 `AiSourcesPart` 的生产端

## 顺序约束

**必须等 ④ `08-09-turn-info-float-panel` 合入之后再开始。** 两个任务都改 `HomeSidePanel.vue`，④ 负责把「本轮信息」段搬走，本任务接手剩下的壳。

（已按此顺序执行：④ 先落地，再改本任务。）

## 实现记录

与 `design.md` 的一处偏离：来源条目**没有**复用 `AiSourceItem`。那个类型要求 `url` 且带 `favicon`，是网页形状的；本地文件只有路径、MCP 只有 server/tool，硬塞进去就得凭空造 URL —— 正好是 PRD 第 2 条禁止的事。改为自定义 `PreviewSource`（带 `kind` 判别式），`AiSourcesPart` 到来时映射成 `kind: 'web'`，渲染层不用改。这条分支已经写好并有测试覆盖。

派生模块做过正控：删掉 `output.startsWith('Created ')` 这道判断后，「ignores a write that the tool refused」立刻失败 —— 说明工具的拒绝文案（`File already exists…`）确实会被错当成产物，这道判断不是装饰。

排查 i18n 孤儿键时，第一版扫描用 `src.includes('home.preview.' + key)` 报「无孤儿」，是**假阴性**：`artifacts` 是 `artifactsCreated` 的前缀，所以永远命中。加上词边界 `(?![A-Za-z0-9_])` 后才暴露出真正的孤儿 `home.preview.open`（加了键但没用上），已补进产物行的 tooltip。**子串匹配不能用来判存在性。**

`.HomePreview-Detail` 一开始用了 `direction: rtl` 做路径尾部截断，已撤掉：那个技巧会重排路径里的 `/`，把 `/Users/me` 显示成 `Users/me/`。改成普通尾部省略，完整路径放 `title`。
