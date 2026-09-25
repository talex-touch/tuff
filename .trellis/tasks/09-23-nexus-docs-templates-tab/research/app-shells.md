# Research: 应用框架分组模板（Shell 应用外壳 / Launcher 启动器 / Settings 设置中心）

- **Query**: 为「模板 Templates」tab 的应用框架分组收集真实 tuffex 组件的导入方式、组合相关 API、尺寸/浮层/动效行为、可借鉴 demo 与坑点，并给出三份组合方案。
- **Scope**: internal（tuffex 源码 + Nexus demo 机制 + 文档页 + spec + 2026-09-21 生产构建产物 `apps/nexus/dist/_nuxt`）；未做外部检索。
- **Date**: 2026-09-23
- **基线**: tuffex 源码读于 2026-09-23。`stat-card/src/TxStatCard.vue` 在调研期间被并行会话（`09-23-nexus-base-gallery-sidebar` R6）改动且**未提交**（+130/−103）。API 不变，但视觉与本文件记录的"旧版"不同，见 Risks R8。

---

## 结论速览

1. **组件零 import**：`apps/nexus/modules/tuffex-components.ts` 把每个组件 barrel 的 `Tx*`/`Tuff*` 导出全局注册，模板里直接写 `<TxSidebarNav>`。类型走 `import type … from '@talex-touch/tuffex/<dir>'`；函数/composable 必须显式 import。
2. **生产构建里组件有两份（高风险，已找到构建产物证据）**：全局注册的组件在生产环境解析到 tuffex **源码**，而 `@talex-touch/tuffex/utils` 和 `@talex-touch/tuffex/<dir>` 解析到 **dist**。两份各自持有模块状态（toast 队列、z-index 分配器、anchor-delay 服务）。
   - 已在 2026-09-21 的生产包里核实：`toast()` 推进 A 队列，自动注册的 `<TxToastHost>` 读 B 队列，所以生产环境永远不显示 toast。
   - dev 下两者都走 dist，**ego 在 dev 截图发现不了这个问题**。详见 Risks R1。
3. **浮层一律在视口层**：`TxCommandPalette` / `TxModal` / `TxToastHost` / 下拉 / 提示 / `TxSelect` 面板都 teleport 到 `body`，z-index 从分配器 2000 起发放。
   - Nexus 顶栏的 z-index 是 10000，这些浮层默认画在顶栏**下面**。
   - 展开浮层（D6）必须和组件用**同一份**分配器抬高下限，里面弹出的菜单才能盖住浮层。见 R2。
4. **`TxToastPanel` 是唯一受控、就地渲染的"通知"组件**，不会跑出模板框。Shell 的通知优先用它，而不是全局 `toast()`。
5. **快捷键冲突**：`app.vue` 在 `window` 上监听 ⌘/Ctrl+K 和 `/`，用来打开 Nexus 全站搜索。
   - `TxSidebarNav` 只要设了单字符 `searchHint`（如 `/`），就会在 `document` 上抢走全站的 `/`。
   - 模板的 ⌘K 只能挂在模板根元素的 keydown 上并调用 `preventDefault()`。见 R3。
6. **模板根节点必须加 `not-prose`**。否则 docs 正文的三套 prose 样式会作用到模板里的 `p/ul/li/h3/code/strong`；teleport 到展开浮层后这些样式又会消失，造成版式跳变。见 R4。
7. **缺失能力（需要宿主补）**：
   - `TxSidebarNav` 没有折叠/图标栏模式。
   - `TxSearchPanel` 不上报"当前高亮项"，行高固定 32px，列表不限高，字段与列表之间没有插槽。
   - `TxSearchInput` 没有 suffix 插槽。
   - `TxDropdownItem` 没有图标 prop。
   - `TxTabs` 用可见标签充当 key，除非改用 `#name` 插槽。
   - 以上都能用组合或少量宿主 CSS/JS 绕过，不需要改 tuffex。
8. **不要在文档页使用** `TxTouchTip` / `TxBottomDialog`：它们在打开期间把任何滚动都强制拉回 `scrollTo({ top: 0 })`。确认弹窗用 `TxModal`。

---

## Files Found

| 路径 | 说明 |
|---|---|
| `apps/nexus/modules/tuffex-components.ts:30,37,91-97,124` | 全局注册：名字正则、跳过聚合目录、dev/prod 前缀切换、`addComponent` |
| `apps/nexus/nuxt.config.ts:46-47,58-60,553-558` | `tuffexComponentAutoImportEntry`（prod→源码）、`tuffexDistUtilsEntry`（prod→dist）、Vite 别名 |
| `apps/nexus/build/tuffex-dev-mode.ts` | 生产恒为 `dist` 模式，dev 默认 dist，`NUXT_TUFFEX_SOURCE=true` 切源码 |
| `apps/nexus/app/components/content/TuffDemoWrapper.vue:76-110,278-284,361-364` | 重置分发（`resetDemo ?? replayDemo ?? reset ?? replay`，否则 key 重挂载）；窗口 `overflow:hidden`；预览区 `padding:28px` |
| `apps/nexus/app/components/content/TuffDemoClientRenderer.client.vue:109` | demo 实例 ref 与 renderKey |
| `apps/nexus/app/app.vue:162-186,204` | 全站 ⌘/Ctrl+K 与 `/` 快捷键（window keydown，检查 `defaultPrevented` 与可编辑目标） |
| `apps/nexus/app/utils/layers.ts` / `layers.test.ts` | `NEXUS_OVERLAY_LAYER_SEED = 10100`、`reserveOverlayLayer()`（经 `@talex-touch/tuffex/utils` → dist） |
| `apps/nexus/app/components/TheHeader.vue:221` | 顶栏 `z-index: 10000` |
| `apps/nexus/app/components/search/GlobalSearch.vue:5` | 先例：**显式** `import { TxCommandPalette } from '@talex-touch/tuffex/command-palette'`，与 `reserveOverlayLayer` 同一份 dist |
| `apps/nexus/app/pages/docs/[...slug].vue:2091,2618-2720` | 正文容器 `.docs-prose.markdown-body.prose`；规则全部带 `:not(:where(.not-prose, .not-prose *))` |
| `apps/nexus/uno.config.ts` | UnoCSS 扫描 `.vue` 整个文件；图标集只有 carbon/cib/logos/twemoji |
| `apps/nexus/dist/_nuxt/COAt5s3g.js`、`DaT6A3W3.js`、`nd79IHVz.js` | 2026-09-21 生产包：toast 队列两份的证据（R1） |
| `.trellis/spec/frontend/tuffex-docs-sync.md` §Demos | demo 约定：`useI18n()` + `copy` computed，`onBeforeUnmount` 清理计时器 |
| `.trellis/spec/frontend/bui-component-family.md` | BUI 令牌层、注册链第 3 条（composable 不注册） |
| `.trellis/spec/frontend/anchor-overlay-chain.md` | 锚定浮层链、`initialFocus`、打开后聚焦在 Chromium 下的 rAF 重试 |
| `.trellis/spec/frontend/tuffex-design-rules.md` | 13–14px 正文、句子大小写标题、每个 transition 都要有 reduced-motion、禁止卡片套卡片、令牌取色 |

---

## Import convention

**1. 组件：零 import，直接写全局名。**

- `modules/tuffex-components.ts:30` 用 `^(?:Tx|Tuff)[A-Z][A-Za-z0-9]*$` 匹配每个 `src/<dir>/index.ts` 的 `export { … }`，并跟随一层 `export *`（`breadcrumb` 就是 `export * from './src'`）。
- 跳过 `ai/base/pro/utils` 四个聚合目录（:37），逐名 `addComponent`（:124）。
- `A as B` 按 B 注册：`TxCheckbox` 来自 `export { TuffCheckbox as TxCheckbox }`，`TxFlatInput` 来自 `FlatInput as TxFlatInput`。
- 已核对本分组可用的全局名：
  - `TxSidebarNav`、`TxBreadcrumb`、`TxCommandPalette`、`TxSearchInput`、`TxKbd`、`TxAvatar`、`TxAvatarGroup`、`TxBadge`、`TxStatusBadge`、`TxStatCard`、`TxSparkChart`、`TxChartScrubber`
  - `TxTimeline`、`TxTimelineItem`、`TxToastHost`、`TxToastPanel`、`TxDropdownMenu`、`TxDropdownItem`、`TxDropdownSubmenu`、`TxButton`、`TxIconButton`、`TxSplitButton`、`TxTooltip`、`TxPopover`、`TxIcon`
  - `TxSearchPanel`、`TxIconChip`、`TxTag`、`TxGlassSurface`、`TxMarkdownView`、`TxFilterChips`、`TxTabBar`、`TxSearchEmpty`、`TxEmptyState`、`TxVirtualList`
  - `TxTabs`、`TxTabItem`、`TxTabItemGroup`、`TxTabHeader`、`TxGroupBlock`、`TxBlockLine`、`TxBlockSlot`、`TxBlockSwitch`、`TxBlockInput`、`TxBlockSelect`
  - `TxSwitch`/`TuffSwitch`、`TxFlatSelect`、`TxFlatSelectItem`、`TxSelect`/`TuffSelect`、`TxSelectItem`/`TuffSelectItem`、`TxSlider`、`TxSegmentedSlider`、`TxSensitiveInput`、`TxFlatRadio`、`TxFlatRadioItem`、`TxRadio`、`TxRadioGroup`、`TxCheckbox`、`TxNumberInput`、`TxInput`/`TuffInput`、`TxFlatInput`、`TxAlert`
  - `TxModal`、`TxBlowDialog`、`TxBottomDialog`、`TxPopperDialog`、`TxTouchTip`、`TxImageUploader`
- 解析目标（**关键**）：
  - dev 默认 dist 模式：前缀 `@talex-touch/tuffex/<dir>` → `packages/tuffex/dist/es/<dir>/index.js`（`.nuxt/components.d.ts` 显示 `TxToastHost: typeof import("@talex-touch/tuffex/toast")`）。
  - 生产：`useTuffexSource = nuxt.options.dev !== true`（`modules/tuffex-components.ts:92`）→ 前缀 `@tuffex-components/<dir>` → 别名 `nuxt.config.ts:553` → `tuffexComponentAutoImportEntry` → 源码 `packages/tuffex/packages/components/src/<dir>/index.ts`（`nuxt.config.ts:47`）。
- 部分 demo（group-block 家族、`IconMorphIconMorphDemo`、`SensitiveInputSensitiveInputDemo`）显式 `import { TxX } from '@talex-touch/tuffex/<dir>'`。dev 下无害，**生产下这是 dist 的另一份拷贝**；它们自己内部一致，但不能和自动注册的父/子组件混用（R1）。

**2. 类型：`import type { … } from '@talex-touch/tuffex/<dir>'`（主流写法）。**

- 例：`ComponentsNavigationShellDemo.vue:2`（`StatusTone`）、`ComponentsReleasePolicyDemo.vue:2-4`（`CascaderNode`/`TxFlatSelectValue`/`SegmentedSliderSegment`）、`ToastToastDemo.vue:2-3`。
- 8 个 demo 用站内别名 `@tuffex-components/<dir>` 引类型（如 `CommandPaletteCommandPaletteDemo.vue:2`、`StatCardInsightVariantDemo.vue:2`）。能用，但 mdc `code:` 片段应该写公开子路径。

**3. 函数/composable：显式 value import，不会被注册。**

- `toast` / `dismissToast` / `clearToasts` / `nextZIndex` / `refreshZIndex` / `getZIndex` 来自 utils barrel（`packages/tuffex/packages/utils/index.ts` 全部 re-export）。
- `useIndicatorBox` 来自 `@talex-touch/tuffex/sidebar-nav`。
- **模板里建议从 `@tuffex-components/utils` 取运行时工具函数**，而不是 `@talex-touch/tuffex/utils`。原因（R1）：
  - 该别名在 dev 解析到 `dist/es/utils/index.js`，在生产解析到 `src/utils/index.ts`（`export * from '../../../utils'`）。
  - 两种模式下都与自动注册组件落在同一份模块，TS 路径也覆盖（`nuxt.config.ts` `'@tuffex-components/*'`）。
  - **尚未在生产构建里验证**，落地前用隔离 worktree 跑一次 `node nuxt.mjs build`（见 memory `nexus-isolated-prod-build-worktree`）。

**4. 周边约定（与现有 demo 一致）**

- i18n：自动导入的 `useI18n()`，`locale.value === 'zh'`，文案放在 `copy`/`labels` computed（`tuffex-docs-sync.md` §Demos 第 1 条）。
- reduced-motion：`import { hasWindow } from '@talex-touch/utils/env'`，写法照 `AiSuiteStreamingAnswerDemo.vue:74-103`：JS 计时器自行检测，直接落到终态。
- 重置/重播：`defineExpose({ replayDemo })`（先例 `ProgressBarUploadDemo.vue:62`、`BaseAnchorBeadDemo.vue:37`）。wrapper 调用顺序见 `TuffDemoWrapper.vue:81-110`；没有暴露方法时 `renderKey++` 整体重挂载。
- 图标：只有 `i-carbon-*` 等 4 个集合（`apps/nexus/package.json:46,77-79`）。class 字面量写在 `.vue` 里即可被 Uno 抽取（整文件扫描，含 `<script>`）。
- helper 子组件可以放在 `demos/` 旁边，但必须被某个 demo 以 `from './X.vue'` 引入（`build/check-demo-registry-orphans.mjs:48-60`）。
- demo 只在客户端渲染（`TuffDemoWrapper` 用 `ClientOnly` + `LazyTuffDemoClientRenderer`），模板内不必再包 `ClientOnly`，也没有 SSR 水合问题。

---

## Component cheat sheets

> 除注明外，路径前缀为 `packages/tuffex/packages/components/src/`。"BUI" 表示吃 `--tx-bui-*` 令牌（`style/bui-tokens.scss`），不跟随 `--tx-color-primary`。

### TxSidebarNav（BUI）

- **Props**（`sidebar-nav/src/types.ts:37-66`；默认值 `TxSidebarNav.vue:10-14`）：
  - `items: SidebarNavItem[]`（必填）、`groups?: SidebarNavGroup[]`
  - `modelValue?: string|number`（v-model）、`query?: string`（v-model:query）
  - `workspace?`（省略即去掉切换器）、`workspaceLabel='Switch workspace'`
  - `searchPlaceholder?`（省略即去掉搜索行）、`searchLabel?`、`searchHint?`
  - `actionLabel?`（省略即去掉主按钮）、`filter?(items, query)`
  - `ariaLabel='Workspace'`、`indicatorDuration=220`
- **数据接口**：

  ```ts
  interface SidebarNavItem { value: string|number; label: string; group?: string; icon?: string; badge?: string|number; action?: { label: string }; disabled?: boolean }
  interface SidebarNavGroup { key: string; label: string }          // label 由 CSS 转大写，按正常大小写传
  interface SidebarNavWorkspace { name: string; description?: string; initials?: string }
  ```

- **Events**：`update:modelValue`、`update:query`、`select(item)`、`action()`、`itemAction(item)`、`workspaceClick()`。
- **Slots**（:18-25）：`workspace`（整块替换）、`item-icon {item, active}`、`footer`（组列表下方）。
- **Expose**（:176-180）：`focusSearch()`、`refreshIndicator()`。
- **尺寸**：
  - 宽度 `var(--tx-bui-sidebar-nav-width, 240px)`（:340），这个变量未写进文档，是源码里的覆盖点。
  - 自带卡片外观：`surface` 背景、raised 环形阴影、radius 10。
  - **没有高度约束，也没有内部滚动**，宿主要自己限高并加 `overflow:auto`。
  - 标签超长省略；没有折叠/图标栏模式。
- **行为**：
  - 过滤是真实的（对 label 做 `includes`）；组内项被过滤光时组标题也会收起。
  - `badge` 值变化会以 `:key` 重播 pop-in。
  - 滑动高亮板通过 `useIndicatorBox` 用 ResizeObserver 测量（`packages/tuffex/packages/utils/use-indicator-box.ts`），teleport 或尺寸变化后会自动重测。
- **键盘/监听**：
  - 只有单字符 `searchHint` 才会在 `document` 上挂 keydown（:133-170），命中时 `preventDefault()` 并聚焦搜索框。多字符（`'⌘K'`）只是展示用的字形。
  - 注意：`document` 监听先于 `app.vue` 的 `window` 监听执行，所以 `search-hint="/"` 会让整个 docs 页的 `/` 失效，现有 `SidebarNavSidebarNavDemo` 就是这样（R3）。
- **动效**：transition 全部有 reduced-motion 兜底（:693-703）。
- **借鉴**：`apps/nexus/app/components/content/demos/SidebarNavSidebarNavDemo.vue`。它用 `#item-icon` 渲染内联 SVG 路径（BUI 描边风格），演示分组、badge 自增和 `itemAction`。

### TxBreadcrumb

- **Props**：`items: BreadcrumbItem[]`、`separatorIcon='i-carbon-chevron-right'`（`breadcrumb/src/TxBreadcrumb.vue:11-13`）。

  ```ts
  interface BreadcrumbItem { label: string; href?: string; icon?: string; disabled?: boolean }
  ```

- **Event**：`click(item, index)`。只有"无 href、非末项、未禁用"的项会触发，这类项渲染为 `<button>`（:21-37）。
- **行为**：
  - 末项为当前页（`<span aria-current="page">`）。
  - **带 `href` 的项渲染成真 `<a>`，点击会让 docs 页跳走**。`BreadcrumbBreadcrumbTrailDemo.vue:10` 用了 `href: '/'`，不要照抄。
- **尺寸**：单行 flex，不换行；每项 `padding:4px 8px`、14px；没有省略。在窄容器里要少放项或加宿主省略。
- 无动效、无监听。

### TxCommandPalette

- **Props**（`command-palette/src/types.ts:15-29`；默认 `TxCommandPalette.vue:13-21`）：
  - `modelValue: boolean`（必填）、`commands=[]`
  - `placeholder='Search commands'`、`emptyText='No commands found'`、`maxHeight=320`
  - `autoFocus=true`、`closeOnSelect=true`
  - `overlayClass?`、`panelClass?`、`query?`（v-model:query）、`ariaLabel='Command palette'`
- **数据接口**：

  ```ts
  interface CommandPaletteItem { id: string; title: string; description?: string; keywords?: string[]; icon?: TxIconSource | string; shortcut?: string; disabled?: boolean }
  ```

- **Events**：`update:modelValue`、`select(item)`、`open`、`close`、`update:query`。
- **Slots**：`empty {query, emptyText}`、`footer {query, visibleCount}`。无 expose。
- **浮层**：
  - `Teleport to="body"`（:293）；遮罩 `position:fixed; inset:0`，底色 `rgba(15,23,42,.35)`。
  - 面板位于 `10vh`，宽 `min(90vw,560px)`（:385-402）。
  - 每次打开从分配器取 `next()`（:95-101）。
  - **它是整页遮罩，没法限制在模板框内。**
- **焦点与键盘**：
  - 打开后聚焦输入框（`autoFocus`），Tab 在面板内循环（:142-174）。
  - Esc 仅在输入框 keydown 时生效，并会 `preventDefault`（:266-269）。
  - 不恢复焦点，不锁滚动。**不自带 ⌘K**，`shortcut` 字段只做展示。
  - 输入法组合态受保护。
- **动效**：`opacity .34s` 淡入淡出，没有 reduced-motion 规则（只有淡入淡出，可以接受）。
- **借鉴**：`CommandPaletteCommandPaletteDemo.vue`，有中英双语的 Tuff 风格命令：搜索文件 / 保存快速笔记 / 用浏览器打开 / 同步设置 / 管理员脚本（禁用）。

### TxSearchInput（基于 TxInput）

- **Props**：`modelValue=''`、`placeholder='Search'`、`disabled=false`、`clearable=true`、`remote=false`、`searchDebounce=200`（`search-input/src/TxSearchInput.vue:8-15`）。
- **Events**：`update:modelValue`、`input`、`focus`、`blur`、`clear`、`search`。回车触发；`remote` 时输入会防抖后触发。
- **Expose**（:68-78）：`focus`、`blur`、`clear`、`setValue`、`getValue`。
- **结构**：根是 `TuffInput`，`prefix` 插槽被搜索图标占用，**没有转发 suffix 插槽**，所以输入框内放不了 `TxKbd`。
- **尺寸**：宽 100%、高 32px、radius 12、1px 边框（`input/src/TxInput.vue`）。
- **透传**：attrs（包括 `@keydown.down` 之类）落到 TxInput 的内层 `<input>`（TxInput `inheritAttrs:false`，`class`/`style` 留在外层）。
- **样式覆盖**：`class` 挂在未加作用域的外层上，需要在宿主包一层再用 `:deep`（memory：tuffex-scoped-class-and-bui-reset-traps）。
- 防抖计时器在卸载时清理（:61-66）。
- **借鉴**：`SearchInputSearchInputDemo.vue`、`SearchInputSearchInputRemoteDemo.vue`。

### TxKbd

- **Props**：`size: 'sm'|'md'`（`'sm'`）、`tone: 'default'|'primary'`（`kbd/src/TxKbd.vue`）。默认插槽放键帽文字。
- `sm` 最小 22px，`md` 最小 26px；等宽 12/13px；渐变底加底边"唇"。纯展示。
- **借鉴**：`KbdKbdDemo.vue`。组合键写 `<TxKbd>⌘</TxKbd><TxKbd>K</TxKbd>` 或 `<TxKbd>⌘K</TxKbd>`。

### TxAvatar / TxAvatarGroup

- **Props**（`avatar/src/types.ts:13-24`）：
  - `src?`、`alt?`、`name?`：姓名取首词和末词首字母，单词名只取一个字母，中文名取首字。
  - `icon?`、`size='medium'`：可选 `'small'` 32 / `'medium'` 40 / `'large'` 48 / `'xlarge'` 64，或数字、`'Npx'`。
  - `status?: 'online'|'offline'|'busy'|'away'`、`shape='circle'|'square'|'rounded'`
  - `clickable=false`、`backgroundColor?`、`textColor?`
- **Event**：`click`（仅 clickable）。
- **键盘陷阱**：clickable 时根是 `div role=button tabindex=0`，Enter/Space 发出的是**组件事件**，不是原生 click。所以把它放进 `TxDropdownMenu #trigger` 时，键盘打不开菜单（base-anchor 在引用外层用 `@click.capture` 监听原生 click，`base-anchor/src/TxBaseAnchor.vue:1032`）。触发器要用原生 `<button>` 包住头像。
- **Group**：`max`、`size`、`overlap`、`hoverEffect`、`spreadOnHover`、`overflowPopover…`。
- 现有 demo 用 `https://avatars.githubusercontent.com/...`（外网依赖，国内网络不稳）。模板建议用 `name` + `backgroundColor` 显示首字母。

### TxBadge

- **Props**（`badge/src/types.ts`）：
  - `variant='default'|'primary'|'success'|'warning'|'error'`
  - `value=0`：数字经 `TxTextMorph` 按位滚动
  - `color?`、`dot?`
  - `open=true`：切换时播放滑入加 pop 动画，首次挂载不播
- **形态**：只是**行内小药丸**，不是包裹子元素的角标。铃铛上的计数要由宿主绝对定位。
- 有 reduced-motion 兜底。
- **借鉴**：`BadgeBadgeMotionDemo.vue`。

### TxStatusBadge

- **Props**（`status-badge/src/types.ts:27-76`）：`text`（必填）、`icon=''`、`status?: 'success'|'warning'|'danger'|'info'|'muted'`、`statusKey=''`、`size='sm'|'md'`（`'md'`）、`os?`、`osOnly?`。
- **Event**：`click`。
- 默认图标类为 `i-carbon-checkmark/time/close/information`（`TxStatusBadge.vue:42-48`），这些字面量在 Nexus 其他 `.vue` 中已存在，Uno 能生成。
- **借鉴**：`StatusBadgeRowDemo.vue`、`ComponentsNavigationShellDemo.vue:88,154`。

### TxStatCard

- **Props**（`stat-card/src/types.ts:14-29`）：
  - `value: number|string`（必填）、`label: string`（必填）
  - `iconClass=''`、`clickable=false`
  - `insight?: StatCardInsight`
  - `variant='default'|'progress'`、`progress?`、`meta?`、`ariaLabel?`

  ```ts
  interface StatCardInsight { from: number; to: number; type?: 'percent'|'delta'; color?: 'success'|'danger'|'warning'|'info'|string; iconClass?: string; suffix?: string; precision?: number }
  ```

- **Slots**：`label`、`value`、`meta`（仅 progress）。
- **没有 emits**：`@click` 是原生 click 透传；clickable 只加了光标样式，不可聚焦，键盘不可达。
- **尺寸**：宽 100%、`min-height:112px`、radius 16、`overflow:hidden`、`backdrop-filter: blur(16px)`；数值 28px/700。
- **光晕**：颜色取自图标的计算色，图标要带颜色类，否则是灰色（`text-[var(--tx-color-primary)]` 这类 Uno 任意值可用）。
- **正在重做（R8）**：
  - 旧版默认涨跌图标是 `i-carbon-growth` / `i-carbon-arrow-down`，其中 `arrow-down` 在 Nexus 里没有任何字面量引用，会留出空白。
  - 工作区版本改为内联 SVG 箭头，并新增 reduced-motion 块（当前 `:571`）。props/slots/events 不变（该任务 R6.3）。
- **借鉴**：`StatCardInsightVariantDemo.vue`（insight 数据形状）、`StatCardProgressVariantDemo.vue`。

### TxSparkChart / TxChartScrubber（BUI，canvas）

- **Props**（`spark-chart/src/types.ts:29-85`；默认 `TxSparkChart.vue:14-35`）：
  - `series: SparkSeries[]`、`theme='auto'`
  - `grid=false`、`gridLines=4`、`lineWidth=2.25`、`curve='monotone'`
  - `xAxis=false`、`yAxis=false`、`xTicks=3`、`yTicks=4`、`x/yTickFormat?`
  - `padding={top:24,right:0,bottom:22,left:0}`、`domain?`
  - `activeIndex?`（受控）、`interactive=true`、`baseline=true`、`endpoint=true`、`animation=true`、`ariaLabel?`

  ```ts
  interface SparkSeries { id: string; data: { time: number; value: number }[]; color?: string /* 可写 'var(--token)' */; label?: string }
  ```

- **Events**：`update:activeIndex`、`hover(i)`、`leave`。**Expose**：`redraw()`。
- **尺寸**：根和 canvas 都是 `width/height:100%`（:320-341），**父级必须给确定高度**（如 96–140px）。ResizeObserver 触发重测和重绘（:271-288），teleport 或放大后会自适应。
- **颜色**：绘制时从 `--tx-bui-accent/orange/green/red` 读取，`auto` 主题跟随 html 的 `.dark`。
- **动效**：进场和更新动画由 `charts/src/core/animate.ts:111-115` 在 reduced-motion 下关闭。
- **交互**：`tabindex=0`，方向键 / Home / End / Esc 移动十字线。
- **Scrubber**：
  - Props：`pointCount`（必填）、`activeIndex?`、`rows?: {label, value, color?}[]`、`timeLabel?`、`tooltip=true`、`anchorMargin=8`、`disabled?`。
  - 事件：`update:activeIndex`、`scrub`、`leave`。
  - 包在图表外面提供竖线和提示框。
- **借鉴**：`SparkChartSparkChartDemo.vue`（`series()` 生成等距样本、双系列、scrubber 联动）。

### TxTimeline / TxTimelineItem

- **Props**：
  - `TxTimeline`：`layout='vertical'|'horizontal'`。
  - `TxTimelineItem`：`title?`、`time?`、`icon?`（类名或内置名）、`color='default'|'primary'|'success'|'warning'|'error'`、`active=false`。
  - 默认插槽放描述（`timeline/src/types.ts`）。
- **尺寸**：
  - vertical：左侧 `padding-left:40px`，项间 `padding-bottom:24px`。
  - horizontal：`overflow-x:auto`，每项 `min-width:120px`。
- **暗色瑕疵**：圆点硬编码 `border: 2px solid #ffffff`（`TxTimelineItem.vue:103`），暗色主题下是一圈白环。点内图标 `font-size:6px`，几乎看不见。
- **动效**：组件没有任何动效。新条目的进场要宿主在插槽里包 `<TransitionGroup>`（不带 `tag` 即渲染 fragment，`:last-child` 规则仍然成立）。
- **借鉴**：`TimelineTimelineDemo.vue`（`{id,title,time,detail,color,icon,active}`）。

### 全局 Toast：`toast()` + TxToastHost

- **API**（`packages/tuffex/packages/utils/toast.ts:24-131`）：

  ```ts
  toast({ id?, title?, description?, variant?: 'default'|'info'|'success'|'warning'|'danger', duration? /*2600*/, action?: { label, onClick?(id), dismiss? } }): string
  ```

  另有 `dismissToast(id)`、`clearToasts()`、`pauseToasts()` / `resumeToasts()`。
- **Host props**（`toast/src/TxToastHost.vue`）：`position='bottom-right'`、`visibleToasts=3`、`expand=false`、`gap=14`、`offset=16`、`swipeToDismiss=true`。
- **Expose**：`pause`、`resume`、`expanded`。
- **浮层**：`teleport to="body"`，`position:fixed` 固定在**视口**角落，z-index 为 `toastStore.zIndex`（每次 `toast()` 调用 `nextZIndex()`）。
- **单宿主**：`toast/src/host-registry.ts` 规定第一个挂载的 host 负责渲染，后挂的保持空白；队列全站共享，`clearToasts()` 会清掉其他 demo 的 toast。
- **生产环境失效（R1，已有构建证据）**：自动注册的 `TxToastHost` 在生产读的是另一份队列。
- **借鉴**：`ToastToastDemo.vue`、`ComponentsFeedbackTaskCenterDemo.vue`。两者都受 R1 影响，且 `ToastToastDemo.fireStack` 的 `setTimeout` 没有清理。

### TxToastPanel（受控、就地渲染，推荐）

- **Props**（`toast-panel/src/types.ts:22-79`）：
  - `open=true`、`tether=true`、`tetherLength=28`、`side='below'|'above'`
  - `stack=1`：0–2 层，表示后面还有排队项
  - `ariaLabel='Latest item'`、`live='polite'|'off'`
- **Slots**：`default`（卡片内容）、`tether`。
- **布局**：
  - 在文档流内，宽 100%，**由宿主负责定位**（例如绝对定位挂在铃铛下方）。
  - 隐藏态是 `opacity:0 + translateY(-6px)`，仍然**占位**。所以要么预留空间，要么宿主绝对定位。
  - `role="status"` + `aria-live`。
- **动效**：reduced-motion 下只保留淡入。
- **借鉴**：`ToastPanelToastPanelDemo.vue`。它的 `replay()` 里 `setTimeout(420)` 未清理，模板需要自行清理。

### TxDropdownMenu / TxDropdownItem / TxDropdownSubmenu

- **Menu props**（默认 `dropdown-menu/src/TxDropdownMenu.vue:8-25`）：
  - `modelValue?`（不传即非受控）、`placement='bottom-start'`、`trigger='click'|'hover'`、`offset=6`
  - `closeOnSelect=true`、`initialFocus='first-item'|'none'`、`animation`
  - `minWidth=220`、`maxHeight=420`、`unlimitedHeight`、`referenceClass`、`panelCard`
  - `panelVariant='solid'`、`panelBackground='refraction'`、`panelShadow='soft'`、`panelRadius=18`、`panelPadding=8`
- **Menu events**：`update:modelValue`、`open`、`close`。**Slots**：`trigger`、`default`。
- **Item props**：`disabled`、`danger`、`arrow`、`closeOnSelect?`。事件 `select`。插槽 `default`（标题）、`right`。
- **没有 icon prop**，前置图标直接写在默认插槽里（`<i class="i-carbon-user" />`）。
- **浮层**：`TxPopover` → `TxTooltip` → `TxBaseAnchor`。
  - `Teleport body`（`base-anchor/src/TxBaseAnchor.vue:1037`）；`strategy:'absolute'` 用文档坐标，每帧 `autoUpdate`（:178-199）。
  - 打开时 `zIndex = next()`（:914）。
  - Esc 在 `document` 上关闭，且**不 `preventDefault`**（:831-839,994）。点击外部关闭。
  - 父子链关系靠 `TX_ANCHOR_NODE_KEY` provide/inject（spec `anchor-overlay-chain.md`）。
- **触发器**：用原生 `<button>` 或 `TxButton`/`TxIconButton`（见 TxAvatar 键盘陷阱）。
- **借鉴**：
  - `ComponentsNavigationShellDemo.vue:92-111`：原生 button 触发器 + `panel-background="refraction"`。
  - `DropdownMenuDropdownMenuNavDemo.vue`：`#right` 放图标。
  - `DropdownMenuDropdownSubmenuDemo.vue`。

### TxButton / TxIconButton

- **TxButton**（`button/src/types.ts:4-37`）：
  - `variant`：`'primary'|'secondary'|'ghost'|'danger'|'success'|'warning'|'info'|'flat'|'bare'`
  - `size='sm'|'md'|'lg'`，对应 26/32/38px（`button/src/size.ts`）
  - `block`、`type`（语义别名）、`plain`、`dashed`、`round`、`circle`
  - `loading`、`loadingVariant='spinner'|'bar'`、`disabled`、`border`、`icon`（类名）、`autofocus`、`nativeType`、`vibrate`
  - 事件 `click`，默认插槽；自带 `v-wave` 涟漪。
- **TxIconButton**（`button/src/icon-button.ts`）：`icon`、`label`（落到 `aria-label`）、`size='xs'|'sm'|'md'|'lg'`、`shape='square'|'circle'|'pill'`、`pressed`、`status`、`disabled`、`nativeType`。原生 button，适合做下拉/提示的触发器。
- **借鉴**：`AiSuiteChatShowcaseDemo.vue:104-106`（顶栏 `TxIconButton` 组）。

### TxTooltip

- **Props**（`tooltip/src/types.ts:11-32`）：
  - `modelValue?`、`content=''`、`disabled`
  - `trigger='hover'|'click'|'focus'|'manual'`、`openDelay?`、`closeDelay?`、`maxHeight?`
  - `referenceFullWidth`、`interactive`、`keepAliveContent`、`closeOnClickOutside?`、`toggleOnReferenceClick?`
  - `layer='hint'`、`role='tooltip'`、`unstyled`、`anchor?`
- **Slots**：默认插槽是引用元素（外包 `span.tx-tooltip__reference`），`#content {side}`。
- **浮层**：同 base-anchor（teleport、分配器、document 级 Esc）。
- **借鉴**：`TooltipButtonDemo.vue`（`<TxTooltip :content><TxButton icon circle/></TxTooltip>`）。

### TxSearchPanel（BUI，内联组合框）

- **Props**（`search-panel/src/types.ts:11-51`；默认 `TxSearchPanel.vue:9-22`）：
  - `modelValue=''`、`items=[]`、`placeholder='Search'`、`ariaLabel?`
  - `idleCount=5`：空查询时显示前 N 项，0 表示全部
  - `emptyThreshold=3`：少于 3 个字符不显示空态
  - `emptyTitle` / `emptyDescription` / `clearLabel` / `listLabel`
  - `minHeight=248`、`filter?`、`clearable=true`、`disabled`

  ```ts
  interface SearchPanelItem { id: string; label: string; keywords?: string[]; disabled?: boolean }
  ```

  运行时可以塞额外字段（图标、种类、副标题），`#item` 插槽拿到的是同一个对象；TS 上要自己收窄类型，或按 `id` 查表。
- **Events**：`update:modelValue`、`queryChange`、`select(item)`（点击或回车；**不会把 label 回写到输入框**）、`clear`。
- **Slots**（:26-33）：`item {item, active, query}`（替换行内容）、`empty {query}`、`footer`（卡片内、列表下方）。
- **Expose**（:186-190）：`focus`、`blur`、`clear`。**没有暴露 input 元素和 activeIndex。**
- **键盘**（:138-179）：↑ / ↓ / Home / End / Enter，Esc 清空（查询为空时不处理，事件继续冒泡）；有输入法组合态保护；ARIA 组合框加 `aria-activedescendant`（选项 id 为 `${uid}-opt-${i}`）。
- **尺寸**：
  - `max-width: var(--tx-bui-search-panel-max-width, 288px)`（:302），**默认只有 288px 宽**，要在宿主上把变量设为 `none`。
  - `min-height` 保留高度（:304）。
  - 输入框 40px / 13px（:315-356）。
  - **每行固定 `height:32px`、不换行**（:388-415）。
  - **列表没有 max-height，也没有 overflow**（:384-386），而且高亮移动时**不会自动 scrollIntoView**。
  - 卡片自带背景、环形阴影和 radius 10。
- **动效**：清除按钮、选项、空态都用 `tx-bui-fade-in`，均有 reduced-motion 兜底（:443-455）。
- 空态内部就是 `TxSearchEmpty`，并用 `icon` 插槽换成了静态图标（不动）。
- **借鉴**：`SearchPanelSearchPanelDemo.vue`；文档 `search-panel.zh.mdc` 有「与 TxCommandPalette 的分工」一节。

### TxIconChip（BUI）

- **Props**（`icon-chip/src/types.ts`）：
  - `size=14`、`radius`（默认 size/4）、`tone='neutral'|'ink'|'accent'|'green'|'orange'|'red'`
  - `variant='solid'|'soft'`、`shape='square'|'circle'`
  - `label?`、`fontSize?`（默认 max(7, size×0.4)）、`ariaLabel?`（不传即 `aria-hidden`）
- **插槽**：直接子 `<svg>` 占 62%；`<i class="i-carbon-x">` 按字号放大（Uno 图标为 1.2em），28px 芯片约 13px 图标。
- **借鉴**：`IconChipIconChipDemo.vue`；`TxSidebarNav` 工作区徽标就是 `TxIconChip size=32 tone=ink`。

### TxTag

- **Props**（`tag/src/types.ts:22-110`）：
  - `label`、`icon`、`color='var(--tx-color-primary)'`、`background`、`border`
  - `size='sm'|'md'`（`'sm'`，11px）、`pill`、`variant='outline'|'soft'|'plain'`
  - `dot?`、`dotSize=6`、`count?`、`closable`、`closeAriaLabel='Remove tag'`、`disabled`
- **Events**：`close`、`click`。
- **借鉴**：`TagIconDemo.vue`、`ComponentsReleasePolicyDemo.vue:258-262`。

### TxGlassSurface

- **Props**（类型在 `glass-surface/index.ts:4-40`；默认 `TxGlassSurface.vue:10-28`）：
  - 尺寸：`width='200px'`、`height='200px'`、`borderRadius=20`、`borderWidth=0.07`
  - 光学：`brightness=70`、`opacity=0.93`、`blur=11`、`displace=0.5`、`backgroundOpacity=0`、`saturation=1`
  - 折射：`distortionScale=-180`、`red/green/blueOffset=0/10/20`、`x/yChannel='R'/'G'`、`mixBlendMode='difference'`
  - **必须显式传宽高**，可用 `'100%'` 或数字。
- **插槽**：`.tx-glass-surface__content` 是 `width/height:100%` 的 flex **居中**容器。放一个 `width:100%; height:100%` 的块子元素，再在里面自行布局。
- **渲染路径**（:51-65,133-169）：
  - Chromium：SVG 位移滤镜做 `backdrop-filter`。
  - Safari / Firefox：`blur` 回退，加 22% 蒙版底色和 1px 边。
  - 两者都不支持：40% 蒙版。
  - 蒙版颜色 `--tx-surface-refraction-mask-rgb` 随主题变化（浅色白、暗色黑，`style/variables.scss:140,255,467`）。
- **要求**：根节点 `overflow:hidden`，**背后需要有丰富背景**（渐变、图案），否则看不出玻璃感。
- ResizeObserver 重算位移图，计时器会清理。
- **借鉴**：`GlassSurfaceGlassSurfaceDemo.vue`（彩色渐变加网格背景）。

### TxMarkdownView

- **Props**：`content`（必填）、`sanitize=true`、`theme='auto'|'light'|'dark'`（`markdown-view/src/types.ts`）。
- **净化**：`sanitize` 为 true 时动态加载 DOMPurify，**加载完成前输出空字符串**（:23-58,136-142）。预览区应只保留一个实例、只换 `content`，不要按条目加 `:key` 重挂载，否则每次都会闪白。
- **主题**：`auto` 用 MutationObserver 监听 html/body 的 `class` / `data-theme`，卸载时断开。
- **渲染与样式**：
  - `v-html` 输出；基础 14px，h1/h2/h3 为 1.75/1.5/1.25em，预览面板里要用 `:deep` 调小。
  - 链接是真 `<a>`，点击会导航 docs 页。
  - 代码块没有语法高亮，也不限高，外面要包滚动容器。
  - 样式限定在 `:where(.tx-md) .markdown-body` 下。docs 自己的 `.markdown-body` 表同样会命中，除非模板根有 `not-prose`（R4）。
- **借鉴**：`MarkdownViewMarkdownViewDemo.vue`、`MarkdownViewLightDarkDemo.vue`。

### TxFilterChips（BUI）

- **Props**（运行时声明，`filter-chips/src/TxFilterChips.vue:16-24`）：
  - `modelValue?`、`items=[]`、`disabled=false`、`role='toolbar'|'tablist'`
  - `indicator=true`（滑动底板）、`iconOnly=false`、`ariaLabel='Filters'`

  ```ts
  interface FilterChipItem { value: string|number; label: string; iconClass?: string; dot?: string; count?: number; disabled?: boolean }
  ```

- **Events**：`update:modelValue`、`change`。**Slot**：`chip {item, active}`。
- **尺寸**（:285-296）：flex、gap 4、`margin:0 -4px 4px`、`padding:4px`、`overflow-x:auto`（隐藏滚动条）。窄容器里横向滚动，不换行。
- **键盘**：toolbar 模式下方向键只移动焦点，不改筛选。
- reduced-motion 兜底（:328,377）。
- **借鉴**：`FilterChipsFilterChipsDemo.vue`：计数从数据推导，不要写死。

### TxTabBar（不推荐用于本分组）

- 移动端底部标签栏：`fixed`、`safeAreaBottom`、`zIndex`（默认 `--tx-tab-bar-z-index` 2000），图标在上、文字在下，背景有模糊（`tab-bar/src/TxTabBar.vue:184-198`）。
- 启动器的范围筛选用 `TxFilterChips`。

### TxSearchEmpty / TxEmptyState

- `TxSearchEmpty` = `TxEmptyState variant="search-empty"`，props 相同但不含 `variant`。
- **Props**（`empty-state/src/types.ts:34-48`）：
  - `title?`、`description?`、`icon?`、`iconSize?`
  - `layout='vertical'|'horizontal'`、`align='center'`、`size='medium'`、`surface='plain'|'card'`
  - `primaryAction?` / `secondaryAction?: { label, type?, variant?, size?, disabled?, icon? }`、`actionSize='sm'`、`loading`
- **Events**：`primary`、`secondary`。**Slots**：`icon`、`title`、`description`、`actions`。
- **动效（坑）**：插画动画都是 `infinite`（`TxEmptyState.vue:498-896`），**没有任何 reduced-motion 规则**。用 `icon` 插槽换静态图标（TxSearchPanel 就是这样做的），或在宿主加 `:deep(.tx-empty-state *) { animation: none }`。
- 并行任务正在改 error 插画（R8）。

### TxVirtualList（启动器仅在需要长列表时使用）

- **Props**：`items`、`itemHeight`（必填，固定行高）、`height=320`、`overscan`、`itemKey`。
- **Emits**：`scroll({scrollTop, startIndex, endIndex})`。**Slot**：`item {item, index}`。
- **Expose**：`scrollToIndex`、`scrollToTop`、`scrollToBottom`。
- 自身带 `overflow:auto`。

### TxTabs / TxTabItem / TxTabItemGroup / TxTabHeader

- **Props**（`tabs/src/TxTabs.vue:62-82`）：
  - `modelValue?`、`defaultValue?`、`placement='left'`（`'left'|'right'|'top'|'bottom'`）、`offset=0`
  - `navMinWidth=220`、`navMaxWidth=320`（以**内联样式**写到导航上，CSS 无法覆盖）
  - `contentPadding=12`、`contentScrollable=true`、`borderless=false`、`autoHeight=false`、`autoWidth=false`
  - `showIndicator=true`、`indicatorVariant='line'|'pill'|'block'|'dot'|'outline'`、`indicatorMotion='stretch'|'warp'|'glide'|'snap'|'spring'`
  - `animation?: { size?, nav?, indicator?, content? }`
- **Events**：`update:modelValue`、`change`。插槽 `nav-right`（导航栏附加区）。
- **TxTabItem**：`name`（必填）、`iconClass`、`disabled`、`activation`（未受控时作为初始激活项）。
  - **`name` 同时是 key 和可见标签**，现有 demo 需要 `watch(locale)` 重置激活项（`ComponentsNavigationShellDemo.vue:69-75`）。
  - `TxTabItem` 支持 `#name` / `#icon` 插槽（`TxTabItem.vue:40-49`，TxTabs 经 `resolveTabNavSlots` 转发）。所以可以用稳定英文 key 作 `name`，本地化标签放进 `#name`。
- **TxTabItemGroup** `name`：在导航里渲染分组标题（12px 次要色，`TxTabs.vue:651-658,983-988`）。
- **TxTabHeader**：默认插槽拿到 `{ props: { node } }`（当前 TxTabItem 的 vnode），`position:sticky` 固定在内容区顶部。
- **只渲染当前面板**（`renderContent`，:667-690）：切换标签会卸载其余面板，**控件状态必须由模板持有**。
- **尺寸**：根 `height:100%`、1px 边框、radius 12（:893-903）；`contentScrollable` 时内容区 `overflow:auto`。**父级必须给高度。**
- **动效**：内容 zoom 180ms、指示器 350ms、导航 220ms，**没有 reduced-motion 兜底**（TxAutoSizer 也没有）。reduced-motion 时传 `:animation="{ content: false, indicator: false, nav: false, size: false }"`。
- **借鉴**：
  - `ComponentsNavigationShellDemo.vue:140-170`：`placement=left`、`nav-min-width=176`、`indicator-variant="pill"`、`indicator-motion="glide"`、`auto-height`。
  - `TabsPlacementHeaderSlotDemo.vue`：`TxTabHeader` + `nav-right`。

### TxGroupBlock 家族（TxGroupBlock / TxBlockSlot / TxBlockSwitch / TxBlockSelect / TxBlockInput / TxBlockLine）

- **TxGroupBlock**（`group-block/src/types.ts:10-63`；`TxGroupBlock.vue:13-22`）：
  - Props：`name`（必填）、`description=''`、`defaultIcon` / `activeIcon`、`iconSize=22`、`collapsible=true`、`collapsed=false`、`defaultExpand?`、`memoryName=''`。
  - 事件：`update:expanded`、`toggle`。插槽：`icon {active}`、`header-extra {active}`、默认。
  - 头部高 56px，`margin-bottom:.7rem`，radius 12，1px 边框（:262-290）。
  - 展开/折叠用 **gsap**（0.45s / 0.35s，:118-163），**没有 reduced-motion 兜底**。
  - `memoryName` 会写 `localStorage`（`tuff-block-storage-*`），模板不要设，否则重播状态不确定。
- **TxBlockSlot**：
  - Props：`title`、`description`、`defaultIcon` / `activeIcon`、`iconSize=20`、`active`、`disabled`。插槽：`icon`、`label`、`tags`、默认（右侧控件区）。
  - **固定 `height:56px`**（`TxBlockSlot.vue:130`）。右侧控件区 `flex-shrink:0`，宽 100% 的控件要给显式宽度（如 `TxSensitiveInput`、`TxSlider` 给 220–260px）。
  - 按下时整行 `:active { transform: scale(0.985) }`（:220）。拖动行内滑块时整行会一直缩着。
  - 只有挂了 `@click` 时才可聚焦。
- **TxBlockSwitch**：
  - Props：`title`、`description`（**两者必填**）、`modelValue`（必填）、`defaultIcon` / `activeIcon`、`disabled`、`guidance`、`loading`。
  - 事件：`update:modelValue`、`change`、`click`（仅 guidance）。插槽：`tags`。
  - **点整行不会切换开关**，只有点开关本身有效（:60-63）。
- **TxBlockSelect**：`title`、`description`、`modelValue`、`defaultIcon` / `activeIcon`、`disabled`、`placeholder`。默认插槽放 `TxSelectItem`；内部是 `TxSelect`（面板 teleport），宽 180px（:102）。
- **TxBlockInput**：
  - Props：`title`、`description`、`modelValue`、`disabled`、`placeholder`、`clearable`、`inputType='text'|'password'|'number'|'email'`。
  - 插槽 `control {value, focused}` 可以换成任意控件（core-app `SettingTools.vue:714-727` 就这样用）。输入框宽 180px，可收缩到 120px。
- **TxBlockLine**：`title`、`description`、`link`（为 true 时渲染 `<button>` 并发 `click`）。
- **借鉴**：
  - `GroupBlockGroupBlockDemo.vue`、`GroupBlockBlockSelectDemo.vue`、`GroupBlockBlockSlotDemo.vue`：注意它们显式 import 了 `@talex-touch/tuffex/group-block`，模板里不要混用（R1）。
  - 真实文案可取自 `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue:693-812` 与 `apps/core-app/src/renderer/src/modules/lang/en-US.json:430-470`（Context / Utilities / Auto paste / Auto hide / Shortcuts 等）。

### TxSwitch（TuffSwitch）

- **Props**（`switch/src/TxSwitch.vue`）：`modelValue=false`、`disabled`、`loading`（滑块变成转圈）、`size='small'|'default'|'large'`、`label?`、`labelPlacement='end'`、`ariaLabel='Toggle'`、`ariaLabelledby?`。
- **Events**：`update:modelValue`、`change`。
- reduced-motion 兜底（`switch/style/index.scss:271`）。

### TxFlatSelect / TxFlatSelectItem

- **Props**：`modelValue?`、`placeholder?`、`disabled?`；Item 为 `value`、`label?`、`disabled?`（`flat-select/src/types.ts`）。
- **浮层**：**不 teleport**。下拉是组件内 `position:absolute; z-index:3`，覆盖在触发器上并以当前项为中心展开，用 clip-path 过渡（`TxFlatSelect.vue:308-327,391-395`）。
  - 会被 `overflow:hidden/auto` 的祖先裁掉，包括 TxTabs 内容滚动区和 `.tuff-demo__window`。
  - 放在靠上位置，长列表改用 `TxSelect`。
- 触发器 34px，`min-width:120px`。
- **借鉴**：`FlatSelectBasicDemo.vue`、`ComponentsReleasePolicyDemo.vue:206-222`。

### TxSelect / TxSelectItem（TuffSelect）

- **Props**（`select/src/types.ts:26-58`，默认 `TxSelect.vue:15-47`）：
  - `modelValue=''`、`placeholder='Please select'`、`multiple`、`status`、`options=[]`
  - `searchable`、`editable`、`remote`、`allowCreate`、`loading`、`emptyText`
  - `dropdownMaxHeight=280`、`panelBackground='refraction'` …
- **选项**：可带 `icon`（前置图标块）和 `description`（第二行）：

  ```ts
  interface TxSelectOption { value: string|number; label: string; disabled?: boolean; icon?: string; description?: string }
  ```

- 下拉走 TxPopover（teleport + 分配器）。
- **借鉴**：`SelectSelectRichOptionsDemo.vue`（图标加描述）。

### TxSlider

- **Props**（`slider/src/types.ts:1-56`；默认 `TxSlider.vue:12-41`）：`modelValue=0`、`min=0`、`max=100`、`step=1`、`disabled`、`ariaLabel?`、`showValue=false`、`formatValue?`、`thumbSurface=true`、`thumbVariant='blur'`、`showTooltip=true`、`tooltipTrigger='drag'|'hover'|'always'`、`tooltipPlacement='top'`，另有一组 jelly/tilt 调参。
- **Events**：`update:modelValue`、`change`。
- **尺寸**：`display:inline-flex; width:100%`，行高 28px。提示框是组件**内部**绝对定位，不 teleport，靠近顶部的滚动容器会裁掉它。
- **动效**：JS 与 CSS 都有 reduced-motion（:170,1004）。
- **借鉴**：`ComponentsReleasePolicyDemo.vue:233-241`（`show-value` + `format-value`）。

### TxSegmentedSlider

- **Props**：`modelValue=0`、`segments=[] as {value: number|string, label?: string}[]`、`disabled`、`showLabels=true`、`vertical=false`（`segmented-slider/src/types.ts`）。
- **Events**：`update:modelValue`、`change`。
- 宽 100%、最小高 32px（不含标签）；reduced-motion 兜底（:291）。
- **借鉴**：`SegmentedSliderSegmentedSliderDemo.vue`、`ComponentsReleasePolicyDemo.vue:228`。

### TxSensitiveInput

- **Props**（`sensitive-input/src/types.ts:39-74`；默认 `TxSensitiveInput.vue:17-30`）：
  - `modelValue=''`、`placeholder=''`、`size='xs'|'sm'|'md'|'lg'`（`'md'`，32px）、`status?`
  - `label?`、`description?`、`error?`、`disabled`、`readonly`、`required`
  - `copyable=true`、`mask='••••••••'`、`copiedDuration=2000`、`labels?: Partial<SensitiveInputLabels>`
  - 所有文案都要本地化（默认英文）。
- **Events**：`update:modelValue`、`copy`、`copyError`、`reveal`、`mask`。
- **Expose**：`focus`、`blur`、`reveal`、`mask`、`copy`。
- **尺寸**：`width:100%`，标签、字段、说明之间间距 6px。复制标签在字段**上方右侧**（`bottom:100%`，悬停出现，`:574-605`），上方要留约 20px 空间。
- **副作用**：复制会**写入读者的真实剪贴板**（`navigator.clipboard.writeText`，:181-182），模拟密钥要一眼看出是假的。
- reduced-motion 兜底（:611）。
- **借鉴**：`SensitiveInputSensitiveInputDemo.vue`。

### TxFlatRadio / TxFlatRadioItem

- **Props**：`modelValue`（必填，多选时为数组）、`multiple`、`disabled`、`size='sm'|'md'|'lg'|'xl'`（`'md'`，轨道 30px）、`bordered`。Item 为 `value`、`label?`、`icon?`、`disabled?`。
- 适合做「浅色 / 深色 / 跟随系统」「24h / 7d / 30d」这类分段控件。reduced-motion 兜底。
- **借鉴**：`AiSuiteChatShowcaseDemo.vue:98-101`、`FlatRadioIconDemo.vue`。

### TxRadio / TxRadioGroup

- **Group props**：`modelValue`、`disabled`、`type='button'|'standard'|'card'`、`direction='row'|'column'`、`indicatorVariant='solid'|'outline'|'glass'|'blur'`、`glass`、`blur`、`updateOnSettled`、`stiffness`、`damping`、`blurAmount`、`elastic`。
- **TxRadio**：`value`、`disabled`、`label`、`type`，独立使用时可用 `modelValue`。默认插槽是卡片内容。
- **借鉴**：`RadioRadioCardDemo.vue`（「仅本地 / 跨设备同步 / 组织托管（禁用）」三张卡）。

### TxCheckbox

- **Props**：`modelValue=false`、`disabled`、`loading`、`label?`、`labelPlacement='end'`、`variant='fill'|'checkmark'`、`ariaLabel?`、`indeterminate`。
- 没有 Group 组件，多选要自己组合。reduced-motion 兜底（:324）。

### TxNumberInput

- **Props**：`modelValue=null`、`min?`、`max?`、`step=1`、`precision?`、`placeholder`、`disabled`、`readonly`、`controls`、`decreaseLabel` / `increaseLabel`（本地化）。
- 宽 100%、`min-width:120px`、高 34px、radius 10（`number-input/src/TxNumberInput.vue:207-215`）。放进 BlockSlot 时给显式宽度（约 120px）。

### TxInput（TuffInput）/ TxFlatInput

- **TxInput**：`modelValue`、`placeholder`、`type='text'|'password'|'textarea'|'date'|'email'|'number'`、`disabled`、`readonly`、`clearable`、`rows=3`、`prefixIcon`、`suffixIcon`、`capsLockText`；插槽 `prefix` / `suffix`；expose `focus/blur/clear/setValue/getValue/inputEl`；高 32px。
- **TxFlatInput**：`modelValue`、`placeholder`、`icon`、`password`、`nonWin`、`area`（textarea，高 10rem）、`disabled`、`readonly`；高 32px。

### TxAlert

- **Props**：`type='info'|'success'|'warning'|'error'`、`title?`、`message?`、**`closable=true`（默认可关）**、`showIcon=true`（`alert/src/TxAlert.vue:10-14`）。
- **Event**：`close`。**Slots**：`title`、默认。**Expose**：`open()`、`close()`、`visible`，重播时用 `open()` 让它回来。
- `role="alert"`：挂载即被读屏播报。有 appear 过渡，reduced-motion 兜底（:196）。
- **借鉴**：`AlertAlertVariantsDemo.vue`。

### 确认弹窗：TxModal（推荐）与 dialog 家族

- **TxModal**（`modal/src/TxModal.vue`）：
  - Props：`modelValue`（必填）、`title=''`、`width='480px'`。
  - 事件：`update:modelValue`、`close`。插槽：`header`、默认、`footer`。
  - `Teleport body`，遮罩 `position:fixed`，打开时 `next()` 分配 z-index。
  - 打开后聚焦遮罩层（没有 `preventScroll`），Tab 在内部循环，Esc 与点击遮罩关闭，关闭后恢复焦点。
  - **借鉴**：`ModalBasicDemo.vue`（「确认同步设置」加 ghost/primary 按钮）。
- **TxBlowDialog / TxPopperDialog**：命令式外形。
  - 必须传 `close: () => void`，用 `v-if` 挂载。
  - 打开会尝试把 `#app` 缩放到 1.25 倍（`TxBlowDialog.vue:107-131`）；Nexus 根节点是 `#__nuxt`，所以不生效。
  - 关闭前等 550ms。只有单个确认按钮，不适合做「取消 / 确认」式的确认框。
- **TxBottomDialog / TxTouchTip**：**禁止用于文档页**。打开期间在 `window` 上挂 scroll 监听，并执行 `window.scrollTo({ top: 0 })`（`TxTouchTip.vue:83,112`、`TxBottomDialog.vue:161,170`），读者一滚动页面就被拉回顶部。

### TxImageUploader

- **Props**（`image-uploader/src/types.ts`；默认 `TxImageUploader.vue:9-15`）：
  - `modelValue: ImageUploaderFile[]`（必填，`{id, url, name?, file?}`）
  - `multiple=true`、`accept='image/*'`、`disabled`、`max=9`、`uploadText='Upload'`、`removeLabel?(name)`
- **Events**：`update:modelValue`、`change`、`remove({id, value})`。
- **尺寸**：`grid-template-columns: repeat(auto-fill, minmax(88px, 1fr))`，每格高 88px。做头像上传时用单选（`:multiple="false"`），外层宽约 190px，正好一格添加、一格预览。
- **副作用**：点击「上传」会打开**真实的系统文件选择器**；object URL 在移除和卸载时回收。预置图片需要本地资源（`/logo.svg`、`/pwa-192x192.png`），或者干脆不预置。

---

## Template proposals

> 公共骨架（三份相同）：
>
> - 根元素 `<section class="tpl-xxx not-prose">`，`container-type: inline-size`。
> - 高度写成 `height: var(--tpl-height, 540px)`，展开浮层把 `--tpl-height` 设为 `100%`（容器查询不能查高度）。
> - 内部各区域都是 `min-height:0` 加独立滚动。
> - 文案放在 `copy` computed；计时器集中管理，`onBeforeUnmount` 清理；`defineExpose({ replayDemo })`。
> - reduced-motion 时直接落到终态。
> - 自动播放**不调用 `focus()`、不打开任何浮层**，并且在用户第一次 `pointerdown` / `keydown` 进入模板时停止。
>
> 断点建议（容器宽）：`< 560` 紧凑（移动端 docs）；`560–959` 栏内（约 784）；`≥ 960` 展开（约 1280）。

### Shell 应用外壳

**栏内布局（约 784×540）**

```
┌ .tpl-shell (flex row) ──────────────────────────────────────────────────────────────┐
│┌ TxSidebarNav 196w ─┐┌ topbar 52h ──────────────────────────────────────────────────┐│
││ [T] Tuff  Personal⇅ ││ Workspace › CoreBox          [⌕ Filter activity   ] ⌘K  🔔³ (TC▾)││
││ [⌕ Quick search  ⌘K]│└──────────────────────────────────────────────────────────────┘│
││ New workflow     (+)││┌ StatCard ──────┐┌ StatCard ──────┐┌ StatCard ──────┐  112h   │
││ WORKSPACE           │││Launches today  ││Active plugins  ││AI tokens       │           │
││  ⌂ Overview         │││1,284   ↑ 8.2%  ││24      +3      ││38.6k   ↓ 4.1%  │           │
││  ⌕ CoreBox       12 ││└────────────────┘└────────────────┘└────────────────┘           │
││  ⧉ Plugins        3 ││┌ Activity  (TxTimeline, scroll) ──┐┌ Queries / hour ─────────┐ │
││  ⎘ Clipboard        │││● Translate 2.4.0 installed    2m ││ TxSparkChart (96h)      │ │
││ INTELLIGENCE        │││● Clipboard synced · MacBook   8m │├─────────────────────────┤ │
││  ✦ Agents         2 │││● "Daily digest" agent done   21m ││ ● Sync      StatusBadge │ │
││  ⇄ Workflows        │││● 1,204 files indexed          1h ││ ● Indexing 82%          │ │
││ ─ footer: ● Synced  ││└─────────────────────────────────┘└─────────────────────────┘ │
│└─────────────────────┘│                        TxToastPanel ↑ 绝对定位在 🔔 下方        │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**展开（约 1280×800，≥960）**

- 侧栏宽度调到 232（`--tx-bui-sidebar-nav-width`）。
- 统计卡变 4 列，新增一张 progress 变体「Index coverage 82%」。
- 右侧增加 280px 栏：「Online now」（`TxAvatarGroup` 加 `status`）、较大的 spark 图（接 `TxChartScrubber` 显示提示框）、服务状态列表。
- 活动时间线变高。

**紧凑（<560）**

- 隐藏侧栏，顶栏加一个 `TxIconButton` 汉堡按钮，打开 `TxDropdownMenu` 列出同一批导航项（数据复用 `items`）。
- 统计卡改成单列横向滚动，spark 图隐藏。

**组件与职责**

| 组件 | 职责 |
|---|---|
| `TxSidebarNav` | 工作区切换、快速过滤导航、主操作「New workflow」、分组导航加 badge、footer 放同步状态 |
| `TxBreadcrumb` | 当前位置。项不带 href；点击父级回到 Overview |
| `TxSearchInput` | 实时过滤活动时间线（真实功能） |
| `TxKbd` + `TxTooltip` | 「⌘K」提示按钮 |
| `TxCommandPalette` | 导航 / 操作命令面板 |
| `TxIconButton` + `TxBadge` | 通知铃铛与未读计数（宿主绝对定位） |
| `TxToastPanel` | 挂在铃铛下的最新通知，受控 `open` |
| `TxDropdownMenu` + `TxDropdownItem` | 用户菜单（原生 `<button>` 包住 `TxAvatar` 作触发器）：Profile / Preferences（`#right` 放 `TxKbd ⌘,`）/ Keyboard shortcuts / Sign out（danger） |
| `TxStatCard` ×3–4 | 带 insight 的指标卡，图标带颜色类 |
| `TxSparkChart` | 每小时查询量，父级高 96px |
| `TxStatusBadge` | 服务状态（Sync / Indexing / Nexus） |
| `TxTimeline` + `TransitionGroup` | 活动流；新条目进场由宿主过渡负责 |
| `TxButton` | 空态和面板里的操作 |

**交互**

- 点侧栏项：更新 breadcrumb 和标题。Overview 显示看板；Plugins 显示插件行（`TxTag` 加 `TxStatusBadge`）；其余分区显示 `TxEmptyState`（加 reduced-motion 覆盖，或用 `icon` 插槽换成静态图标）。
- 焦点在模板内按 ⌘K（绑在根元素 keydown 上并 `preventDefault()`），或点「⌘K」按钮：打开 `TxCommandPalette`。
  - 命令：Go to Overview / Plugins / Clipboard / Agents；New workflow；Toggle compact sidebar；Invite teammate；Open settings（`disabled`，演示禁用项）。
  - `@select` 执行对应动作，并弹出 `TxToastPanel` 反馈。
- 侧栏「New workflow (+)」、`itemAction`：在时间线插入一条，Workflows badge 加 1。
- 铃铛：切换 `TxToastPanel`；打开即标记已读（badge `open=false`）。
- 用户菜单：键盘可达（原生 button 触发）；Sign out 用 `TxToastPanel` 提示「已退出（演示）」。
- `TxSearchInput` 过滤时间线；无结果时显示一行 `TxSearchEmpty size="small"`。
- spark 图支持悬停和方向键移动十字线。

**自动播放（一次性，可重播）**

| 时间 | 动作 |
|---|---|
| T+0.8s | 时间线顶部插入「Translate 2.4.0 installed」；Plugins badge 3→4（pop-in） |
| T+1.4s | 铃铛 badge +1，`TxToastPanel` 打开 3.2s 后收回 |
| T+2.0s | 「Launches today」1,284 → 1,291，insight 的 `from/to` 同步更新 |

- reduced-motion：直接写入终态，时间线有新条目，toast panel 保持关闭。
- `replayDemo()`：清理计时器，恢复初始数据，重新开始。

**模拟数据（Tuff 风格，中英各一套）**

- **工作区**：`{ name: 'Tuff', description: '个人工作区' / 'Personal workspace', initials: 'T' }`。
- **导航分组**：
  - `workspace`：Overview `i-carbon-home`、CoreBox `i-carbon-search` badge 12、Plugins `i-carbon-plug` badge 3、Clipboard `i-carbon-paste`。
  - `intelligence`：Agents `i-carbon-bot` badge 2、Workflows `i-carbon-flow`。
  - 图标名需要逐个在 carbon 集合中确认。
- **统计卡**：
  - Launches today 1,284（`{from:1187,to:1284}`）
  - Active plugins 24（`{from:21,to:24,type:'delta'}`）
  - AI tokens 38.6k（`{from:40.2,to:38.6}` → −4.0%）
  - 展开时加一张 Index coverage 82%（progress 变体）
- **时间线**：
  - Translate 插件更新至 2.4.0 · 2m
  - 剪贴板已同步到 MacBook Pro · 8m
  - 智能体「每日摘要」完成 · 21m
  - 新索引 1,204 个文件 · 1h
  - 在 Windows 台式机登录 · 3h
- **spark 图**：24 个点（每小时查询量，峰值在 10:00 和 15:00）。
- 插件名取自 `plugins/`：touch-browser-open、touch-quick-actions、touch-window-presets、touch-workspace-scripts、touch-system-actions、touch-intelligence。

**风险与兜底**

- 命令面板覆盖整页，并且在顶栏之下，需要按 R2 抬高下限。如果老板不接受整页遮罩，可改用框内方案：在 shell 内绝对定位一层半透明 scrim，里面放 `TxSearchPanel`（放宽 max-width），但就不再是 `TxCommandPalette` 了。
- 侧栏不能折叠成图标栏：紧凑模式用隐藏侧栏加汉堡菜单代替。
- 侧栏自带卡片外观：可以接受 BUI 浮起风格，也可以用 `:deep` 去掉阴影和圆角，改成右侧 1px 分隔线，避免卡片套卡片。
- `search-hint` **必须用多字符 `'⌘K'`，不能用 `'/'`**（R3）。
- 需要手写的 CSS：shell 的 grid/flex 布局、顶栏、铃铛角标定位、toast panel 定位、右栏、容器查询。

### Launcher 启动器（仿 CoreBox）

**栏内布局（约 784×540）**

```
┌ .tpl-launcher  wallpaper = 令牌渐变网格（亮/暗两套） ─────────────────────────────┐
│  ◖ Tuff   File  Edit  View                    （假菜单栏 24h，手写）       12:04  │
│      ┌ TxGlassSurface 680×420 r18 ─────────────────────────────────────────────┐   │
│      │  ⌕  clip▏                                                   [esc]      │   │ ← TxSearchPanel 输入框（:deep 放大到 52h/17px）
│      │  [All 9] [▣ Apps] [⧉ Plugins 3] [▤ Files 2] [⎘ Clipboard 2] [✦ AI]      │   │ ← TxFilterChips（位置见下方"卡片内顺序"）
│      ├──────────────────────────────┬──────────────────────────────────────────┤   │
│      │ ▣ Clipboard History Plugin ⌘1│ # Clipboard History                      │   │
│      │ ▣ Copy as Markdown  Action ⌘2│ 保留最近 500 条文本、图片与文件…          │   │ ← 左：结果行（TxIconChip+标题+副标题+TxTag+TxKbd）
│      │ ▤ clip-notes.md     File   ⌘3│ - `⌘⇧V` 直接打开历史                      │   │   右：TxMarkdownView 预览（13px，可滚动）
│      │ ⎘ “Q3 roadmap…”     Clip   ⌘4│ - 敏感内容自动跳过                        │   │
│      │ ✦ Ask AI “clip”     AI     ⌘5│                                          │   │
│      ├──────────────────────────────┴──────────────────────────────────────────┤   │
│      │  ↵ Open   ⌘K Actions   ⌘1–0 Quick select              ● Indexing 82%   │   │ ← footer：TxKbd×n + TxStatusBadge
│      └─────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**展开（≥960）**

- 玻璃窗 880×560，列表 380px，预览区更宽，`idleCount` 调到 8。
- 壁纸上可以加一排假 Dock 图标（`TxIconChip size=40`）增加氛围。

**紧凑（<560）**

- 玻璃窗宽度设为 `calc(100% - 24px)`，隐藏预览区；筛选条靠横向滚动（`TxFilterChips` 自带），或用 JS 按宽度切换 `iconOnly`。

**核心方案：`TxSearchPanel` 负责输入框、结果列表、键盘、ARIA 和空态。** 需要以下宿主补丁，全部是 CSS/组合，不改 tuffex：

1. **尺寸**：宿主设置 `--tx-bui-search-panel-max-width: none`；`:deep(.tx-bui-search-panel__option){height:44px}`，把 32px 行高撑高到能放两行。
2. **去卡片外观**：`:deep(.tx-bui-search-panel__card){background:transparent; box-shadow:none}`，避免与玻璃层形成卡片套卡片。
3. **卡片内顺序**：卡片默认是 block，只有 `item/empty/footer` 三个插槽。
   - 方案 A：`:deep(.tx-bui-search-panel__card){display:flex; flex-direction:column}`，`footer` 插槽里放两个兄弟元素：筛选条 `order:1`、快捷键提示条 `order:3`，列表或空态 `order:2`。视觉顺序和 DOM 顺序不一致，属于 a11y 小瑕疵。
   - 方案 B：筛选条放在输入框**上方**、卡片之外，DOM 干净但版式不像 CoreBox。
4. **预览跟随高亮**：组件不上报 activeIndex。在 `#item` 插槽里包一个 helper 组件（如 `TemplateLauncherRow.vue`，必须被 demo 用 `from './TemplateLauncherRow.vue'` 引入），`watch(() => props.active, a => a && emit('activate', item))` 把当前项抛给宿主。
5. **列表不滚动**：用自定义 `filter` 截取前 6 条，并用 `idleCount` 控制，保证结果不超过可视高度。组件不会 scrollIntoView，所以不要让列表出现滚动。
6. **自动播放移动高亮**：`TxSearchPanel` 不暴露 input。可以 `root.querySelector('.tx-bui-search-panel__input')` 后派发 `new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })`，Vue 监听器会接收合成事件，也不需要聚焦。

**备选方案**：`TxSearchInput` 作输入框，加 `TxFilterChips`，加手写 `role=listbox`（行多时用 `TxVirtualList`，它有 `scrollToIndex`），加 `TxSearchEmpty`。

- 好处：顺序和高亮完全可控，预览天然同步。
- 代价：键盘导航和 ARIA 要手写，大约多 80 行；输入框要放大的话，需要 `(0,3,0)` 以上的 `:deep(.tx-input)` 覆盖，因为它是 scoped 样式。

**组件与职责**

| 组件 | 职责 |
|---|---|
| `TxGlassSurface` | 启动器窗体（`:width="'100%'"`，高度按断点） |
| `TxSearchPanel` | 输入、结果、键盘、空态 |
| `TxFilterChips` | 范围：All / Apps / Plugins / Files / Clipboard / AI，带 `count` 与 `iconClass` |
| `TxIconChip` | 结果图标，按种类取色调：app→ink、plugin→accent、file→neutral、clip→orange、ai→green |
| `TxTag` | 种类标签，`size=sm variant=soft` |
| `TxKbd` | 行尾 ⌘1–5、底栏 ↵ / ⌘K / esc |
| `TxMarkdownView` | 预览（单实例、只换 content、`sanitize` 保持默认） |
| `TxSearchEmpty` | 在 `empty` 插槽里使用，`primaryAction`「问问 Tuff AI」；用 `icon` 插槽放静态图标以避开无限动画 |
| `TxStatusBadge` | 底栏「Indexing 82%」 |
| `TxDropdownMenu` | 「⌘K Actions」操作菜单：Open / Copy path / Reveal in Finder / Pin / Disable plugin |

**交互**

- 输入：跨种类过滤，筛选条计数由数据推导。
- ↑ / ↓：移动高亮，预览同步。
- Enter：执行。底栏左侧短暂显示「已打开 Clipboard History」，1.6s 后恢复；计时器需要清理。
- 输入框聚焦时按 ⌘K：`app.vue` 在可编辑目标上会跳过全站搜索，所以这里安全。按下后打开操作菜单：受控 `v-model`、`initialFocus='first-item'`，注意 spec 所说的 rAF 聚焦问题。
- Esc：先清空查询（组件行为），再按一次重置范围。
- 空态：输入如 `zzz` 时显示「问问 Tuff AI」按钮，点击后切到 AI 范围，预览区显示一段 AI 回答（静态 markdown）。
- 计算器：查询匹配 `/^[\d\s+\-*/().]+$/` 时，列表首行合成「= 512」（`TxIconChip label="="` 取 accent 色调），预览显示算式。
- ⌘1–⌘5 **只做展示**：浏览器保留 ⌘/Ctrl+数字切换标签页，页面无法可靠拦截；纯数字又会和计算器输入冲突。

**自动播放**

- 空闲推荐 → 逐字输入「clip」（每字 120ms）→ 高亮下移两次（合成 ArrowDown，预览切换）→ 选中 Plugins 范围 → 停在最终状态。
- 用户一旦输入或点击就中止；`replayDemo()` 重新开始。
- reduced-motion：直接设置 `query='clip'` 并高亮第 2 项，不逐字。

**模拟数据（中英双份，CoreBox 源类型取自 `apps/core-app/src/renderer/src/components/render/sourceMeta.ts` 的 application / plugin / file / command / web / feature / system）**

- **Apps**：Visual Studio Code、Figma、Terminal（ink 色芯片加首字母）。
- **Plugins**：
  - Clipboard History（`touch-clipboard`）
  - Quick Actions（`touch-quick-actions`）
  - Browser Open（`touch-browser-open`）
  - Translate
  - Window Presets（`touch-window-presets`）
  - Tuff Intelligence（`touch-intelligence`）
- **Files**：`clip-notes.md ~/Documents`、`Q3-roadmap.pdf ~/Downloads`。
- **Clipboard**：「Meeting notes — Q3 roadmap…」2 分钟前；「Screenshot 12:04」图片条目。
- **AI**：「Ask Tuff AI: "summarize my clipboard"」。
- **System**：Toggle Dark Mode、Lock Screen。
- **底栏真实文案**：core-app `en-US.json:2577-2585`（`hints.open` Open / `execute` Execute / `actions` Actions / `quickSelect` Quick Select / `footer.indexing` Indexing {progress}%）；按键取自 `CoreBoxFooter.vue:146-174`（↵、⌘K、⌘1-0）。

**风险与兜底**

- 玻璃效果只有 Chromium 走 SVG 滤镜，Safari 和 Firefox 是 blur 回退；壁纸必须有足够的色彩对比（暗色另配一套）。
- `TxMarkdownView` 首次渲染会因 DOMPurify 异步加载而为空，要常驻单实例。
- 预览里的链接是真链接：预览 markdown 不要放链接，或在宿主上拦截 `click`。
- 需要手写的 CSS：壁纸、假菜单栏、玻璃内三段布局（顶 / 中两栏 / 底）、结果行版式、`TxSearchPanel` 的 `:deep` 覆盖、容器查询。

### Settings 设置中心

**栏内布局（约 784×540）**

```
┌ .tpl-settings ──────────────────────────────────────────────────────────────────┐
│┌ TxTabs placement=left, nav 184 (navMinWidth=184,navMaxWidth=200), height 100% ─┐│
││ GENERAL         │ TxTabHeader:  CoreBox                 ✓ Saved · just now [↺] ││ ← TxStatusBadge + TxButton ghost(Reset→TxModal)
││ ⚙ General       ├──────────────────────────────────────────────────────────────┤│
││ ⌕ CoreBox    ●  │ TxGroupBlock "Search"  (collapsible=false)                   ││
││ ⌨ Shortcuts     │  ◈ Show recommendations  Suggest apps on empty query   [●]   ││ ← TxBlockSwitch
││ INTELLIGENCE    │  ◈ Auto paste            Paste the pick after…     [3 s ▾]   ││ ← TxBlockSelect
││ ✦ AI models     │  ◈ Result density        [Compact ─●─ Cozy ── Roomy]         ││ ← TxBlockSlot + TxSegmentedSlider(240w)
││ ⛨ Privacy       │  ◈ Max results           [ − 8 + ]                           ││ ← TxBlockSlot + TxNumberInput(120w)
││ ACCOUNT         │ TxGroupBlock "Appearance"                                    ││
││ ☺ Profile       │  ◈ Theme                 [ Light | Dark | System ]           ││ ← TxBlockSlot + TxFlatRadio size=sm
││                 │  ◈ Window opacity        ───────●──── 92%                    ││ ← TxBlockSlot + TxSlider(220w, show-value)
│└─────────────────┴──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────┘
```

**各标签页内容**（稳定英文 key 作 `name`，本地化标签放 `#name` 插槽；导航分组用 `TxTabItemGroup`）

| 标签页 | 内容 |
|---|---|
| General | Language（`TxBlockSelect`：简体中文 / English / 日本語）；Launch at login（`TxBlockSwitch`）；Global shortcut（`TxBlockSlot` 放 `TxKbd ⌘ E` 和「Record」`TxButton size=sm`）；Theme 与 Window opacity（同上图） |
| CoreBox | 同上图，外加 Custom placeholder（`TxBlockInput`，文案参考 `SettingTools.vue:713-727`） |
| Shortcuts | `TxBlockSlot` 列表，每行放 `TxKbd` 组合加 `TxSwitch`：Open CoreBox ⌘E、OmniPanel ⌘⇧P、Clipboard history ⌘⇧V、Screenshot translate ⌘⇧T；顶部 `TxSearchInput` 过滤 |
| AI models | Provider（`TxSelect`，富选项：Tuff Nexus（推荐）/ OpenAI compatible / Local（Ollama），各带 `icon` 和 `description`）；API key（`TxSensitiveInput` 带 label 和 description，全部 `labels` 本地化，放在 `TxGroupBlock` 正文而不是 56px 的行里）；Temperature（`TxSlider` 0–1，步长 0.1）；`TxCheckbox`×3（允许读取剪贴板 / 文件索引 / 网页）；`TxAlert type=info :closable="false"`「登录后请求经 Nexus 路由」 |
| Privacy | `TxAlert type=warning`「剪贴板历史仅保存在本机」；Retention（`TxRadioGroup type=card`：7 天 / 30 天 / 永久）；排除的应用（`TxCheckbox` 列表：1Password、Keychain Access）；危险区「清空剪贴板历史」（`TxButton variant=danger`）弹出 `TxModal` 确认框，框内带一个 `TxCheckbox`「同时清除已固定项」 |
| Profile | `TxAvatar size=xlarge` 显示首字母；`TxImageUploader :multiple="false"`（外层约 190px）；Display name（`TxInput`）；Email（`TxBlockLine` 只读）；「在所有设备上退出」弹出 `TxModal` |

**展开（≥960）**

- 导航宽 220。
- 内容区右侧新增「Live preview」卡：一个迷你 CoreBox 条，实时反映 Theme / Window opacity / Result density / Max results。这是本模板的"创新点"：设置与效果联动，可以复用 Launcher 的数据和少量样式。
- 另一种做法是内容区两列 grid，GroupBlock 左右并排。

**紧凑（<560）**

- `placement` 由 JS 按宽度切换为 `'top'`，导航横向排列。
- 必须用 JS：`navMinWidth` 是内联样式，CSS 覆盖不了。用 ResizeObserver 即可；`@vueuse/core` 已装（`apps/nexus/package.json:92`），但目前没有 demo 用它。

**组件与职责**

| 组件 | 职责 |
|---|---|
| `TxTabs` / `TxTabItemGroup` / `TxTabItem` / `TxTabHeader` | 分区导航、分组标题、吸顶标题栏 |
| `TxGroupBlock` + `TxBlock*` | 设置行 |
| `TxSwitch` / `TxSelect` / `TxFlatSelect` / `TxSlider` / `TxSegmentedSlider` / `TxNumberInput` / `TxFlatRadio` / `TxRadioGroup` / `TxCheckbox` / `TxInput` / `TxSensitiveInput` | 具体控件 |
| `TxAlert` | 提示与警告 |
| `TxModal` | 确认框 |
| `TxAvatar` + `TxImageUploader` | 头像 |
| `TxKbd` | 快捷键展示 |
| `TxStatusBadge` | 「已保存」反馈 |

- `TxFlatSelect` 只在不会被裁切的位置用一次，例如 General 首行的「Language」，并且与 `TxSelect` 形成对照。

**交互**

- 所有控件都是真实可操作的，状态集中放在一个 `reactive` 对象里，因为 TxTabs 切换会卸载面板。
- 任一值变化时，`TxTabHeader` 的 `TxStatusBadge` 显示「已保存 · 刚刚」，600ms 防抖，计时器需要清理。
- 「Reset」弹出 `TxModal`，确认后恢复默认值。
- Privacy 的清空操作弹出 `TxModal`，确认后显示成功的 `TxAlert`，重播时调用 `open()` 让它再次出现。
- 键盘：TxTabs 方向键切换；`TxModal` 支持 Esc 和焦点循环。

**自动播放（可选、轻量）**

- 1.0s 后切到 CoreBox 标签（指示器滑动）→ 1.6s 把「Result density」从 Cozy 调到 Compact → 「已保存」闪现。
- 如果展开态有 Live preview，同步显示迷你 CoreBox 变紧凑。
- reduced-motion：直接落到终态，同时给 TxTabs 传 `animation` 关闭配置。
- 可选的扩展：「设置搜索」。在导航顶部放 `TxSearchInput`，输入「透明度 / opacity」时跳到对应标签并高亮匹配行（行上加 data 属性和一次性 CSS 闪烁）。

**风险与兜底**

- TxTabs 与 TxGroupBlock 的动效没有 reduced-motion 兜底。前者传 `animation` 配置关闭；后者统一设 `collapsible=false`，gsap 就不会执行。
- `TxBlockSlot` 固定 56px 且按下时会缩放：滑块行可以用 `:deep(.tx-block-slot:active){transform:none}` 局部取消，也可以接受。
- `TxSensitiveInput` 不要放进 56px 行：复制标签会伸出到上一行。
- `TxImageUploader` 会打开真实的文件选择器（用户主动触发，可以接受），不要预置外网图片。
- 需要手写的 CSS：根高度、`TxTabHeader` 内版式、各控件在行内的显式宽度、Live preview 卡、容器查询。

---

## Risks

**R1（高，已找到构建证据）生产构建里 tuffex 被打包了两份，模块状态也分成两份。**

- **分叉点**：
  - 自动注册的组件在生产解析到**源码**：`modules/tuffex-components.ts:92-96`，`nuxt.config.ts:47,553`。
  - `@talex-touch/tuffex/utils` 和 `@talex-touch/tuffex/<dir>` 解析到 **dist**：`nuxt.config.ts:58-60,555,558`；生产固定为 dist 模式，见 `build/tuffex-dev-mode.ts`。
  - dev 默认两边都是 dist，所以 dev 下 ego 截图是正常的，**看不出问题**。这套逻辑 2026-09-12 落地（`8e2742bef`），09-21 的构建已经反映出来。
- **证据**（`apps/nexus/dist/_nuxt`，2026-09-21 构建）：
  - `COAt5s3g.js` 是 TxToastHost 的 chunk，内联了**私有**队列 `const k=ut({items:[],zIndex:ct()})`，只导出组件本身。
  - `toast()` 是入口 chunk `DaT6A3W3.js` 里的 `function SA(e){On.zIndex=EP();…On.items.push…}`。
  - `ToastToastDemo` 的 chunk `nd79IHVz.js` 从 `COAt5s3g.js` 引入 host，同时从 `DaT6A3W3.js` 引入 `an`（即 `SA`）来调用。
  - 所以**生产环境里 `ToastToastDemo` 和 `ComponentsFeedbackTaskCenterDemo` 的 toast 不会出现**。这是超出本任务范围的现存缺陷，建议另开任务处理。
- **对模板的影响**：
  - (a) `toast()` 配自动注册的 `<TxToastHost>` 在生产失效。
  - (b) `reserveOverlayLayer()`（`app/utils/layers.ts` → dist）在生产抬不高自动注册浮层（源码分配器）的下限。
  - (c) 如果显式 import 了父组件（dist），而子组件或弹层是自动注册的（源码），用 Symbol 做 key 的 provide/inject 会断开（`FLAT_SELECT_KEY`、`SELECT_KEY`、`FLAT_RADIO_KEY`、`TX_ANCHOR_NODE_KEY`），分配器也不同。例如显式导入的 `TxModal` 里放一个自动注册的 `TxSelect`，在生产环境它的面板会被压在弹窗下面。
- **建议**：
  - 模板里**所有组件都走自动注册，不混用显式组件 import**。
  - 运行时函数从 `@tuffex-components/utils` 引入，它在两种模式下都和自动注册组件是同一份。
  - 通知优先用受控的 `TxToastPanel`。
  - 落地前用隔离 worktree 跑一次生产构建验证（`node nuxt.mjs build`，见 memory）。
  - mdc 的 `code:` 片段仍然写公开子路径 `@talex-touch/tuffex/*`。

**R2 浮层层级：Nexus 顶栏与展开浮层。**

- **现状**：
  - 顶栏 `z-index:10000`（`TheHeader.vue:221`），tuffex 分配器从 2000 开始（`z-index-manager.ts:33`）。
  - Nexus 自己的全站搜索用 `reserveOverlayLayer()`（种子 10100）先抬高下限，再打开面板（`useGlobalSearchState.ts:75-78`）。
  - 模板在栏内打开 `TxCommandPalette` / `TxModal` 时，如果不抬高下限，顶栏药丸会压在遮罩之上。
- **展开浮层（D6）**：
  - 必须盖住顶栏（≥10100）。
  - 它里面之后打开的下拉 / 提示 / `TxSelect` / `TxModal` / 命令面板都要取 `next()`，才能盖在浮层之上。所以浮层打开时要先抬高**组件所用那一份**分配器的下限，再用同一份分配器的 `nextZIndex()` 给自己取层级（R1：`@tuffex-components/utils`）。
  - 同时抬高 `@talex-touch/tuffex/utils`（dist）也无害：dev 下两者是同一模块，生产下还能照顾 GlobalSearch 的 dist 面板。
- **不 teleport 的弹层**（`TxFlatSelect` z-index 3、`TxSlider` 提示框、`TxSensitiveInput` 复制标签）会被 `.tuff-demo__window{overflow:hidden}`（`TuffDemoWrapper.vue:283`）和任何滚动祖先裁掉。

**R3 键盘冲突。**

- `app.vue:162-186` 在 `window` 上监听：⌘/Ctrl+K 和 `/` 打开全站搜索。它会检查 `event.defaultPrevented` 和可编辑目标，Esc 只在全站搜索打开时处理。
- 模板的 ⌘K 只能绑在模板根元素上（元素级监听先于 window），并且要 `preventDefault()`。**不要在 `document` 或 `window` 上监听。**
- `TxSidebarNav` 的单字符 `searchHint` 会在 `document` 上 `preventDefault`，**整页的 `/` 都会失效**。模板里只用多字符提示。
- ⌘/Ctrl+数字是浏览器保留键，只做展示。
- 焦点在 `TxSearchPanel` 等输入框里时，全站 ⌘K 本来就会跳过（可编辑目标），模板可以放心接管。

**R4 docs 正文样式外泄。**

- 正文容器是 `.docs-prose.markdown-body.prose`（`[...slug].vue:2091`），三套样式都只排除 `.not-prose` 子树。
- `.docs-prose p/ul/li` 会被设成 `font-size:1.0625rem; line-height:1.7; margin-bottom:.9rem`，`h3` 也会被重设（:2618-2700）。scoped 编译后优先级为 (0,2,1)，普通的 scoped 类选择器 (0,2,0) 压不过。
- teleport 到展开浮层后这些样式会消失，版式跳变。
- **模板根一律加 `not-prose`**（先例 `DocsComponentsGallery.vue` 的 `docs-gallery__stage not-prose`）。
- `TxMarkdownView` 的 `.markdown-body` 同样依赖这一点。

**R5 Esc 的多层处理。**

- base-anchor 在 `document` 上关闭，不 `preventDefault`（`TxBaseAnchor.vue:831-839`）。`TxModal` 在遮罩上处理 Esc，也不 `preventDefault`。`TxCommandPalette` 在输入框上处理，会 `preventDefault`。
- 展开浮层如果也用 Esc 关闭，要避免一次按键关掉两层。可以只在 `event.target` 位于浮层 DOM 内、且 `!event.defaultPrevented` 时关闭；teleport 出去的面板和弹窗都不在浮层 DOM 内。

**R6 焦点。**

- 自动播放不能调用 `focus()`：会滚动页面并抢走读者的键盘。
- `TxModal` 打开时 `focus()` 不带 `preventScroll`，`TxCommandPalette` 会 `autoFocus`；两者都只在用户主动操作时打开。
- 展开浮层如果做焦点陷阱，要允许焦点进入 teleport 到 `body` 的面板、弹窗和命令面板（它们不在浮层 DOM 内）。

**R7 动效兜底缺口。**

- 以下组件**没有** reduced-motion：
  - `TxTabs` / `TxAutoSizer`：传 `animation` 配置关闭。
  - `TxGroupBlock`（gsap）：用 `collapsible=false` 规避。
  - `TxEmptyState` 插画（`infinite`）：用 `icon` 插槽换静态图标，或加 CSS 覆盖。
  - `TxCommandPalette` 淡入：可以接受。
  - `TxTimeline`：本身无动效，宿主加的 TransitionGroup 要自带兜底。
- 旧版 `TxStatCard` 也没有，工作区版本已补上。
- 模板自己的 `transition` / `animation` 都要写 `@media (prefers-reduced-motion: reduce)`（`tuffex-design-rules.md` §Motion）。

**R8 组件正在变动。**

- `TxStatCard`：并行会话未提交的重做（+130/−103），包括内联 SVG 涨跌箭头、右下大图标、reduced-motion。
- `TxEmptyState` 的 error 插画、`TxLayoutSkeleton`：已计划修改。
- 它们的 props/slots/events 不变，但 Nexus dev 读的是 dist，重建后外观会变化（重建锁 `/tmp/tuffex-build.lock`）。模板截图验收应该在它们落地并重建 dist 之后进行。

**R9 两套令牌家族混用。**

- `TxSidebarNav` / `TxSearchPanel` / `TxIconChip` / `TxFilterChips` / `TxSparkChart` 用 `--tx-bui-*`（accent `#0285ff` / 暗色 `#3d9aff`，灰阶独立）。`TxButton` / `TxStatCard` / `TxTabs` 等用 `--tx-*`（primary `#409eff`）。
- 同一模板里两种蓝色和两套灰阶会并存。spec 允许宿主在自己的作用域里覆盖 `--tx-bui-*`（`bui-component-family.md` §Token layer），是否统一交给设计决定。

**R10 缺失能力汇总（均有兜底，不改 tuffex）。**

- `TxSidebarNav`：没有图标栏模式，没有内部滚动。
- `TxSearchPanel`：不上报高亮、不暴露 input、行高固定 32px、列表不限高也不自动滚动、字段与列表之间没有插槽、默认 288px 宽。
- `TxSearchInput`：没有 suffix 插槽。
- `TxDropdownItem`：没有图标 prop。
- `TxTimeline`：没有进场动效，暗色下圆点有白环（`TxTimelineItem.vue:103`）。
- `TxBreadcrumb`：href 会导航。
- `TxStatCard`：键盘不可点击。
- `TxTabs`：`name` 就是标签，只渲染当前面板，`navMinWidth` 是内联样式。
- `TxBlockSwitch`：点整行不切换。

**R11 外部副作用。**

- `TxSensitiveInput` 会写入真实剪贴板。
- `TxImageUploader` 会打开系统文件选择器。
- `TxGroupBlock` 设了 `memoryName` 会写 localStorage。
- `TxBottomDialog` / `TxTouchTip` 会劫持滚动（禁用）。
- `TxBlowDialog` 会改 `#app`（在 Nexus 不生效，但仍不推荐）。
- `TxAlert` 挂载时读屏播报。
- 全局 `toast()` 队列与第一个挂载的 host 是全站共享的，`clearToasts()` 会影响其他 demo。

**R12 图标。**

- 只有 carbon / cib / logos / twemoji。class 字面量必须出现在 `.vue` 里。
- tuffex 内部的默认图标类只有在 Nexus 某个 `.vue` 引用过才会生成。例如 `i-carbon-arrow-down` 在 Nexus 里没有引用，旧版 StatCard 的下跌箭头因此是空白。
- 模板用到的每个 `i-carbon-*` 名都要确认在集合中存在（兄弟调研 `ai.md` 记录了若干并不存在的名字，如 `i-carbon-clipboard`）。

**R13 不要照抄现有 demo 的计时器写法。**

- `ToastPanelToastPanelDemo.replay` 和 `ToastToastDemo.fireStack` 的 `setTimeout` 都没有清理。模板按 `tuffex-docs-sync.md` §Demos 第 1 条，在 `onBeforeUnmount` 统一清理。
