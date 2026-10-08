# Research: 能力页改版为「技能 Skills」页（现状调研）

- **Query**: 为 `/setting/intelligence/capabilities`（侧栏「能力」）改版成「技能 Skills」页做规划前的现状调研：页面结构、列表右侧留白、详情区块、保存模型、本地技能数据、命名与链接、相关任务、锁定现状的测试、设置页相关 spec。
- **Scope**: internal（代码阅读 + 本机目录名测量）；external 只核对了 node_modules 里 vue-router / Electron 的实现与类型注释。
- **Date**: 2026-10-03
- **工作区状态**: 本文引用的文件中，有未提交改动的只有 `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`、`en-US.json`（各 +7 行，新增 `update.ready_notice`，与本页无关）、`apps/core-app/src/renderer/src/components/shell/ShellSidebar.vue`（+3 行，挂 `ShellUpdateNotice`），以及 `.trellis/spec/frontend/index.md` 等 spec 文件（`git status` / `git diff --stat`）。i18n 行号按当前工作区计（约 3412 行之后比 HEAD 多 7 行）。

## Findings

### Files Found

下文用文件名加行号引用，路径对照如下。

| 简称 | 路径 | 作用 |
|---|---|---|
| `base/router.ts` | `apps/core-app/src/renderer/src/base/router.ts` | 子页路由、KeepAlive meta、旧路径重定向 |
| `categories.ts` | `apps/core-app/src/renderer/src/modules/settings/categories.ts` | 设置信息架构，侧栏与路由共用的表 |
| `Page` | `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceCapabilitiesPage.vue` | 能力页本体 |
| `Info` | `apps/core-app/src/renderer/src/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue` | 右侧详情 |
| `CapabilityHeader.vue` / `CapabilityOverview.vue` / `ProviderList.vue` / `CapabilityModelTransfer.vue` / `TestSection.vue` / `CapabilityTestInput.vue` | 同上目录 | 详情各区块 |
| `CapabilitySkeleton.vue` | `apps/core-app/src/renderer/src/components/intelligence/skeleton/CapabilitySkeleton.vue` | 列表骨架 |
| `SettingsPage.vue` | `apps/core-app/src/renderer/src/components/settings/SettingsPage.vue` | 设置页外壳（column / split） |
| `TuffAsideTemplate.vue` / `TuffAsideSearchBar.vue` / `TuffItemTemplate.vue` / `TuffListTemplate.vue` | `apps/core-app/src/renderer/src/components/tuff/template/` | split 布局、搜索、列表项、分组列表 |
| `TxScroll.vue` / `runtime-capabilities.ts` | `packages/tuffex/packages/components/src/scroll/src/` | 滚动容器与原生模式判定 |
| `useIntelligenceManager.ts` | `apps/core-app/src/renderer/src/modules/hooks/useIntelligenceManager.ts` | 页面状态来源 |
| `intelligence-storage.ts` / `base-storage.ts` | `packages/utils/renderer/storage/` | `intelligenceSettings`（TouchStorage） |
| `utils/types/intelligence.ts` | `packages/utils/types/intelligence.ts` | `DEFAULT_CAPABILITIES` 与类型 |
| `intelligence-config.ts` / `intelligence-module.ts` | `apps/core-app/src/main/modules/ai/` | 主进程补种默认能力、写配置、能力测试 |
| `SettingSkillsMcp.vue` | `apps/core-app/src/renderer/src/views/base/settings/SettingSkillsMcp.vue` | 智能页「技能 / MCP」各组 |
| `agent-skill-roots.ts` / `skill-local-runtime.ts` / `skill-local-sources.ts` | `apps/core-app/src/main/modules/ai/` | 本地 skill 发现、扫描、传输 |
| `ai-orchestrator.ts` | `packages/utils/types/ai-orchestrator.ts` | 导入项类型 |
| `SettingIntelligencePage.vue` | `apps/core-app/src/renderer/src/views/base/settings/categories/SettingIntelligencePage.vue` | 智能 hub 页 |
| `ShellSidebar.vue` | `apps/core-app/src/renderer/src/components/shell/ShellSidebar.vue` | 侧栏 |
| `AppShell.vue` | `apps/core-app/src/renderer/src/views/layout/AppShell.vue` | KeepAlive |
| `zh-CN.json` / `en-US.json` | `apps/core-app/src/renderer/src/modules/lang/` | 文案 |

---

### 1. 页面结构

#### 1.1 路由与侧栏入口

- 设置表里的子页：`categories.ts:137-143`，`key: 'capabilities'`，`path: '/setting/intelligence/capabilities'`，`labelKey: 'settingsIntelligenceHub.capabilities'`，`descriptionKey: 'settingsIntelligenceHub.capabilitiesDesc'`，`navIcon: 'i-carbon-machine-learning-model'`。
- 有 `navIcon` 的子页会被提升进侧栏（`groupedSettingNavigation`，`categories.ts:246-277`）。侧栏用 `t(item.labelKey)` 渲染（`ShellSidebar.vue:80-81, 128-137`），所以侧栏上的「能力」就是 `settingsIntelligenceHub.capabilities`。
- 智能 hub 页只列出没有 `navIcon` 的子页（`SettingIntelligencePage.vue:21-23`），因此 `capabilitiesDesc` 现在没有任何地方渲染，只是被 smoke test 要求非空（`categories.smoke.test.ts:135-143`）。
- 侧栏顺序由 children 数组顺序决定：channels → voice → prompts(beta) → agents(beta) → workflows（没有 navIcon）→ audit（没有 navIcon）→ capabilities（`categories.ts:91-144`）。父 PRD 要求的顺序是「智能 / 模型渠道 / 语音输入 / 技能 / MCP」（`10-03-intelligence-settings-revamp/prd.md:42`）。
- 路由：loader 表 `'intelligence/capabilities'` 指向 `IntelligenceCapabilitiesPage.vue`，路由名为 `$I18n:router.intelligenceCapabilities`（`base/router.ts:124-127`）。子路由由 categories 表生成，靠 `childLoaders[\`${category.key}/${child.key}\`]` 取 loader（`base/router.ts:148-153`），表里缺 key 时会在 `loader.name` 处抛错。meta 里 `keepAlive: true`，`keepAliveKey: setting-intelligence-capabilities`（`base/router.ts:154-162`）。
- 旧路径 `/intelligence/<key>` 的重定向按 children 自动生成（`base/router.ts:174-183`）。
- AppShell 的 `KeepAlive :max="10"`（`AppShell.vue:214-220`）。

#### 1.2 页面骨架

- `Page:457-534`：`<SettingsPage layout="split">`，`aria-label` 为 `settingsIntelligenceHub.capabilities`（`Page:460`），`search-id="capability-search"`（`Page:461`），placeholder 为 `settings.intelligence.capabilitySearchPlaceholder`「搜索能力...」（`Page:462`），清除按钮为 `intelligence.search.clear`（`Page:463`）。
- `SettingsPage.vue:104-135`：split 形态挂 `TuffAsideTemplate`。插槽对应关系：`#filter` → `#filter`，`#aside` → 默认槽，`#aside-footer` → `#footer`，`#detail` → `#main`。另有 `#overlay`，放在两栏之外。`SettingsPage.vue:7-18` 的注释说明 column / split 是封闭的两种形态。
- `TuffAsideTemplate.vue:39-96`：
  - 左栏 `<aside class="TuffAsideTemplate-Aside w-76">`（`:41`）。
  - 搜索头（`:51-62`）。
  - `TxScroll` 里先放 `.TuffAsideTemplate-Filters`（filter 槽，`:64-67`），再放 `.TuffAsideTemplate-AsideBody`（`:69-71`）。
  - `#footer`（`:75-77`）。
  - 右栏 `.TuffAsideTemplate-Main` 用 `Transition name="fade-slide" mode="out-in"` 包住 `#main`（`:80-94`）。

#### 1.3 左侧列表

- **标题行**放在 filter 槽里，会随列表一起滚动（`Page:465-472`；`TuffAsideTemplate.vue:64-67`）：
  - 左侧是 `settings.intelligence.capabilityPageTitle`「能力配置商」（`zh-CN.json:4705`）。
  - 右侧是 `settings.intelligence.capabilitySummary`「共 {count} 个能力」（`zh-CN.json:4601`），`count = capabilityList.length`，即全部条目，不随搜索变化（`Page:468-470`）。
- **列表项**用的是 CoreApp 组件 `TuffItemTemplate`，传 `size="sm"`、`class="capability-card"`，以及 `title`、`icon`、`selected`、`top-badge`、`status-dot`、`aria-label`（`Page:482-494`）。
  - `top-badge`：有启用渠道时显示「渠道数 + `i-carbon-checkmark`」（success），否则显示 `settings.intelligence.capabilityNotConfigured`「未配置」（muted）（`Page:187-201`）。
  - `status-dot`：有启用渠道时为 `is-active`。它的 aria label 复用了 `capabilitySummary`，count 传的是渠道数（`Page:203-213`），也就是用「共 N 个能力」来读「N 个渠道」。
  - 图标：10 个 id 有映射，其余用 `i-carbon-cube`。映射表里的 `color` 没有被用到（`Page:155-173`）。
  - `TuffItemTemplate` 的根节点是 `div role="button"`（`TuffItemTemplate.vue:73-90`）。
- **排序 / 分组**：没有分组，是一个扁平列表。
  - `CAPABILITY_USAGE_ORDER` 里的 17 个 id 按显式顺序排（`Page:41-59`）。
  - 其余按关键词给 0.5 / 1.5 / 2.5 / 3.5 / 7.5 / 10.5 / 14.5 / 1000 的权重（`Page:64-83`）。
  - 同权重时按 `label || id` 做 `localeCompare`（`Page:85-91`）。
- **搜索**匹配 id / label / description（`Page:107-116`）。没有结果时显示 `settings.intelligence.capabilityListEmpty`「没有匹配的能力」（`Page:495-497`）。
- **选中**：默认选第一项；搜索后如果选中项被过滤掉，就改选第一项（`Page:128-146`）。页面不读 route query，没有 `useRoute`（`Page` 全文）。
- **骨架**：`v-if="loading"` 时渲染 8 个 `CapabilitySkeleton`（`Page:476-478`）。但 `useIntelligenceManager` 的 `loading` 只在 `useIntelligenceManager.ts:134` 初始化为 `false`，整个文件里没有别的赋值，所以骨架永远不会出现。水合前列表显示的是 renderer 侧的默认数据（`intelligence-storage.ts:60-67`）。
- **31 项的来源**：
  - 页面读 `useIntelligenceManager().capabilities`，这是一个 computed，读写 `intelligenceSettings.get().capabilities`（`useIntelligenceManager.ts:122-131`）。
  - 背后是 TouchStorage 文档 `aisdk-config`（`StorageList.IntelligenceConfig = 'aisdk-config'`，`packages/utils/common/storage/constants.ts:9`；`intelligence-storage.ts:69-76`）。
  - 默认值是 `DEFAULT_CAPABILITIES`（`utils/types/intelligence.ts:2950-3403`），共 31 个 key：text.chat、embedding.generate、vision.ocr、image.translate.e2e、text.translate、text.summarize、text.rewrite、text.grammar、text.classify、intent.detect、code.generate、code.explain、content.extract、sentiment.analyze、code.review、code.refactor、code.debug、keywords.extract、audio.stt、audio.asr、audio.transcribe、audio.tts、image.caption、image.analyze、image.generate、image.edit、rag.query、search.semantic、search.rerank、workflow.execute、agent.run。
  - 主进程的 `patchStoredConfigDefaults` 会把缺失的默认能力补进存储，但不会删除多余的项（`intelligence-config.ts:928-933`）。
- **同类 split 页里的分组先例**：模型渠道页的 `IntelligenceList` 用 `TuffListTemplate` 分成「已启用 / 未启用」两组，组头是 title + 计数 badge，可折叠（`apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceList.vue:84-106`；`TuffListGroup` 接口在 `TuffListTemplate.vue:5-19`，模板在 `:115-195`）。

---

### 2. 列表卡片右缘到分栏线的留白

从外到内，水平方向逐层如下：

| 层 | 选择器 / 位置 | 值 | 对右侧留白的贡献 |
|---|---|---|---|
| 分栏线 | `.TuffAsideTemplate-Aside { border-right: 1px solid var(--tx-border-color-lighter) }`（`TuffAsideTemplate.vue:117-122`） | 1px | 线本身 |
| 栏宽 | `class="TuffAsideTemplate-Aside w-76"`（`TuffAsideTemplate.vue:41`） | UnoCSS presetUno 的 `w-76` 是 19rem，按 16px 根字号为 304px（`apps/core-app/uno.config.ts` 用 `presetUno`，renderer 里没找到 html / `:root` 改字号） | 固定宽度 |
| 滚动内容 | `.tx-scroll__content { padding: 8px 12px }`（`TxScroll.vue:592-595`）；`TuffAsideTemplate` 没传 `no-padding`（`TuffAsideTemplate.vue:64`，`noPadding` 默认 `false`，见 `TxScroll.vue:39`） | 12px | **12px** |
| 页面列表容器 | `.capability-cards { padding: 0.5rem; gap: 0.625rem }`（`Page:556-562`） | 8px | **8px** |
| 卡片本身 | `.TuffItemTemplate` 没有外边距（`TuffItemTemplate.vue:159-229`） | 0 | 0 |

**合计**：卡片右边框到分栏线是 20px，左侧同样是 20px。卡片宽约 304 − 1 − 2×12 − 2×8 = 263px。

其他相关事实：

- **标题行没对齐**：标题行只有 TxScroll 的 12px 内边距（`.TuffAsideTemplate-Filters` 自身没有 padding，`TuffAsideTemplate.vue:142-146`），所以它和卡片在左右两侧各差 8px。搜索框是 `.TuffAsideSearch-Field { padding: 0.4rem 0.65rem }`（`TuffAsideSearchBar.vue:86-92`）。
- **滚动条**：
  - Electron 41.10.7 内置 Chrome/146.0.7680.216（从 node_modules 里 Electron Framework 二进制的字符串读出）。
  - `supportsNativeNonRootOverscrollBounce()` 在 macOS 且 Chromium ≥ 145 时返回 true（`runtime-capabilities.ts:16, 90-103`），所以 TxScroll 会走原生的 `.tx-scroll__native { overflow: auto }`（`TxScroll.vue:77-86, 538-552, 578-582`）。
  - renderer 和 tuffex 里都没有全局的 `::-webkit-scrollbar` 或 `scrollbar-gutter` 规则（rg 只搜到局部组件）。本机没设置 `AppleShowScrollBars`（`defaults read -g` 找不到该 key），即自动 / 覆盖式滚动条，一般不占布局宽度。
  - 如果系统设成「始终显示滚动条」，会再多占一条滚动条的宽度（未实测）。
- **对照模型渠道页**：渠道页把 `IntelligenceList` 直接放进 aside（`IntelligenceChannelsPage.vue:332-365`），外面没有额外的 8px 包裹，卡片距分栏线 12px。
- **影响面**：`.tx-scroll__content` 的 12px 和 `TuffAsideTemplate` 本身被以下页面共用：5 个 split 页（`ApplicationIndex.vue`、`IntelligenceCapabilitiesPage.vue`、`IntelligenceChannelsPage.vue`、`IntelligencePromptsPage.vue`、`IntelligenceAgentsPage.vue`）和 `views/base/Plugin.vue`（rg `layout="split"` / `TuffAsideTemplate`）。那 8px 只属于本页。
- **卡片高度（静态推断，未在真机量）**：
  - 页面里 `.capability-card { height: 4.5rem; min-height: 0 }`（`Page:564-569`），scoped 后选择器特异性为 (0,2,0)。
  - 组件里 `.TuffItemTemplate.size-sm { height: 3rem; min-height: 3rem }`（`TuffItemTemplate.vue:212-216`），特异性为 (0,3,0)，后者生效。
  - 但 `CapabilitySkeleton` 是按 4.5rem 定高的（`CapabilitySkeleton.vue:18-27`）。

---

### 3. 详情面板各区块，以及对本地 skill 是否适用

本地 skill 能拿到的数据见 §5.2：`id`、`name`、`description`、`path`（realpath）、`sourceDir`、`enabled`。

| 区块 | 位置 | 内容 / 数据 | 对本地 skill（读自代理目录的 SKILL.md） |
|---|---|---|---|
| 头部 `CapabilityHeader`（sticky，可拖窗） | `Info:348-375`；`CapabilityHeader.vue:15-52` | 显示 id；type badge 取 `metadata.type`，没有时用字面量 `'capability'`（`CapabilityHeader.vue:9-12, 23-24`，`DEFAULT_CAPABILITIES` 都没有 metadata，所以 31 项都显示大写 CAPABILITY）；标题；描述（最多 2 行，`:111-121`）；actions 槽里是保存状态和「测试能力」按钮（`Info:352-371`） | id、name、description 都有（`skill-local-runtime.ts:33-40`） |
| 统计行 `CapabilityOverview` | `Info:378-382`；`CapabilityOverview.vue:13-29` | 启用渠道 / 总绑定数 / 配置模型（数据在 `Info:87, 95-99`） | 只对内置能力有意义 |
| 「选择渠道」组 | `Info:384-400` → `ProviderList.vue:133-160` | 每行是一个 `TuffBlockSlot`：渠道图标、渠道名、适配器类型、Nexus「官方」tag、`TxSwitch`（`ProviderList.vue:61-80, 143-155`） | 版式上正是「某能力 – 渠道列表」的先例，对应用户想要的「某 skill – Codex – Claude」。但本地 skill 目前只带**一个**来源目录（见 §5） |
| 「能力配置」组 | `Info:402-448` | 每个启用的绑定一行「管理模型」，打开 `CapabilityModelTransfer` 抽屉（`Info:452-468`）；没有绑定时显示占位行「模型优先级」（`Info:429-434`）；「默认提示词」行打开 `FlatMarkdown` 抽屉（`Info:436-446, 470-480`） | 只对内置能力有意义。SKILL.md 正文只能在主进程读（`readLocalSkill`，`skill-local-sources.ts:298-304`，经 `apps/core-app/src/main/modules/tool-gateway/index.ts:98`）。渲染端只有 list / add-dir / remove-dir / set-enabled 四个事件（`skill-local-runtime.ts:62-77`），没有读正文的事件 |
| 「测试能力」抽屉 | `Info:482-500`；`Page:415-453` | `aiClient.testCapability(...)`。主进程要求该能力已注册且有 tester（`intelligence-module.ts:1851-1859`） | 只对内置能力有意义 |
| 本地 skill 才有的项 | — | 启用开关（`ai:skill-local:set-enabled`，`skill-local-runtime.ts:190-195`）、真实路径 `path`、来源目录 `sourceDir` | 内置能力目前没有对应的开关；「已配置」是根据绑定推出来的（`Page:175-185`） |

开关链路的一个事实：

- `ProviderList` 的开关不发 `toggleProvider`：
  - 关闭时发 `reorder`，列表里去掉这条绑定（绑定和它的 models 一起移除）。
  - 开启时发 `reorder`，列表里追加一条绑定（models 取 `provider.models`，或用推荐值），再发 `focus`（`ProviderList.vue:92-129`）。
- 之后的链路：`Info` 的 `emitProvidersOrder` 重排 priority（`Info:253-262`）→ 页面的 `onReorderProviders`（`Page:295-307`）。
- `Info` 声明了 `toggleProvider` emit（`Info:39`），但从来没有发出过。页面上的 `@toggle-provider`（`Page:518`）→ `handleCapabilityProviderToggle`（`Page:240-258`，里面会调 `updateProvider(...{ enabled: true })`）因此走不到。

---

### 4. 保存模型

#### 4.1「自动保存已启用」在哪里渲染

- 位置：`Info:352-361` 的 `.capability-info__save-status`（`role="status"`，`aria-live="polite"`）。
- 文字来自 `saveStatusText`（`Info:307-318`），按状态依次是：
  - 保存中：`autoSaveSaving`「保存中...」
  - 刚保存：`autoSaveSaved`「已保存」
  - 出错：`capabilitySaveErrorWithDetail` 或 `capabilitySaveError`
  - 有待保存：`autoSavePending`「待保存...」
  - 空闲：`autoSaveEnabled`「自动保存已启用」（`zh-CN.json:4710-4713`）
- 图标在 `Info:300-305`，样式在 `Info:537-554`。
- 同一组 `autoSave*` key 也被提示词页使用（`IntelligencePromptsPage.vue:249-260`）。

#### 4.2 可编辑的状态

都在 `aisdk-config` 文档里：

- `capabilities[id].providers`：绑定列表，字段为 providerId / enabled / priority / models（`Page:218-238`；类型见 `utils/types/intelligence.ts:2551-2562`）。
- `capabilities[id].promptTemplate`（`Page:265-268`）。
- `capabilities[id].metadata.userReordered`（`Page:295-307`；类型见 `utils/types/intelligence.ts:2827-2844`）。
- 另外 `providers[i].enabled` 也会被写，但只在上面那条走不到的路径上（`Page:249`）。

#### 4.3 什么时候写盘

1. **每次编辑都直接写进共享 store**：编辑会调 `setCapabilityProviders` / `updateCapability`（`useIntelligenceManager.ts:254-293`），给 computed `capabilities` 赋一个新对象，setter 再调 `intelligenceSettings.set({...})`（`useIntelligenceManager.ts:122-131`）。
2. **store 自己会在约 300ms 后写盘，与页面无关**：
   - `IntelligenceStorage` 在构造时调用 `setAutoSave(true)`（`intelligence-storage.ts:72-76`）。
   - 写入链：`TouchStorage.set` → `assignData`（`base-storage.ts:1018-1021, 850-873`）→ 自动保存开启时执行 `#runAutoSavePipeline({ force: true })`（`base-storage.ts:871, 751-763`）→ `saveToRemote`（`useDebounceFn` 300ms，`base-storage.ts:674-676`）→ `#executeSave` → `transport.send(StorageEvents.app.save, { key, value, clear: false, version })`（`base-storage.ts:579-672, 357-360`）。
   - 另有一个 deep watch 兜底（`base-storage.ts:737-749`）。
3. **页面自己再叠一层 900ms 去抖**：
   - `markCapabilityDirty`（`Page:319-325`）→ `scheduleCapabilityAutoSave`（`Page:315, 327-335`）→ `handleSaveCapabilities` → `saveSettings()`。`saveSettings()` 就是 `whenHydrated()` 加 `saveToRemote({ force: true })`（`useIntelligenceManager.ts:295-301`）。
   - `dirtyGeneration` 用来防止「写入进行中又来了新编辑」时把新编辑的 dirty 标记清掉（`Page:355-363`）。
   - 成功后 `saveState = 'saved'`，1.5s 后回到 `idle`（`Page:364-370`）。
   - 失败时按 `details.reason` 映射成对应文案（`Page:371-409`）。
4. **切换能力时立即 flush**（`Page:148-153`）；`onBeforeUnmount` 时也 flush（`Page:411-413`）。但在 KeepAlive 下离开路由只会 deactivate，不会 unmount，而页面里没有 `onActivated` / `onDeactivated`。
5. **提示词编辑器有自己的草稿**：`promptValue`，800ms 去抖后发 `updatePrompt(draftOwner, prompt)`，卸载时也会 flush；只有与 `savedPrompt` 不同时才写（`Info:56-73, 208-247, 341-343`）。这是 2026-09-15 事故的修复约束：KeepAlive 缓存的旧页面在 HMR 后把一个能力的 id 写进了另一个能力的提示词（`Info:56-65`）。
6. **窗口卸载时也会写**：`window.onbeforeunload` 会对所有 TouchStorage 调 `saveSync()`（`apps/core-app/src/renderer/src/modules/storage/app-storage.ts:54-58`；`base-storage.ts:982-990`）。
7. **`saving` 是共享的**：它就是 `intelligenceSettings.savingState`（`useIntelligenceManager.ts:135`；`base-storage.ts:242, 613-671`）。本 renderer 里任何一次 `aisdk-config` 保存都会让它变 true。
8. **持久化副本会在底下变化**：
   - store 订阅了 `StorageEvents.app.updated`，收到更新的版本时会重新加载，并把本地还没同步的 patch 重放上去（`base-storage.ts:407-444, 461-530`）。
   - 主进程有多处直接写 `aisdk-config`，例如设备端 ASR 路由、Nexus 登录态切换：`saveMainConfig(StorageList.IntelligenceConfig, …)`，见 `intelligence-config.ts:249, 327, 385, 438, 495, 1099, 1156, 1358, 1413, 1480`。
   - 模型渠道页也编辑同一份文档（它同样用 `useIntelligenceManager`）。
9. **含明文凭据的写入会被拒**：主进程存储返回 `credential-rejected`（`apps/core-app/src/main/modules/storage/index.ts:545`），页面有对应文案（`Page:399-400`）。
10. **测试用的是主进程里已持久化的配置**：`getCapabilityOptions(capabilityId)`（`intelligence-module.ts:1878-1880`）。渲染端只能覆盖 providerId / model / promptTemplate（`CapabilityTestInput.vue:84-90`）；`audio.asr` 会明确拒绝覆盖（`intelligence-module.ts:1862`）。

#### 4.4 现有「未保存 / 保存条 / 离开确认」模式的检索结果

- **路由守卫**：`onBeforeRouteLeave` / `beforeRouteLeave` / `onBeforeRouteUpdate` 在 core-app renderer、tuffex、`packages/utils/renderer` 里都是 0 处（rg）。
- **保存条**：`SaveBar` / `save-bar` / `unsaved` / sticky footer 都是 0 处。tuffex 里唯一相关的是 `TxDataTable` 的 `stickyFooter`，那是表格页脚行（`TxDataTable.vue:36, 419`）。
- **「草稿 + dirty」的近似先例**：
  - `IntelligencePromptsPage.vue:239-247` 有 `isDirty`，比较草稿和选中项，但它仍然是 900ms 自动保存（`:356-386`）。
  - `apps/core-app/src/renderer/src/components/base/UserProfileEditor.vue:33-37` 和 `components/plugin/tabs/PluginDevSettingsOverlay.vue:57-66`：弹层里的 `hasChanges` + 保存按钮。
  - `views/base/settings/SettingNetwork.vue:389-398`：TxModal footer 里的「取消 / 保存」。
- **拦截窗口关闭的先例**：`apps/core-app/src/renderer/src/modules/install/install-manager.ts:224-247`，有安装任务时在 `beforeunload` 里设置 `returnValue`。Electron 类型注释说明：beforeunload 返回任何非 `undefined` 的值都会取消关闭，并且不会弹系统确认框（`node_modules/.pnpm/electron@41.10.7…/electron.d.ts:2145-2160`）。主窗口点关闭时是隐藏还是真正关闭，未查清。
- **异步确认对话框**：
  - `forTouchTip(title, message, buttons)`（`apps/core-app/src/renderer/src/modules/mention/dialog-mention.ts:163`），renderer 里有 19 处调用。
  - `confirmExternalLinkOpen` 把它包成了 `Promise<boolean>`（`modules/hooks/confirm-external-link.ts:4-36`）。
  - `SettingSkillsMcp.vue` 用的是 `window.confirm`（`:408, :590`）。
- **vue-router 与 KeepAlive**：vue-router 4.6.4 的 `registerGuard` 在 `onDeactivated` 时移除组件内守卫，在 `onActivated` 时重新加入（`node_modules/.pnpm/vue-router@4.6.4…/dist/devtools-EWN81iOl.mjs:688-698`）。也就是说，在 KeepAlive 页面里 `onBeforeRouteLeave` 只在页面处于激活状态时生效。
- **底部条可以挂在哪**：
  - `SettingsPage` split 形态只有两个相关插槽。
    - `#aside-footer`：只在左栏底部，自带 border-top（`TuffAsideTemplate.vue:75-77, 167-170`）。
    - `#overlay`：`SettingsPage-Split` 是纵向 flex，`TuffAsideTemplate` 占 `flex: 1 1 auto`，放进 overlay 槽的普通流元素会排在两栏下方（`SettingsPage.vue:104-135, 175-186`）。
  - 没有右栏 footer 槽。
  - `TxScroll` 的 `#footer` 在滚动内容里面，会跟着滚动（`TxScroll.vue:549-552, 558-562`）。
  - `TuffAsideTemplate-Main` 的 `fade-slide out-in` 过渡会随 `#detail` 根节点的 key 切换（`Page:502-503`）。
  - `tuffex-design-rules.md:93-97` 规定：sticky 的工具条 / footer 用 1px `--tx-border-color` 线分隔，不用阴影。
- **状态文字原语**：`TxStatusHint`（tone 可选 success / warning / danger / info / muted，`packages/tuffex/packages/components/src/status-hint/src/TxStatusHint.vue`），目前只有 CoreBox 在用（`components/render/CoreBoxActionFeedback.vue:3, 29`）。

---

### 5. 本地技能数据

#### 5.1 主进程如何发现

- **根目录表** `AGENT_SKILL_ROOT_SPECS`（`agent-skill-roots.ts:39-57`），按顺序：
  1. codex：`~/.codex/skills`；设置了绝对路径的 `CODEX_HOME` 时改为 `$CODEX_HOME/skills`（`:70-72`）
  2. claude
  3. cc-switch
  4. agents：`~/.agents/skills`，共享层
  5. oh-my-pi：`~/.omp/agent/skills`
  6. pi：`~/.pi/agent/skills`
  7. opencode：`~/.config/opencode/skills`
  8. 之后依次是 cursor、gemini、kiro、qoder、codebuddy、factory、reasonix、kilocode、devin

  只取 home 级目录（`:9-11`）；同路径去重（`:73`）；按存在性过滤（`:84-94`）。
- **缓存与刷新**：`detectedSkillRoots` 在注册通道时和每次 `list` 请求时刷新（`skill-local-runtime.ts:105-111, 170-179`）。生效配置 = 探测到的根 + 用户链接的目录（`:120-127`）。探测到的根不落盘（`:113-119`）。
- **扫描规则**（`skill-local-sources.ts`）：
  - 根先取 `realpath`；含 `SKILL.md` 的目录就是一个 skill，根本身也算。
  - 深度不超过 3（`:48`）；子目录和符号链接都会进入，并取 `realpath`（`:170-208`）。
  - 每个根最多 200 条（`MAX_ENTRIES_PER_DIR`，`:40`）；全局目录预算 4000（`:50`）。
  - frontmatter 只读前 16KB，取 `name` / `description`（`:60, 138-154, 264-268`）；没有 name 时用真实路径的目录名（`:275`）。
- **id**：`local:` + sha1(skill 目录的 realpath) 前 12 位（`:33, 106-108`）。
- **去重：同一个 realpath 只保留第一次遇到的那条**。`locationsFor` 按配置目录的顺序遍历，以 id（也就是 realpath）去重，先到先得（`:211-237`，关键在 `:231-234`）。结果是：
  - 通过符号链接出现在多个代理目录下的同一个 skill 只留一条，它的 `sourceDir` 是表顺序里第一个包含它的根。
  - 内容相同、但物理上是两份拷贝的 skill，会是两条 id 不同的记录。
  - 测试 `skill-local-sources.test.ts:122-132` 锁定了「两个注册目录到达同一个 skill 时只保留一条」。
- **持久化**：
  - 存在 `skill-local-sources.json`（`StorageList.SKILL_LOCAL_SOURCES`，`constants.ts:21`），注册表默认值 `{ dirs: [], disabledIds: [] }`（`apps/core-app/src/main/modules/storage/main-storage-registry.ts:354-358`）。
  - `dirs` 是用户链接的目录；`disabledIds` 是被关掉的 id。不在 `disabledIds` 里就是启用，新出现的 skill 默认启用（`skill-local-sources.ts:62-67, 349-358`）。
  - 写入用 `saveMainConfigDurable(..., { force: true })`（`skill-local-runtime.ts:129-134`）。
  - 因为 id 是 realpath 的哈希：符号链接到同一处的多个代理目录共用一个开关；物理拷贝各有各的开关。

#### 5.2 传输方式与数据形状

- **四个原始事件**：`defineEvent('ai').module('skill-local').event('list' | 'add-dir' | 'remove-dir' | 'set-enabled')`。
  - 主进程一份（`skill-local-runtime.ts:62-77`），渲染端一份（`SettingSkillsMcp.vue:110-125`），注释要求两份同改（`skill-local-runtime.ts:58-61`；`SettingSkillsMcp.vue:68-73`）。
  - 事件名形如 `ai:skill-local:list`（`SettingSkillsMcp.mount.test.ts:112-114`）。
  - 只有宿主能调（`assertHostOwned`，`skill-local-runtime.ts:83-85`）。
  - 每次改动都返回重新扫描后的完整快照（`skill-local-runtime.ts:159-166`）。
- **快照**：`{ dirs: LocalSkillDirView[]; skills: LocalSkillView[] }`（`skill-local-runtime.ts:33-56, 136-157`）。
  - `LocalSkillDirView = { path, sourceId: string | null, auto }`：探测到的根 `sourceId` 是代理 id、`auto = true`；用户目录 `sourceId = null`。
  - `LocalSkillView = { id, name, description, path, sourceDir, enabled }`，其中 `path` 是 realpath。
- **导入型 skill**：
  - 来自 `useIntelligenceSdk().orchestratorGetSnapshot()` 的 `importedItems` 里 `kind === 'skill'` 的项（`SettingSkillsMcp.vue:194, 355-368`）。
  - 类型是 `AiImportedConfigItem`（`ai-orchestrator.ts:44-66`），带 `provider: AiImportOriginId`，取值 codex / claude / pi / oh-my-pi / opencode / manual（`ai-orchestrator.ts:1-13`）。
  - 开关 `active` 走 `orchestratorSetImportedItemActive`（`SettingSkillsMcp.vue:370-380`）。

#### 5.3 智能页「技能」组的组装方式

- `skillRowsAll`（`SettingSkillsMcp.vue:238-284`）：
  - 本地 skill 行：用 `sourceDir → dirs[].sourceId` 映射出**一个**代理 id，kind 为 `agent` 或 `linked`（`:244-261`）。
  - 导入 skill 行：kind 为 `imported`，`sourceId: null`，没有用到 `item.provider`（`:263-278`）。
  - 排序：启用的在前，再按标题（`:280-283`）。
  - 默认只显示 5 行（`:46, 286-291`）。
- 每行一个来源 chip（`skillSourceLabel`，`:349-353`），label key 为 `settings.skillsMcp.sources.<id>`（`zh-CN.json:3506-3523`，例如 agents 显示「共享技能」），外加一个开关（`:1060-1076`）。
- 另有「本地技能目录」组，列出每个目录及其中 skill 数（`:303-308, 1108-…`）。
- 本地 skill 和导入 skill 之间不去重（`:243-284`）；首页注入时也是直接拼在一起（`apps/core-app/src/main/modules/ai/ai-imported-config-runtime.ts:329-339`）。
- **数据层面的结论**：渲染端现在每个 skill 只能拿到一个来源代理，即表顺序里第一个命中的根。「这个 skill 在哪些代理里都有」这份信息在主进程扫描时出现过，但在 `locationsFor` 去重时被丢掉了，不在快照里。

#### 5.4 谁在用本地 skill

- 首页会话注入 `buildHomeInjection`：启用的本地 skill 和导入 skill 一起进 `Available skills` 元数据（`ai-imported-config-runtime.ts:323-358`）。每轮都重新读取，启用一个 skill 在下一次发送时生效（`.trellis/spec/main-process/agent-tool-gateway-contracts.md:84-100`，尤其是 `:98`）。
- MCP host 的 `tuff_list_skills`（`apps/core-app/src/main/modules/mcp-host/mcp-host-tools.ts:195-215`）。
- 本地 skill 不受 `TUFF_ENABLE_LOCAL_AI_CLI` 门槛影响：skill 通道在 `intelligence-module.ts:1296` 无条件注册，这个环境变量门槛只在 `apps/core-app/src/main/modules/local-ai-cli/index.ts:124`。

#### 5.5 本机测量（2026-10-03）

测量方式：按 `collectSkillLocations` 的同一套规则用脚本复算（`SKILL.md` 是否存在、深度 3、跟随 symlink、按 realpath 去重、先到先得），只看目录名和存在性，**没有读 SKILL.md 内容**，所以 UI 实际显示的 frontmatter 名字可能和目录名不同。

存在的根有 14 个，`~/.cursor/skills` 和 `~/.devin/skills` 不存在。

当前 shell 设置了 `CODEX_HOME`（指向 Orca 的 `codex-accounts/<id>/home`）。App 是否会继承这个变量取决于启动方式（未验证），所以下面分两种情形。

**情形 A：`CODEX_HOME` 未设置（如从 Finder 启动）**

| 根 | 找到的 skill | 先到先得后归它的 | 顶层条目 / 其中符号链接 | 链接指向 |
|---|---:|---:|---|---|
| codex `~/.codex/skills` | 37 | 37 | 34 / 28 | cc-switch 25、agents 2、pi 1 |
| claude | 50 | 47 | 51 / 47 | agents 35、cc-switch 10、`/Applications/ego lite.app` 1、pi 1 |
| cc-switch | 88 | 54 | 89 / 1 | agents 1 |
| agents（共享层） | 57 | 21 | 57 / 1 | ego lite.app 1 |
| oh-my-pi | 11 | 10 | 7 / 1 | pi 1 |
| pi | 56 | 16 | 50 / 39 | agents 38、ego 1 |
| opencode | 7 | 2 | 7 / 5 | cc-switch 5 |
| gemini | 2 | 2 | 2 / 0 | — |
| kiro | 35 | 0 | 35 / 35 | 全部 → agents |
| qoder | 8 | 0 | 8 / 8 | 全部 → agents |
| codebuddy | 8 | 0 | 8 / 8 | 全部 → agents |
| factory | 35 | 0 | 35 / 35 | 全部 → agents |
| reasonix | 8 | 0 | 8 / 8 | 全部 → agents |
| kilocode | 35 | 0 | 35 / 35 | 全部 → agents |

- 一共找到 437 处，按 realpath 去重后剩 189 条，即智能页「技能」组的本地行数。预算没触顶，剩余 3535。
- 80 个 realpath 同时出现在 2 个以上的根下。最常见的组合：
  - agents + claude + factory + kilocode + kiro + pi：27 个
  - cc-switch + codex：23 个
  - cc-switch + claude：9 个
- **同名但不是同一份文件**：189 条记录只有 103 个不同的目录名；其中 68 个目录名对应 2 个以上不同的 realpath（即物理拷贝），多出 86 条记录。
  - 最常见的情况：23 个名字一份在 codex 下（链接到 `~/.cc-switch/skills`），一份在 claude 下（链接到 `~/.agents/skills`）；18 个名字分属 agents 与 cc-switch。
  - 例子：`apple-design`、`ego-browser`、`lark-*` 系列。

**情形 B：`CODEX_HOME` 已设置**

- codex 根变成 `$CODEX_HOME/skills`，只有 6 个 skill；去重后共 185 条；cc-switch 名下的归属增加到 78 条。

**用户链接的目录和禁用的 id**

- 两套 profile 的 `~/Library/Application Support/@talex-touch/core-app/{tuff,tuff-dev}/modules/config/` 下都没有 `skill-local-sources.json`（只列了文件名，同目录下有 `aisdk-config`）。据此推断：没有链接过目录，也没有关闭过本地 skill。未读文件内容。
- 导入型 skill 的数量没有测。

---

### 6. 命名与链接

#### 6.1 属于本页或其侧栏入口、zh 值含「能力」的 key

行号是当前工作区的 zh-CN.json / en-US.json。

| key | zh | en | 使用处 | zh 行 / en 行 |
|---|---|---|---|---|
| `settingsIntelligenceHub.capabilities` | 能力 | Capabilities | 侧栏 label（`categories.ts:140`）、页面 aria-label（`Page:460`） | 1775 / 1775 |
| `settingsIntelligenceHub.capabilitiesDesc` | 把能力绑定到渠道与模型。 | Bind capabilities to providers and models. | `categories.ts:141`（目前不渲染） | 1776 / 1776 |
| `router.intelligenceCapabilities` | 智能能力 | Intelligence Capabilities | 路由名（`base/router.ts:125`） | 3175 / 3175 |
| `settings.intelligence.capabilityPageTitle` | 能力配置商 | Capability Manager | `Page:467` | 4705 / 4705 |
| `settings.intelligence.capabilitySummary` | 共 {count} 个能力 | {count} capabilities | `Page:469`；`Page:209`（status dot 的 aria） | 4601 / 4605 |
| `settings.intelligence.capabilitySearchPlaceholder` | 搜索能力... | Search capabilities... | `Page:462` | 4598 / 4602 |
| `settings.intelligence.capabilityListEmpty` | 没有匹配的能力 | No capabilities match your filters | `Page:496` | 4600 / 4604 |
| `settings.intelligence.capabilityProviderSectionDesc` | 勾选可执行该能力的渠道，未勾选的渠道不会被调用。 | Pick the channels that are allowed to run this capability. | `Info:386` | 4604 / 4608 |
| `settings.intelligence.capabilityConfigTitle` | 能力配置 | Capability Configuration | `Info:403` | 4640 / 4634 |
| `settings.intelligence.capabilityConfigDesc` | 配置该能力的渠道、模型和提示词等参数 | Configure channels, models and prompts for this capability | `Info:404` | 4641 / 4635 |
| `settings.intelligence.capabilityPromptSectionDesc` | 当调用该能力时默认追加的系统提示词，可为空。 | System prompt appended when the capability is invoked. | `Info:184, 476` | 4617 / 4647 |
| `settings.intelligence.capabilityTest` | 测试能力 | Run Capability Test | `Info:370` | 4647 / 4652 |
| `settings.intelligence.capabilityTestTitle` | 测试能力 | Test Capability | `Info:484` | 4648 / 4639 |
| `settings.intelligence.capabilityTestDesc` | 使用当前配置测试该能力是否正常工作 | Test if this capability works with current configuration | `Info:92` | 4649 / 4640 |
| `settings.intelligence.capabilityAsrBindingTestDesc` | 此测试使用已保存的 audio.asr 能力绑定及其配置模型；不可覆盖渠道或模型。 | （en 对应句） | `Info:91` | 4650 / 4641 |

- **不在文案目录里的硬编码**：
  - `Page:447` 的 `'能力测试失败'`：测试抛异常时的兜底文案，没走 i18n。
  - `CapabilityHeader.vue:11` 的字面量 `'capability'`：type badge，显示为大写。
- **同页但不含「能力」的相关 key**：`capabilityNotConfigured`「未配置」(4707)、`capabilityProviderSectionTitle`「选择渠道」(4603)、`capabilityPromptSectionTitle`「默认提示词」(4616)、`autoSave*`(4710-4713，与提示词页共用)。
- **en 侧**：不少 key 的英文值也带 "capability"，例如 `transferEmptySelected` 是 "...to use this capability"，而 zh 值不含「能力」。

#### 6.2 其他含「能力」的 key

- **代码里没有引用（rg 无命中）的**：
  - `settings.intelligence.landing.capabilities.*`（title「能力配置商」4866、cta「进入能力面板」4868 等）
  - `capabilityPageDesc`(4706)、`capabilitySearchLabel`(4597)
  - `capabilitySavePending`「有未保存的能力配置修改」(4626)、`capabilitySaveSaving`(4627)、`capabilitySaveSaved`「能力配置已保存」(4628)
  - `capabilityFooterHint`(4624)、`capabilityActionsHint`(4606)
  - `statsCapabilities`(4729)、`capabilityStat`(4787)、`capabilitiesSection`(4512)
  - `settings.intelligence.localSkills.desc`(4790)
- **被别的页面使用、不能随本页删掉的**：
  - `capabilitySelectTitle`（`IntelligencePromptsPage.vue:679`）
  - `capabilityTestFailed`（`IntelligencePromptsPage.vue:116`）
  - `autoSave*`（`IntelligencePromptsPage.vue:249-260`）
- 智能页的「技能」组已经叫「技能」了：`settings.skillsMcp.skills.label`（`zh-CN.json:3599`）。

#### 6.3 其他指向本页的界面与硬编码路径

- **首页听写提示**：`HomePage.vue:234` 是 `openRecognitionSettings: () => void router.push('/setting/intelligence/capabilities')`。按钮文案是 `assistant.voicePanel.openRecognitionSettings`「打开智能设置」（`zh-CN.json:5562`）。另见 `views/base/home/composer/dictation-notice.ts:164`（注释）、`:174-183`、`:233-238`。
- **语音输入页**：`views/base/settings/VoiceRecognitionStatus.vue:120-133` 同样 `router.push('/setting/intelligence/capabilities')`。按钮文案是 `settingSpeechRecognition.capabilities.action`「打开智能」（`zh-CN.json:592`；`VoiceRecognitionStatus.vue:171-177`）。测试 `VoiceRecognitionStatus.test.ts:110, 166` 断言了这个路径。
- 这两处都是为了让用户去配置 `audio.asr`。但页面不读 query，落地后默认选中排序第一的 `text.chat`（`Page:128-136`）。
- **旧路径**：`/intelligence/capabilities` 会被自动重定向（`base/router.ts:174-183`）。插件里只用到了 `/intelligence/channels`，并且有白名单校验（`plugins/touch-intelligence/index.js:63`；`apps/core-app/src/main/modules/plugin/host/plugin-business-capabilities.ts:244`）。rg 没有找到任何插件引用 `/intelligence/capabilities`。
- **CoreBox 目的地目录** `apps/core-app/src/shared/app-destinations.ts` 里没有本页条目（`:12-30, 305-354`）。
- **同名但与路由无关**：`apps/core-app/src/main/modules/ai/tuff-intelligence-storage-adapter.ts:27` 的 `capabilities: 'intelligence/capabilities'` 是数据库里的 config key。

#### 6.4 如果改路由路径，会碰到什么

- 上面的 2 处硬编码和 1 个测试。
- `categories.smoke.test.ts`：
  - `:154-163` 和 `:165-175` 写死了 `'capabilities'` 和 `'intelligence-capabilities'`。
  - `:177-190` 要求页面文件名是 `Intelligence${Key}Page.vue`，并且目录里不能有多余的页面文件（`IntelligenceCapabilitiesPage.vue` 会变成多余文件）。
- `base/router.ts:124-127` 的 loader 表 key 要同步改（它在 `:149` 被查找）。
- `keepAliveKey` 会变（`base/router.ts:160`）。
- 自动生成的 `/intelligence/capabilities` 重定向会消失（`base/router.ts:174-183`）。
- `useKeepAliveHmrPrune.test.ts:13-17, 45, 112-191` 只是把文件路径当字符串夹具，不 import 真实页面，不受影响。
- **只改文案、不改 key 和 path 时，以上都不受影响**，只需要改 i18n 的值。

---

### 7. 相关任务 `.trellis/tasks/08-06-skills-local-dirs`

- **task.json**：
  - `status: in_progress`，`base_branch: TalexDreamSoul/app-shell-v2`，parent 为 `08-05-ai-toolchain-suite`（`task.json:6`）。
  - `meta.nextAction`：补齐三条验收——单测、放一个 SKILL.md 走一遍手动链路、两侧 typecheck 与 lint（`task.json:26`）。
  - `meta.evidence`：三条验收都没勾选；随收敛合并 de14ee9 / PR #1743 带入；收敛后没有重跑验证（`task.json:28`）。de14ee9 在本地仓库解析不到。
- **prd.md**：
  - 链接语义，不拷贝。
  - 内容包括目录注册表、`local:` id、realpath 边界、注入合并，以及在 SettingSkillsMcp 里加「本地目录」子块。
  - 单目录上限 50（`prd.md:15`）。
  - 三条验收都没勾选。
- **design.md**：配置放在主进程 storage；不新增 transport 域；id 用 realpath 哈希；单目录超过 50 条截断（`design.md:21`）。
- **implement.md**：S1–S3 全部打勾（49 个测试通过；新增 18 个 i18n 键）。
- **research/local-skill-smoke.md**：
  - 真机三项待验证：设置里出现、模型能 `tuff_skill_read`、改正文后下一轮生效。
  - spec 契约已写进 `agent-tool-gateway-contracts.md` §4–§7（`:44-128`）。
- **已发布的部分**：
  - 实现提交 766a1db1d（2026-08-06）已在 HEAD 中。
  - 之后的 778fc7dd7（2026-09-15，「read skills from the AI agents already on the machine」，也在 HEAD 中）做了这些改动：新增 `agent-skill-roots.ts`；上限改为 200；扫描深度 3；把 agent / linked / imported 三个列表合并成一个列表，每行带来源 chip（见 commit message 和 `skill-local-sources.ts:35-48`）。
  - 所以 08-06 文档里的「50 条」「本地目录子块」已经和代码不一致。
- **与本次改版的交集**：08-06 没有涉及能力页。交集在于 `SettingSkillsMcp.vue` 的「技能」「本地技能目录」两组，以及 skill-local 的四个事件。
- **父任务相关约束**：
  - 父 PRD 的 Open Question：技能页接管本机 skills 之后，智能页的「技能」组是否删除（`10-03-intelligence-settings-revamp/prd.md:46-48`）。
  - 兄弟任务 `10-03-mcp-settings-page` 也要拆 `SettingSkillsMcp.vue`，规则是谁后做谁以前一个的结果为基线（`prd.md:38`）。它的 PRD 还是 TBD。

---

### 8. 锁定现状的测试

| 测试 | 断言内容 |
|---|---|
| `components/intelligence/capabilities/IntelligenceCapabilityInfo.test.ts:135-207` | 模型抽屉：按行打开，`updateModels` 的参数正确；provider 记录已不存在时不打开抽屉；只对启用的绑定提供「管理模型」 |
| 同文件 `:209-250`（describe「autosave status」） | 保存中优先于错误（`data-status="saving"`，文字为 `autoSaveSaving`）；出错时显示 `capabilitySaveErrorWithDetail` 或 `capabilitySaveError`；header actions 里只有「测试能力」一个按钮，并且不存在 `.capability-info__save-button` |
| 同文件 `:252-305` | 提示词归属：卸载时按原 id flush 改动；只查看不写；store 推入的值在 800ms 去抖后也不会被写回；编辑器被复用到另一个能力时按旧 id flush |
| 同文件 `:336-386` | 复现 2026-09-15 事故：没有编辑就切换能力时，不允许写任何提示词 |
| `ProviderList.test.ts:124-175` | 渠道名、适配器标签、图标；「官方」tag 只标在 Nexus 渠道上；provider 不存在时回退显示 providerId；设备端 ASR 渠道不画行，但 reorder 时仍保留它 |
| `CapabilityModelTransfer.test.ts:27-…` | 三个用例：过滤后勾选再添加；父组件回传同样的值时不丢；props 换成新对象时不丢 |
| `CapabilityTestInput.test.ts:18-19` | binding-only 的能力不发送 provider / model 覆盖 |
| （无） | `IntelligenceCapabilitiesPage.vue` 本身没有单测：900ms 去抖、`dirtyGeneration`、flush 都没有测试覆盖 |
| `modules/settings/categories.smoke.test.ts:135-190, 199-251` | 见 §6.4；外加目的地目录与路由的一致性 |
| `modules/layout/useKeepAliveHmrPrune.test.ts:13-191` | 用页面文件路径和组件名 `IntelligenceCapabilitiesPage` 做夹具 |
| `views/base/settings/VoiceRecognitionStatus.test.ts:97-112, 155-168` | 点击「配置」会 push `/setting/intelligence/capabilities` |
| `views/base/settings/SettingSkillsMcp.mount.test.ts:130-171` | 技能组 label；本地快照里的行；自动探测目录用 `settings.skillsMcp.sources.claude` 作标题；目录计数 `dirDesc` / `autoDesc` |
| `views/base/settings/SettingSkillsMcp.host.test.ts:196-…` | MCP host 区块，其中 `:365` 断言开启 host 不影响 MCP 客户端行和技能行 |
| `views/base/settings/categories/SettingIntelligencePage.test.ts:57-84` | mock 掉 SettingSkillsMcp，只断言本机 AI CLI 区块能挂载 |
| `main/modules/ai/agent-skill-roots.test.ts:4-40` | 包含哪些代理 id；`CODEX_HOME` 覆盖；按存在性过滤 |
| `main/modules/ai/skill-local-sources.test.ts:51-300` | 扫描、符号链接、去重（`:122-132`）、上限（`:134`）、关闭后仍列出（`:155`）、读取边界、id 前缀 |
| （无） | `skill-local-runtime.ts` 没有测试文件 |

---

### 9. 管辖设置页的 spec（`.trellis/spec/frontend/index.md` 索引）

- **`index.md` Hard Frontend Rules（`:87-98`）**：优先用 TuffEx 原语（`:89`）；新的交互要用语义化控件（`:92`）；骨架是默认的加载态，要镜像真实布局，复用 `TxRowSkeleton` / `TxSkeleton` / `SettingSkeleton` + `useDeferredLoading`（`:94`）；新文案进 message catalog（`:96`）。开发前检查清单在 `:57-78`。
- **`component-guidelines.md`**：
  - `TuffGroupBlock` 这类 CoreApp 组合层可以保留，原语逻辑委托给 TuffEx（`:69`）。
  - Loading States（`:309-343`）。其中写的是 `SettingSkeleton`「composes `SettingSection` + `TxRowSkeleton`」（`:330`），但实际 `SettingSkeleton.vue:2-3, 39` 用的是 `TuffGroupBlock`。
  - 不新增 `div role="button"`（`:367-374`）。
  - I18n（`:390-397`）。
- **`tuffex-design-rules.md`**：内容字号 13–14px；颜色只用 `--tx-*` token；sticky 条用 1px 边线、不用阴影（`:93-97`）；不要卡片套卡片（`:305-309`）；新组件清单（`:311-…`）。
- **`tuffex-docs-sync.md`**（`index.md:40, 67`）：任何 TuffEx 组件改动，都要在同一个提交里更新 Nexus 文档（zh / en 以及包装组件的页面）。
- **`state-management.md:7-…`**：按数据所有者选最小的状态边界；宿主状态走 typed SDK / transport。
- **`type-safety.md` Typed Transport（`:88-110`）**：新增事件走 typed event / domain。第 5 条（`:109`）：注册、发送、mock 都用同一个导出的 `TuffEvent`，不要在 main 和 renderer 各写一遍原始事件名。skill-local 的四个事件目前就是两份副本（§5.2）。
- **`hook-guidelines.md:7-…`**：composable 的生命周期，以及 Electron keep-alive 窗口的约束。
- **`quality-guidelines.md`**：收尾时跑最小相关测试和 `git diff --check`；eslint 按 workspace 跑。
- **包级文档**：
  - `docs/engineering/coreapp-ui-contract.md:6-12`：页面优先用 TuffEx 原语；`TuffGroupBlock` / `TuffBlockSlot` 作为组合层保留。门禁是 `pnpm check coreapp-ui-contract`（`:28-34`）。
  - `apps/core-app/AGENTS.md:49-54`：UI / i18n 规则。
- **代码层面的约定**：`SettingsPage.vue:7-18`，column / split 是封闭的两种形态。
- **没找到的**：专门规定设置页分组 / 卡片版式、手动保存 / 保存条、离开前确认的 spec 条目（在 `.trellis/spec` 里 rg `TuffGroupBlock|SettingSection|settings page|设置页|unsaved` 均无对应条目）。

---

### External References

- vue-router 4.6.4，组件内守卫在 KeepAlive 下的注册与撤销：本地 `node_modules/.pnpm/vue-router@4.6.4_vue@3.5.39_typescript@5.9.3_/node_modules/vue-router/dist/devtools-EWN81iOl.mjs:688-698`；文档 https://router.vuejs.org/guide/advanced/composition-api.html#Navigation-Guards
- Electron 41 `BrowserWindow` 的 `close` 事件与 `beforeunload` 语义：本地 `node_modules/.pnpm/electron@41.10.7_supports-color@10.2.2/node_modules/electron/electron.d.ts:2145-2160`；文档 https://www.electronjs.org/docs/latest/api/browser-window#event-close

### Related Specs

- `.trellis/spec/main-process/agent-tool-gateway-contracts.md` §4–§6（`:44-112`）：`local:` id 规则、注入每轮重读、错误矩阵。
- `.trellis/spec/frontend/component-guidelines.md`、`tuffex-design-rules.md`、`type-safety.md`、`state-management.md`：见 §9。

---

## 对规划的影响（约束与风险，不含设计）

1. **改成手动保存，前提是编辑不能再直接进共享 store。** 现在每次编辑都写进 `intelligenceSettings`，store 约 300ms 后自己写盘（§4.3 第 2 条），窗口卸载时还会 `saveSync()`（§4.3 第 6 条）。只要编辑还进 store，「未保存」状态就不成立。
2. **持久化副本会在草稿底下变化。** 主进程有 10 处直接写 `aisdk-config`，模型渠道页也编辑同一份文档，store 还会重载远端版本并重放 patch（§4.3 第 8 条）。草稿和基线如何对齐，需要单独考虑。
3. **提示词编辑器有自己的草稿、去抖和卸载时 flush**，并有测试锁住，其中包括 2026-09-15 事故的回归测试（§4.3 第 5 条、§8）。「只有真实编辑才写」这条性质是事故后加的约束。
4. **离开页面的拦截没有现成实现。** `onBeforeRouteLeave` 全仓 0 处；它在 KeepAlive 下只在页面激活时生效。KeepAlive 最多缓存 10 页，按 LRU 淘汰时会 unmount（`AppShell.vue:214-220`），缓存里的未保存草稿会在淘汰时消失。窗口关闭有 `beforeunload` 先例，但 Electron 不弹确认框（§4.4）。
5. **测试只能测已保存的配置。** 「测试能力」走主进程里的持久化配置，草稿不会被测到；`audio.asr` 还会拒绝任何覆盖参数（§4.3 第 10 条）。
6. **本地 skill 的开关现在是立即写盘的**，一次只能改一个 id，没有批量接口；每次改动都会返回全量重扫。本机全量是 437 处、189 条（§5.2、§5.5）。另外，用 realpath 做 id 意味着：一个开关同时管住所有通过链接共享它的代理；物理拷贝则各有各的开关（§5.1）。
7. **「Codex · Claude」这类多代理归属，今天的快照里没有。** 主进程只保留表顺序里第一个命中的根（§5.1、§5.3）。本机有 80 个 realpath 被多个根共享、68 个名字有多份物理拷贝（§5.5）。按名字合并会把两份不同的文件当成一个（内容是否相同未核对）。归属结果还受根表顺序和 `CODEX_HOME` 影响（§5.1、§5.5）。
8. **扩展快照字段要同时改两份副本。** skill-local 的类型和事件在 main 与 renderer 各有一份，必须同改；这与 `type-safety.md:109` 的要求不一致（§5.2、§9）。
9. **改路由 key / path 的影响面**见 §6.4。只改文案只动 i18n 的值。插件和 CoreBox 目的地目录都不引用本页。听写提示和语音页的两处跳转是冲着 `audio.asr` 来的，但页面不处理 query（§6.3）。
10. **i18n 的连带关系**：
    - `autoSave*` 和提示词页共用。
    - `capabilitySummary` 同时被用作 status dot 的 aria 文案。
    - `'能力测试失败'` 和 `'capability'` 两处硬编码在文案目录之外。
    - 还有一批不再被引用的「能力」key（§6.1、§6.2）。
11. **骨架**：现有骨架永远不会显示（`loading` 恒为 false）；如果加上异步拉取本地 skill 的 transport 请求，就会出现真正的加载阶段，spec 要求骨架镜像真实布局（§1.3、§9）。卡片的实际高度可能是 3rem 而不是骨架的 4.5rem（§2，未实测）。
12. **留白**：20px = 共享的 12px + 本页私有的 8px。共享的 12px 被 5 个 split 页和 `Plugin.vue` 共用（§2）。
13. **底部条的挂载点**：右栏没有 footer 槽；`#overlay` 里的普通流元素会排在两栏下方；`TxScroll` 的 footer 会跟着滚动；sticky 条按设计规则要用 1px 线分隔（§4.4）。
14. **列表项组件是 `div role="button"`。** spec 不允许新增这类写法；复用现有组件属于存量债务（§1.3、§9）。
15. **与兄弟任务的边界**：两个子任务要按先后顺序拆 `SettingSkillsMcp.vue`；智能页「技能」组是否保留仍是父 PRD 的 Open Question；08-06 的验收至今没有补齐（§7）。

## Caveats / Not Found

- 卡片的实际高度、滚动条是否占宽、App 进程是否继承 `CODEX_HOME`、主窗口点关闭是隐藏还是关闭，都**没有在真机上验证**，属于静态推断。
- 本机测量只看了目录名和存在性。skill 的显示名来自 frontmatter，可能和目录名不同；同名拷贝的内容是否一致没有核对。
- 导入型 skill 的数量没有测（需要读 orchestrator store）。
- 「用户没有链接目录、没有禁用 skill」是根据 `skill-local-sources.json` 文件不存在推断的，没有读存储后端去确认。
- `de14ee9`（08-06 evidence 里提到的合并提交）在本地仓库解析不到；08-06 的实现提交 766a1db1d 和后续 778fc7dd7 都已在 HEAD 中。
