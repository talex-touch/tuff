# Design — Nexus 基础套件画廊整改 + 文档侧栏重设计

需求编号见 `prd.md`（R1–R8）。本文件只写技术方案、边界与取舍。

## 0. 边界与归属

| 需求 | 改动层 | 文件 |
| --- | --- | --- |
| R1 侧栏 | nexus 页面组件 | `apps/nexus/app/components/DocsSidebar.vue`、`app/components/docs/DocSection.vue`、`i18n/locales/{zh,en}.ts` |
| R2 `.dark` 泄漏 | nexus 页面组件 | `apps/nexus/app/components/docs/TuffexDocsHeroBackground.vue` |
| R3/R4/R5/R7.2 样品 | nexus 画廊 | `DocsComponentsGallery.vue`（仅 base 区域的对应格子 + `statusStates` 表）、`DocsComponentsGallery.css`（新规则放在 base 相关位置，不放文件末尾——末尾是 Pro 会话的 reset 按钮块） |
| R6 StatCard | tuffex 组件 | `stat-card/src/TxStatCard.vue`、`stat-card/__tests__/stat-card.test.ts`、`stat-card.{zh,en}.mdc` |
| R7.1 error 插画 | tuffex 组件 | `empty-state/src/TxEmptyState.vue`、相关测试、`empty-state.{zh,en}.mdc`、`error-state.{zh,en}.mdc` |
| R8 LayoutSkeleton | tuffex 组件 | `layout-skeleton/src/TxLayoutSkeleton.vue`、测试、`layout-skeleton.{zh,en}.mdc` |

并行会话分区（已互相确认）：
- Pro 画廊会话：在画廊 `<script setup>` 顶部加一行 `import ClientOnly from './DocsGallerySpecimen'`（本地覆盖全局 `ClientOnly`，给每格加 reset 按钮），改 `/* ── Pro band. ── */` 段与 `suite === 'pro'` 模板段，`copy` 对象只在末尾（`toolSummary` 之后）追加；CSS 追加在文件末尾。本任务不碰这些位置，也不往 `copy` 末尾加键——需要的双语文案放进各自的数据表（`statusStates` 等）。
- Templates 会话：改 `DocsSidebar.vue` 的 `SUITES` 条目、`SECTION_ORDER`、`suiteOverviewLink` / `selectSuite`，以及 `docs-suites.ts`、i18n 的 `docsSidebar.suites/categories`。本任务不改这些段落。

## 1. R2 — `.dark` 泄漏

Vue scoped CSS 对 `:global(X) Y` 的处理是**整条选择器替换为 X**，因此 `:global(.dark) .tuffex-docs-hero-bg__wash` 编译成 `.dark`。改为普通后代选择器：

```css
.dark .tuffex-docs-hero-bg__wash,
[data-theme='dark'] .tuffex-docs-hero-bg__wash { … }
```

scoped 编译会把 `[data-v-…]` 加到最后一个复合选择器上（`.dark .tuffex-docs-hero-bg__wash[data-v-5b06a29b]`），祖先 `.dark` 不需要作用域属性，语义正确。4 组规则（`:195–217`）都这样改。

影响：这些暗色规则自 2026-05-23（`848386f9c`）写下起从未作用到 hero 元素上，修复后 hero 第一次拿到作者设计的暗色样式（形状光斑 0.62 → 0.34、细描边、柔光投影）。实现时对 hero 做修复前后截图对比，观感差异报告给老板；若明显变差，退回方案是删除这 4 组从未生效的规则（等价于保持现状外观），同样消除泄漏。

验证点：`getComputedStyle(document.documentElement).backgroundImage === 'none'`；`document.styleSheets` 里不再存在 selector 恰为 `.dark` / `[data-theme="dark"]` 且来自该文件的规则；走真实导航路径（先进入组件文档页让该样式注入），并抽查 AI 套件页的 TxMarkdownView / TxStreamMarkdown 根节点。

## 2. R1 — 侧栏

### 2.1 结构

```
<nav class="docs-nav">
  <div class="docs-nav-head" (sticky, 底部 1px 分隔线)>
    <div class="docs-seg" role="group">           ← R1.1 分段控件（两个 NuxtLink）
    <TxDropdownMenu v-if="activeTopSection === 'components'"> ← R1.2 套件切换器
      #trigger: <button class="docs-suite-trigger" aria-haspopup="menu" :aria-expanded>
      items:    <TxDropdownItem v-for="suite in SUITES" role="menuitemradio" :aria-checked>
  </div>
  …列表（现有 DocSection / docs-nav-link 结构不变）
</nav>
```

- 分段控件：`display: grid; grid-template-columns: 1fr 1fr`，外框 `padding: 3px`、`border-radius: 10px`、inset ring；段 28px 高、`border-radius: 7px`（同心：10 − 3）。当前段实底（亮色为表面色、暗色为更亮的 `--tx-fill-color`，加 `--tx-elevation-1` 左上光源投影），非当前段用 `--docs-nav-ink`；hover 即时变色，不做颜色过渡。仍是 `NuxtLink` + `aria-current`，`:prefetch="false"` 保持。
- 切换器触发按钮：整宽 40px、`border-radius: 12px`、inset ring；左侧 28px 圆角方块（内缩 6px，圆角 6px 与外框同心）里放套件图标，中间套件名（13px / 600）+ 文档数胶囊（11px、`tabular-nums`，底色取墨色 8% 混色——触发器展开时自己占用轨道色；元数据未到时不显示），右侧上下箭头。整宽靠 `<TxDropdownMenu reference-full-width>` 透传到 `TxPopover`，不写宽度覆盖（见 anchor-overlay-chain 的 referenceFullWidth 链）。
- 浮层：复用 `TxDropdownMenu`（与 `LanguageToggle.vue` 同一套：`trigger="click"`、`placement="bottom-start"`、`min-width: 300`——比 230px 侧栏宽，让每行说明完整显示，面板可以越出侧栏右缘），它已提供方向键 / Home / End 导航、打开聚焦首项、Esc 关闭（`TxBaseAnchor` `closeOnEsc`）与点击外部关闭。每行放进 `TxDropdownItem` 默认插槽：图标方块 + 名称 + 一句说明（12px、单行省略）；`#right` 放文档数，当前套件显示对勾。行 `role="menuitemradio"` + `aria-checked`。选中调用现有 `selectSuite(suite.key)`。焦点：`TxDropdownMenu` 的 `focusFirstItem` 在面板仍 `visibility: hidden` 时执行而落空，侧栏按帧重试（上限 60 帧、关闭/卸载时取消）把焦点放到当前套件项；触发器上的 ↑/↓ 也能打开菜单；关闭后若焦点在 body 或仍在收起中的菜单项上，归还给触发按钮；菜单项 `@keydown.esc.stop`，避免移动端抽屉（`TxDrawer` 也监听 Esc）被一起关掉。`suiteOfRoute` 在组件元数据到达前先用各套件的 `standalonePages` 识别当前套件，SSR 与客户端首帧一致。
- 新增脚本（放在 `activeSuiteDef` 之后，不改 `SuiteDef` / `SUITES`）：
  - `SUITE_ICONS: Partial<Record<SuiteKey, string>>`，缺省回退 `i-carbon-folder`（图标类写在 SFC 里，nexus UnoCSS 会扫描到）。
  - `suiteDocCounts`：按 `componentItems` 的 `category` 经 `CATEGORY_SUITE_MAP` 统计；concepts 用其 `standalonePages` 实际存在的数量。
  - `suiteDescription(key)`：读 `docsSidebar.suiteDescriptions.<key>`，缺键时返回空串（`te()` 判断），Templates 会话补键前不报错。
  - `suiteMenuOpen` ref。
- 删除 `.docs-tab-row*` / `.docs-tab-link*` 样式与 `flex-wrap` 兜底；两行结构天然不折行。

### 2.2 列表

- `.docs-nav-link` 与 `.DocSection-Header--page`：`border-radius: 7px`、`padding: 5px 8px 5px 10px`、最小高 30px；hover 浅底（即时）；active = 主墨色 + `font-weight: 500` + 浅底 + 左侧 2px 强调条（`::before`，高 14px，垂直居中）。静止墨色走 `--docs-nav-ink`（亮色 `--tx-text-color-regular` ≈6.3:1，暗色 secondary ≈7.6:1），分组标题走 `--docs-nav-label`（亮色 regular/secondary 75/25 混色 ≈5:1，暗色 placeholder ≈5.9:1）——secondary 在亮色页上只有 3.1:1。家族折叠行包含当前页时只加重墨色，不叠底色和强调条（否则与成员行形成两个当前页）。
- 分组标题维持 11px 大写（这是设计规则允许 `letter-spacing` 的三种形态之一），组间距加大（`.DocSection` `margin-block` 调大、标题下间距小于组间距），体现"相关靠近、分组拉开"。
- `docs-page-performance.test.ts` 钉住的 DocSection 模板字符串（`<button\n      v-else`、`class="DocSection-Header DocSection-Header--group bg-transparent"`、`class="DocSection-Body"`、`grid-template-rows: 0fr/1fr`）与 DocsSidebar 的预取绑定全部保留。

### 2.3 i18n（只追加）

`docsSidebar.sections`（分段控件 `role="group"` 的 aria-label："文档分区" / "Docs sections"）、`docsSidebar.suiteSwitcher`（触发器里 `sr-only` 的前缀文字："组件套件" / "Component suite"，可见文字仍是套件名，满足 label-in-name）、`docsSidebar.suiteDescriptions.{concepts,base,pro,ai,data,flow}`。

## 3. 画廊样品（nexus）

- **R3 Container**：两个 `TxRow :gutter="8"`（12/12、8/16）放进新类 `.docs-gallery__rows { display: grid; gap: 8px }`。`TxRow` 不改。
- **R4 MarkdownView**：格内外包 `.docs-gallery__doc`——一个轻量"文档"框（顶部文件名条 `README.md`，1px ring、12px 圆角）；`markdownSample` 改为按 locale 的 computed，内容覆盖标题 / 强调 / 行内代码 / 列表 / 引用。字号与缩进用局部规则收敛：`.docs-gallery .docs-gallery__doc .markdown-body { font-size: 13px }`、`… ul { padding-left: 1.25em }`（3 个类，稳定压过组件自带 `:where(.tx-md) .markdown-body` 的 16px 与画廊 `ul/li` 重置；不改共享重置，Pro/AI 的 markdown 类样品依赖它）。
- **R5 SortableList**：插槽行不再复用 `.docs-gallery__scroll-row`；新类 `.docs-gallery__sort-row` 自带布局：手柄 → 24px 着色图标方块（`color-mix(in srgb, var(--tx-color-<hue>) 14%, transparent)` 底 + 同色图标——普通暗色主题下 success/warning 的 `-light-9` 仍混白，会变成浅色方块）→ 名称 → 右侧 `TxKbd` 快捷键。拖拽态沿用组件的 `--dragging` / `--over` 样式。
- **R6 样品**：`icon-class` 带上着色类（画廊 CSS 里定义 `.docs-gallery__stat-icon { color: var(--tx-color-primary) }`），数值与涨幅保持真实感。
- **R7.2 状态格**：`statusStates` 每项增加 `props`（按组件实际支持的 props 给出中英 `title` / `description`；ErrorState 另给 `primaryAction`）与可选 `blockClass`（LayoutSkeleton 给定高 `.docs-gallery__layout-skel`）。模板改为 `v-bind="state.props"`，不再给不接受 `title` 的组件（如 `TxLayoutSkeleton`）透传原生 `title` 属性。

## 4. tuffex 组件

### 4.1 R6 TxStatCard（方向 B）

保留 DOM 契约（测试依赖）：`__icon-layer > i.__icon`、`__decoration`、`__insight-icon`、`__insight-prefix`、`__insight-value`、`__insight-suffix`、`__label--top`、progress 相关类。

- 大号装饰图标：`.tx-stat-card__icon` 改为裁在右下角——`right: -12px; bottom: -16px; font-size: 88px`（选择器带作用域属性，优先级 (0,2,0) 稳定压过宿主 `text-6xl` 这类 (0,1,0) 工具类，颜色类仍生效），无模糊；透明度亮暗共用 `--tx-stat-card-icon-opacity: 0.16`（hover 0.26），两种主题下实测都"看得见形状但不抢数字"，无需分主题取值。
- 柔光：只保留 `.tx-stat-card__glow`（右下角径向渐变，颜色来自现有 `updateGlowVars` 读取的图标计算色）；删除模糊放大的重复图标 `.tx-stat-card__decoration-icon`。`updateGlowVars` 增加"无彩色判定"（RGB 通道极差小于阈值即视为灰），灰色时不设置光晕变量并隐藏光晕——杜绝灰雾。
- hover：`border-color` 即时变化（移除其 `transition`，符合"hover 不过渡颜色"），图标 `translate(-4px, -4px)`，光晕 `opacity` 增强；`transform` / `opacity` 过渡在 `prefers-reduced-motion: reduce` 下关闭。移除 `scale(2.05)`、`blur`、`rotate(10deg)`。
- 涨幅：三个文本 span 包进 `.tx-stat-card__insight-text`（普通行内文本 + `white-space: nowrap`；做成 flex 行会让每个 span 吞掉前导空格，调用方 `suffix: ' pts'` 的空格就丢了），渲染为一个整体 `+16.7%`；整体做成胶囊（`color-mix(in srgb, currentColor 12%, transparent)` 底、999px 圆角、12px / 600、`tabular-nums`）。默认图标改用内联 SVG 箭头（上 / 下两种，`currentColor` 描边），不再依赖宿主扫描 `i-carbon-growth`；显式传入的 `insight.iconClass` 继续用 `<i :class>`。测试中"默认图标类为 `i-carbon-growth`"的断言相应改为断言内联 SVG。
- `progress` 变体不动。

### 4.2 R7.1 TxEmptyState error 插画

重画 `illustrationVariant === 'error'` 的 SVG，与同族插画（blank-slate 的"纸张 + 角标"）同构：一个应用窗口轮廓（圆角矩形 + 标题栏三点）+ 右下角 danger 色角标（圆 + 感叹号）。角标外一圈脉冲环写出真实的 `@keyframes`（scale + fade，2.4s，ease-out，无限），`prefers-reduced-motion: reduce` 时环隐藏、只留静止完整的一帧。颜色：线条沿用插画的 `currentColor`（次要墨色），角标用 `--tx-color-danger` 及其 light 阶。类名以 `tx-empty-state__error-*` 命名并补齐对应 CSS。

### 4.3 R8 TxLayoutSkeleton

保留类名与数量（测试依赖：`__header-line`、6 个 `__sidebar-item`、8 个 `__content-line`、确定的宽度序列），重排尺寸与布局：

- 修正优先级：把通用 `.tx-layout-skeleton__line`（`height: 100%`）移到具体条规则之前，具体条改为显式高度（顶栏条 10px、侧栏文字 8px、内容线 8px、内容首行作为标题 12px）。
- 顶栏：整宽、`padding: 0 14px`、高 36px，底部 1px 分隔线；左侧品牌圆点 + 标题条，右侧两枚小胶囊（新增元素、新类名，纯增量）。
- 侧栏：`flex: 0 0 clamp(72px, 30%, 200px)`，右侧 1px 分隔线代替深色底块；条目去掉每行底色，只第一项作"当前项"浅底胶囊；圆点 14px。
- 内容区：透明底（不再用 `--tx-bg-color-page`），首行标题 + 段落线，第 3 行后留一段落间距。
- 保留 `skeleton-surface` mixin 与其自带的 reduced-motion 块（motion-contract 测试计数不变）。

### 4.4 文档同步（tuffex-docs-sync）

- `stat-card.{zh,en}.mdc`：更新视觉描述、交互契约（hover、无彩色图标不出光晕、涨幅胶囊与内联图标）、审阅说明（记录被否决的方向 A 与原因：保留 core-app 的大号彩色图标气质），demo 覆盖"着色大图标"。
- `empty-state.{zh,en}.mdc` / `error-state.{zh,en}.mdc`：error 插画新造型与 reduced-motion 行为。
- `layout-skeleton.{zh,en}.mdc`：新布局、窄容器行为、类名不变的说明。
- 其余命名这些组件的页面（data-table、status-badge、index、tuffex-composition、skeleton、offline-state）逐个确认没有行为性描述需要改。
- 新 demo 若新增则登记 `demo-registry.ts`（按字母序插入）。

### 4.5 dist 构建

`mkdir /tmp/tuffex-build.lock` 成功后在 `packages/tuffex` 执行 `node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`，结束 `rmdir`；构建期间 :3200 会短暂 503，完成后刷新验证。

## 5. 兼容与回退

- 所有 tuffex 改动不改 props / slots / events；core-app 6 处 `TxStatCard` 用法无需改代码。
- 每个需求改动相互独立，可按文件单独回退；`.dark` 修复的退回方案见 §1。

## 6. 追加（R9–R13，2026-09-24）

- **R9 StatCard 进度环**：`@property --tx-stat-card-progress` 改为 `inherits: true`（值绑定在 `.tx-stat-card__progress`，由子元素 `__progress-ring` 读取）；DOM 契约不变（测试断言值在父元素上）。过渡仍在环上，reduced-motion 块加入 `__progress-ring`。环中心圆盘去掉 `@supports` 覆盖（`rgba(0, 0, 0, 0.45)` 混色在亮色下是灰斑，也是裸 rgba），只留"16% 进度色 + 透明"。
- **R10 UpdatesAllView**：`:global(.dark) .X` → `.dark .X`（`:deep()` 部分同理），规则落在组件自己的元素上。
- **R11 DocsSuiteCatalog**：`server: false` 的请求在 SSR 为 `idle`、客户端首帧为 `pending`，旧代码按 `pending` 选分支导致两端分支不同。改为按 `status ∈ {success, error}`（settled）切换：SSR 与首帧都渲染骨架；`aria-busy` 与总数行同样按 settled。
- **R12 暗色填充 tint**：普通暗色块中 `primary-light-8` 与 success / warning / info 的 `-light-8/-9` 改为 `color-mix(in srgb, var(--tx-color-<hue>) 20%|10%, var(--tx-bg-color, #141414))`，与手调的 primary 阶梯同一规则（`#18222c` = 10%，`#1d3043` = 20%）。`-light-3/5/7` 不动：core-app `PluginStatus.vue` 把 `warning-light-7` 当彩色底上的文字色。消费者全部是底色用法（core-app 的 soft badge / banner / 选中行、tuffex `TxIconPickerPanel`、并行任务的 `TxModeChip`）。`src/__tests__/dark-fill-tints.test.ts` 守卫。
- **R13 EmptyState 动效兜底**：一个统一的 reduced-motion 块停掉其余 18 个动画选择器；静止样式恰是动画"隐藏起点"的部件显式设为终态：`chart-line` / `offline-slash` `stroke-dashoffset: 0`、`chart-dot` `opacity: 1`、`chart-marks` `opacity: 0.6`、`search-bubble` `transform: scale(1) translate(-50%, -10px)`；只在运动中存在的 `box-dust` 保持隐藏。`empty-state.test.ts` 扫描所有 `animation: tx-empty-state-*` 选择器，缺兜底即失败。
- **dist 与门禁**：重建两次（锁内）。tuffex CSS 体积门禁（全量 600 / 按需 608 KiB）因多个会话的增长合计超限，本任务净增约 +3.2 KiB（empty-state +2.6、layout-skeleton +0.8、stat-card −0.2）；2026-09-24 由并行任务 09-23-composer-motion-reference 在其 07:31 重建后统一上调（全量 600→608、按需 608→616 KiB），`scripts/audit-package-size.mjs` 的说明逐项列出两任务的份额；门禁复测为绿。
