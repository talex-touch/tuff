# Research: MCP 独立设置页（把「MCP 服务器」「本机 MCP 服务」拆出智能页）

- **Query**: 为 `10-03-mcp-settings-page` 调研：拆 `SettingSkillsMcp.vue`，在「塔芙智能」侧栏「能力（将改名技能）」下方新增 MCP 子页所需的组件解剖、设置 IA、路由、入站链接、设置搜索、i18n、图标、测试与 spec 事实。
- **Scope**: internal
- **Date**: 2026-10-03

路径缩写：`R/` = `apps/core-app/src/renderer/src/`，`M/` = `apps/core-app/src/main/`，`S/` = `apps/core-app/src/shared/`，`SPEC/` = `.trellis/spec/`。行号均为当前工作区行号。

## 0. 工作区未提交改动（引用行号前先看）

| 文件 | 他人未提交改动 | 对本文行号的影响 |
|---|---|---|
| `R/modules/lang/zh-CN.json`、`R/modules/lang/en-US.json` | 各 +7 行 `update.ready_notice`（3413–3419），更新提示任务，与 MCP 无关 | ≤3412 行与 HEAD 相同；`settings.skillsMcp`（工作区 3499–3659）在 HEAD 是 3492–3652 |
| `R/components/shell/ShellSidebar.vue` | +1 行 import `ShellUpdateNotice`（22）、+2 行 `<ShellUpdateNotice />`（195–196） | 工作区 23–194 行 = HEAD 22–193 行（本文引用的 64、80–82、87–89、126–142 在 HEAD 需 −1） |
| `apps/core-app/src/renderer/components.d.ts` | +2 行（`ShellUpdateNotice` 自动注册） | 新组件若放 `R/components/**` 会再生成此文件 |
| `SPEC/frontend/index.md`(+1 @39)、`quality-guidelines.md`(+2 @51)、`release-testing.md`(+7 @619–654) | 他人 spec 改动 | 本文引用的 `index.md:94` 在 HEAD 是 93，`release-testing.md:876` 在 HEAD 是 869 |

`SettingSkillsMcp.vue`、`SettingIntelligencePage.vue`、`categories.ts`、`router.ts`、`ShellNavItem.vue`、`S/app-destinations.ts`、`apps/core-app/uno.config.ts` 无未提交改动（`git diff --stat` 为空）。

---

## 1. `SettingSkillsMcp.vue` 解剖

文件 `R/views/base/settings/SettingSkillsMcp.vue`（1393 行）。唯一使用方：`R/views/base/settings/categories/SettingIntelligencePage.vue:12,32`。

### 1.1 模板块

| 行 | 块 | 归属 |
|---|---|---|
| 785 | `<SettingSkeleton v-if="showSkeleton" :groups="skeletonGroups" />` | 共享闸门（四组共用） |
| 787–795 | `TuffGroupBlock v-else-if="loadError"`，组名借用 `settings.skillsMcp.mcp.label`，一行「加载失败 + 重试」 | 共享：`orchestratorGetSnapshot` 失败（MCP 与已导入 skills 同源），但占 MCP 组的位置 |
| 798–911 | 「MCP 服务器」组 | (a) |
| 799 | `showStateRow` 加载行 | 共享计算属性 |
| 801–845 | 已接入服务器行：来源 chip 手动/导入（808–814）、传输 chip（815）、探测状态 chip（失败带 `TxTooltip`，817–827）、「探测」（829–836）、「编辑」仅手动项（837–839）、`TxSwitch` 启停（840–843） | (a) |
| 851–872 | 本机发现、未接入的配置行：标题 `candidate.name`、描述 `mcp.discoveredDesc`（服务器数 + 名称）、chip「本机发现」（863）、agent 品牌 chip `agentLabel(candidate.provider)`（864）、chip「含敏感值」（865–867）、「启用」→ `adoptServer`（868–870） | (a) |
| 874–884 | 扫描失败行 + 重新扫描 | (a) |
| 886–892 | 「查看全部服务器」（`showAllMcp`） | (a) |
| 894–910 | 「手动添加」行：「重新扫描」→ `refreshDiscovery`（903–905）、「添加」→ `openCreateDialog`（906–908） | (a) |
| 919–1050 | 「本机 MCP 服务」组（`v-if="!showSkeleton"`） | (b) |
| 921–931 | 读取失败行（不冒充「未开启」） | (b) |
| 933–952 | 「让其他 AI 调用 Tuff」：运行中/未开启 chip + `TxSwitch` | (b) |
| 954–970 / 972–987 / 989–1016 | 接入地址 + 复制 / 端口 `TxInput` + 应用 / 访问令牌 掩码·显示·复制·重置 | (b) |
| 1018–1034 | 每个工具一行：风险 chip + `TxSwitch` | (b) |
| 1036–1049 | 客户端配置块（`TuffBlockSlot` + `<pre>` + 复制） | (b) |
| 1057–1101 | 「技能」组（`v-if="!showSkeleton"`） | (c) |
| 1108–1155 | 「本地技能目录」组（`v-if="!showSkeleton"`） | (c) |
| 1157–1279 | `TxModal` 新建/编辑 MCP 服务器对话框：名称；传输分段按钮（1180–1197，原生 `<button>`）；stdio 命令/参数/环境变量 `<textarea>`；HTTP 地址/请求头 `<textarea>`；footer 删除/取消/保存 | (a) |

渲染顺序：MCP 服务器（798）→ 本机 MCP 服务（919）→ 技能（1057）→ 本地技能目录（1108）。

### 1.2 脚本按归属

**(a) MCP 服务器 + 对话框**
- 类型/常量：`ProbeStatus`/`ProbeState`（48–54）、`ManualDraft`（56–66）、`McpCandidate`（200）、`IDLE_PROBE`（132）。
- SDK：`mcpSdk = useMcpServersSdk()`（136），只调 `probe`（509）、`upsertManual`（575）。
- 状态：`probeStates`（144）、`showAllMcp`（150）、`scanId`/`discovered`/`scanFailed`/`adoptingId`（153–156）、`dialogVisible`/`dialogSaving`/`draft`（158–160）。
- 计算：`mcpServers`（193，`kind === 'mcp'`）、`discoveredServers`（202–210，`kind==='mcp' && state==='added' && blockingIssues.length===0 && serverNames.length>0`）、`mcpRows`（212–231）、`hiddenMcpCount`（293）、`showMcpEmptyHint`（295–301）、`draftValid`（329–332）。
- 函数：`byActiveThenName`（233–236，仅 `mcpRows` 用）、`probeChipTone`/`probeChipText`（334–347）、`refreshDiscovery`（386–396，`aiClient.orchestratorPreviewImport({})`）、`adoptServer`（403–427，`orchestratorApplyImport`；含敏感值先 `window.confirm`，406–410）、`probeServer`（505–525）、`createEmptyDraft`（162–173）、`quoteIfNeeded`（183–185）、`openCreateDialog`/`openEditDialog`（527–547）、`buildManualInput`（549–568）、`saveManualServer`（570–585）、`deleteDraftServer`（587–600，`orchestratorDeleteImportedItem` + `window.confirm`）。
- 辅助模块 `R/views/base/settings/setting-skills-mcp-display.ts`：`resolveMcpTransport`（40–56）、`isManualMcpServer`（64–73）、`parseCommandArgs`（76–79）、`parseKeyValueLines`（85–97），只被 MCP 部分 import（`SettingSkillsMcp.vue:38-43`）。
- 发现行标题来自主进程：「Claude Code MCP」= `M/modules/ai/ai-cli-import-service.ts:117` 的 `userMcpFiles` 名；「config MCP」= 同文件 515 行对 `kind === 'config'` 生成的 `${base.name} MCP`，`base.name` 取文件 basename 去扩展名（392–398、429）。

**(b) 本机 MCP 服务（606–770，自成一体）**
- SDK：`mcpHostSdk = useMcpHostSdk()`（137）：`getState`（699）、`setEnabled`（726）、`setToolEnabled`（731）、`rotateToken`（740）、`setPort`（750）。
- 状态：`mcpHost`、`hostBusy`、`hostTokenRevealed`、`hostPortDraft`、`hostLoadFailed`（611–620）。
- 计算：`hostRunning`/`hostReady`/`enabledHostToolCount`/`hostTools`（622–629）、`hostStatusDescription`（635–642）、`hostTokenDisplay`（645–648）、`hostClientConfig`（672–675）、`hostClientConfigDisplay`（682–689）。
- 函数：`buildClientConfig`（654–669）、`hostRiskTone`（691–695）、`loadMcpHost`（697–707，失败不 toast）、`runHostCommand`（709–723）、`toggleMcpHost`/`setHostTool`/`rotateHostToken`/`applyHostPort`（725–751）、`copyHostValue`（753–762，`navigator.clipboard`）、端口 `watch`（764–770）。
- 不读 MCP 客户端或技能的任何状态；只依赖共享的 `t`、`toast`、`errorMessage`、`skillsMcpLog`、key `settings.skillsMcp.retry`（928），以及 `showSkeleton` 闸门（919）。

**(c) 技能 + 本地技能目录**
- 类型 `LocalSkillDirView`/`LocalSkillView`/`LocalSkillSnapshotView`/`SkillRowKind`/`SkillRow`（68–108）；69 行注释与 `M/modules/ai/skill-local-runtime.ts:59`（「Mirrored in `SettingSkillsMcp.vue`」）互为镜像。
- 原始事件 `skillLocal*Event`（110–125，`defineEvent('ai').module('skill-local')`）、`openFileEvent`（127–130，`defineRawEvent('dialog:open-file')`），经 `tuffTransport = useTuffTransport()`（138）发送（457、463、477、484、491）。**MCP 两组完全不用 `useTuffTransport` 与这些原始事件**，只走 typed SDK。
- 状态/计算/函数：`localDirs`/`localSkills`/`localBusy`/`showAllSkills`（146–149）、`importedSkills`（194）、`skillRowsAll`/`skillRows`/`hiddenSkillCount`（243–291）、`localDirRows`（303–308）、`skillSourceLabel`（349–353）、`applyLocalSnapshot`…`setSkillEnabled`（429–503）、`rescan`（602–604）。

**(d) 共享**
- `MAX_VISIBLE_ROWS = 5`（46）：MCP（214、293）与技能（287）。
- `aiClient = useIntelligenceSdk()`（135）：MCP 用 `orchestratorGetSnapshot/SetImportedItemActive/PreviewImport/ApplyImport/DeleteImportedItem`；技能用 `orchestratorGetSnapshot/SetImportedItemActive`。
- `items`/`loading`/`loadError`（141–143）+ `loadItems`（355–368）：一次 `orchestratorGetSnapshot()` 的 `importedItems` 同时喂 `mcpServers` 与 `importedSkills`（193–194）。`loadItems` 被 790、420、578、595、773 调用。
- `setItemActive`（370–380）：MCP 开关（842）与已导入技能开关（499）共用。
- `hasLoaded` + `showSkeleton = useDeferredLoading(() => !hasLoaded.value)`（315–316）：`hasLoaded` 只在 `loadItems` 的 finally 中置真（366）；四个组都受它控制（785、919、1057、1108）。
- `skeletonGroups`（323–327）只声明 MCP（4 行）、技能（4 行）、本地技能目录（2 行）三组，没有「本机 MCP 服务」。
- `showStateRow`（294）：MCP（799）与技能（1058）。
- `errorMessage`（175–177）；`displayName`（179–181，MCP 行 219/235、编辑对话框 536、技能行 267）；`agentLabel`（188–191，MCP 发现 chip 864、技能来源 352、目录标题 1112）。
- `t/te`（134）、`skillsMcpLog = createRendererLogger('SettingSkillsMcp')`（139）、`toast`（31）。
- `onMounted`（772–777）一次触发 `loadItems`、`loadLocalSkills`、`refreshDiscovery`、`loadMcpHost`。

### 1.3 import 归属（17–43）
- 仅 MCP：`McpManualServerInput`（18）、`TxModal`（22）、`useMcpServersSdk`（26）、`./setting-skills-mcp-display`（38–43）。
- 仅本机服务：`McpHostState`（19）、`useMcpHostSdk`（26）、`TuffBlockSlot`（35）、`watch`（29）。
- 仅技能：`useTuffTransport`（27）、`defineEvent`/`defineRawEvent`（28）。
- 多方共用：`AiImportCandidate`/`AiImportedConfigItem`（17）、`TxButton`（20）、`TxInput`（21：对话框 1169/1205/1214/1237 与端口 978）、`useDeferredLoading`（23）、`TxSwitch`（24：840/946/1029/1070）、`TxTooltip`（25：818 与 1123）、`useIntelligenceSdk`（26）、`reactive`（144、160）、`SettingChip`/`SettingRow`/`SettingSkeleton`/`TuffGroupBlock`（32–36）、`createRendererLogger`（37）。

### 1.4 样式
`<style lang="scss" scoped>`（1282–1393）：`.SettingSkillsMcp-Dialog/-Field/-FieldLabel/-FieldNote/-Textarea/-Segmented/-DialogActions/-DialogSpacer`（1283–1357）全属对话框；`.SettingsMcpHost-Code/-Port/-Snippet`（1359–1392）全属本机服务；技能两组无专属样式。

### 1.5 跨块耦合点（拆分时必须处理的事实）
1. 技能组「重新扫描」`rescan()`（602–604）同时调 `loadLocalSkills()` 与 `refreshDiscovery()`；后者结果只用于 MCP 发现行（202–210）。
2. 快照读取失败时，错误行占用 MCP 组的位置与组名（787–795），技能/目录组照常渲染。
3. 「本机 MCP 服务」组受 orchestrator 快照的骨架闸门控制（919），而骨架不含它（323–327）；加载完成后它出现在 MCP 组与技能组之间。
4. 组件头注释（1–15）与 `SettingIntelligencePage.vue:31` 注释把技能与 MCP 描述为「首页会话能触达的两半」；`R/views/base/settings/SettingSkillsMcp.vue:606-610` 注释说明本机服务与 MCP 服务器是「同一根线的两个方向」，引入该组的提交 `4e670526a` 也以此为由把两组并排。

### 1.6 拆出组件的放置约束
- `R/modules/settings/categories.smoke.test.ts:22` 以**非递归** glob `../../views/base/intelligence/*.vue` 收集文件，177–190 要求该目录每个 `.vue` 都是某个 intelligence 子页的 stem——多出任何 `.vue` 都会失败。
- 同文件 21 行 glob `../../views/base/settings/categories/*.vue`，107–120 要求该目录每个 `.vue` 都是分类页 stem。
- 先例：设置分块组件放在 `R/views/base/settings/`（`SettingSkillsMcp.vue`、`SettingLocalAiCli.vue`、`VoiceRecognitionStatus.vue`），由页面显式 import。`R/views/base/settings/categories/SettingIntelligencePage.test.ts:81-84` 注释记录过：漏 import 时 Electron 里渲染成字面自定义元素。
- 放在 `R/components/**` 会被 `Components()`（`apps/core-app/electron.vite.config.ts:416`，默认扫 `src/components`）自动注册并改写 `components.d.ts`（当前有他人未提交改动）。

---

## 2. 设置 IA：新增子页 `mcp` 需要什么

### 2.1 数据模型（`R/modules/settings/categories.ts`）
- `SettingSubPage`（18–32）：`key`（路径段 + keep-alive 后缀）、`path`、`labelKey`/`descriptionKey`（完整 i18n key）、`navIcon?`（存在即提升进侧栏，26–27）、`beta?`（28–29）、`advanced?`（30–31）。子页注册为兄弟路由而非嵌套路由（12–16）。
- 只有 `intelligence` 有 `children`（43–44）。数组（92–144）：`channels`（`i-ri-global-line`）、`voice`（`i-ri-mic-line`）、`prompts`（`i-carbon-text-font`，beta）、`agents`（`i-carbon-bot`，beta）、`workflows`（无 navIcon，beta + advanced）、`audit`（无 navIcon）、`capabilities`（`i-carbon-machine-learning-model`，137–143）。

### 2.2 侧栏提升规则与顺序
- `groupedSettingNavigation(includeRestricted)`（246–277）：按 `SETTING_GROUP_ORDER`（53–58）分组；每个分类先输出自身，再紧跟其 `children` 中有 `navIcon` 的项，**顺序 = `children` 数组顺序**（254–274）。
- 过滤：分类级 `advanced` 在受限模式隐藏（253）；子项只检查 `child.beta`（256），**不检查 `child.advanced`**。
- 子项 nav key = `${category.key}-${child.key}`（267，即 `intelligence-mcp`）；icon = `child.navIcon ?? category.icon`（269）；`beta` 透传给徽标（271）；有提升子项的分类 `activeExact: true`（264）。
- 侧栏：`R/components/shell/ShellSidebar.vue:80-82` 以 `appSetting?.dev?.developerMode` 作 `includeRestricted`；128–142 渲染，`:label="t(item.labelKey)"`（137）、beta 徽标 `settings.platformTags.beta`（139）、`:active="item.activeExact ? route.path === item.path : undefined"`（140）。
- 当前「塔芙智能」组顺序：普通模式 = 智能 / 模型渠道 / 语音输入 / 能力；开发者模式 = 智能 / 模型渠道 / 语音输入 / 提示词β / Agentsβ / 能力。`mcp` 追加在 `capabilities` 之后（143 行后）时两种模式都紧跟「能力（技能）」。父 PRD 验收顺序：智能 / 模型渠道 / 语音输入 / 技能 / MCP（`.trellis/tasks/10-03-intelligence-settings-revamp/prd.md:42`）。

### 2.3 智能页 hub 列表
- `SettingIntelligencePage.vue:20-23`：`settingCategoryChildren('intelligence', developerMode.value).filter((subPage) => !subPage.navIcon)`；`settingCategoryChildren`（categories.ts:216-219）在 `includeRestricted=false` 时剔除 beta 与 advanced。
- 有 `navIcon` 的子页不进 hub「工作流与审计」组（`SettingIntelligencePage.vue:43-56`）；没有 `navIcon` 的进 hub、不进侧栏。

### 2.4 路由（`R/base/router.ts`）
- `createSettingCategoryRoutes`（79–166）由 `SETTING_CATEGORIES` 生成。子页 loader 必须在 `childLoaders`（99–128）里以 `'intelligence/<key>'` 登记 `{ name, load }`；生成时先取 `childLoaders[...]`（149）再直接读 `loader.name`（152）——**缺项会在 router 模块求值时抛 TypeError，整个路由表建不起来**。
- 命名惯例 `name: '$I18n:router.intelligence<Key>'`（例 `'intelligence/capabilities'` → `$I18n:router.intelligenceCapabilities`，124–127）。
- 子页 meta：`index: 1`、`keepAlive: true`、`parentRoute: category.path`（157）、`keepAliveKey: setting-${category.key}-${child.key}`（160，即 `setting-intelligence-mcp`）、`advanced` → `requiresAdvanced`（161）。分类页键为 `setting-${category.key}`（142）。
- 自动旧路径重定向：`createLegacyIntelligenceRedirects`（174–183）为每个子页生成 `/intelligence/<key>` → `child.path`；168–173 注释说明这些重定向是永久的（插件把旧路径写死在用户目录里）。
- 守卫：`?section=` 只映射 `LEGACY_SECTION_REDIRECTS`（categories.ts:211-214，仅 `everything`、`file-index`；router.ts:387-402）；`requiresAdvanced` 在开发者模式关闭时跳回 `DEFAULT_SETTING_PATH`（417–423）。`beta` 不影响可达性。
- `$I18n:` 路由名的消费：`resolveI18nLabel`（`R/utils/i18n-helpers.ts:8-28`）；`R/components/base/template/ViewTemplate.vue:23-29` 把 route name 作为标题来源之一；`R/composables/layout/useLayoutController.ts:22-26` 在仓库内没有调用方；`R/views/layout/AppShell.vue:100-113` 只在缺 `keepAliveKey` 时拿它当缓存键。

### 2.5 侧栏高亮
- `R/components/shell/ShellNavItem.vue:29-33`：未传 `active` 时为 `route.path === to || route.path.startsWith(`${to}/`)`（32）；`/setting/intelligence/mcp` 不会点亮 `/setting/intelligence/capabilities`。
- 「智能」项因 `activeExact`（categories.ts:264 + ShellSidebar.vue:140）只在精确路径 `/setting/intelligence` 高亮；hub-only 子页（audit、workflows）打开时侧栏无高亮项。
- 设置上下文判定：`route.path.startsWith('/setting')`（ShellSidebar.vue:64）。

### 2.6 KeepAlive
- `AppShell.vue:214-220`：`<KeepAlive :max="10">`，组件键 = `meta.keepAliveKey`（105–108）。
- `SettingSkillsMcp` 的四个加载都在 `onMounted`（772–777）；`R/views/base/intelligence/*.vue` 与 `R/views/base/settings/*.vue` 中没有 `onActivated`（grep 为空）。`SPEC/frontend/release-testing.md:876` 也记录「设置页 KeepAlive 缓存，回到页面不重挂载」。即：页面在缓存期内再次进入不会重新读取 MCP 列表、发现结果、本机服务状态。

### 2.7 页面形态先例
- `SettingsPage`（`R/components/settings/SettingsPage.vue:19-53`）只有 `column`/`split`；`backTo` 注释说明子页是兄弟路由、侧栏不显示路径（24–29）。
- 侧栏提升子页：`channels`/`capabilities`/`prompts`/`agents` 用 `layout="split"`（`R/views/base/intelligence/IntelligenceChannelsPage.vue:324-331`、`IntelligenceCapabilitiesPage.vue:457-464`、`IntelligencePromptsPage.vue:489-496`、`IntelligenceAgentsPage.vue:66-73`）；`voice` 用无标题 column（`IntelligenceVoicePage.vue:23`）。
- hub-only 子页 `audit` 用带标题 + `back-to="/setting/intelligence"` 的 column（`IntelligenceAuditPage.vue:39-43`）。智能页自身是带标题 column（`SettingIntelligencePage.vue:27`）。

### 2.8 新增 `mcp` 子页的接线清单

必需（缺一即失败）：
1. `categories.ts` `children` 加一项：`path` 必须是 `${category.path}/${child.key}`（smoke 135–143）；`key`/`path` 全局唯一（145–152）；`labelKey`/`descriptionKey` 非空（139–140）。
2. `router.ts` `childLoaders` 加 `'intelligence/mcp'`（否则 152 抛错）。
3. 页面文件 `R/views/base/intelligence/IntelligenceMcpPage.vue`。smoke 的 `subPageStem`（130–133）= `Intelligence${key.charAt(0).toUpperCase()}${key.slice(1)}Page`，只大写首字母、不处理连字符：`mcp` → `IntelligenceMcpPage`；`mcp-servers` 会得到 `IntelligenceMcp-serversPage`，须改测试特例（`workflows` 已是特例，131）。
4. 两种语言的 `settingsIntelligenceHub.<key>` 与 `settingsIntelligenceHub.<key>Desc`（有 navIcon 时 Desc 不显示，但 smoke 要求非空）。
5. navIcon 类必须能被 UnoCSS 生成（§6.2）。

自动获得：`setting-intelligence-mcp` 缓存键、`parentRoute`、`/intelligence/mcp` 永久重定向、侧栏前缀高亮、`intelligence` 的 `activeExact` 保持为真。

惯例但非强制：`router.intelligenceMcp` 路由名 key（现有子页都有，zh-CN/en-US 3172–3179）；CoreBox 目的地（§4）。

### 2.9 断言 IA 的测试
- `categories.smoke.test.ts`：分类表（47–121）、子页表（128–191）、目的地对齐（199–252）。intelligence 相关断言全是 `arrayContaining`/`not.toContain`（154–175），不锁顺序；唯一锁顺序的是 system 组（71–77）。
- `R/components/shell/ShellSidebar.test.ts:43` 把 `groupedSettingNavigation` mock 成 `() => []`，不测导航内容。
- 没有任何测试锁定「塔芙智能」组的完整顺序或子项数量。

---

## 3. 入站链接盘点

检索：`/setting/intelligence`、`skills-mcp`/`skillsMcp`、`data-settings-section`、`scrollIntoView`、`?section=`、`openSettings`、`settings-intelligence`、首页 composer、本机 MCP 服务状态、插件、nexus/docs。

| 入口 | 位置 | 目标 | 指向 MCP 区块？ |
|---|---|---|---|
| 侧栏「智能」 | categories.ts:83-87 → ShellSidebar.vue:133-141 | `/setting/intelligence` | 否（整页） |
| CoreBox 目的地 `settings-intelligence` | `S/app-destinations.ts:305-325` | `/setting/intelligence` | 否；别名不含 MCP（312–320） |
| 本机代理「打开设置」 | `M/modules/local-ai-cli/index.ts:299,388-397` → `open('settings-intelligence')`；渲染端 `R/views/omni-panel/components/LocalAiCliPanel.vue:204,341-343` | 智能页 | 否（服务 `SettingLocalAiCli`，不在本任务搬迁范围） |
| 旧路径 | router.ts:177（`/intelligence`）、229–234（`/voice-insights`） | `/setting/intelligence` | 否 |
| 审计页返回 | `R/views/base/intelligence/IntelligenceAuditPage.vue:41` | `/setting/intelligence` | 否 |
| `data-settings-section` | 仅 `SettingIntelligencePage.vue:39`（`local-ai-cli`）、`R/views/base/settings/SettingUpdate.vue:754`（`update`）、探针 `apps/core-app/scripts/coreapp-visible-app-index-workbench-probe.ts:880`（`file-index`） | — | 无 MCP 锚点；`local-ai-cli` 锚点也无读取方 |
| `scrollIntoView` | 仅 AppList、VoiceInsights、MetaPanel、TextPreview、PreviewHistoryPanel、LineTemplate、MainWindowCommandPalette、VoiceRecognitionStatus | — | 无 |
| `?section=` | `LEGACY_SECTION_REDIRECTS`（everything/file-index）；`M/modules/box-tool/addon/files/everything-provider.ts:1141` | — | 无 |
| 首页 | `R/views/base/home/HomePage.vue:234`（capabilities）、`:875`（channels）；`R/views/base/home/preview/HomePreviewSources.vue:23` 只有 MCP 图标、无链接 | — | 无 |
| 本机 MCP 服务状态 | `mcpHost`/`McpHostEvents` 在 renderer 除 `SettingSkillsMcp.vue` 外、tray、box-tool、plugins 中均无引用 | — | 无 |
| 主进程目的地调用 | local-ai-cli（settings-intelligence）、`M/modules/assistant/module.ts:1108`（settings-channels）、`M/modules/tray/tray-menu-builder.ts:200` 与 `M/channel/common.ts:1581`（settings-overview）、`M/modules/plugin/plugin-module.ts:2456`（main-window） | — | 无 |
| 插件 | `plugins/touch-intelligence/index.js:63` 只有 `/intelligence/channels`；plugins 中无 `/setting` 字面量 | — | 无 |
| 文档 | `apps/nexus/content`、`docs/`、`apps/core-app/docs` 无 MCP 设置位置描述 | — | 无 |

结论：没有任何代码链接、锚点或滚动专门指向 MCP 两组；所有入口指向智能页整体。搬走后这些入口仍可达（不会 404），只是智能页上不再有 MCP。

---

## 4. 设置搜索
- 侧栏「搜索设置」只是按钮：`R/components/shell/ShellSearchEntry.vue:14-25` emit `activate` → `ShellSidebar.vue:87-89,126` 发 `CoreBoxEvents.ui.show` 打开 CoreBox；设置页内没有过滤。
- CoreBox 中唯一的设置来源是 `AppDestinationProvider`（`M/modules/box-tool/addon/system/app-destination-provider.ts:77-118`）：`resolveAppDestinationQuery`（`S/app-destinations.ts:534-541`）对规范化查询做**精确别名**匹配，命中返回一条页面级目的地。`AppDestinationDefinition`（32–47）只有 `route`，没有区块/锚点字段；不存在设置行级索引。
- 现有目的地（12–30）：settings-overview/general/appearance/intelligence/channels/voice/plugins/applications/file-index/network/update/about——没有 capabilities，也没有 MCP。查询「MCP」今天不命中任何设置目的地。
- 若新增 `settings-mcp` 目的地，现有机制与测试的约束：
  - `AppDestinationId` 联合（12–30）+ `APP_DESTINATION_LIST`（75–446）。
  - 对齐测试：id 去 `settings-` 前缀后必须是某分类/子页 key 且 route 一致（`categories.smoke.test.ts:208-227`）→ 子页 key 为 `mcp` 时只能叫 `settings-mcp`。
  - 图标必须是 `i-ri-*` 且存在于 `@iconify-json/ri`（`S/app-destinations.test.ts:378-388`）；声明顺序被钉死（354–376）。
  - `titleKey`/`subtitleKey` 两种语言都要有（332–346）；主进程标题读同一份 renderer lang JSON（`M/utils/i18n-helper.ts:8-9`）。
  - 别名重复在模块求值时抛错（`S/app-destinations.ts:494-520`），测试 296–316 也查；别名策略禁止裸泛词（62–74），负例表（`app-destinations.test.ts:221-240`）当前不含 `mcp`。
  - `commonSetting: true` 还需进 `COMMON_SETTING_DESTINATION_IDS`（448–459，顺序被 `app-destinations.test.ts:261-273` 钉死），它同时驱动 CoreBox 「常用设置」动作组（provider 199–222）与推荐冷启动候选（`M/modules/box-tool/search-engine/recommendation/recommendation-engine.ts:2421-2444`，`BUILTIN_DESTINATION_CANDIDATE_LIMIT = 3`，172）。
  - 图标经 `APP_DESTINATION_ICON_CLASSES` 自动 safelist（`apps/core-app/uno.config.ts:116-118`）。

---

## 5. i18n

### 5.1 MCP 两组与对话框使用的 key（全部在 `settings.skillsMcp` 下）
zh-CN 与 en-US 结构、行号一致：`settings.skillsMcp` 3499–3659；`sources` 3505、`mcp` 3525–3557、`host` 3558–3597、`skills` 3598–3608、`localDirs` 3609–3631、`dialog` 3632–3658（HEAD 均 −7）。组名：`mcp.label` = 「MCP 服务器」/"MCP servers"（3526），`host.label` = 「本机 MCP 服务」/"Local MCP server"（3559）。

- MCP 组：`mcp.label`、`addTitle`（手动添加）、`addDesc`、`addDescEmpty`、`addAction`（添加）、`edit`、`probe`、`probeUnavailable`、`probeUnknownError`、`detailUnknown`、`sourceImported`、`sourceManual`、`stateIdle/stateOk/stateProbing/stateFailed`、`transportStdio/transportHttp/transportUnknown`、`showAllTitle/showAllDesc`、`discoveredDesc`、`discoveredChip`（本机发现）、`secretChip`（含敏感值）、`adoptAction`（启用）、`scanFailed/scanFailedDesc`、`scanAction`（重新扫描）、`sensitiveConfirm`、`adopted`、`adoptFailed`。用法见 SettingSkillsMcp.vue 220–227、341–346、408–423、514–522、787–908。
- 本机服务：`host.*` 全部叶子；`risk.read/write/execute` 由模板字符串动态拼接（1027）。用法见 637–760、919–1047。
- 对话框：`dialog.*` 全部（`createTitle`…`deleteFailed`），用法见 577–598、1159–1275。
- 与技能侧共享：`loading`（799/1058）、`retry`（791/928）、`loadFailed`（788）、`loadFailedDesc`（363）、`toggleFailed`（378，`setItemActive`）、`sources.<id>`（`agentLabel` 189；MCP 发现 chip 864 显示 provider 品牌名）。
- 技能侧专属：`skills.*`、`localDirs.*`、`sources.imported`/`sources.linked`。
- JSON 中未被代码引用（仅记录）：`localDirs.linked`、`localDirs.noDescription`、`localDirs.addDescEmpty`、`localDirs.showAllTitle`、`localDirs.showAllDesc`。
- 现有测试断言原始 key 字符串（如 `settings.skillsMcp.mcp.label`，`SettingSkillsMcp.mount.test.ts:137`；`settings.skillsMcp.host.*`，host.test 多处），改 key 前缀需同步测试。

### 5.2 新导航子项的 key 模式
- 子页 `labelKey`/`descriptionKey` 是完整 key，惯例放 `settingsIntelligenceHub`：zh-CN/en-US 1760–1777（如 `capabilities` 1775、`capabilitiesDesc` 1776）。侧栏直接 `t(item.labelKey)`（ShellSidebar.vue:137；categories.ts:232-233 注释「Full i18n key」）。
- 分类级 label 为 `settingsNav.category.<labelKey>`（categories.ts:263；zh-CN 1742–1755）；组名 `settingsNav.group.intelligence` = 「塔芙智能」（zh-CN 1738）；hub 组名 `settingsIntelligenceHub.label` = 「工作流与审计」（1761）。
- 路由名 `router.intelligence<Key>`：zh-CN/en-US 3172–3179（`intelligenceCapabilities` 3175）。
- 兄弟任务要把「能力」改叫「技能」（父 PRD:25），会改同一个 `settingsIntelligenceHub` 块。
- 没有 zh/en key 对齐的通用测试或脚本；只有 `S/app-destinations.test.ts:332-346` 对目的地 key 做双语检查。

---

## 6. 图标

### 6.1 core-app 中与 MCP 相关的图标
- 唯一显式的 MCP 图标：`R/views/base/home/preview/HomePreviewSources.vue:20-25` `KIND_ICON.mcp = 'i-ri-plug-line'`（23，首页预览「来源」分组）。
- `i-ri-plug-line` 也用于插件语义：`R/views/base/store/StoreDetailOverlay.vue:417`（先安装插件）、`R/components/plugin/PluginInfo.vue:488`（插件开发重连）。`i-carbon-plug` 用于插件默认图标/能力（`R/components/plugin/PluginIcon.vue:18`、`R/views/base/settings/SettingPlatformCapabilities.vue:59`、`SettingFileIndex.vue:1921-1922`）。
- `SettingSkillsMcp.vue` 本身不用图标类，`TuffGroupBlock` 的 `defaultIcon`/`activeIcon` 也未传。
- 侧栏图标：分类 `icon` 注释写「设计稿用 lucide，这里用 `ri` 等价物」（categories.ts:38）；子项 `navIcon` 混用 `ri`（global、mic）与 `carbon`（text-font、bot、machine-learning-model）（98–142）。「插件与工具」分类是 `i-ri-puzzle-line`（157）。
- 已安装的 `simple-icons` 集合含 MCP 官方标 `modelcontextprotocol`（类名 `i-simple-icons-modelcontextprotocol`），core-app 未使用；`simple-icons` 在 core-app 用于品牌标（`R/modules/intelligence/provider-icons.ts`、`model-family-icons.ts`、`model-source-icons.ts`、`R/components/icon/OSIcon.vue` 等）。

### 6.2 可渲染集合与生成条件
- `apps/core-app/uno.config.ts:157-163`：`presetIcons` 只注册 `ri`、`simple-icons`、`carbon`（依赖见 `apps/core-app/package.json:168-170`）；其他集合（`i-lucide-*`、`i-mdi-*` 等）不会生成。
- 提取范围：core-app 用 unocss 66.7.5，默认 pipeline 只扫 `.vue/.svelte/[jt]sx/vine.ts/mdx?/astro/elm/php/phtml/marko/html`（`node_modules/.pnpm/@unocss+core@66.7.5/node_modules/@unocss/core/dist/index.d.mts:967`），**不扫 `.ts`**；`uno.config.ts:25-32` 注释写明 `.ts` 表中的类必须 safelist。
- `SETTINGS_CATEGORY_ICONS`（`uno.config.ts:41-54`）只列分类图标，**没有任何子项 `navIcon`**。现有子项图标能显示是因为同名类恰好出现在某个 `.vue` 或别的 safelist：`i-ri-global-line`（分类 safelist）、`i-ri-mic-line`（目的地 safelist + `R/views/base/home/composer/ComposerMic.vue:392`）、`i-carbon-text-font`（`IntelligenceChannelsPage.vue:434`）、`i-carbon-bot`（`IntelligenceAgentsPage.vue:86`）、`i-carbon-machine-learning-model`（`R/components/render/custom/CoreIntelligenceAnswer.vue:139`）。
- `ShellNavItem.vue:52` 用动态 `:class="icon"`，侧栏模板不提供字面量；没有测试守护设置导航图标（有守护的只有目的地、home-push、flow-target、model-family 等表）。
- 候选类现状：`i-ri-plug-line` 在 3 个 `.vue` 中字面出现（会生成）；`i-simple-icons-modelcontextprotocol`、`i-ri-server-line`、`i-ri-plug-2-line`、`i-ri-tools-line`、`i-ri-share-circle-line`、`i-ri-connector-line` 在 `.vue` 中 0 次（需 safelist，或在新页 `.vue` 中字面出现）；`i-ri-links-line` 仅经目的地 safelist 生成。

---

## 7. 锁定组合的测试
- `R/views/base/settings/categories/SettingIntelligencePage.test.ts`：mock `~/modules/settings/categories`（17–19，`settingCategoryChildren: () => []`）、`../SettingAssistant.vue`（48–55）、`../SettingSkillsMcp.vue`（57–64）、`../SettingLocalAiCli.vue`（66–73）；唯一用例断言 `SettingLocalAiCli` 被解析挂载（77–85）。
- `R/views/base/settings/SettingSkillsMcp.mount.test.ts`：同一次 mount 断言 MCP 组名 + 技能组名 + 条目（131–142）、本地技能目录（144–161）、本机发现 MCP 行与「启用」（163–171）；SDK mock 覆盖三个 SDK（41–86）与 `useTuffTransport`（113–117）。
- `R/views/base/settings/SettingSkillsMcp.host.test.ts`：本机服务 9 个用例（196–389）。其中 365–389「leaves the MCP-client and skills rows alone when the host is switched on」在同一 mount 里以 `'fs'`、`'legacy-server'`（MCP）和 `'notes'`、`'triage'`（技能）作邻居对照——依赖三组同页。
- `SPEC/main-process/agent-tool-gateway-contracts.md:238-241` 把 `SettingSkillsMcp.host.test.ts` 列为 Tests Required（令牌行与配置块都掩码、复制拿真文档、轮换重新掩码、开而未绑定显示原因）。
- `R/views/base/settings/setting-skills-mcp-display.test.ts`：纯函数，依赖模块路径（3–8）。
- `categories.smoke.test.ts`（§2.8–2.9）；`S/app-destinations.test.ts`（仅新增目的地时涉及，§4）。
- 与智能子页路径有关但不涉及 MCP：`R/views/base/settings/VoiceRecognitionStatus.test.ts:110,166`（capabilities 路径）、`R/modules/box/adapter/hooks/useActionPanel.test.ts:209-234`（`/intelligence/channels`）。

---

## 8. 相关 spec（一行一个）
- `SPEC/frontend/index.md:94` —— 硬规则：等数据的视图默认骨架且须镜像加载后版式，复用 `SettingSkeleton`/`useDeferredLoading`；用户文案进消息目录。
- `SPEC/frontend/component-guidelines.md:309-343` —— Loading States：骨架组数/行数/行高与真实一致（330 行仍写 `SettingSkeleton` 组合 `SettingSection`，但该组件已删，见 `.trellis/tasks/archive/2026-08/08-06-settings-v25-closeout/design.md:3`）；`390-398` I18n 归属。
- `SPEC/frontend/directory-structure.md:15-23,78-86` —— renderer 视图放 `views/base/settings|intelligence`，UI 辅助模块靠近所属视图，命名约定。
- `SPEC/frontend/hook-guidelines.md:171-176` —— 数据获取走既有 SDK/domain，不加裸 IPC。
- `SPEC/frontend/state-management.md:54-62` —— 渲染端只镜像宿主状态，凭据不进普通 UI 状态。
- `SPEC/frontend/quality-guidelines.md:41-62` —— renderer 改动跑就近 vitest + `typecheck:web` + `git diff --check`（文件有他人未提交 +2 行）。
- `SPEC/frontend/release-testing.md:876` —— 记录设置页 KeepAlive 缓存、回访不重挂载。
- `SPEC/main-process/agent-tool-gateway-contracts.md:147-242` —— 「Tuff As An MCP Server」：Scope 明确包含「the settings surface that turns the listener on」（154–159）；令牌处处掩码、读失败不等于关（209–211）、端口归用户；Tests Required 点名 host 测试文件（238）。
- `SPEC/main-process/recommendation-freshness-contracts.md:18` —— 目的地 item id 规则（仅新增 CoreBox 目的地时相关）。
- 未找到：`.trellis/spec` 中没有设置 IA / 侧栏 / `categories.ts` 的专门 spec；该契约只存在于 `categories.ts`、`router.ts` 注释与 `categories.smoke.test.ts`。

---

## 对规划的影响（约束与风险）
1. **最小接线是四件套**：`children` 项、`childLoaders['intelligence/mcp']`、`R/views/base/intelligence/IntelligenceMcpPage.vue`、两语言 `settingsIntelligenceHub.mcp/mcpDesc`。漏 `childLoaders` 会让 renderer 路由表在模块求值时崩（router.ts:149-152）。
2. **key 选择牵连四处**：页面文件 stem（smoke 130–133，带连字符要改测试）、keep-alive 键、永久的 `/intelligence/<key>` 重定向（router.ts:168-183）、将来 `settings-<key>` 目的地 id（smoke 208–227）。
3. **顺序靠数组位置**：放在 `capabilities`（137–143）之后即满足父 PRD 顺序；普通模式可见性只看 `beta`；`advanced` 子项不会被侧栏过滤（categories.ts:256）但路由会拦（router.ts:161,417-423）。
4. **navIcon 可能静默空白**：子项图标不在 safelist（uno.config.ts:41-54），只能靠同名类在某个 `.vue` 出现；集合只有 `ri`/`carbon`/`simple-icons`，无测试兜底。
5. **共享状态需要分家**：MCP 与技能共用一次 `orchestratorGetSnapshot`、`setItemActive`、`showStateRow`、骨架闸门；技能「重新扫描」会触发 MCP 发现（602–604）；快照失败行挂在 MCP 组（787–795）。拆成两页后各自要有加载/错误/骨架，且按 spec 骨架须镜像加载后版式——当前骨架不含「本机 MCP 服务」组（323–327）。
6. **KeepAlive 不刷新**：新页若沿用 `onMounted` 加载，缓存期内回访不会刷新发现结果、监听状态、端口占用错误（AppShell.vue:214-220；无 `onActivated`）。
7. **子组件放置**：不能放进 `views/base/intelligence/` 或 `views/base/settings/categories/` 根目录（smoke glob 21–22）；放 `R/components/**` 会改写有他人改动的 `components.d.ts`。
8. **测试与 spec 迁移面**：mount.test 与 host.test 的同页断言（host.test 365–389）、`SettingIntelligencePage.test.ts` 的 mock（57–64）、spec 对 `SettingSkillsMcp.host.test.ts` 的点名（agent-tool-gateway-contracts.md:238）；安全契约（令牌掩码 645–689、读失败不显示「未开启」921–931、敏感值迁移前确认 405–410）随组件迁移，由 spec 147–242 约束。
9. **入口无需改写但搜不到**：没有链接/锚点指向 MCP 区块（§3）；CoreBox 搜「MCP」现在也无结果，若要可搜需新增目的地并满足 §4 全部测试约束（`ri` 图标、别名唯一、双语 key、图标顺序钉死）。
10. **并发冲突面**：`SettingSkillsMcp.vue`（与 `10-03-skills-page-revamp` 都要拆，父 PRD:38）；`settingsIntelligenceHub` JSON 块与 `children` 数组（技能改名同处）；`10-03-local-agent-detection` 的「MCP 发现缺口」（父 PRD:36）可能改动发现候选的形状或 `discoveredServers` 过滤条件（202–210、`ai-cli-import-service.ts`）；lang JSON、`ShellSidebar.vue`、`components.d.ts` 还有他人未提交改动。

## Caveats / Not Found
- 未打开 `docs/design/corebox/v2.5.0.pen`（加密文件，仅 pencil MCP 可读；categories.ts:6 说 IA 对应其 `iqbKR` 画板），没有核对设计稿里是否画了 MCP 页。
- 未在真实应用中核对侧栏渲染与图标显示；「图标是否生成」的结论来自配置与源码 grep。
- `subPageStem` 对连字符 key 的结论来自阅读测试代码，未执行测试。
