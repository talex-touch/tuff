# Design — Nexus「模板 Templates」tab

## 1. 边界

- 全部改动在 `apps/nexus/**`。不改 tuffex 源码、不重建 tuffex dist、不改 docs 布局（`layouts/docs.vue`、`pages/docs/[...slug].vue`）、不改 `TuffDemoWrapper.vue`（399 个 demo 共用）、不改 `DocsComponentsGallery.vue(.css)` 与 `TuffexDocsHeroBackground.vue`（并行会话在改）。
- 模板是**文档层**产物：每个模板 = 一个 demo SFC + 中英两个 `.mdc` 页面。不导出为 tuffex API。
- 单任务推进，不拆父子任务：基础设施（阶段 A）落地后，10 个模板只各自改自己的文件，互不共享写入点，适合按组并行实现；最终验收只有一个（老板看效果）。

## 2. Taxonomy 与侧栏

### 2.1 `app/utils/docs-suites.ts`

- `DocsSuiteKey` 增加 `'templates'`；`DOCS_SUITE_KEYS` 顺序改为 `['concepts', 'templates', 'base', 'pro', 'ai', 'data', 'flow']`。
- 四个分类（frontmatter `category` 值）及其 i18n key：

  | category | i18n key | zh | en |
  |---|---|---|---|
  | `TemplateApp` | `templateApp` | 应用框架 | App shells |
  | `TemplateContent` | `templateContent` | 内容运营 | Content |
  | `TemplateAi` | `templateAi` | AI 应用 | AI apps |
  | `TemplateData` | `templateData` | 数据与流程 | Data & flow |

- `SUITE_CATEGORY_KEYS.templates = ['TemplateApp', 'TemplateContent', 'TemplateAi', 'TemplateData']`；`CATEGORY_SUITE_MAP` 四项映射到 `'templates'`；`CATEGORY_I18N_KEY` 四项。
- 文件头注释里的 "six suites" 同步为七个，并说明 templates 没有总览页。

### 2.2 `app/components/DocsSidebar.vue`（与 talex-touch-87 已对齐分区）

- `SuiteDef` 增加可选 `entryPage?: string`：套件没有总览页时，点 tab 落到这里。
- `SUITES` 在 concepts 之后插入：
  ```ts
  {
    key: 'templates',
    label: t('docsSidebar.suites.templates'),
    categories: suiteCategories('templates'),
    // No overview page: the tab lands on the first template directly.
    standalonePages: [],
    entryPage: '/docs/dev/components/template-shell',
  }
  ```
- `suiteOverviewLink()`：`const overview = suite?.standalonePages[0] ?? suite?.entryPage`。
- `SECTION_ORDER['/docs/dev/components']`：在 concepts 块（`…/sound`）与 `base-suite` 之间插入 10 条，按分组加注释，顺序同 PRD D5。
- 若 talex-touch-87 的 `SUITE_ICONS` 已落地，补一行 `templates: 'i-carbon-template'`，并在 zh/en 的 `docsSidebar.suiteDescriptions` 补 `templates`；未落地则跳过（它的实现有回退）。

### 2.3 i18n（`i18n/locales/{zh,en}.ts`）

- `docsSidebar.suites.templates`：模板 / Templates。
- `docsSidebar.categories.templateApp|templateContent|templateAi|templateData`（值见 2.1 表）。
- 只追加键，不动已有键（talex-touch-87 也在 `docsSidebar` 下追加 `suiteDescriptions`，注意合并）。
- 模板内部文案不进全局 i18n：沿用 demo 惯例，`useI18n()` + `copy` computed 分 zh / en 两支。

### 2.4 `scripts/recategorize-component-docs.py`

- `TAXONOMY` 在 concepts 块后插入 `TemplateApp` / `TemplateContent` / `TemplateAi` / `TemplateData` 四组 slug；docstring 的套件清单补 templates，说明它没有总览页。
- 该脚本 `glob("*.mdc")` 只扫平铺文件 → 模板页用平铺命名 `template-<slug>.{zh,en}.mdc`，不用子目录。

### 2.5 刻意不做的 suite 同步点

`component-guidelines.md`「TuffEx Suite Taxonomy」列出新增 suite 要同步的全部位置。templates 是纯文档层 suite，其中三处不适用：

- **总览页 / `*Suite` 分类**：老板决定不做（PRD D2），tab 直接落到 `entryPage`。
- **`DocsComponentsGallery` band 与 `suite` prop 联合类型**：画廊展示单个组件 specimen，模板本身就是整页组合，没有 specimen 可放。
- **hub（`index.{zh,en}.mdc`）的 H2 与套件总览表行**：表的列是「组件数 / 引入入口」，模板不是可引入的组件，放进去会误导。

Phase 3.3 更新规范时把这三条例外写进该章节，免得下次有人按清单补回来。

## 3. 内容页

### 3.1 命名与 frontmatter

| slug | 标题 zh / en | category |
|---|---|---|
| `template-shell` | Shell 应用外壳 / Shell | TemplateApp |
| `template-launcher` | Launcher 启动器 / Launcher | TemplateApp |
| `template-settings` | Settings 设置中心 / Settings | TemplateApp |
| `template-cms` | CMS 内容管理 / CMS | TemplateContent |
| `template-gallery` | Gallery 画廊 / Gallery | TemplateContent |
| `template-inbox` | Inbox 收件箱 / Inbox | TemplateContent |
| `template-agent-chat` | AgentChat 智能体对话 / Agent Chat | TemplateAi |
| `template-research` | Research 研究助手 / Research | TemplateAi |
| `template-dashboard` | Dashboard 数据看板 / Dashboard | TemplateData |
| `template-automation` | Automation 自动化编排 / Automation | TemplateData |

```yaml
---
title: Shell 应用外壳
description: <一句话：这个模板是什么>
category: TemplateApp
status: beta
since: 0.6.0          # 当前 packages/tuffex/package.json 版本
tags: [template, <场景词>...]
syncStatus: reviewed  # 仓库惯例（177/178 个组件页）
verified: false
---
```

frontmatter 的值里**不能出现未加引号的 `: `**（半角冒号 + 空格）：YAML 会把它当成嵌套映射、整段 frontmatter 解析失败，`category` 变成 `null`，页面悄悄落进侧栏「其他」组——`check-mdc-fences`、`check-doc-parity`、分类脚本都查不出来（A7 实测：四篇 en 页中招）。中文用全角「：」不受影响；英文改写句子或给值加引号。

### 3.2 章节结构（zh / en 同构，`check:doc-parity` 按章节数校验）

```
## 场景 / Scenario            一段：解决什么问题、适合什么产品
## 模板 / Template
### <风格名> / <Style name>   D4：每章预留多风格位，首批只有一个 ###
:::TuffDemoWrapper{demo="Template<Name>Demo" code-lang="vue" title=… description=…}
code: 精简但真实的骨架片段（布局 + 关键组件用法，不含 i18n 脚手架）
:::
## 组成 / Anatomy             表格：区域 | 组件（链接到组件文档）| 作用
## 交互要点 / Interactions    3–6 条：可以点什么、自动演示了什么、响应式怎么收
## 改造建议 / Adapting it     2–4 条：换数据源 / 换组件 / 常见变体
```

不需要 `## API` / Props / 最佳实践（覆盖率测试只约束导出组件的 slug）。

## 4. `TemplateFrame.vue` —— 共享舞台组件

位置：`app/components/content/demos/TemplateFrame.vue`。它是 helper，靠各模板 demo 的 `import TemplateFrame from './TemplateFrame.vue'` 通过 `check-demo-registry-orphans` 的 helper 规则，不进 registry。

### 4.1 契约

```ts
defineProps<{
  title: string          // 工具条左侧名称，同时作为展开浮层的 aria-label
  height?: number        // 列内舞台高度，默认 540
}>()
defineEmits<{
  enter: []              // 舞台首次 ≥35% 可见时触发一次（IntersectionObserver）；自动演示从这里开播
}>()
// default slot props: { expanded: boolean, width: number, height: number }
//   width / height = .template-frame__body 的实测内容尺寸（ResizeObserver，取整 px）
```

`TuffDemoWrapper` 在 demo 进入视口前 240px（`DEMO_LAZY_ROOT_MARGIN`）就挂载它，如果在 `onMounted` 里开播，读者滚到时可能已经错过开头，所以用 `enter` 事件开播。重播时 wrapper 会重新挂载 demo，或调用 demo 暴露的 `resetDemo`；重新挂载后 `TemplateFrame` 会再判断一次可见度，舞台本来就在视口里，所以会立刻再触发 `enter`。

容器查询够不到数值型 props（`TxFlowchart.height` 与节点 `x/y`、`TxTimeseriesChart.height`、`TxDataTable.maxHeight` 等，见 research/data-flow.md Risks 1），所以舞台把实测尺寸作为 slot props 交给模板，模板据此算数值；纯 CSS 布局仍用 `@container`。首帧（尚未测量）传 `0`，模板需给出合理的回退值。

结构：
```
.template-frame.not-prose
├── .template-frame__toolbar      左：title · 实时宽度读数（如「784px」）  右：展开按钮
└── .template-frame__stage        高度 = height（展开时保留占位，页面不塌）
    ├── 展开时：占位提示「已在全屏中查看 · 收起」
    └── <Teleport to="body" :disabled="!expanded">
          .template-frame__host（列内：填满 stage；展开：fixed 浮层 + 背景遮罩）
            └── .template-frame__panel
                  ├── 展开时：浮层标题条（title + 收起按钮 + Esc 提示）
                  └── .template-frame__body   container-type: inline-size; container-name: template
                        └── <slot :expanded :width :height />
```

- **同一活实例**：`Teleport` 的 `disabled` 切换只移动 DOM，不重建组件，模板状态（选中行、流式进度、筛选）全部保留。
- **容器查询**：模板布局一律写 `@container template (…)`，不用 `@media`。统一三档：`< 640px` 窄（单栏）、`640–959px` 列内（默认，最宽 ≈784）、`≥ 960px` 宽（展开态多栏 / 附加面板）。列内永远到不了 960；1024 视口下展开面板约 976，仍进宽档。模板确有需要时可在宽档内再加一档（如 `≥ 1200px`），但不另起一套基准。这是 nexus 首次使用 `@container`，没有先例，Vue scoped 下的编译要在浏览器里确认（A7）。
- **确定高度与不透明底**：`.template-frame__body` 在两种状态下都有确定高度（列内 = `height` prop；展开 = 面板剩余高度），模板根写 `height: 100%` 即可满足 `TxConversationStream` / `TxTabs` / `TxAgentsList` 等 `height:100%` 组件。body 铺不透明底 `var(--tx-bg-color)`（暗色下 `--tx-fill-color-blank` 是透明的，非 BUI 组件的底色会消失）；圆角裁剪只做在 body 上，模板内部的列不要设 `overflow: hidden`，否则 `TxPromptBar` 向上弹出的菜单（约 220px）会被裁掉。
- **prose 隔离**：根节点与浮层 host 都带 `not-prose`，屏蔽 `github-markdown.css` 与 `.docs-prose` 对裸标签的样式（`TuffDemoWrapper` 本身没有这层隔离）。
- **层级**：浮层用固定 `z-index: 1900`，刚好低于 tuffex 分配器下限 `DEFAULT_Z_INDEX_SEED = 2000`。模板里弹出的所有 tuffex 浮层（popover / tooltip / ⌘K 从 2000 起、drawer 从 10000 起）因此在 dev 和生产环境都叠在浮层之上。**不与分配器协调**：生产构建里自动注册的组件编译自 tuffex 源码（`modules/tuffex-components.ts:90` 在非 dev 时 `useTuffexSource = true` → `@tuffex-components/*` → `components/src`），而 `@talex-touch/tuffex/utils` 始终别名到 dist（`nuxt.config.ts:436,555`），两边是两个分配器实例；`~/utils/layers.reserveOverlayLayer()` 只能抬 dist 那个，对源码组件无效。页头 `.TuffHeader` 的 `z-index: 10000` 并不参与竞争：它位于 `.docs-layout-stage` / `.docs-layout-root` 内，两者都 `isolation: isolate`，整个 docs 布局在根层叠上下文里按 `auto` 绘制，所以挂在 body 下的 1900 浮层会盖住页头（A7 实测）。面板四边留 24px（窄屏 12px）。
- **滚动锁**：展开时给 `document.documentElement` 设 `overflow: hidden`，收起 / 卸载时恢复原值。
- **键盘与焦点**：浮层 `role="dialog"` + `aria-modal="true"` + `aria-label=title`；展开后聚焦收起按钮，收起后焦点回到展开按钮，两处都用 `focus({ preventScroll: true })`。Esc 监听挂在浮层元素上（不挂 window）：tuffex 浮层 teleport 在 body 下、不在浮层 DOM 内，焦点在 drawer 里按 Esc 只会关 drawer。不做硬焦点陷阱（会困住 teleport 出去的 popover）。
- **动效**：展开 / 收起只做 opacity 过渡（≤ 180ms），不用 scale / transform——transform、filter、mask 会让祖先成为 fixed 后代的包含块（research/content.md R5）；`prefers-reduced-motion: reduce` 时取消过渡。`container-type: inline-size` 只施加 style + inline-size containment，不会成为 fixed 后代的包含块，可以放心用。
- **卸载安全**：路由切换时如仍在展开态，`onBeforeUnmount` 恢复滚动、移除监听。
- **宽度读数**：同一个 `ResizeObserver` 观察 body（也是 slot props 的来源），四舍五入到 px 显示；卸载时 disconnect。
- 文案（展开 / 收起 / 已在全屏中查看 / Esc）走组件内 `copy` computed（zh / en）。

## 5. 模板 demo 约定

- 文件：`app/components/content/demos/Template<Name>Demo.vue`；registry 按字母序插入一行。
- 结构：`<script setup lang="ts">` → `<template>`（根是 `<TemplateFrame>`）→ `<style scoped>` 最后。
- 引入：所有 `Tx*` / `Tuff*` 组件由 `modules/tuffex-components.ts` 自动注册，模板**不 import 组件**；只显式引入非组件导出（如 `ChartPalette`、`prefersReducedMotion`）自 `@talex-touch/tuffex/<dir>`，不从裸 `@talex-touch/tuffex` 引入。`TxChart` 与其 series 必须来自同一条 `@talex-touch/tuffex/charts` import（provide/inject 配对，跨模块实例会断）。
- 反馈：模板内一律用 `TxToastPanel`（受控、无全局 store，留在模板框内），不用 `toast()` + `TxToastHost`——生产构建里两者可能分属源码 / dist 两个 store 实例，且 host 落在视口角落、跑出模板。
- 网格：`TxGrid` 的响应式 cols 读 `window.innerWidth`，`TxGridLayout` 有 `@media (min-width:1400px)`，都跟视口走 → 模板布局用自己的 CSS grid + `@container`（`TxGrid` 仅可用 `min-item-width` 模式）。
- 裁切：`TxFlatSelect`、`TxFineTuneCard` 的类型菜单等**不 teleport** 的下拉会被 `overflow: hidden` 祖先裁切（包括 `TuffDemoWrapper` 窗口本身）→ 这类控件别放在舞台底边附近，并保证其所在列不设 `overflow: hidden`。
- 文案：`useI18n()` + `copy` computed，zh / en 两支；mock 数据同样双语。
- 数据：产品化的 mock（Tuff 桌面启动器 / 插件 / AI / 剪贴板 / CoreBox 语境），不外链图片（用 CSS 渐变 / 内联 SVG / 仓库内已有资源，见 research/content.md）。
- 图标：只用已安装集合（carbon / cib / logos / twemoji，`check:icon-collections` 门禁），首选 `i-carbon-*`；类名字面量必须写在 `.vue` 里——`uno.config.ts` 只扫描 `.vue` 与 `app/(data|composables|utils)/*.ts`，`demos/*.ts` 不在其中。门禁只校验**集合**不校验**名字**，而 research 已发现若干并不存在的 carbon 名（如 `i-carbon-clipboard`）→ 每个模板都要跑 implement.md 里的图标名校验。
- 禁用：`TxTouchTip`、`TxBottomDialog`（整页滚回顶部）、`TxBlowDialog`（改 `#app`）、全局 `toast()` + `TxToastHost`（见上）、`clearToasts()`（全站共享队列）；`TxGroupBlock` 不设 `memoryName`；预置图片不外链。
- 显式组件 import 与自动注册**不混用**：生产构建里两者分属 dist / 源码两份实例，Symbol key 的 provide/inject（`FLAT_SELECT_KEY`、`SELECT_KEY`、`FLAT_RADIO_KEY` 等）与 z-index 分配器都会断开。
- 自动演示：AI / 编排类模板在 `TemplateFrame` 的 `enter` 事件里按脚本时间轴开播一次；暴露 `defineExpose({ resetDemo })` 让「重播」精确复位（Vue 3.5 会把异步组件的 ref 透传到内部 demo），不暴露则 wrapper 整体重挂载，同样可重放。`prefers-reduced-motion` 下直接渲染终态、不启动计时器。所有 timer / listener 在 `onBeforeUnmount` 清理；`watch(locale, resetDemo)`。
- **不碰 docs 页的滚动与焦点**：模板内禁止 `scrollIntoView`，自动演示期间禁止任何 `focus()`（如 `TxPromptBar.focus()`）——两者都会把整页滚到 demo 处。滚动一律用容器的 `scrollTop` / `scrollTo` 或组件暴露的方法（如 `TxConversationStream.scrollToBottom`、`useStickToBottom`）。
- **人机闸门**：涉及安全动作的确认（如写文件的 `TxToolConfirmation`）**无限等待**读者点击，旁边给出「点允许继续」提示，不做倒计时自动允许（文档站不示范自动放行写权限）。非安全的澄清问卷（`TxApprovalCard`）可在闲置 3s 后自动选推荐项，读者一旦作答即取消自动。
- **数据真实性**：涉及第三方产品的性能 / 准确率等结论写成定性描述，或明确标注「示例数据」，不伪造精确指标。
- **本地化**：tuffex 组件默认文案多为英文，所有可传的 label / placeholder / aria 文案都按 `copy` 传中英两版；少数组件内部写死的英文（如 `TxConversationStream` 回底按钮 aria-label）记入审阅说明，不在本任务修组件。
- 浮层：持久面板（检查器、预览、详情）做在模板内部；瞬时流程（编辑抽屉、确认对话框、⌘K）用真实的 `TxDrawer` / 对话框 / `TxCommandPalette`——它们 teleport 到 body 并覆盖整页，这就是组件的真实行为，列内和展开态都成立。
- 颜色：只用 `--tx-*` / `--tx-bui-*` token（`tuffex-design-rules.md`），暗 / 亮两套主题都要成立；阴影遵循单一左上光源（`--tx-elevation-*`）。**不引用 `--docs-*`、`--tuff-demo-*` 等 docs 容器上定义的变量**：展开时模板被 teleport 到 body，这些变量就没了。同屏会出现两种蓝（BUI `--tx-bui-accent` 与 `--tx-color-primary`），是否在模板作用域内统一留到阶段 C 视觉验收决定。

## 6. 各模板组合设计

组件 API、布局 ASCII、完整 mock 数据与时间轴以对应 research 文件为准；本节只记录**采纳的方案、主会话的决策和对 research 的偏离**。所有模板：demo 名 `Template<Name>Demo`，舞台默认高 540，断点按 §4 三档。

### 6.1 Shell 应用外壳 — `TemplateShellDemo`（research/app-shells.md §Shell）

- 采纳：`TxSidebarNav`（工作区切换、分组导航 + badge、footer 同步状态）+ 顶栏（`TxBreadcrumb`、过滤活动的 `TxSearchInput`、⌘K 按钮 `TxKbd`+`TxTooltip`、铃铛 `TxIconButton`+`TxBadge`、用户菜单 `TxDropdownMenu`）+ 看板（`TxStatCard` ×3、`TxTimeline` 活动流、`TxSparkChart` 每小时查询、`TxStatusBadge` 服务状态）+ `TxCommandPalette` + `TxToastPanel`。
- 宽档：统计卡 4 列（加 progress 变体「索引覆盖 82%」），右侧 280px 栏（在线成员 `TxAvatarGroup`、带 `TxChartScrubber` 的大 spark、服务列表）。窄档：隐藏侧栏，顶栏汉堡 `TxIconButton` 打开 `TxDropdownMenu` 导航（复用同一份 items）。
- 导航：Overview 显示看板；Plugins 显示插件行（`TxTag`+`TxStatusBadge`，插件名取自 `plugins/`）；其余分区显示 `TxEmptyState`（`icon` 插槽放静态图标，规避无限动画）。
- 键盘：⌘K 绑在模板根元素 `@keydown`（`preventDefault`），不绑 window / document（`app.vue` 在 window 上占用 ⌘K 与 `/`）；`TxSidebarNav` 的 `search-hint` 只用多字符 `'⌘K'`，单字符会在 document 上劫持整页的 `/`。
- 侧栏去掉 BUI 卡片阴影与圆角，改右侧 1px 分隔线（`:deep` 局部覆盖），避免卡片套卡片。
- 自动演示（`enter` 开播）：+0.8s 活动流顶部插入「Translate 2.4.0 已安装」、Plugins badge 3→4；+1.4s 铃铛 +1，`TxToastPanel` 打开 3.2s 后收起；+2.0s「今日启动」1,284→1,291。读者第一次 pointerdown / keydown 进入模板即停止自动演示。
- 已知取舍：列内打开的 `TxCommandPalette`（z≈2001）位于站点页头（10000）之下，与现有 CommandPalette 文档 demo 一致；展开态下它在浮层（1900）之上。

### 6.2 Launcher 启动器 — `TemplateLauncherDemo`（research/app-shells.md §Launcher）

- **偏离 research 主方案**：不用 `TxSearchPanel`，改用 research 的备选——`TxSearchInput` + `TxFilterChips` + 自建 `role="listbox"`（`aria-activedescendant`，↑/↓/Enter/Esc 挂在输入框上），行 = `TxIconChip` + 标题 / 副标题 + `TxTag` + `TxKbd`。理由：预览要跟随高亮、自动演示要移动高亮，`TxSearchPanel` 两者都不暴露，主方案要靠 helper 行组件泄漏 `active`、合成 `KeyboardEvent`、`:deep` 改内部行高与卡片结构共 6 处补丁，脆弱且难维护；备选多约 80 行键盘 / ARIA 代码，但顺序、高亮、预览全部可控。
- 外观：令牌渐变壁纸（亮 / 暗两套）+ 假菜单栏（手写）+ `TxGlassSurface` 启动器窗体；右侧 `TxMarkdownView` 预览（单实例常驻，只换 content，预览 markdown 不放链接）；底栏 `TxKbd`（↵ 打开、⌘K 操作、⌘1–0 快速选择，文案取 core-app `en-US.json` 的 CoreBox footer）+ `TxStatusBadge`「索引中 82%」。
- 宽档：窗体放大、列表 380px、壁纸加一排假 Dock（`TxIconChip size=40`）。窄档：隐藏预览。
- 交互：输入跨类过滤（筛选条计数由数据推导）；Enter 在底栏左侧显示「已打开 …」1.6s；输入框聚焦时 ⌘K 打开操作菜单（`TxDropdownMenu`）；Esc 先清空查询、再按一次重置范围；无结果时 `TxSearchEmpty`（静态 icon 插槽）+「问问 Tuff AI」切到 AI 范围；查询是算式时首行合成「= 结果」。⌘1–⌘5 只展示不拦截（浏览器保留键）。
- 自动演示（`enter` 开播）：逐字键入「clip」（120ms/字，直接写 model，不 focus）→ 高亮下移两次、预览随动 → 切到「插件」范围 → 停住。读者一旦输入或点击即中止。
- mock：CoreBox 源类型（application / plugin / file / clipboard / AI / system），插件用真实 id（`touch-clipboard`、`touch-quick-actions`、`touch-browser-open`、`touch-window-presets`、`touch-intelligence` 等）。

### 6.3 Settings 设置中心 — `TemplateSettingsDemo`（research/app-shells.md §Settings）

- 采纳：`TxTabs placement="left"` + `TxTabItemGroup`（稳定英文 `name`，本地化放 `#name` 插槽）+ `TxTabHeader`（「已保存 · 刚刚」`TxStatusBadge` + 重置按钮）；各页 `TxGroupBlock`（统一 `collapsible=false`，规避无 reduced-motion 的 gsap；不设 `memoryName`，避免写 localStorage）+ `TxBlock*` 行 + 具体控件（Switch / Select / FlatSelect / Slider / SegmentedSlider / NumberInput / FlatRadio / RadioGroup / Checkbox / Input / SensitiveInput / Kbd / Alert / Avatar / ImageUploader）。页面：通用 / CoreBox / 快捷键 / AI 模型 / 隐私 / 账户。
- 所有值集中在一个 `reactive` 对象里（`TxTabs` 只渲染当前面板，切页会卸载）；任一值变化后 600ms 防抖显示「已保存」。
- 确认框一律 `TxModal`（重置设置、清空剪贴板历史、在所有设备上退出）；禁用 `TxBottomDialog` / `TxTouchTip`（会把整页强制滚回顶部）。
- `TxSensitiveInput` 放在 `TxGroupBlock` 正文、不放 56px 行里；`TxFlatSelect`（不 teleport）只在不会被裁切的位置出现一次（通用页首行「语言」）。
- 宽档**创新点**：内容区右侧「实时预览」卡——一个迷你 CoreBox 条，实时反映主题 / 窗口透明度 / 结果密度 / 最多结果数。窄档：用 slot `width` 把 `TxTabs` 切到 `placement="top"`（`navMinWidth` 是内联样式，CSS 覆盖不了）。
- 自动演示（`enter` 开播）：1.0s 切到 CoreBox 页 → 1.6s 结果密度「舒适→紧凑」→「已保存」闪现（宽档实时预览同步变紧凑）。reduced motion 直接落终态，并给 `TxTabs` 关掉 `animation`。

### 6.4 AgentChat 智能体对话 — `TemplateAgentChatDemo`（research/ai.md §AgentChat）

- 采纳：「插件工程师」智能体为 clipboard-history 插件加隐私模式——规划 → 澄清问卷 → 检索代码 → 申请写权限 → 逐行写码 → 跑测试 → 流式总结。组件分工见 research 表：`TxConversationStream`（`:overscan="24"`，会话项只存 id + kind，内容读响应式剧本状态）、`TxChatMessage`、`TxAgentTrace`、`TxApprovalCard`（澄清问卷）、`TxToolCallCard`、`TxToolConfirmation`（写权限闸门）、`TxCodeStream`（diff）、`TxTypingIndicator`、`TxStreamMarkdown`、`TxToolChips`、`TxMessageActions`、头部 `TxThinkingOrb`（固定 `state`、传中文 `label`）+ `TxWorkingIndicator` + `TxContextIndicator`，侧栏 `TxFlatRadio`（任务 / 变更 / 预览）+ `TxTaskRows` / `TxDiffChips` / `TxAgentScreen`，底部 `TxPromptBar`。
- 宽档三栏：`TxAgentsList` 220 | 会话 | 计划 / 变更 / 预览纵排 320（不用页签）。窄档：隐藏侧栏，输入条上方加一行状态条（「任务 2/4 · 4 个文件变更」）。
- **闸门决策**：`TxToolConfirmation` **无限等待**读者点击，旁边提示「点「允许」继续」，不做倒计时自动允许。澄清问卷闲置 3s 自动选推荐项，读者任何作答即取消自动。拒绝分支、停止按 research 执行。
- 时间轴按 research（约 14s + 闸门等待），从 `enter` 起算；`defineExpose({ resetDemo })`。
- 约束：禁止 `scrollIntoView` 与自动 `focus()`；会话列不设 `overflow: hidden`（`TxPromptBar` 菜单向上弹约 220px）；`TxToolChips` / `TxApprovalCard` 最宽 320px，不强行拉宽；不用会 teleport 的附件预览与 mermaid 围栏。

### 6.5 Research 研究助手 — `TemplateResearchDemo`（research/ai.md §Research）

- 采纳：问题「Tuff 的截图 OCR 该选哪个本地引擎？」→ `TxChainOfThought` 研究过程（4 步，`:default-open="false"`）→ 带编号引用的结论 → 对比表 → `TxInsightCards` 洞察 + `TxRecommendationCard` 建议 → `TxSuggestionChips` 追问 → 追问线程（`TxAiConversation` / `TxAiMessage` 只用 text part 或 default 插槽，规避内嵌英文文案）；侧栏 `TxTabs`（来源 `TxSources` / 片段 `TxContextCards`+`TxSignalMeter` / 笔记 `TxMarkdownView`+`TxMessageActions`），首批来源到达前 `TxSkeleton`；底部 `TxPromptBar`。
- **引用决策**：答案拆两段——结论段是普通段落 + token 逐词显影，按标记插入 `TxInlineCitation` 组件；对比段用 `TxStreamMarkdown` 流式输出表格与要点，**不写任何链接**（`v-html` 渲染，链接会真的导航 docs 页）。
- 点结论里的引用：侧栏切到对应页签、用滚动容器 `scrollTo` 定位并加高亮环；点来源 / 片段只在底部状态行显示「宿主会打开：…」，不导航。
- 宽档三栏：主列（阅读宽 ≤680）| 证据栏 320（来源 + 片段纵排）| 洞察栏 300（InsightCards + RecommendationCard + SuggestionChips）。窄档：隐藏侧栏，结论下方插入 `TxSources variant="stack"`。
- 数据真实性：第三方引擎的准确率 / 延迟 / 体积一律定性描述或标注「示例数据」。
- 主列跟随用显式 import 的 `useStickToBottom`；时间轴按 research（约 10s），从 `enter` 起算；`defineExpose({ resetDemo })`。

### 6.6 Dashboard 数据看板 — `TemplateDashboardDemo`（research/data-flow.md §Dashboard「Tuff Pulse」）

- 采纳：头部（`TxStatusBadge` 系统状态、`TxFlatRadio` 7d/30d/90d、`TxDatePicker variant="field" range`）+ KPI `TxStatCard`（列内 4 张、宽档 5 张，value 插槽用 `TxTextMorph` 滚动数字）+ 主趋势 `TxTimeseriesChart`（版本 markers、当天未完成段虚线、框选缩放联动 KPI）+ `TxChartLegendItem` + 平台占比 `TxAllocationBar`（选中段高亮图表系列）+ 服务健康 `TxSignalMeter`+`TxDotIndicator` + AI 配额分段 `TxProgressBar` + 热门插件 `TxDataTable`（单元格内 `TxSparkChart` 覆盖 padding、`TxSignalMeter`、`TxStatusBadge`，可排序）；宽档加 `TxInsightCards`（带 `TxChartScrubber`）。
- 数值型尺寸（图表高度、表格 `maxHeight`）取 slot `width/height` 计算；布局用自有 CSS grid + `@container`，不用 `TxGridLayout`。
- 趋势图画次数不画比率（`TxTimeseriesChart` 的 y 轴恒含 0，接近 100% 的比率会画成平线）；`TxStatCard` 下跌 insight 显式传 `iconClass`（`i-carbon-arrow-down` 在 nexus 无引用会空白）；图表颜色统一 `ChartPalette.categoricalVar(i)`（`@talex-touch/tuffex/charts`，无状态辅助函数）。
- 无脚本自动演示（交互型模板）；`defineExpose({ resetDemo })` 复位时间范围与筛选。插件表用 `plugins/` 真实 id。

### 6.7 Automation 自动化编排 — `TemplateAutomationDemo`（research/data-flow.md §Automation「剪贴板 OCR → 翻译」）

- 采纳：`TxFlowchart` 自上而下的 DAG（触发 → 原生 OCR →〔置信度 < 阈值时〕AI 重读 → 翻译 → 通知），节点卡片插槽里画状态（`TxStatusBadge` / `TxWorkingIndicator` / `TxDotIndicator`），传输中的连线用模板 CSS 给 `.is-dashed` 做流动虚线（`prefers-reduced-motion: no-preference` 内才动画）；右侧检查器按节点切换表单（`TxFlatSelect` / `TxScrubField` / `TxSwitch`，通知节点用 `TxFineTuneCard` + `TxToastPanel` 预览）；本次运行 `TxTaskRows`。宽档：左栏运行历史 `TxTimeline`、头部 `TxSteps`、`TxSplitter` 下方日志 `TxCodeStream`（外包滚动容器）。
- 节点 `x` 由 slot `width` 计算，画布高度由 slot `height` 给（容器查询够不到数值型 props）。
- 运行：点「运行」或 `enter` 时自动跑一次，约 3.3s 的 `setTimeout` 链带 `cancel()`；检查器把最低置信度调到 93 以上会让下一次运行走 AI 兜底分支；「模拟限流」开关演示 error → 重试。`defineExpose({ resetDemo })`；`TxWorkingIndicator` 空闲时 `v-if` 掉（它有 100ms interval）。
- `TxTimelineItem` 暗色下圆点有白环（组件写死 `#fff` 边框）：模板层 `:deep` 覆盖为 token 色，并记入待汇报缺陷。

### 6.8 CMS 内容管理 — `TemplateCmsDemo`（research/content.md §CMS「Nexus 内容工作台」）

- 采纳：管理 tuff.tagzxia.com 的文档 / 博客。头部（标题 + 篇数、`TxSearchInput` 过滤标题 / slug、`TxButton` 新建）+ `TxFilterChips` 状态筛选（色点 + 由数据推导的计数）+ `TxDataTable`（`selectable` / `highlight-selected` / `sticky-header` / `table-layout="fixed"`；单元格：标题 + `TxTag` 栏目 + 置顶图标、`TxStatusBadge`、`TxAvatar`+名字、相对时间、等宽浏览数、`TxCellLink` slug、行菜单 `TxDropdownMenu`）+ 底栏（有选中时批量发布 / 归档 / 删除，否则「共 N 篇 · 第 x/y 页」）+ `TxPagination`。切筛选 / 翻页 / 排序时模拟 350ms 取数，用 `TxSkeleton` 占位；无结果 `TxSearchEmpty`「清除筛选」。
- 编辑：行点击 / 回车 / 菜单「编辑」打开 `TxDrawer`（铺满视口、盖住整页，是组件真实行为）；`TxForm label-position="top"` 带校验（标题必填、slug `^[a-z0-9-]+$`、摘要 ≤160 字）；字段 `TxInput`（slug 前缀 `/blog/`）/ `TxSelect` 栏目与状态 / `TxTagInput :max="5"` / `TxDatePicker variant="field"` / `TxFlatRadio` 语言 / `TuffSwitch` 置顶与评论 / `TxTextarea` 摘要（计数）与正文（等宽）；`#footer` 放「取消」+ `TxSplitButton`（保存草稿 / 提交审核 / 立即发布，`menu-icon` 必须传 carbon 图标，默认是缺失的 `ri` 集合）。**不用 `TxMarkdownEditor`**（工具栏 14 个 `i-ri-*` 图标在 nexus 渲染成灰方块）。
- 宿主负责表格语义：受控排序（`:sort-on-client="false"`，先对过滤后的全量排序再切页）、翻页清空选择（全选只覆盖当前页）、单元格内交互 `@click.stop`（否则冒泡触发 `row-click`）。
- 宽档：列加栏目 / 语言 / 浏览，每页 12 行；右侧 340px inspector（状态、标签、作者、`TxCellLink`、`TxMarkdownView` 正文预览、「编辑」）——单击行更新 inspector，双击或「编辑」开抽屉。窄档：只留选择 / 标题（下挂状态点 + 时间）/ 操作列，筛选条横向滚动。
- 反馈：保存 / 发布 / 删除后用 `TxToastPanel`（底栏上方），带「撤销」恢复快照。
- 无脚本自动演示（管理后台是交互型模板）；`resetDemo` 复位筛选 / 搜索 / 排序 / 页码 / 选择 / 数据快照并关闭抽屉。mock：26 篇双语文章、5 位作者（首字母头像），见 research。

### 6.9 Gallery 画廊 — `TemplateGalleryDemo`（research/content.md §Gallery「Tuff Showcase 作品墙」）

- 采纳：Nexus 社区作品墙（壁纸 / CoreBox 主题 / 插件封面 / 社区精选）。头部（`TxAvatarGroup` 贡献者、`TxBadge` 总数、上传 `TxIconButton`+`TxTooltip` 打开 `TxPopover` 内的 `TxImageUploader`）+ `TxFilterChips role="tablist"` 合集切换 + 浮在滚动区上方的 `TxGlassSurface` 工具条（`TxSegmentedSlider` 缩略图 S/M/L/XL → `--thumb-min`、`TxFlatRadio` 网格 / 瀑布流 / 列表、排序 `TxDropdownMenu`——**不用 `TxFlatSelect`**，它的下拉会被玻璃层裁掉）+ `TxEdgeFadeMask` 纵向滚动区 + `TxStagger` 网格；卡片是手写 `<li><button>`：作品图、悬停渐变遮罩（标题、`TxRating readonly`、喜欢 `TxIconButton :pressed`）、`TxTag` 合集、`TxBadge`「新」、`TxAvatar` 作者。
- **详情决策**：用 `TxModal`（会 teleport）。`TxFlipOverlay` 在 HEAD 不 teleport，而 `.docs-prose` 带 `content-visibility: auto`，成了它的包含块，在正文里会错位；它的 teleport 修复还在 pro-gallery 会话的工作树里未提交。等修复进了 dist，再把详情升级为从卡片翻开的 FlipOverlay，作为后续项，不纳入首批。详情内容：大图 + 说明条、作者与时间、可交互 `TxRating`、`TxTag`、色板、「设为壁纸」「复制色值」（`TxToastPanel` 反馈）、上一张 / 下一张（←/→ 只在打开期间监听，挂在模板内而非 document）、变体条 `TxImageGallery`（用它自带的灯箱；它不能程序化打开、只有方形网格，所以只放在详情里）。
- 作品图：代码生成的 SVG data URI（motif：dunes / orbs / grid / rings，seed + 三色板，亮暗主题都成立）为主，另外 3–5 张仓库本地 JPG（避开带第三方商标的 spotify / vscode）；不外链。上传产生的 object URL 在卸载 / 重置时统一 `revokeObjectURL`。
- 宽档：更多列，右侧 280px 合集栏（简介、贡献者、热门标签、统计、常驻 `TxImageUploader` 代替 popover）。窄档：2 列，工具条只留布局与排序。
- 自动演示：在 `enter` 时换 `TxStagger` 的 key 播放一次入场（不在挂载时播，读者会错过）；切合集时也播。reduced motion 下不做 stagger。`resetDemo` 复位并重播。

### 6.10 Inbox 收件箱 — `TemplateInboxDemo`（research/content.md §Inbox「Tuff 账户收件箱」）

- 采纳：Tuff 账户邮件 / 通知中心（插件审核、CI 构建、安全登录、AI 额度、账单、社区提及）。外层 CSS grid（侧栏固定 px）+ 唯一一个 `TxSplitter`（列表 | 阅读，`:deep` 去边框与圆角）；列表 `TxVirtualList height="100%" :item-height="76"`（外包 `role="listbox"`，行 `role="option"` + `aria-selected` / `aria-setsize` / `aria-posinset`），行内 `TxAvatar`（人用首字母、Tuff 系统发件人用 `/logo.svg`）、`TxDotIndicator` 未读点、发件人 / 时间 / 主题 / 摘要、`TxTag`、星标 `TxIconButton :pressed`（`@click.stop`）；列表头 `TxBadge` 未读数 + 排序 `TxDropdownMenu`；切文件夹时 400ms 骨架占位；无结果 `TxSearchEmpty`。
- 阅读区：未选中时 `TxNoSelection`（`TxKbd` 提示 J / K）；选中时主题、发件人信息、`TxTag`、`TxMessageActions`（复制正文 + 回复 / 归档 / 星标）、「更多」`TxDropdownMenu`（标为未读 / 移动到 ▸ `TxDropdownSubmenu` / 静音）、`TxMarkdownView` 正文、只读 `TxAttachmentTray`（文案与 `sizeFormatter` 全部本地化）、`TxChatComposer` 回复（`:send-on-enter="false"`，假发送 600ms，发送后追加到往来）。
- 键盘挂在模板根元素上（不挂 document）：↑↓ / J / K 选择并 `scrollToIndex`、E 归档、S 星标、Enter 聚焦回复框（用户主动按键时的 focus，带 `preventScroll`）；焦点在可编辑元素里时不响应单字母键。`TxSidebarNav` **不传** `search-hint` / `search-placeholder`。
- 宽档：左侧 `TxSidebarNav` 216px（邮箱 / 标签分组，未读 badge 由数据推导），隐藏文件夹 chips。列内：文件夹用 `TxFilterChips`。窄档：单栏列表，选中后阅读区从右侧滑入，带「返回」按钮。
- 自动演示（从 `enter` 起算）：3.5s / 9s / 15s 各有一封新邮件插到收件箱顶部（未读数滚动、`TxToastPanel` 提示约 4s，「查看」按钮选中该邮件）；读者已滚离顶部时不跳回。reduced motion：一开始就插好 3 封、不弹提示。`resetDemo` 复位数据 / 选择 / 文件夹 / 草稿并重启计时，回收 object URL。
- mock：12 封双语种子按文件夹 × 时间偏移派生到约 160 封，让虚拟列表有意义，见 research。

### 6.11 已知 tuffex 缺陷（本任务只在模板层绕开，不改组件，收尾时汇报）

| 缺陷 | 证据 | 本任务处理 |
|---|---|---|
| 生产构建 `toast()`（dist）与自动注册的 `TxToastHost`（源码）各用一份队列 → `ToastToastDemo`、`ComponentsFeedbackTaskCenterDemo` 的 toast 线上不显示 | research/app-shells.md R1（09-21 生产包 chunk 分析） | 模板只用受控 `TxToastPanel` |
| 同因：`~/utils/layers.reserveOverlayLayer()` 在生产抬的是 dist 分配器，对源码组件无效，`GlobalSearch` 面板可能被页头压住（未验证） | 同上 | 浮层用固定 1900，不依赖分配器 |
| `TxTimelineItem` 圆点边框写死 `#ffffff`，暗色下一圈白环 | research/data-flow.md Risks 8 | 模板 `:deep` 覆盖 |
| `TxStatCard` 下跌图标 `i-carbon-arrow-down` 在 nexus 无引用 → 空白 | data-flow.md Risks 6 | 显式传 `iconClass` |
| `TxSidebarNav` 单字符 `search-hint` 在 document 上 `preventDefault`，整页 `/` 失效 | app-shells.md R3 | 只用多字符提示 |
| `TxTouchTip` / `TxBottomDialog` 打开时把整页滚回顶部 | app-shells.md R11 | 禁用 |
| `TxTabs`、`TxGroupBlock`、`TxEmptyState` 插画、`TxConversationStream` 跟随、`TxAiMessage` 等缺 reduced-motion 兜底 | app-shells.md R7、ai.md Risks 8 | 传 `animation` 关闭 / `collapsible=false` / 静态 icon 插槽 / 终态直出 |
| `TxSearchPanel` 不上报高亮项、不暴露 input；`TxCodeStream` 无纵向滚动 | app-shells.md R10、data-flow.md Risks 11 | Launcher 改自建 listbox；日志外包滚动容器 |
| `TxFlipOverlay` 在 HEAD 不 teleport，在 `content-visibility: auto` 的 `.docs-prose` 里错位 | content.md R4 | pro-gallery 会话在修（未提交）；Gallery 详情先用 `TxModal` |
| `TuffexDocsHeroBackground.vue` 的 `:global(.dark) .x` 编译成裸 `.dark{}`，命中 `TxMarkdownView` / `TxMarkdownEditor` / `TxCodeEditor` 根节点 | content.md R2（compiler-sfc 复现） | talex-touch-87 在修；CMS / Inbox 的暗色截图等它落地 |
| `TxMarkdownEditor` 工具栏、`TxSplitButton` 默认 `menuIcon`、`TxStatusBadge os`、`TxIcon` 出错兜底用了 nexus 未安装的 `ri` / `simple-icons` 集合 | content.md R6 | 不用 MarkdownEditor；SplitButton 显式传 carbon `menu-icon`；不用 `os` |
| 实现阶段新发现（2026-09-24）：`TxImageUploader` 卸载时回收自己的 object URL（`TxTabs` 切页后头像变成坏图）；`TxBlockSlot` 每行是独立层叠上下文，`TxFlatSelect` 的就地下拉被下一行盖住；`TxTimeseriesChart` 会把所有 marker 的时间并进 x 轴范围；`TxVirtualList.scrollToIndex` 只会顶部对齐；`TxContextIndicator` 默认格式输出「200.0K」；`TxSources` 没有单行高亮 prop；`TxStreamMarkdown` / `TxMarkdownView` 正文固定 16px；`TxStatusBadge` 的 warning 图标是时钟；`TxStagger`、`TxDrawer`、`TxModal` 动效不理会 reduced motion | 各 impl agent 报告 | 模板层各自绕开（自管 URL、抬高该行层级、只传可见范围内的 marker、自写 reveal、传 formatter、nth-child 画环、局部覆盖字号、显式传图标、reduced motion 下不播 stagger） |
| 组件内写死、无 prop 可改的英文：`TxDataTable`「Select all / Select row」、`TxDatePicker` 星期表头与「previous / next / switch view」、`TxModal`「Close」、`TxDrawer`「Close drawer」、`TxSplitter`「Resize」、`TxInput` 清除按钮「Clear input」、`TxTagInput`「Remove tag」、`TxBreadcrumb`「Breadcrumb」、`TxAlert`「Close」、`TxConversationStream` 回底按钮、`TxToolConfirmation` aria 后缀、CoT / Reasoning 内置 orb 的 label | check-templates + impl 报告 | 记录，不在本任务修组件 |

## 7. 兼容与协作

- `DocsSidebar.vue`：与 talex-touch-87 分区不重叠（见 PRD Confirmed Facts）。动手前再 `git diff` 一次该文件，基于最新内容修改。
- `i18n/locales/{zh,en}.ts`：两个会话都在 `docsSidebar` 下追加键，编辑前重新读取，避免覆盖。
- 共享工作树：只 `git add` 本任务文件；不 commit，除非老板要求。

## 8. 回滚

- 模板页与 demo 是纯新增文件，删除即回滚。
- 共享文件改动（docs-suites.ts / DocsSidebar.vue / i18n / recategorize 脚本 / demo-registry.ts）都是局部插入，可逐段撤销。
- 先撤内容页再撤 taxonomy：顺序反了的话，残留页面的 category 不认识，会落进每个 suite 的 misc 兜底组。
