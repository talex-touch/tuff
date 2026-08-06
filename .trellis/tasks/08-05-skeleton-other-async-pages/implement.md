# 执行计划：其他异步页面接入骨架加载态

## 验证命令

| 用途 | 命令 |
|---|---|
| 渲染层测试 | `cd apps/core-app && pnpm exec vitest run src/renderer/src/components src/renderer/src/views/base/settings` |
| 类型 | `cd apps/core-app && npm run typecheck` |
| 单文件 lint | `pnpm exec eslint <path>` |

**Lint 判定标准**：改动后问题数不高于该文件在 HEAD 的问题数。多数 CoreApp 文件在 HEAD 就带既存问题，禁止整文件 `eslint --fix`（会重排上百行无关代码）。

## 分诊结论（R1，24 页全覆盖）

### A. 适用且已完成（1）

| 页面 | 处理 |
|---|---|
| `components/intelligence/agents/AgentsList.vue` | 原为 `TxSkeleton :lines="4"`——4 根等宽条，比真实行矮且无结构，加载完仍跳。`AgentItem` 的形状正是 `TxRowSkeleton` 建模的「前导图标 + 标题 / 描述 + 尾部徽章」，改为复用该原语，只用令牌覆盖与默认值不同的两项（`padding-inline` / `gap` 均为 0.75rem，因 `AgentItem` 比 `SettingRow` 紧凑）。分组头沿用原有 `.group-header`（它在 fetch 前就已渲染）。 |

> **实施中修正的一个错误**：最初把骨架用 `.agent-item` / `.agent-icon` 等类写在 `AgentsList.vue` 里，但这些类定义在 **`AgentItem.vue` 的 scoped 样式**中，跨组件不生效，骨架会完全没有样式。改用原语 + 令牌后既避开了 scoped 边界，也不必复制版式。

### B. 已有骨架，需验证 B 收敛后无回归（2）

| 页面 | 现状 |
|---|---|
| `views/base/store/StoreDetailOverlay.vue` | 消费 `StoreDetailSkeleton`（子任务 B 已收敛为 `TxSkeleton` 薄封装） |
| `views/base/intelligence/IntelligenceCapabilitiesPage.vue` | 消费 `CapabilitySkeleton`（同上，收敛为 `TxCardSkeleton` 薄封装） |

两者均未逐项核对骨架与真实版式是否贴合——**收敛无回归 ≠ 版式达标**，仍需按 AC2 复核。

### C. 适用，未做（7）

| 页面 | 加载态形态 | 备注 |
|---|---|---|
| `views/storage/PrivacyDataSection.vue` | `initialLoading = ref(true)` | 已是标准首屏哨兵，接入成本最低；1556 行 |
| `views/storage/Storagable.vue` | `summaryLoading` + `pluginsLoading` | 双区域，需区域级骨架；1113 行 |
| `views/omni-panel/OmniPanel.vue` | `loading = ref(false)` + 模板分支 | 需加 `hasLoaded` 哨兵（首帧问题）；797 行 |
| `views/base/LingPan.vue` | `v-if="loading"` | 2011 行，建议单独拆 |
| `views/base/intelligence/IntelligenceWorkflowPage.vue` | `v-if="!loading && workflows.length === 0"` | 1445 行 |
| `views/storage/PrivacyDataSection.vue` 的其余 4 个 band | — | 见下方「已勘察」 |

### 已完成（第二批）

| 页面 | 处理 |
|---|---|
| `views/base/store/StorePublisher.vue` | **仅 timeline 区**接入骨架，用页面自有的 `.publisher-timeline` / `.publisher-timeline-item` 类搭（继承真实卡片的边框、内边距与行间距）。直接绑 `timelineLoading` 而非 `hasLoaded` 哨兵——`refreshTimeline` 只在打开详情面板时调用，每次都是该插件时间线的首次加载，不存在需要保留的已渲染内容。`previewLoading` **不接骨架**：它是用户上传 .tpex 后的预览等待，属操作级 pending，按规范应保留原有文案。 |

### 已勘察但未做：`views/storage/PrivacyDataSection.vue`

条件很好——`initialLoading = ref(true)` 是标准首屏标志，且 summary 网格遍历的是常量 `PRIVACY_SETTINGS_DATA_CATEGORIES`（条数编译期已知，骨架可精确匹配）。但有两点须先处理：

1. **测试契约**：`PrivacyDataSection.test.ts` 断言 `[data-testid="privacy-initial-loading"]` 的 `role="status"`。改造须**保留**该元素与其 role，把骨架放进去，而不是替换掉它。
2. **无障碍写法**：正确形态是容器保留 `role="status"` + 视觉隐藏的加载文案（供屏幕阅读器），骨架条 `aria-hidden`（`TxSkeleton` 自带）。需先确认仓库是否已有 visually-hidden 约定类。

该页 1556 行、5 个 band，建议单独排期而非顺带做。

### D. 不适用（12，含 1 例改判）

> `views/base/home/HomeModelMenu.vue` 初判为「适用」，复核后**改判不适用**：它是下拉菜单（`role="listbox"`、`v-if="props.open"`）而非页面，且模型条目数完全取决于用户配置了几个 provider（0 到任意）。按规范「条数不定 → 用空态或 pending 文案而非骨架」，保留原有的一行提示。因此适用组由 7 降为 6。

| 页面 | 理由 |
|---|---|
| `views/box/CoreBox.vue` | 启动器形态：输入即出结果，无「已知版式的首屏等待」 |
| `views/box/tag/UnifiedFileTag.vue` | `isLoading` 是单个缩略图/图标的加载，属图片加载反馈而非页面骨架 |
| `views/screenshot/ScreenshotEditorShell.vue` | 编辑器外壳，无模板加载分支 |
| `views/base/Plugin.vue` | `loadingStates.openFolder` 是按钮级操作反馈，非首屏加载 |
| `views/base/Store.vue` | 无模板加载分支 |
| `views/base/plugin/PluginNew.vue` | 无模板加载分支 |
| `views/base/home/HomePage.vue` | 无模板加载分支 |
| `views/base/intelligence/IntelligencePromptsPage.vue` | 无模板加载分支 |
| `views/base/begin/internal/Forbidden.vue` | 引导流程，无加载分支 |
| `views/base/begin/internal/AccountDo.vue` | 同上 |
| `views/base/begin/internal/SetupPermissions.vue` | 同上 |

### E. 另有归属（3）

`views/test/ClerkTest.vue`、`views/test/LoginTest.vue`、`views/test/MemoryLeakTest.vue` —— 测试页，非用户可达的产品界面。

**合计 1 + 2 + 7 + 11 + 3 = 24**，无遗漏。

## 一条被撤回的「既有缺陷」结论

分诊初稿曾判定 `Store.vue` / `PluginNew.vue` / `HomePage.vue` / `IntelligencePromptsPage.vue` 四页「有 await 数据拉取但无任何加载反馈」，属既有缺陷。**逐页复核后全部推翻，已撤回，无需开 issue**：

| 页面 | 复核结论 |
|---|---|
| `views/base/Store.vue` | **有**加载态：`useStoreData()` 提供 `loading`，经 `:loading="loading"` 传给子组件（`Store.vue:293,309`） |
| `views/base/plugin/PluginNew.vue` | **有**反馈：`manualShowSpinner` + `downloading` 安装阶段 + `setLoading` |
| `views/base/home/HomePage.vue` | **无首屏数据拉取**：`onMounted` 只装 ResizeObserver；awaits 全是 TTS、`nextTick()`、用户选会话时的 `history.load` |
| `views/base/intelligence/IntelligencePromptsPage.vue` | **无首屏数据拉取**：无 `onMounted`；awaits 全是用户触发动作（testCapability / 打开目录 / 剪贴板 / 读文件） |

**错因**：初稿用 `grep -c "await "` 当作「有数据拉取」的代理指标。该指标会把 `nextTick()` 与用户触发的异步操作一并计入，不能用来判定首屏加载。判定首屏加载须看 `onMounted` / `onActivated` 内是否真的发起数据请求，且加载反馈的形式不限于 `v-if="loading"`——**`:loading="x"` 这种向子组件传 prop 的形式同样是加载反馈**，初稿的正则漏掉了它。

## 通用改法（同子任务 C）

1. 加 `hasLoaded` 哨兵，在加载函数 `finally` 置 true；不改 `loading` 初值，避免连带改变按钮禁用语义。
2. `useDeferredLoading(() => !hasLoaded.value)` 防闪烁。
3. 判断该替换整页还是某个区域——已在首帧可渲染的头部/静态行不要替换。
4. 优先复用原语 + 令牌微调；**注意 scoped 样式边界**：不要在 A 组件里使用 B 组件 scoped 定义的类。
