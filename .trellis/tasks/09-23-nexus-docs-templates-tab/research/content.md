# Research: 内容运营分组模板（CMS 内容管理 / Gallery 画廊 / Inbox 收件箱）

- **Query**: 为「模板 Templates」tab 的内容运营分组收集真实 tuffex 组件的导入方式、组合相关 API（props / events / slots / expose / 类型）、尺寸 / 浮层 / 动效行为、可借鉴 demo 与坑点，调研图片来源，并给出三份组合方案（784×540 栏内 + 1280×800 展开）。
- **Scope**: internal 为主（tuffex 源码、Nexus demo 机制 / 文档页 / 配置 / 构建产物）；外部只核对了一条 CSS 规范（`container-type` 施加哪些 containment，见 Risks R5）。
- **Date**: 2026-09-23
- **基线**: 源码读于 2026-09-23。调研期间工作树里有并行会话的**未提交**改动：`TxFlipOverlay.vue`（改为 teleport，属 `09-23-nexus-pro-gallery-polish` R4）、`TxEmptyState.vue`（新 error 插画）、`TxStatCard` / `TxLayoutSkeleton` / `TxGlowText` / `TxKeyframeStrokeText`，dist 也在被重建（`dist/es/index.js` mtime 23:01）。受影响处都标了「进行中」。
- **与兄弟调研的关系**: `research/app-shells.md` 已完整论证了几条跨模板风险（生产构建双份 tuffex、浮层层级、`/` 快捷键、prose 外泄）。本文件独立复核了关键代码行，只写它们对内容运营模板的具体影响，不重复推导。

---

## 结论速览

1. **组件零 import**：模板里直接写 `<TxDataTable>` 等标签（`apps/nexus/modules/tuffex-components.ts` 全局注册）；类型用 `import type … from '@talex-touch/tuffex/<slug>'`；运行时函数（`toast`、`refreshZIndex`…）建议从 `@tuffex-components/utils` 引入（生产环境与自动注册组件同一份模块，见 R1）。
2. **图片**：不要外链（现有 demo 用 picsum / pravatar / githubusercontent）。推荐「代码生成的 SVG data URI」为主，所有要 URL 的组件（`TxImageGallery`、`TxAttachmentTray`、`TxAvatar`、`TxImageUploader`）都能直接用。辅以 5 张已打进产物的本地 JPG（零新增资源），头像用首字母，Tuff 系统发件人用 `/logo.svg`。
3. **TxImageGallery 自带灯箱**：点击缩略图后在 `TxModal` 里显示，有上一张 / 下一张按钮和计数。但它**不能从外部打开**，只有正方形缩略网格，没有插槽和说明文字，也不支持方向键。适合做详情里的「变体条」；「卡片 → 详情」用 `TxFlipOverlay`。
4. **阻塞项 1**：`TxFlipOverlay` 在 HEAD 版本是**就地渲染**（没有 teleport）。docs 正文 `.docs-prose` 带 `content-visibility: auto`，于是它会以文章为包含块居中，并把页面滚走。修复（改为 teleport）还在工作树里、没有提交。Gallery 的「翻转详情」依赖这个修复落进 dist。
5. **阻塞项 2**：`TuffexDocsHeroBackground.vue` 泄漏出全局 `.dark` / `[data-theme='dark']` 规则。它会命中 `TxMarkdownView`（Inbox 阅读区、CMS 预览）和 `TxMarkdownEditor` 的根节点。暗色截图要等 talex-touch-87 修完再验收。
6. **TxMarkdownEditor 不建议用**：
   - 工具栏和模式按钮用的是 `i-ri-*` 图标，Nexus 没装 `ri` 图标集（pro-gallery 任务 R3 实测是「灰方块」）。
   - 再加上 dark 泄漏和 `execCommand`，CMS 正文改用 `TxTextarea` 写源码，配 `TxMarkdownView` 实时预览。
7. **浮层都在视口层**：`TxDrawer`、`TxModal`、下拉、提示、`TxSelect` / `TxDatePicker` 面板、Toast 都 teleport 到 body，默认 z-index 2000 起，Nexus 顶栏是 10000。
   - CMS 的编辑抽屉会盖住整页，这是 `TxDrawer` 唯一的形态，没有「容器内抽屉」参数。
   - 需要框内编辑时，只能在展开态手写 inspector 栏。
8. **TxDataTable 的分页 / 排序 / 全选语义要由宿主兜底**：
   - 表格只对传入的 `data`（当前页）做前端排序。
   - 「全选」只覆盖当前页，而且会**替换**整个选择集。
   - 单元格里的点击会冒泡触发 `rowClick`。
9. **TxSidebarNav 的单字符 `search-hint`**（如 `/`）会在 document 上抢走 Nexus 全站搜索的 `/`。Inbox 不传 `search-hint`。
10. **模板根节点加 `not-prose`**，样式只用 `--tx-*` / `--tx-bui-*` token，不用 `--docs-*`。teleport 到展开浮层后，正文上的变量和 prose 样式都会消失。

---

## Import convention

### 组件：零 import，靠全局注册

- `apps/nexus/modules/tuffex-components.ts` 是一个本地 Nuxt 模块，从 `modules/` 目录自动加载。它的做法：
  - 遍历 `packages/tuffex/packages/components/src/*/index.ts`，跳过聚合目录 `ai` / `base` / `pro` / `utils`（:37）。
  - 以**文本方式**读取匹配 `/^(?:Tx|Tuff)[A-Z]/` 的值导出（:30），支持 `A as B`，并跟进一跳 `export * from './src'`（pagination / breadcrumb / steps 就是这种写法）。
  - 对每个导出调用 Nuxt `addComponent({ name, filePath: '<prefix>/<slug>', export })`（:124）。
  - 前缀：dev 的 dist 模式是 `@talex-touch/tuffex`，生产和 dev 的 source 模式是 `@tuffex-components`（:96）。
  - 同名导出冲突时直接抛错。
- 实际效果：
  - 模板里直接写 `<TxDataTable>`、`<TuffSwitch>`、`<TxToastHost>`，按路由懒加载。
  - 双名都已注册：`TuffInput`/`TxInput`、`TuffSwitch`/`TxSwitch`、`TuffSelect`/`TxSelect`、`TuffSelectItem`/`TxSelectItem`；`TxFlipOverlay`（`as` 导出）、`TxRating`、`TxPagination` 也都已注册。
- 代表性 demo 只 import 类型，不 import 组件：`DataTableRecordsDemo.vue`、`FilterChipsFilterTableDemo.vue`、`ComponentsDataOperationsDemo.vue`。
- 显式值导入也能用，现有 46 行，集中在 group-block / charts / select，例如 `import { TxButton } from '@talex-touch/tuffex/button'`。但**生产环境里它会是 dist 的另一份拷贝**，和自动注册组件的模块状态不同（R1）。**模板里不要混用显式组件 import。**

### 类型

- 按 slug 用子路径：`import type { DataTableColumn } from '@talex-touch/tuffex/data-table'`。67 个 demo 文件、99 行用这种写法。
- 另有 8 个文件用等价的站内别名 `@tuffex-components/<slug>`，例如 `AttachmentTrayAttachmentTrayDemo.vue:2` 从 `ai-elements` 取 `AiAttachmentFile`。
- 没有 demo 从根入口 `@talex-touch/tuffex` import。
- mdc 的 `code:` 片段写公开子路径 `@talex-touch/tuffex/<slug>`。

### 运行时工具

- 现状：`import { toast, clearToasts } from '@talex-touch/tuffex/utils'`（`ToastToastDemo.vue:4`、`ComponentsFeedbackTaskCenterDemo.vue:3`）。
  - 这个入口在所有模式下都指向 dist `utils/index.js`（`nuxt.config.ts:57-60,555`），而**生产环境**的自动注册组件来自源码。两边的 `toastStore` 和 z-index 分配器各是一份（R1）。
- 推荐：`import { toast, refreshZIndex, nextZIndex } from '@tuffex-components/utils'`。
  - dev 解析到 `dist/es/utils/index.js`，生产解析到 `src/utils/index.ts`（内容是 `export * from '../../../utils'`，已核对），两种模式都和自动注册组件同一份。
  - 尚未在生产构建里验证（同 app-shells R1）。
- `useIndicatorBox` 从 `@talex-touch/tuffex/sidebar-nav` 或 utils 取。

### Vue / i18n / env / Nexus 工具

- `import { computed, ref, … } from 'vue'` 显式写。
- `const { locale } = useI18n()` 靠自动导入：399 个 demo 里有 289 个直接调用；只有 4 个 AI 套件 demo 显式 `from 'vue-i18n'`。
- 文案统一放 `labels` / `copy` computed，按 `locale.value === 'zh'` 切换。
- `import { hasWindow } from '@talex-touch/utils/env'`（`AiSuiteStreamingAnswerDemo.vue:8`）。
- Nexus 工具走 `~/utils/...`，例如 `~/utils/layers` 的 `NEXUS_OVERLAY_LAYER_SEED`。

### demo 外壳里会影响模板的事实

**注册与渲染**

- `demo-registry.ts` 按字母序写 `Key: () => import('./demos/Key.vue')`。
- wrapper 用 IntersectionObserver 激活，`DEMO_LAZY_ROOT_MARGIN = '240px 0px'`（`demo-lazy.ts:15`）。
- 渲染在 `<ClientOnly>` 里：demo 永远不走 SSR，setup 里可以用 `window`。惯例上仍用 `hasWindow()` 守一下。

**尺寸**

- `.tuff-demo__preview { padding: 28px }`（`TuffDemoWrapper.vue:361-364`）。840px 正文列（`app.vue:550`）内可用宽度约 784px，高度由内容撑开。
- 建议模板根节点写 `height: var(--tpl-height, 540px)`，交给展开浮层改写。

**重置 / 重播**

- 优先调用 demo 暴露的 `resetDemo` / `replayDemo` / `reset` / `replay`（`TuffDemoWrapper.vue:81-110`）。
- 没有暴露时，`renderKey++` 整体重挂载（`TuffDemoClientRenderer.client.vue:109`）。
- 先例：`defineExpose({ replayDemo: start })`（`ProgressBarUploadDemo.vue:62`）。
- 模板应暴露 `replayDemo`。如果展开状态由模板内部的 Teleport 持有，重挂载会把浮层一起关掉。

**计时器与减弱动效**

- 计时器惯例：模块级 `let timer`，在 `onBeforeUnmount` 里 `clearTimeout`（`AiSuiteChatShowcaseDemo.vue:31-44`）。
- JS 时间线自己判断减弱动效：`const still = hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches`，命中就直接落到终态（`AiSuiteStreamingAnswerDemo.vue:74-90`）。

**时间与排序**

- 用确定性时间：固定 `NOW = Date.UTC(…)`，字段存 epoch ms。
- 显示时用 `Intl.RelativeTimeFormat`；排序只读时间戳字段（`DataTableRecordsDemo.vue:22-23,85-97,106-113`）。

**辅助文件**

- 孤儿门禁只扫 `demos/` 顶层的 `.vue`。
- helper `.vue` 必须被某个已注册 demo 以 `from './X.vue'` 引入（`build/check-demo-registry-orphans.mjs:43-60`）。
- `.ts` helper 门禁不管，但 **UnoCSS 不扫描 `demos/*.ts`**，图标 class 写在里面会失效（R6）。

**正文容器**

- 正文 = `ContentRenderer` 加 `docs-prose markdown-body prose prose-neutral dark:prose-invert`（`pages/docs/[...slug].vue:2060-2072, 2091`）。
- 同时带 `content-visibility: auto`（:2596-2597），见 R4 / R5。

---

## Images

### 现有 demo 怎么取图

全部是外链：

- `picsum.photos`：`ImageGalleryImageGalleryDemo.vue:5-7`、`AttachmentTrayAttachmentTrayDemo.vue:25-26`。
- `i.pravatar.cc`、`avatars.githubusercontent.com`：各 Avatar demo。
- `example.com/missing.png`：故意放的坏图，用来演示占位。

国内访问不稳定，模板禁用。

### 仓库里可用的本地图片

| 资源 | 体积 | 尺寸 | 内容 | 现用处 |
|---|---|---|---|---|
| `apps/nexus/app/images/assets/plugin-cards/calendar.jpg` | 54 KB | 960×960 | 暗红底上的橙色玻璃「31」日历图标 | `tuff/landing/plugins/cards/PluginCardCalendar.vue:3` |
| `…/plugin-cards/notion.jpg` | 67 KB | 736×1308（竖） | 黑白抽象条纹玻璃，**没有** Notion 标志 | `PluginCardNotion.vue:3` |
| `…/plugin-cards/spotify.jpg` | 73 KB | 960×960 | Spotify 标志玻璃砖 + 彩虹波浪（第三方商标） | `PluginCardSpotify.vue:3` |
| `…/plugin-cards/vscode.jpg` | 38 KB | 960×960 | VS Code 标志玻璃（第三方商标），深蓝底 | `PluginCardVSCode.vue:3` |
| `apps/nexus/app/images/assets/intelligence.jpg` | 83 KB | 1199×800 | 紫蓝霓虹沙丘夜景 | `TuffLandingIntelligenceHeader.vue:87` |
| `…/plugin-cards/abstract.png` | 500 KB | 720×1280 | 蓝青渐变模糊 | 未使用，引入即新增 500 KB |
| 同名 `.png` 孪生（calendar / notion / spotify / vscode / intelligence / home） | 0.37–3.1 MB | — | — | 未使用，不要用 |
| `apps/nexus/public/shots/SearchFileImmediately.jpg` | 157 KB | 1668×1080 | Finder 截图，里面有个人账户名和设备名 | 不要用 |
| `apps/nexus/public/assets/updates/download-bg.png` | 1.8 MB | 1672×941 | — | `pages/updates.vue:210`，太重 |
| `apps/nexus/public/logo.svg` | 1.1 KB | viewBox 100 | Tuff 标志（渐变 + 模糊滤镜） | favicon / 品牌 |

- 上表前 5 张 JPG 已经作为带 hash 的客户端资源产出（`apps/nexus/dist/_nuxt/{calendar,vscode,notion,spotify,intelligence}.*.jpg`），demo 里再 import **不新增文件**。
- 写法与落地页一致：`import CalendarArt from '~/images/assets/plugin-cards/calendar.jpg'`，得到 Vite 资源 URL 字符串。

### 哪些组件必须给 URL

- 这些组件内部都是 `<img :src>`，纯 CSS 渐变喂不进去：
  - `TxImageGallery`：`items[].url`
  - `TxAttachmentTray`：图片项的 `url`
  - `TxAvatar`：`src`
  - `TxImageUploader`：`modelValue[].url`
  - `TxChatMessage` 的 attachments
- 纯装饰面（卡片底、玻璃背后的彩带）可以用 CSS 渐变，参考 `GlassSurfaceGlassSurfaceDemo.vue:24-40` 的写法。

### 推荐方案

**1. 主力：代码生成 SVG data URI**

- 写成确定性函数：同一个 seed 永远生成同一张图。零网络，任意尺寸，1280 展开时依然清晰。
- 每个 `<img>` 是独立文档，里面的 `id` 不会互相冲突。
- 图里不要放文字：data URI 图片里的 `<text>` 只能用系统字体，外部字体加载不进来。
- 示意：

```ts
// 形状由 seed 决定（波浪 / 光球 / 网格 / 圆环），颜色来自 palette
function artwork(seed: number, [a, b, c]: [string, string, string], motif: 'dunes' | 'orbs' | 'grid' | 'rings', w = 640, h = 400) {
  const body = /* 按 motif 与 seed 生成 <path>/<circle>/<rect>，可加 feGaussianBlur */ ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
```

- 放在哪里：
  - 放模板 `.vue` 里最省事，Uno 抽取和孤儿门禁都没问题。
  - 三个模板共用时可以放 `demos/template-artwork.ts`（门禁不扫 `.ts`），但**里面不能写图标 class**。

**2. 精选：5 张本地 JPG**

- 品牌中性的三张：calendar、notion.jpg（其实是抽象条纹）、intelligence。
- spotify / vscode 带第三方商标，只在「插件封面」这类与落地页一致的语境里用，否则跳过。

**3. 人物头像**：`TxAvatar :name` 加 `background-color`，显示首字母，不用图片。中文名没有空格时取首字。

**4. 系统发件人**：Tuff CI / Nexus Store 等用 `src="/logo.svg"`，同源。

**5. 用户本地图片**：`TxImageUploader` 生成 object URL，只在当前会话有效，不出浏览器。生命周期注意事项见 Gallery 方案。

---

## Component cheat sheets

说明：
- 默认值均出自各组件源码的 `withDefaults` / `defineProps`；「源码」指 `packages/tuffex/packages/components/src/<slug>/`。
- 「浮层」一栏写的是：是否 teleport、定位方式、z-index 从哪来。
- 标注「CMS / 画廊 / 收件箱」的是本分组会用到的组件。

### TxDataTable（`data-table`）— CMS

**导出**

- `TxDataTable`（另有别名 `DataTable`）。
- 类型：`DataTableColumn`、`DataTableKey`、`DataTableSortState`、`DataTableSortOrder`、`DataTableRowKey`、`DataTableHeaderSlotProps`、`DataTableRowClass`。

**Props**（`TxDataTable.vue:10-29`）

| Prop | 默认值 | 说明 |
|---|---|---|
| `columns` | `[]` | |
| `data` | `[]` | |
| `rowKey` | — | 字段名或函数；**不传就用行下标** |
| `loading` | `false` | 转圈遮罩，不是骨架屏 |
| `emptyText` | `'No data'` | |
| `striped` / `bordered` | `false` | |
| `hover` | `true` | |
| `interactiveRows` | `false` | 绑定了 `@row-click` 会自动开启（:39-40） |
| `selectable` | `false` | |
| `selectedKeys` | `[]` | 配合 `v-model:selected-keys` |
| `defaultSort` / `sort` | — | 二选一：前者非受控；后者受控，`null` 表示不排序 |
| `sortOnClient` | `true` | |
| `sortCycle` | `'tri'` | 可选 `'bi'` |
| `tableLayout` | `'auto'` | 可选 `'fixed'` |
| `nowrap` | `false` | |
| `maxHeight` | — | 设置后组件自己成为纵向滚动容器 |
| `scrollX` | `false` | |
| `stickyHeader` / `stickyFooter` | `false` | |
| `rowClass(row, i)` | — | |
| `highlightSelected` | `false` | |

**列定义**（`types.ts:42-58`）

```ts
interface DataTableColumn<T = any> {
  key: string; title: string; dataIndex?: string
  width?: string | number; minWidth?: string | number; maxWidth?: string | number; auto?: boolean
  fixed?: boolean | 'left' | 'right'; nowrap?: boolean; align?: 'left' | 'center' | 'right'
  sortable?: boolean; sorter?: (a: T, b: T) => number; format?: (value: any, row: T, index: number) => string
  headerClass?: string; cellClass?: string
}
```

**Events**：`update:selectedKeys(keys)`、`selectionChange(keys)`、`update:sort(state | null)`、`sortChange(state | null)`、`rowClick({ row, index })`。

**Slots**

| 插槽 | 作用域参数 | 说明 |
|---|---|---|
| `header-<key>` | `{ column, sorted, order, toggle }` | |
| `cell-<key>` | `{ row, column, value, index }` | `index` 是排序后的下标 |
| `footer` | `{ columns, data, selectedKeys }` | 自己写 `<td>` |
| `footer-<key>` | `{ column, data }` | |
| `empty` | — | |

**Expose**：无。

**尺寸**

- 根节点 `width:100%`、圆角 12、`overflow:hidden`；开吸顶后变成 `overflow:auto`（:472-497）。
- 高度随内容，除非给了 `maxHeight`。字符串原样透传（`toCssUnit`，:205-209），所以可以写 `:max-height="'var(--cms-table-h)'"`，让容器查询来改高度。
- 吸顶必须配 `maxHeight` 或一个会滚动的祖先，而且不能放进默认模式的 `TxScroll`（transform 滚动）。
- 单元格 padding 10/12，字号 13px。

**行为要点**

- 前端排序只排传进来的 `data`（:164-177）。分页时必须由宿主先对全量排序再切片：`:sort` 受控 + `:sort-on-client="false"`。
- `toggleAll` 的逻辑是：全选时把选择集**替换**成当前 `data` 的 keys，取消时**清空全部**（:190-194）。所以跨页选择会被冲掉，建议翻页时清空选择。
- 只有复选框单元格带 `@click.stop`（:415）。其他单元格里的按钮 / 下拉点击会冒泡到 `<tr>` 触发 `rowClick`，触发器外面要包 `@click.stop`。
- 聚焦行按 Enter / Space 会触发 `rowClick`；按键来自内部元素时不触发（:327-335）。

**主题变量**

- `--tx-data-table-row-hover-bg`、`--tx-data-table-row-selected-bg`。
- `DataTableRecordsDemo.vue:222-228` 用它们换成了中性的 BUI 灰。

**浮层 / 动效**：无；loading 遮罩带 `backdrop-filter: blur(4px)`。

**借鉴**

- `DataTableRecordsDemo.vue`：吸顶 / 吸底、固定首列，单元格里放 tag / dot / link，受控 `bi` 排序，`NOW` 常量。
- `ComponentsDataOperationsDemo.vue`：分页 + 骨架 + 状态徽标。注意它是先分页再交给表格排序，属于上面说的页内排序问题。
- `FilterChipsFilterTableDemo.vue`：chips 过滤，计数从数据推导。

**坑**

- 表头 / 行复选框的 aria 写死英文 `Select all` / `Select row`。
- 默认空态是 `TxEmptyState variant="no-data"`，`emptyText` 默认英文。
- 没有虚拟化，每页控制在 30 行以内。

### TxFilterChips（`filter-chips`）— CMS 状态 / 画廊合集 / 收件箱栏内文件夹

**导出与类型**

- 导出 `TxFilterChips`；类型 `FilterChipItem`、`FilterChipValue`、`FilterChipsRole`。

```ts
interface FilterChipItem { value: string | number; label: string; iconClass?: string; dot?: string; count?: number; disabled?: boolean }
```

**Props**（运行时对象，`TxFilterChips.vue:17-25`）：

| Prop | 默认值 | 说明 |
|---|---|---|
| `modelValue` | — | **单选** |
| `items` | `[]` | |
| `disabled` | — | |
| `role` | `'toolbar'` | 可选 `'tablist'` |
| `indicator` | `true` | 滑动底色 |
| `iconOnly` | `false` | |
| `ariaLabel` | `'Filters'` | |

**Events / 插槽 / Expose**：`update:modelValue`、`change`；插槽 `chip { item, active }`；无 expose。

**尺寸**

- 横向 flex，`overflow-x:auto`，滚动条隐藏。
- `margin: 0 -4px 4px; padding: 4px`：左右各外扩 4px。
- chip 高 26px、字号 12。宽度撑满父级，溢出时横向滚动。

**BUI**

- 用 `bui-scope`（13px Inter、盒模型 reset）。
- 激活底色是 `--tx-bui-surface` 加 `--tx-bui-shadow-btn`，背景需要是 canvas / inset 这类非 surface 色才看得出来。
- 强调色 `--tx-bui-accent`（#0285ff），与 tuffex 主色 #409eff 不是同一个蓝。

**动效**：指示条 transform / width 0.24s；有 `prefers-reduced-motion`（:328,377）；ResizeObserver + rAF，卸载时清理。

**坑**

- 只能单选。
- `count` 必须由数据推导（文档最佳实践）。
- `iconClass` 只能用已安装的图标集。单测里的 `i-ri-star-line` 在 Nexus 不显示（R6）。

**借鉴**：`FilterChipsFilterTableDemo.vue`。

### TxStatusBadge（`status-badge`）— CMS 状态列 / inspector

- **Props**：`text`（必填）、`status?: 'success'|'warning'|'danger'|'info'|'muted'`、`statusKey`、`icon`、`size='md'|'sm'`、`os?`、`osOnly`。
- **Events**：`click`；只有绑定了监听才变成可键盘操作的按钮。
- **图标**：色盘里的图标是 carbon；`muted` 是虚线空心环。
- **坑**：`os` 用的是 `i-simple-icons-*`，Nexus 没装，会是空白（R6）。不要传 `os`。
- 类型 `StatusTone` 从 `@talex-touch/tuffex/status-badge` 取。

### TxTag（`tag`）

- **Props**：
  - 内容与颜色：`label`、`icon`（图标 class）、`color='var(--tx-color-primary)'`、`background` / `border`（覆盖）。
  - 形态：`size='sm'`（可选 `md`）、`pill`、`variant='outline'|'soft'|'plain'`。
  - 附加：`dot?`、`dotSize=6`、`count?`、`closable`、`closeAriaLabel='Remove tag'`、`disabled`。
- **Events**：`close`、`click`；绑定 click 后变为可交互。
- **用法**：`plain` 会忽略颜色，适合做「+3」这类溢出计数（`DataTableRecordsDemo.vue:156`）。标签列通常用 `variant="soft"` 加 `dot`。

### TxAvatar / TxAvatarGroup（`avatar`）— 三个模板都用

**TxAvatar Props**

| Prop | 说明 |
|---|---|
| `src` / `alt` | 图片失败时回退到首字母 / 图标 |
| `name` | 首字母取首词和末词的首字母；无空格的中文名取首字 |
| `icon` | |
| `size` | 默认 `'medium'`。预设 small 32 / medium 40 / large 48 / xlarge 64，也可以传数字或 px |
| `status?` | `online` / `offline` / `busy` / `away` |
| `shape` | `'circle'` / `'square'` / `'rounded'` |
| `clickable` | 为 true 时才触发 `click` |
| `backgroundColor` | 另有 `textColor`，默认 #fff |

**TxAvatarGroup Props**

- `max`、`size`、`overlap=8`、`hoverEffect='lift'`、`spreadOnHover`、`spreadOverlap`。
- `overflowPopover`（配合 trigger / placement）。
- 默认插槽放 `TxAvatar`。

**暗色**：外圈颜色取 `--tx-bg-color`，暗色下正常。

### TxCellLink（`cell-link`）— CMS slug 列 / inspector

- **Props**：`href`（必填）、`label?`、`external`、`muted`、`underline='hover'|'always'`、`ariaLabel`。
- **Events**：`open({ href, event })`。组件总会 `preventDefault()`，是否导航由宿主决定。在 docs 里不要真的跳走，改成弹 toast。
- **插槽**：`default`。
- **样式**：BUI 强调色，字号 12.5px。

### TxDotIndicator（`dot-indicator`）— 行内状态点、收件箱未读

- **Props**：`color='currentColor'`、`label?`、`size=8`、`ariaLabel?`。既没 label 也没 ariaLabel 时 `aria-hidden`。
- **插槽**：`default` 替换文字。

### TxPagination（`pagination`）— CMS

- **Props**：
  - `currentPage=1`（`v-model:current-page`）、`pageSize=10`、`total?` / `totalPages?`。
  - `prevIcon` / `nextIcon`（carbon 箭头）、`showInfo=false`、`showFirstLast=false`。
  - aria 文案：`ariaLabel`、`firstLabel`、`prevLabel`、`nextLabel`、`lastLabel`，默认英文。
- **Events**：`update:currentPage`、`pageChange`。
- **插槽**：`info { currentPage, totalPages, total }`。
- **布局**：
  - 根节点是**纵向** flex：页码在上、信息在下、居中、间距 8。按钮 32px。
  - 越界页码会被 clamp，并通过 watch 自我修正 v-model（:43-47）。
  - 主题变量 `--tx-pagination-*`。
- **注意**：栏内高度紧，可以关掉 `show-info`，信息文字写在底栏左侧。

### TxSearchInput（`search-input`）与 TxInput

**TxSearchInput**

- **Props**：`modelValue=''`、`placeholder='Search'`、`disabled`、`clearable=true`、`remote=false`、`searchDebounce=200`。
- **Events**：`update:modelValue`、`input`、`focus`、`blur`、`clear`、`search`。回车总会触发 `search`；只有 `remote` 时，输入才会防抖触发。
- **Expose**：`focus`、`blur`、`clear`、`setValue`、`getValue`。
- **结构**：内部渲染 `TxInput`（根 `.tx-input`，宽 100%，高 32，圆角 12），前缀是搜索图标 SVG。
- **坑**：给 `TxSearchInput` 传的 class 会落到 `TxInput` 根上，但不带任何一方的 scope 属性（项目 memory：StoreSearch 实测）。宽度 / 样式要在带 scope 的外层包装上用 `:deep()` 写。

**TxInput（`TuffInput` / `TxInput`）**

- **Props**：`modelValue`、`placeholder`、`type`（text / password / textarea / date / email / number）、`disabled`、`readonly`、`clearable`、`rows`、`prefixIcon`、`suffixIcon`。
- **插槽**：`prefix`、`suffix`。
- `inheritAttrs:false`：attrs 进原生 input，class / style 进外层包装。

### TxButton / TxIconButton / TxSplitButton（`button`）

**TxButton**

- **Props**：
  - `variant`：primary / secondary / ghost / danger / success / warning / info / flat / bare。
  - `size`：sm / md / lg（26 / 32 / 38px）；旧写法 small / mini / large 会被映射。
  - 其他：`block`、`plain`、`dashed`、`round`、`circle`、`loading`（配 `loadingVariant`）、`disabled`、`border=true`、`icon`（class）、`nativeType='button'`。
- **Events**：`click`。
- **动效**：懒加载 v-wave 水波纹，宽度变化走 FLIP 动画。

**TxIconButton**

- **Props**：`icon`、`label`（作 aria；缺失会 warn）、`size`（xs / sm / md / lg）、`shape`（square / circle / pill）、`pressed`（输出 aria-pressed，适合开关型）、`status`。
- **插槽**：默认插槽，参数 `{ hover, pressed }`。

**TxSplitButton**

- **Props**：variant / size / disabled / loading / icon，`menuWidth=200`、`menuPlacement`、`menuOffset`。
- **插槽**：`default`（按钮文字）、`menu { close }`、`menu-icon`。
- **Events**：`click`、`menuOpenChange`。
- 菜单是 TxPopover，会 teleport。
- **坑**：`menuIcon` 默认是 `'i-ri-more-2-line'`（`split-button.vue:16`），在 Nexus 不显示，必须传 `menu-icon="i-carbon-chevron-down"`。
- **借鉴**：`ButtonSplitDemo.vue`，菜单里放 `TxButton plain block`，点击时调 `close()`。

### TxDropdownMenu / TxDropdownItem / TxDropdownSubmenu（`dropdown-menu`）— 行操作 / 排序 / 「更多」

**TxDropdownMenu**（`TxDropdownMenu.vue:8-25`）

- **Props**：
  - 开合与定位：`modelValue?`（可选 v-model）、`placement='bottom-start'`、`trigger='click'|'hover'`、`offset=6`。
  - 行为：`closeOnSelect=true`、`initialFocus='first-item'|'none'`。
  - 面板尺寸：`minWidth=220`、`maxHeight=420`、`unlimitedHeight`。
  - 面板外观：`panelVariant`、`panelBackground='refraction'`、`panelShadow`、`panelRadius=18`、`panelPadding=8`、`animation`。
- **Events**：`update:modelValue`、`open`、`close`。
- **插槽**：`trigger`（引用元素）、`default`（菜单项）。

**TxDropdownItem**

- **Props**：`disabled`、`danger`、`arrow`、`closeOnSelect?`。
- **Events**：`select`。
- **插槽**：`default`（标签）、`right`。
- **没有图标 prop**：需要图标就在默认插槽里写 `<i class="i-carbon-…" />`。

**TxDropdownSubmenu**

- **插槽**：`default`（行标签）、`right`、`menu`（子菜单项）。
- **Props**：placement / offset / width / minWidth / maxHeight / panel*。

**浮层**

- 调用链是 TxPopover → TxTooltip → TxBaseAnchor。
- 面板 teleport 到 body，floating-ui `strategy:'absolute'`（文档坐标）；每次打开取 `zIndexAllocator.next()`（`TxBaseAnchor.vue:914,1037`）。
- 外部点击用 document 捕获阶段的 `pointerdown` 检测（:993），所以外层包 `@click.stop` 不影响它关闭。
- 面板内方向键 / Home / End 会移动焦点。
- anchor 层尊重减弱动效（:721-728）。

**借鉴**：`DropdownMenuDropdownMenuDemo.vue`、`DropdownMenuDropdownSubmenuDemo.vue`、`ComponentsNavigationShellDemo.vue:92-111`。

### TxDrawer（`drawer`）— CMS 编辑器

**Props**

| Prop | 默认值 | 说明 |
|---|---|---|
| `visible` | — | 必填，`v-model:visible` |
| `title` | `'Drawer'` | |
| `size` | `'60%'` | 数字转 px；也可以传 CSS 长度或 `'full'` |
| `full` | — | |
| `direction` | `'right'` | 可选 left / top / bottom |
| `showHeader` / `showFooter` / `showClose` | `true` | |
| `closeOnClickMask` / `closeOnPressEscape` | `true` | |
| `maskEffect` | `'blur'` | 可选 `'opacity'` / `'transparent'` |
| `panelTransparent` | — | |
| `mobileAdapt` | `true` | `window.innerWidth <= 768` 时变成底部抽屉（:105）。看的是**视口**，不是容器 |
| `zIndex?` | — | |
| `lazy` | `true` | 首次打开才挂载内容，之后一直保活 |

**Events / 插槽 / Expose**

- Events：`update:visible`、`open`、`close`。
- 插槽：`header { close, title, titleId }`、`default`、`footer { close }`。
- 无 expose。

**浮层**

- `<teleport to="body">`（:221），根节点 `position:fixed; width:100vw`：全视口遮罩加面板（:297-313）。
- 打开时先 `zIndexAllocator.refresh(10000)` 再 `next()`（:186-195），层级 ≥ 10001，高于 Nexus 顶栏的 10000。
- 抽屉里之后打开的弹层取更大的 `next()`，会盖在抽屉上面。
- 有焦点陷阱，关闭后恢复焦点。挂载时就在 document 上注册了 keydown 监听（Esc / Tab）。

**动效**：0.4s 滑入，`cubic-bezier(0.16,1,0.3,1)`，**没有减弱动效规则**。

**坑**

- 永远是视口级：没有 container / target 参数，栏内使用时会用模糊遮罩盖住整篇文档。
- 关闭按钮的 aria 写死 `Close drawer`。

**借鉴**：`ComponentsNavigationShellDemo.vue:172-204`（抽屉里放表单行 + footer）、`DrawerSlotsEffectsDemo.vue`。

### TxForm / TxFormItem（`form`）— CMS 编辑表单

**TxForm**

- **Props**：`model`、`rules?: Record<string, FormRule | FormRule[]>`、`labelPosition='left'|'right'|'top'`、`labelWidth`、`size`、`disabled`。
- **Events**：`validate(valid)`。
- **Expose**：`validate(): Promise<boolean>`、`resetFields()`、`clearValidate()`。
- 渲染 `<form @submit.prevent>`，纵向 flex，间距 14。

```ts
interface FormRule { required?: boolean; message?: string; validator?: (value: any, rule: FormRule, model: Record<string, any>) => boolean | string | Promise<boolean | string> }
```

**TxFormItem**

- **Props**：`label`、`prop`、`rules`、`required`、`showMessage=true`、`inline`。
- **默认插槽参数**：`{ id, ariaInvalid, ariaDescribedby }`，用来把控件接上 label 和错误提示。
- 错误信息以 `role="alert"` 渲染。

**坑**

- 只在调用 `validate()` 时校验，没有 blur / change 触发。
- `size` / `disabled` 虽然通过 context 提供，但除了 `TxFormItem` 没有任何控件读取 `TX_FORM_CONTEXT_KEY`（grep 证实）。**对输入框无效**。
- `resetFields` 恢复的是各 item 挂载时记下的值。表单要以被编辑记录的 id 作 `:key`。

**借鉴**：`FormFormDemo.vue`。

### TxTextarea（`textarea`）— CMS 摘要 / 正文源码

- **Props**：`modelValue`、`placeholder`、`rows=4`、`disabled`、`readonly`、`maxLength`、`showCount`、`resize='vertical'`、`status='default'|'success'|'error'`。
- **Events**：`update:modelValue`、`input`、`focus`、`blur`。
- **Expose**：`focus`、`blur`、`textareaRef`。
- `inheritAttrs:false`。

### TxTagInput（`tag-input`）— CMS 标签

- **Props**：`modelValue=[]`、`placeholder='Add tag'`、`disabled`、`max=20`、`allowDuplicates=false`、`separators=[',']`、`confirmOnBlur=true`。
- **Events**：`update:modelValue`、`change`、`add(string[])`、`remove(tag)`、`focus`、`blur`。
- **交互**：回车添加；输入为空时按 Backspace 删除最后一个。标签用 `TxTag` 渲染。

### TxSelect / TxSelectItem（`select`）— CMS 栏目 / 作者

**Props**（`TxSelect.vue:15-47`）

- 值与状态：`modelValue=''`（`multiple` 时为数组）、`placeholder='Please select'`、`disabled`、`multiple`、`status`。
- 选项：`eager=true`、`options`（选项或选项组）、`maxTagCount`。
- 搜索与创建：`searchable`、`editable`、`remote`、`allowCreate`。
- 加载与空态：`loading`、`emptyText='No results'`。
- 面板：`dropdownMaxHeight=280`、`panel*`。

```ts
interface TxSelectOption { value: string | number; label: string; disabled?: boolean; icon?: string; description?: string }
interface TxSelectOptionGroup { label: string; disabled?: boolean; options: TxSelectOption[] }
```

**Events / Expose**

- Events：`update:modelValue`、`change`、`search`、`create`。
- Expose：`open`、`close`、`toggle`、`focus`、`blur`、`clear`…（:540）。

**尺寸与浮层**

- 根节点 `width: 240px; max-width: 100%`（:941），表单里要显式给宽度。
- 面板是 TxPopover，会 teleport，宽度对齐触发器。

**坑**：`eager: true`，面板从首帧起就挂在 body 里。

### TxFlatSelect / TxFlatSelectItem（`flat-select`）

- **用法**：Props 为 `modelValue`、`placeholder`、`disabled`；选项写成 `<TxFlatSelectItem value label disabled />`。
- **Events**：`update:modelValue`、`change`。
- **浮层**：**不 teleport**。下拉是组件内的 `position:absolute; z-index:3`（`TxFlatSelect.vue:391-398`），用 clip-path 动画；在 document 上监听 click / keydown。最小宽 120，触发器高 34。
- **坑**：
  - 会被有 `overflow` 的祖先裁切或撑出滚动：抽屉 body、`TxGlassSurface`（`overflow:hidden`）、`.docs-prose` 的 paint containment。
  - 没有减弱动效规则。
  - **放在玻璃工具条里时用 `TxDropdownMenu` 代替**。

### TxDatePicker（`date-picker`）— CMS 发布时间

- **Props**：
  - 值：`modelValue`，格式 `YYYY-MM-DD`；`range` 时为 `[start, end]`。
  - 形态：`variant`，默认 `'picker'` 是底部弹层里的滚轮；`'field'` 是输入框 + 日历 popover；`'adaptive'` 在 `window.innerWidth >= 768` 时用 field。
  - 其余：`visible`（picker 模式的 v-model）、`popup=true`、`title`、`placeholder`、`min`、`max`、`disabled`、`showToolbar`、`confirmText` / `cancelText`、`closeOnClickMask`、`weekStartsOn`、`rangeSeparator=' → '`。
- **Events**：`update:modelValue`、`change`、`update:visible`、`confirm`、`cancel`、`open`、`close`。
- **桌面表单用 `variant="field"`**：popover 会 teleport，最小宽 280。
- **坑**：星期表头写死英文 `['Sun', …]`（:418-421），中文页也显示英文。
- **借鉴**：`DatePickerDatePickerDemo.vue`。

### TxSwitch（`TuffSwitch` / `TxSwitch`）— CMS 置顶 / 允许评论

- **Props**：`modelValue`、`disabled`、`loading`、`size='small'|'default'|'large'`、`label`（变化时经 `TxTextTransformer` 形变）、`labelPlacement='start'|'end'`、`ariaLabel='Toggle'`、`ariaLabelledby`。
- **Events**：`update:modelValue`、`change`。
- **注意**：尺寸命名是 small / default / large，和 TxButton（sm / md / lg）、TxTag（sm / md）、TxAvatar（small…xlarge）、TxFlatRadio（sm…xl）各不相同，写错会有类型错误。

### TxMarkdownEditor（`markdown-editor`）— 已评估，不建议原样使用

**API**

- **Props**：`modelValue`、`placeholder`、`mode`（受控）/ `defaultMode='wysiwyg'|'source'|'preview'`、`disabled`、`readonly`、`sanitize=true`、`theme='auto'`、`toolbar=true`、`toolbarActions`、`minHeight=220`、`maxHeight`、`ariaLabel`、`linkPrompt`。
- **Events**：`update:modelValue`、`change`、`update:mode`、`mode-change`、`focus`、`blur`。
- **Expose**：`focus`、`blur` 等。

**分量**

- dist 里 `TxMarkdownEditor.vue.js` 18.6 KB，另有 serializer 4 KB、CSS 5.3 KB；`marked` / `dompurify` 懒加载。
- WYSIWYG 模式用 `document.execCommand`（:181-185），并在 html / body 上挂 MutationObserver。

**在 Nexus 的问题**

- 工具栏和模式按钮的图标全是 `i-ri-*`（:34-53）。Nexus 没有安装 `ri` 图标集。
- 根节点在暗色下带 `data-theme="dark"`（:481），被 `.dark` 泄漏命中（R2）。
- 两点都被 pro-gallery 任务 R3 实测：工具栏图标全是灰方块，底部有一条怪异光带。

**结论**：CMS 正文用 `TxTextarea`（源码）配 `TxMarkdownView` 预览。等图标和泄漏都修好后再考虑换回。

### Toast：TxToastHost + `toast()`（`toast` + utils）

- **`toast()` 签名**：

  ```ts
  toast({ id?, title?, description?,
          variant?: 'default'|'info'|'success'|'warning'|'danger',
          duration?: number,   // 默认 2600，0 表示常驻
          action?: { label, onClick?(id), dismiss?: boolean } }): string
  ```

- **配套函数**：`dismissToast(id)`、`clearToasts()`、`pauseToasts()` / `resumeToasts()`。
- **TxToastHost Props**：`position='bottom-right'`（`TxToastHost.vue:21`）、`visibleToasts=3`、`expand`、`gap`、`offset`、`swipeToDismiss`。
- **浮层**
  - host teleport 到 body（:319），`position:fixed` 贴视口边；每条 toast 取 `nextZIndex()`。
  - **先挂载的 host 独占渲染**（`host-registry.ts`），后来的 host 空着。同页有多个 demo 时，位置以第一个 host 为准。
  - Nexus 自己的 toast（`LazyToastContainer`、`composables/useToast.ts`）是另一套系统。
- **动效**：有减弱动效规则（:614）；悬停时暂停计时。
- **坑**：生产环境里 `toast()`（dist）和自动注册的 host（源码）是两份队列，toast 不会出现（R1）。
- **框内替代**：`TxToastPanel`（受控 `open`，可选 tether、`side='below'|'above'`、`stack`）。它**就地渲染**，隐藏时仍占位（opacity + transform），位置由宿主决定。参考 `ToastPanelToastPanelDemo.vue`。

### TxEmptyState / TxSearchEmpty / TxNoSelection（`empty-state` / `search-empty` / `no-selection`）

- **EmptyStateProps**：
  - `variant`：empty / blank-slate / no-data / no-selection / search-empty / loading / offline / permission / error / guide / custom。
  - 文案与图标：`title`、`description`、`icon`（传 `null` 隐藏）、`iconSize`。
  - 布局：`layout='vertical'|'horizontal'`、`align`、`size='small'|'medium'|'large'`、`surface='plain'|'card'`。
  - 操作：`primaryAction` / `secondaryAction`，结构为 `{ label, type?, variant?, size?, disabled?, icon? }`；`actionSize='sm'`；`loading`。
- **Events**：`primary`、`secondary`。**插槽**：`icon`、`title`、`description`、`actions`。
- `TxSearchEmpty` / `TxNoSelection` = `Omit<EmptyStateProps, 'variant'>` 的包装，只是把 variant 固定住。
- **默认文案是英文**（`No results`、`Nothing selected`…），必须传本地化的 title / description。
- **动效**：插画 SVG 无限循环动画（如 `tx-empty-state-search-pan 3s … infinite`，`TxEmptyState.vue:598`），**没有减弱动效规则**。
- **进行中**：并行会话在改 `TxEmptyState.vue`（新 error 插画），目前 API 未变。
- **借鉴**：`ComponentsSearchFiltersDemo.vue:130-138`（search-empty + 重置主操作）。

### 骨架屏家族（`skeleton`）

- **TxSkeleton**：`loading=true`（为 false 时渲染默认插槽）、`variant='text'|'rect'|'circle'`、`width='100%'`、`height=12`、`radius=8`、`lines=1`、`gap=10`；`aria-hidden`。
- **TxListItemSkeleton**：2rem 图标 + 两条 + 徽标，形态接近邮件行。
- **TxCardSkeleton**、**TxRowSkeleton**：`rows`、`leading`、`description`、`trailing`、`separated`、`titleWidth`、`descWidth`。
- **useDeferredLoading**：`useDeferredLoading(source, { delay=150, minDuration=400 })` 返回 `Ref<boolean>`。延迟出现、保底时长，快速返回时不会闪。
- **动效**：减弱动效下关闭 shimmer（`style/mixins.scss:161-165`）。

### TxImageGallery（`image-gallery`）— 画廊变体条

- **类型**：`interface ImageGalleryItem { id: string; url: string; name?: string }`。
- **Props**：`items`（必填）、`startIndex=0`（只设下标，**不会打开**）、`previousLabel` / `nextLabel`（aria）、`previousText='Prev'` / `nextText='Next'`（可见文字）、`previewTitle='Preview'`、`itemLabelFormatter`、`openLabelFormatter`。
- **Events**：`open({ index, item })`、`close`。**没有插槽，没有 expose**。
- **自带灯箱**
  - 点缩略图后打开 `TxModal`，`width="min(92vw, 880px)"`（`TxImageGallery.vue:103`），大图 max-height 70vh。
  - footer 有 Prev / Next 按钮和 `i / n` 计数。
  - 没有方向键、没有滑动手势、没有说明文字，**不能从外部打开**。
- **网格**：`repeat(auto-fill, minmax(92px, 1fr))`，正方形缩略图（`aspect-ratio:1`），间距 10，`<img loading="lazy">`（:126-147）。
- **定位**：适合当详情里的「变体 / 同系列」缩略条，用 `:deep(.tx-image-gallery__grid)` 改列数；不适合当主网格。
- **没有减弱动效**：灯箱动效来自 TxModal。

### TxFlipOverlay（`flip-overlay`）— 画廊「卡片 → 详情」

**Props**

- 开合与起点：`modelValue`、`source`（`HTMLElement | DOMRect | null`）、`sourceRadius`。
- 动画：`duration=480`、`rotateX=6`、`rotateY=8`、`tiltRange=2`、`randomTilt=true`、`perspective=1200`、`speedBoost` / `speedBoostAt`、`easeOut` / `easeIn`（GSAP 缓动）。
- 遮罩与关闭：`maskClosable=true`、`preventAccidentalClose`、`globalMask=true`。
- 外观：`border`、`surface='mask'|…`、`surfaceColor`、`surfaceOpacity=0.96`。
- 头部：`header=true`、`headerTitle`、`headerDesc`、`closable`、`closeAriaLabel='Close'`。
- 其他：`scrollable=true`、`maskClass`、`cardClass`、`cardStyle`、`expanded` / `animating`（同步动效状态用）。

**Events / 插槽 / Expose**

- Events：`update:modelValue`、`open`、`opened`、`close`、`closed`、`update:expanded`、`update:animating`。
- 插槽：`default`、`header`、`header-display`、`header-actions`、`header-close`，都拿到 `{ close, expanded, animating, closable, headerTitle, headerDesc }`。
- Expose：`close()`。

**尺寸**

- 卡片大小由内容决定：`position:fixed`，left / top 50% 居中，`max-width: calc(100vw - 24px)`，`max-height: calc(90dvh - 24px)`。
- 尺寸用 `cardStyle` 传（文档最佳实践）。

**动效**

- GSAP 懒加载（`import('gsap')`）。
- 目标中心取 `window.innerWidth / innerHeight`（`flip-overlay-motion.ts:225-226`）。
- **没有减弱动效处理**。打开期间锁 body 滚动（`flip-overlay-body-scroll-lock.ts`）。
- z-index 从分配器取。

**teleport 现状（阻塞项）**

- HEAD：遮罩和卡片**就地渲染**。
- docs 正文 `.docs-prose { content-visibility: auto }` 施加了 layout + paint containment，于是成了 fixed 后代的包含块，并且会裁切。
- 结果：卡片以整篇文章为中心，聚焦时页面被滚走约 870px，翻转起点跑出屏幕（pro-gallery 任务 R4）。
- 工作树里有**未提交**的修复：外包 `<Teleport to="body">`，设 `inheritAttrs:false`，把 `v-bind="$attrs"` 挪到遮罩上。
- 模板必须等这个修复进 dist 才能用。

**借鉴**：`FlipOverlayFlipOverlayDemo.vue`（`source` 取 `triggerRef.$el`）。

### TxSegmentedSlider（`segmented-slider`）— 缩略图尺寸

- **类型**：`interface SegmentedSliderSegment { value: number | string; label?: string }`。
- **Props**：`modelValue=0`、`segments=[]`、`disabled`、`showLabels=true`、`vertical`。
- **Events**：`update:modelValue`、`change`。
- **语义**：radiogroup，支持方向键 / Home / End。
- **尺寸**：
  - 宽 100%，min-height 32px + 上下 padding 8；圆点均匀分布在轨道 0% 到 100%。
  - 标签是绝对定位（`top: calc(100% + 8px)`，居中于圆点，:279-282）。首尾标签会横向溢出半个标签宽，纵向约溢出 20px。
  - 外层要留左右 padding 和底部 margin。
- **动效**：有减弱动效规则（:291）。

### TxFlatRadio / TxFlatRadioItem（`flat-radio`）— 布局切换 / 语言

- **TxFlatRadio Props**：`modelValue`（必填；`multiple` 时为数组）、`multiple`、`disabled`、`size='sm'|'md'|'lg'|'xl'`、`bordered`。
- **TxFlatRadioItem Props**：`value`、`label`（可见文字）、`icon`（class）、`disabled`；插槽 `default`、`icon`。
- **指示条**：滑动指示条基于 `useIndicatorBox`（ResizeObserver），尊重减弱动效。
- **纯图标用法**：不传 `label`，改传 `aria-label` / `title`，attrs 会透传到 item 的 `<button>`。
- **借鉴**：`FlatRadioIconDemo.vue`（grid / list / kanban）。

### TxTabs / TxTabItem 与 TxTabBar（`tabs` / `tab-bar`）

**TxTabs**

- `modelValue` 就是当前 `TxTabItem` 的 `name`，而 `name` 同时是显示文字。切语言时值会跟着变；`TabsTabsDemo.vue` 为此在 locale 变化时重新赋初值。
- 其他 props：`placement` 默认 `'left'`（`TxTabs.vue:66`）、`navMinWidth` / `navMaxWidth`、`contentPadding`、`contentScrollable`、`borderless`、`autoHeight` / `autoWidth`、`indicatorVariant`、`indicatorMotion`、`animation`。
- 组件较重，1441 行。
- **建议**：合集切换用 `TxFilterChips role="tablist"`；只有确实需要面板内容时才用 TxTabs。

**TxTabBar**：items 为 `{ value, label, iconClass, badge, disabled }`，另有 `indicator`、`size`、`fixed`（底栏）。偏移动端风格。

### TxRating（`rating`）— 画廊

- **Props**：
  - 值与范围：`modelValue=0`、`maxStars=5`、`precision`（1 或 0.5）。
  - 状态：`disabled`、`readonly`、`showText`。
  - 图标：`icon` / `filledIcon` / `emptyIcon` / `halfIcon`，默认内置 `'star'`，不依赖图标集。
  - 颜色与尺寸：`filledColor` / `emptyColor` / `hoverColor` / `textColor`、`size`、`gap`、`animated=true`。
  - 无障碍：`starLabel(star) => string`，需要本地化，默认 `Rate N star(s)`。
- **Events**：`update:modelValue`、`change`。
- **用法**：卡片上 `readonly`，详情里可交互。

### TxGlassSurface（`glass-surface`）— 画廊浮动工具条 / 详情大图说明

- **Props**（`glass-surface/index.ts:4-38`）：
  - 尺寸：`width='200px'`、`height='200px'`、`borderRadius=20`、`borderWidth`。
  - 玻璃参数：`brightness`、`opacity`、`blur=11`、`displace`、`backgroundOpacity=0`、`saturation`。
  - 折射参数：`distortionScale`、`red` / `green` / `blueOffset`、`x` / `yChannel`、`mixBlendMode`。
- **默认插槽**：内容放在 `.tx-glass-surface__content` 里，默认 flex 居中；左对齐要自己包一层。
- **渲染**：
  - Chromium：每个实例一个 SVG 位移滤镜，经 `backdrop-filter: url(#id)`；ResizeObserver 触发重建位移图。
  - Safari / Firefox：`backdrop-filter: blur()`。
  - 都不支持时：半透明面。
  - 着色取 `--tx-surface-refraction-mask-rgb`：亮色白、暗色黑。
- **坑**：
  - 必须传宽高（如 `width="100%"`）。
  - `overflow:hidden`。
  - `backdrop-filter` 让它成为 fixed 后代的包含块。
  - 背后要有足够繁杂的图像才看得出效果（pro-gallery 任务 R6：「看不出玻璃、偏离中心」）。
  - 每个实例一套滤镜，数量控制在 2 个以内。

### TxEdgeFadeMask（`edge-fade-mask`）— 画廊滚动区

- **Props**：`as='div'`、`axis='vertical'|'horizontal'`、`size=24`、`threshold=1`、`disabled`、`observeResize=true`。
- **插槽**：默认插槽放滚动内容。
- **结构**：
  - 根节点 `relative`，纵向模式需要显式高度。
  - 里面是 `.tx-edge-fade-mask__viewport`（100%×100%，`overflow-y:auto`）。
  - 只有可滚动时才加内联 `mask-image` 渐变；滚动、resize、`onUpdated` 时更新。
- **注意**：
  - 边框、圆角放在父级上。
  - mask 会作用到其内部绘制的一切，包括没 teleport 的浮层，所以浮层不要放在里面。

### TxModal（`modal`）

- **Props**：`modelValue`（必填）、`title=''`、`width='480px'`。
- **Events**：`update:modelValue`、`close`。**插槽**：`header`、`default`、`footer`。
- **浮层**
  - teleport 到 body（:107），遮罩 `position:fixed; inset:0` 带模糊。
  - 打开时取 `next()`（:44）。
  - Esc 挂在已聚焦的遮罩元素上（:119）；有焦点陷阱，关闭后恢复焦点。
- **动效**：淡入 + 缩放关键帧，**没有减弱动效规则**。
- **文案**：关闭按钮 aria 写死 `Close`。
- **注意**：打开期间内容 `v-if` 挂载，关闭即卸载。

### TxImageUploader（`image-uploader`）— 画廊上传

- **类型**：`interface ImageUploaderFile { id: string; url: string; name?: string; file?: File }`。
- **Props**：`modelValue`（必填）、`multiple=true`、`accept='image/*'`、`disabled`、`max=9`、`uploadText='Upload'`、`removeLabel(name)`。
- **Events**：`update:modelValue`、`change`、`remove({ id, value })`。
- **只在本地**：
  - 用 `URL.createObjectURL`，只回收自己创建的 URL：remove 时、单选替换时、**卸载时**。
  - 所以它必须一直挂着，别的组件才能继续用这些 URL。放在 `TxPopover`（`keepAliveContent` 默认 true）里可以；放在 `TxModal` 里不行，内容会被 `v-if` 卸载。
- **渲染**：组件自己渲染一个网格（添加格 + 预览）。

### TxBadge（`badge`）

- **Props**：`variant='default'|'primary'|'success'|'warning'|'error'`、`value`（数字时用 TxTextMorph 滚动数位）、`color`、`dot`、`open=true`（切换时播放滑入 / 弹出）。
- **形态**：是行内胶囊，不是角标定位；默认插槽可覆盖内容。

### TxTooltip / TxPopover（`tooltip` / `popover`）

- **TxTooltip**：
  - 默认插槽是引用元素；内容用 `content` 字符串或 `#content` 插槽。
  - `trigger`：hover / click / focus / manual；`openDelay` / `closeDelay`、`interactive`。
  - `anchor`：placement、showArrow、panelBackground、panelShadow…
- **TxPopover**：
  - 插槽 `#reference` + 默认面板。
  - Props：placement、width / minWidth / maxWidth / maxHeight、`trigger`（click / hover / manual）、`keepAliveContent=true`、`panel*`。
  - Expose：`updatePosition`。
- **共同点**：都走 TxBaseAnchor，teleport，分配器给 z-index，尊重减弱动效；共享的 anchor-delay 服务会关掉同类的其他提示。
- **借鉴**：`ComponentsFeedbackTaskCenterDemo.vue:120-127`、`ComponentsNavigationShellDemo.vue:113-133`。

### TxStagger（`stagger`）— 画廊入场

- **Props**：`tag='div'`、`appear=true`、`name='tx-stagger'`、`duration=180`、`delayStep=24`、`delayBase=0`、`easing`。
- **结构**：渲染一个 TransitionGroup，外层是 `tag` 指定的元素，带 class `tx-stagger`。子项必须有 key，下标通过 `--tx-stagger-index` 传入。
- **动效与限制**：
  - 进场是 opacity + translateY(6px)。
  - 没有 `-move` class，重排不会动画。
  - 离场过渡期间元素仍占位。
  - **没有减弱动效规则**。
  - 文档明确说：不要包裹虚拟列表的行。
- **重播**：给 TxStagger 换 key，让它重挂载。

### TxSplitter（`splitter`）— 收件箱列表 | 阅读

- **Props**：`modelValue=0.5`（0..1 的比例）、`direction='horizontal'|'vertical'`、`min=0.1`、`max=0.9`、`disabled`、`barSize=10`（最小 6）、`snap=0`。
- **Events**：`update:modelValue`、`change`、`drag-start`、`drag-end`。
- **插槽**：`a`、`b`。无 expose。
- **布局**
  - 根节点 `width:100%; height:100%; display:grid`，列为 `minmax(0, ratio*100%) bar minmax(0, (1-ratio)*100%)`（`TxSplitter.vue:196-201`）。
  - `overflow:hidden`，自带边框、圆角 14 和背景（:183-194）。
  - **必须放在有明确高度的父级里**。
  - 只有两个窗格：三栏布局要嵌套两个 splitter，或者「grid + 一个 splitter」。
- **把手与键盘**：把手是 28×28 的玻璃块，带 backdrop-filter；键盘每次调整 ±0.02。
- **坑**：
  - 比例是分数，容器从 784 变到 1280 时各窗格等比放大，侧栏会跟着变宽。
  - 嵌套时边框和圆角会叠两层，要用 `:deep()` 去掉内层的。
  - aria 写死 `Resize`。

### TxSidebarNav（`sidebar-nav`）— 收件箱文件夹（展开态）

**类型**（`types.ts:3-66`）

```ts
interface SidebarNavItem { value: string | number; label: string; group?: string; icon?: string; badge?: string | number; action?: { label: string }; disabled?: boolean }
interface SidebarNavGroup { key: string; label: string }
interface SidebarNavWorkspace { name: string; description?: string; initials?: string }
```

**Props**

- 必填 `items`；`groups`。
- 绑定：`modelValue`（v-model）、`query`（v-model:query）。
- 可省略的区块：`workspace`（不传则去掉工作区切换）、`searchPlaceholder`（不传则去掉搜索行）、`actionLabel`（不传则去掉主按钮）。
- 其他：`workspaceLabel`、`searchLabel`、`searchHint`、`filter`、`ariaLabel='Workspace'`、`indicatorDuration=220`。

**Events / 插槽 / Expose**

- Events：`update:modelValue`、`update:query`、`select(item)`、`action`、`itemAction(item)`、`workspaceClick`。
- 插槽：`workspace`、`item-icon { item, active }`、`footer`。
- Expose：`focusSearch`、`refreshIndicator`。

**尺寸**

- 宽度 `var(--tx-bui-sidebar-nav-width, 240px)`（:340）。
- 自带面：`--tx-bui-surface` 背景、卡片圆角、`--tx-bui-shadow-raised` 阴影。
- 在外层包装上改写自定义属性即可覆盖：`--tx-bui-sidebar-nav-width: 100%`、`--tx-bui-shadow-raised: none`。

**动效**：badge 数值变化会重播弹入动画；尊重减弱动效（:693）。

**坑**

- 单字符 `searchHint` 会在 **document** 上注册 keydown，并对该键 `preventDefault()`（:148-166）。
- 这会让 Nexus 在 window 上监听的全站 `/` 搜索（`app.vue:182-185`）失效。
- 模板**不传 `search-hint`**，或者只用多字符字形。

**借鉴**：`SidebarNavSidebarNavDemo.vue`（通过 `#item-icon` 插槽传内联 SVG 图标）。

### TxTree（`tree`）— 可选：嵌套标签

- **类型**：`TreeNode { key; label; children?; leaf?; disabled?; icon? }`。
- **Props**：`nodes`、`modelValue`、`multiple`、`selectable`、`checkable`、`disabled`、`defaultExpandedKeys`、`defaultSelectedKeys`、`expandedKeys`、`indent=16`、`filterText`、`filterMethod`。
- **Events**：`update:modelValue`、`select`、`toggle`、`update:expandedKeys`。
- **插槽**：
  - `item { node, level, expanded, hasChildren, selected, toggleExpand, toggleSelect, indent }`
  - `empty`：默认文案英文 `No results`。
- **说明**：没有内置计数 / 徽标，要用 `#item` 自己画；键盘交互是完整的 ARIA tree。

### TxVirtualList（`virtual-list`）— 收件箱列表

- **Props**（泛型 T）：
  - `items=[]`、`itemHeight`（必填，固定 px）、`overscan=4`、`itemKey`（字段或函数；缺失时回退到下标）。
  - `height=320`：数字转 px；`'100%'`、`vh`、`rem` 这类值会等真实 `clientHeight`，并由 ResizeObserver 跟随。
- **Events**：`scroll({ scrollTop, startIndex, endIndex })`。
- **插槽**：`item { item, index }`。
- **Expose**：`scrollToIndex`、`scrollToTop`、`scrollToBottom`。
- **结构**：
  - 滚动容器 `.tx-virtual-list`（overflow auto）→ spacer → 条目包装层。
  - 包装层带 `transform: translateY()`（:133），会成为 fixed 后代的包含块。
  - 每一行 `display:flex; align-items:center; height: itemHeight`。行内容要写 `flex:1` / `width:100%`。
- **坑**：
  - 没有 role 和键盘交互。宿主按文档补 `listbox` / `option`，以及用真实总数和绝对下标算的 `aria-setsize` / `aria-posinset`。
  - pro-gallery 任务 R8 提到画廊格里它「窄、贴左」，属于 specimen 的样式问题。
- **借鉴**：`VirtualListVirtualListDemo.vue`。

### TxMarkdownView（`markdown-view`）— 收件箱阅读区 / CMS 预览

- **Props**：`content`（必填）、`sanitize=true`、`theme='auto'|'light'|'dark'`。
- **渲染**：
  - 根节点 `<div class="tx-md tx-markdown-view {light|dark}" :data-theme>`（:152），里面是 `.markdown-body`。
  - 静态引入 `Marked`，开 gfm + breaks。`sanitize=true` 时，DOMPurify 加载完成前渲染空字符串。
  - 全局的 github-markdown 样式用 `:where(.tx-md)` 限定作用域。
  - 内层 `.markdown-body` 字号是 16px，信息密集的阅读区要自己覆盖。
- **主题**：`theme="auto"` 监听 html / body 的 class 和 data-theme。
- **坑**：暗色下根节点同时带 `dark` class 和 `data-theme="dark"`，**被 `.dark` 泄漏命中**（R2）。

### TxMessageActions（`message-actions`）— 收件箱阅读操作条

- **Props**：
  - 功能开关：`copyText`（传了才启用内置复制，走 `navigator.clipboard`）、`regenerable`、`speakable`、`speakState`。
  - 入场：`appear=true`。
  - 文案：`copyLabel` / `copiedLabel` / `regenerateLabel` / `speakLabel` / `stopSpeakLabel`、`label='Message actions'`。
- **Events**：`copy(text)`、`regenerate`、`speak`。
- **默认插槽**：放进去的按钮加入同一个 roving toolbar，方向键可在其间移动。
- **样式**：按钮 26×26。插槽按钮要加 class `tx-message-actions__btn` 才能套上同样的外观（全局样式）。
- **`appear` 动画**：0.9s 模糊 + 位移，`fill-mode: both`（:208-209）。结束后操作条上会残留 `filter: blur(0)` 和 `transform`。有减弱动效规则（:266）。

### TxChatComposer（`chat`）— 收件箱回复

**Props**（`types.ts:35-55`）

| Prop | 默认值 | 说明 |
|---|---|---|
| `modelValue` | — | |
| `placeholder` | `'Message…'` | |
| `ariaLabel` | — | |
| `disabled` / `submitting` | — | |
| `allowAttachmentWhileSubmitting` | — | |
| `minRows` / `maxRows` | `3` / `6` | |
| `sendOnEnter` | `true` | |
| `sendOnMetaEnter` | `true` | |
| `allowEmptySend` | — | |
| `sendButtonText` | `'Send'` | |
| `showAttachmentButton` / `attachmentButtonText` | — | |
| `attachments` | — | `ChatComposerAttachment { id; label; kind?; pending? }` |

**Events**：`update:modelValue`、`send({ text })`、`attachmentClick`、`paste`、`attachmentAdd(files)`（来自粘贴 / 拖放）、`focus`、`blur`。

**插槽**：`attachments { attachments }`、`toolbar { send, disabled, attachmentClick }`、`toolbar-left`、`actions { send, disabled }`、`footer`。

**外观**：根节点宽 100%、圆角 16，背景 `--tx-fill-color-blank`（暗色下是透明）。

**邮件场景**：设 `:send-on-enter="false"`，⌘ / Ctrl+Enter 发送（文档最佳实践）。

### TxAttachmentTray / TxAttachmentChip（`attachment-tray`）

- **类型**：`attachments` 为 `AiAttachment[]`，类型从 `@talex-touch/tuffex/ai-elements` 取：

  ```ts
  type AiAttachment =
    | { kind: 'image'; id: string; url: string; name?: string; width?: number; height?: number }
    | { kind: 'file'; id: string; name: string; size?: number; mime?: string }
  // 以上任一形态都可以再带 { progress?: number; uploading?: boolean }
  ```

- **Props**：`attachments`（必填）、`removable`、`sizeFormatter`，以及 7 个默认英文的文案 prop：`previewTitle`、`previousLabel`、`nextLabel`、`previousText`、`nextText`、`removeLabel`、`cancelLabel`。
- **Events**：`remove(id)`、`cancel(id)`、`open(fileAttachment)`。
- **行为**：图片自带 TxModal 预览（有 prev / next）；坏图显示占位。
- **借鉴**：`AttachmentTrayAttachmentTrayDemo.vue`。它用了 picsum，模板里要替换掉。

### TxKbd（`kbd`）/ TxContextMenu（可选）

- **TxKbd**：Props `size='sm'|'md'`、`tone='default'|'primary'`；插槽是键名。可以放进 `TxNoSelection` 的 `#description`，提示 J / K / E 等快捷键。
- **TxContextMenu**：
  - Props：`trigger='contextmenu'|'click'|'both'|'manual'`、`anchorMode='pointer'|'reference'`、`closeOnSelect`、`panel*`…
  - 子项用 `TxContextMenuItem` / `Divider` / `Submenu`。teleport 方式与其他 anchor 一致。
  - 可选用途：收件箱行 / 画廊卡片的右键菜单。

---

## Template proposals

通用约定（三份都适用）：

**根节点**

- `<section class="tpl-xxx not-prose">`，`container: tpl-xxx / inline-size`。
- `height: var(--tpl-height, 540px)`、`width: 100%`、`overflow: hidden`、圆角 16。
- 背景用 `--tx-bg-color` 或 `--tx-bui-canvas`。

**只能用的变量**：`--tx-*` / `--tx-bui-*`。**不要**引用 `--docs-*`、`--tuff-demo-*`（teleport 后就没了）。

**两层响应式**

- 纯 CSS 的布局变化用 `@container`。
- props 需要知道的状态（列集合、每页条数、是否显示 inspector）由根节点上一个 ResizeObserver 算出 `mode = 'narrow' | 'column' | 'wide'` 来驱动。
- 阈值建议：`narrow < 620`、`column 620–999`、`wide ≥ 1000`。栏内 784 属于 column，展开的 1280 属于 wide。

**浮层层级**：弹 Drawer / Modal / FlipOverlay 前先抬高分配器下限，并与组件用同一份分配器（R3）：

```ts
refreshZIndex(NEXUS_OVERLAY_LAYER_SEED, reason)
// refreshZIndex 从 '@tuffex-components/utils' 引入
// NEXUS_OVERLAY_LAYER_SEED（10100）从 '~/utils/layers' 引入
```

**反馈**

- 优先用框内的 `TxToastPanel`。
- 用 `toast()` 时从 `@tuffex-components/utils` 引入（R1）。
- `onMounted` / `replayDemo` 时 `clearToasts()`。

**生命周期**

- `defineExpose({ replayDemo })`：重置状态、清计时器、关掉浮层。
- 所有计时器在 `onBeforeUnmount` 里清理。

**命名**：`TemplateCmsDemo.vue`、`TemplateGalleryDemo.vue`、`TemplateInboxDemo.vue`，符合 PRD 的 `Template<Name>Demo.vue`。

### CMS 内容管理 — 「Nexus 内容工作台」

**设定**：管理 tuff.tagzxia.com 的文档 / 博客内容，包括发布说明、上手指南、插件聚光灯、工程博客。

**栏内布局（784×540，column 模式）**

```
┌─────────────────────────────────────────────────────────────────── 784 ─┐
│ 内容工作台  24 篇                       [🔍 搜索标题 / slug      ] [+ 新建] │ 44  标题 + TxSearchInput + TxButton
│ (全部 24)(草稿 6)(审核中 3)(已排期 2)(已发布 11)(已归档 2)                  │ 34  TxFilterChips（点 + 推导计数）
│┌───────────────────────────────────────────────────────────────────────┐│
││☐│ 标题                          │ 状态     │ 作者        │ 更新 ▾ │ ⋯  ││ 表头吸顶
││☐│ Tuff 2.4 发布说明  [发布说明]    │ ●已发布  │ (LQ) 林乔    │ 2 小时前│ ⋯  ││
││☐│ 用 50 行 Prelude 写汇率插件 📌   │ ◐审核中  │ (MO) Mara   │ 昨天    │ ⋯  ││ TxDataTable，每页 8 行
││ …                                                                     ││ max-height: var(--cms-table-h)≈370
│└───────────────────────────────────────────────────────────────────────┘│
│ 已选 3 · [发布] [归档] [删除]                          ‹ 1 [2] 3 4 ›      │ 44  批量栏 / 分页（关 show-info）
└──────────────────────────────────────────────────────────────────────────┘
行点击 / 聚焦行回车 / 行菜单「编辑」→ TxDrawer（右侧，size="min(480px, 92vw)"），盖住整页
```

**展开（≥1000 容器，1280×800，wide 模式）**

```
┌ 内容工作台  24 篇  · 本周浏览 18.2k · 待审核 3 ──────── [🔍 ……] [+ 新建] ──────────────────────┐
│ (全部)(草稿)(审核中)(已排期)(已发布)(已归档)                                                    │
│┌──────────────────────────────────────────────────────┐┌──────── inspector 340 ──────────────┐│
││☐ 标题 │栏目 │状态 │作者 │语言 │浏览 │更新 ▾│⋯        ││ ●已发布  zh+en   /blog/tuff-2-4 ↗     ││
││ 每页 12 行，--cms-table-h 更高                        ││ (LQ) 林乔 · 更新于 2 小时前            ││
││                                                        ││ [发布说明][CoreBox][剪贴板]            ││
││                                                        ││ ── TxMarkdownView 正文预览 ──          ││
│└──────────────────────────────────────────────────────┘│ [编辑] [复制链接]                      ││
│ 已选 3 · 发布 · 归档 · 删除            « ‹ 1 [2] 3 › »  第 2/3 页 └────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**各尺寸下的差异**

| 模式 | 列 / 布局 | 行为 |
|---|---|---|
| narrow <620 | 选择列、标题（标题下一行放 `TxDotIndicator` 状态 + 相对时间）、操作列 | chips 横向滚动；「新建」只显示图标 |
| column | 选择、标题、状态、作者、更新、操作 | 每页 8 条 |
| wide | 再加栏目、语言、浏览 | 每页 12 条；显示 inspector 列；单击行更新 inspector，双击或「编辑」打开抽屉 |

**组件与角色**

**头部与筛选**

- `TxSearchInput`：按标题 / slug 过滤；宽度在带 scope 的包装上用 `:deep` 设。
- `TxButton primary icon="i-carbon-add"`：新建，打开空白抽屉。
- `TxFilterChips`：按状态过滤，带点和计数，`role="toolbar"`。
  - 色点：草稿 `--tx-bui-ink-3`、审核中 `--tx-bui-orange`、已排期 `--tx-bui-accent`、已发布 `--tx-bui-green`、已归档 ink-3。
  - 计数由数据推导。

**表格（`TxDataTable`）**

- 配置：`row-key="id"`、`selectable`、`highlight-selected`、`sticky-header`、`table-layout="fixed"`、`nowrap`、`sort-cycle="bi"`。
- 排序：`:sort` 受控 + `:sort-on-client="false"`。宿主先对「过滤后的全量」排序再切页。
- `@row-click` 打开抽屉（会自动开启行可聚焦）。
- 背景变量沿用 BUI 中性灰（照 `DataTableRecordsDemo`）。
- 单元格：

| 列 | 内容 |
|---|---|
| 标题 | 粗体 + `TxTag soft` 栏目；置顶时加 `i-carbon-pin` |
| 状态 | `TxStatusBadge size="sm"` |
| 作者 | `TxAvatar size="small" :name :background-color` + 名字 |
| 更新 | `Intl.RelativeTimeFormat` |
| 浏览 | 等宽数字 |
| slug | `TxCellLink external`，`@open` 弹 toast，不导航 |
| 操作 | 外包 `<span @click.stop>`，里面 `TxDropdownMenu` 由 `TxIconButton icon="i-carbon-overflow-menu-horizontal" label="更多操作"` 触发。菜单项：编辑 / 复制 / 发布或撤回 / 归档 / 删除（danger） |

- `#empty`：`TxSearchEmpty`，文案本地化，主操作「清除筛选」。

**加载**

- 切换筛选 / 页码 / 排序时，模拟 350ms 取数。
- 用 `useDeferredLoading` 驱动，把表格包在 `TxSkeleton :loading :lines="8" height="34px" gap="8"` 里。

**底栏**

- 有选中项时：`TxBadge` 显示已选数，`TxButton size="sm"` 做批量发布 / 归档，删除用 `variant="danger"`。
- 没有选中项时：显示「共 24 篇 · 第 2/3 页」。
- `TxPagination`：`v-model:current-page`，每页 8 或 12，`total` = 过滤后条数；aria 文案本地化；wide 模式开 `show-first-last`。
- 翻页时清空选择（「全选」只覆盖当前页）。

**编辑抽屉（`TxDrawer`）**

- 标题「编辑文章」/「新建文章」；`#footer` 放 ghost「取消」+ `TxSplitButton` 主按钮「保存」。
- 「保存」的 `#menu` 里是 保存草稿 / 提交审核 / 立即发布，`menu-icon="i-carbon-chevron-down"`。
- `TxForm label-position="top" :key="editing.id"`，校验规则：
  - 标题必填。
  - slug 必须匹配 `^[a-z0-9-]+$`。
  - 摘要不超过 160 字。
- 字段：

| 字段 | 组件 |
|---|---|
| 标题 | `TxInput` |
| slug | `TxInput`，`#prefix` 显示 `/blog/` |
| 栏目 | `TxSelect`，`style="width:100%"`，options 带 `i-carbon-*` 图标和说明 |
| 状态 | `TxSelect` |
| 标签 | `TxTagInput :max="5"` |
| 发布时间 | `TxDatePicker variant="field"` |
| 语言 | `TxFlatRadio size="sm"`：中文 / English / 双语 |
| 置顶、允许评论 | `TuffSwitch`（`:label`） |
| 摘要 | `TxTextarea show-count :max-length="160"` |
| 正文 | `TxTextarea :rows="8"`，等宽字体。wide 模式下 inspector 用 `TxMarkdownView` 实时预览 |

**反馈与预览**

- 保存 / 发布 / 删除后用 `TxToastPanel` 显示，底栏上方，`side="above"`，带「撤销」，撤销时恢复快照数组；或者用 `toast({ action })`，受 R1 限制。
- inspector（wide）：`TxStatusBadge`、`TxTag` 列表、`TxAvatar` + 名字、`TxCellLink`、`TxMarkdownView`（`theme="auto"`，局部字号 14）、`TxButton`「编辑」。

**可交互**

- 过滤：状态 chips、搜索。
- 排序：标题 / 更新 / 浏览，`bi` 循环。
- 分页、多选后批量操作（可撤销）。
- 行点击或回车打开抽屉，行菜单各项操作。
- 新建：条目插到最前。
- 表单：校验出错时就地提示，SplitButton 选择三种保存方式。
- wide 模式：单击更新 inspector。

**自动播放**：默认没有，这是管理后台。`replayDemo` 会把筛选、搜索、排序、页码、选择、数据快照复位，关闭抽屉，清空反馈。

**Mock 数据**

- 26 篇，确保能分 4 页，每篇双语。`NOW = Date.UTC(2026, 8, 23, 2, 0)`。

```ts
interface Article {
  id: string; slug: string; title: { zh: string; en: string }; summary: { zh: string; en: string }; body: { zh: string; en: string } // markdown
  section: 'release' | 'guide' | 'plugin' | 'engineering' | 'changelog'
  status: 'draft' | 'review' | 'scheduled' | 'published' | 'archived'
  authorId: string; tags: string[]; locale: 'zh' | 'en' | 'both'
  updatedAt: number; publishAt: number | null; views: number; pinned: boolean; comments: boolean
}
```

- 标题示例（中 / 英）：
  - 「Tuff 2.4 发布说明：CoreBox 秒开与剪贴板时间线」/ "Tuff 2.4 release notes: instant CoreBox and a clipboard timeline"
  - 「用 50 行 Prelude 写一个汇率插件」/ "Build a currency plugin in 50 lines of Prelude"
  - 「插件聚光灯：Workspace Scripts」/ "Plugin spotlight: Workspace Scripts"
  - 「我们如何把搜索主线程阻塞压到 16ms 以下」/ "Keeping search under a 16 ms main-thread budget"
  - 「自带密钥：接入你自己的 AI Provider」/ "Bring your own key: custom AI providers"
  - 「从 Alfred / Raycast 迁移」/ "Migrating from Alfred or Raycast"
  - 「sdkapi 260713 变更日志」/ "Changelog: sdkapi 260713"
  - 「Nexus 插件审核标准（2026 版）」/ "Nexus plugin review guidelines (2026)"
  - 「原生 OCR：Apple Vision 与 Windows OCR」/ "Native OCR with Apple Vision and Windows OCR"
  - 「快捷键速查表」/ "Keyboard shortcut cheat sheet"
  - 「插件存储的 100MB 配额怎么算」/ "How the 100 MB plugin storage quota is counted"
  - 「社区周报 #38」/ "Community digest #38"
  - 「隐私说明：剪贴板数据只留在本机」/ "Privacy note: clipboard data stays on device"
  - 「Mica 与 Vibrancy：窗口材质」/ "Window materials: Mica and Vibrancy"
- 作者 5 位，用首字母头像：林乔 Lin Qiao、Mara Okafor、佐藤健二 Kenji Sato、Ava Chen、Noor Haddad。颜色取 BUI 色或 `ChartPalette`。

**手写 CSS**

- 头部行、批量栏 / 底栏的 flex。
- 单元格内的组合：标题 + tag 纵排、头像 + 名字。
- inspector 列、容器查询、BUI 中性 hover 变量。
- `:deep()` 给搜索框设宽度。

**风险**

- 抽屉盖住整页。
- 分页 / 排序 / 全选必须由宿主处理。
- `TxSplitButton` 的默认图标不显示。
- `TxDatePicker` 星期是英文。
- `TxMarkdownView` 在暗色下被泄漏影响（R2）。

### Gallery 画廊 — 「Tuff Showcase 作品墙」

**设定**：Nexus 上社区分享的壁纸 / CoreBox 主题 / 插件封面。

**栏内布局（784×540）**

```
┌─────────────────────────────────────────────────────────────────── 784 ─┐
│ 作品墙  (LQ)(MO)(KS)+5  36 件                           [⤒ 上传] [♡ 12] │ 44  TxAvatarGroup + TxBadge + TxPopover(上传)
│ (全部 36)(壁纸 14)(CoreBox 主题 9)(插件封面 8)(社区精选 5)                 │ 34  TxFilterChips role="tablist"
│╭─────────────────────────────────────────────────────────────────────────╮│
││░ 缩略图 ○──●──○──○ │ [▦][▥][☰] │ 排序：最新 ▾ │ 36 件                  ░││ 52  TxGlassSurface 浮在滚动区上方
││ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                                 ││
││ │  art  │ │  art  │ │  art  │ │  art  │  hover：标题 · ★★★★½ · ♡ 128    ││  TxEdgeFadeMask（纵向）
││ └───────┘ └───────┘ └───────┘ └───────┘  角标：新 / 合集 tag / 作者头像  ││  里面是 TxStagger 网格
││ ┌───────┐ …                                                              ││  约 420px 可滚动
│╰─────────────────────────────────────────────────────────────────────────╯│
└──────────────────────────────────────────────────────────────────────────┘
```

**点卡片 → TxFlipOverlay**（`source` 为卡片元素）

```
┌──────── card：cardStyle { width: 'min(920px, calc(100vw - 48px))', height: 'min(600px, calc(90dvh - 24px))' } ─────┐
│ ┌──────────────────────── 大图 16:10 ─────────────────┐  极光黄昏 Aurora Dusk                    [⤓][♡][×] │
│ │ ◀                                              ▶    │  (MO) Mara Okafor · 3 天前                          │
│ │  TxGlassSurface 说明条：3840×2160 · SVG · 3 色       │  ★★★★½ 4.6（可交互，starLabel 本地化）             │
│ └──────────────────────────────────────────────────────┘  [壁纸][暗色][极简]   ●#6C5CE7 ●#00B894 ●#0B1020     │
│  变体  ■ ■ ■ ■（TxImageGallery，点开是它自带的 TxModal 灯箱）      [设为壁纸]  [复制色值]                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**展开（wide）**

- 网格按缩略图档位变多列（M 档约 6 列），瀑布流 5 列。
- 右侧 280px「合集」栏：合集简介、`TxAvatarGroup` 贡献者、热门 `TxTag`、`TxBadge` 统计、常驻的 `TxImageUploader`（替代 popover）。

**narrow**：2 列；工具条只保留布局图标和排序，滑杆隐藏。

**组件与角色**

**头部**

- `TxAvatarGroup :max="3"` 显示贡献者。
- `TxBadge :value` 显示总数，数值会滚动变化。
- 「上传」按钮：`TxTooltip` 包 `TxIconButton icon="i-carbon-upload"`，打开 `TxPopover`（`keepAliveContent` 默认 true），里面放 `TxImageUploader`（R10）。
- 「我的收藏」计数。

**合集与工具条**

- `TxFilterChips role="tablist"`：合集切换，带计数和色点，方向键跟随选中。
- `TxGlassSurface width="100%" :height="52"`：浮动工具条，背后是滚动中的作品。全模板最多 2 个实例（工具条 + 详情说明条）。
- `TxSegmentedSlider`：S / M / L / XL，映射到 `--thumb-min: 120/160/210/280px`。外层给左右 padding 和底部 margin。
- `TxFlatRadio size="sm"`：网格 / 瀑布流 / 列表，纯图标项，传 `aria-label`。
- 排序用 `TxDropdownMenu`（会 teleport）：最新 / 评分最高 / 最多喜欢。**不要用 `TxFlatSelect`**，它的下拉会被玻璃层的 `overflow:hidden` 裁掉。

**滚动区与网格**

- `TxEdgeFadeMask axis="vertical"`：滚动区，根节点给明确高度；网格加 `padding-top`，让作品从工具条下面滚过。
- `TxStagger tag="ul"`：网格或瀑布流容器，以 `collection + layout + replayKey` 为 key，保证能重播。减弱动效时 `:appear="!still"`，外加 CSS 兜底。
- 卡片是手写的 `<li><button>`：
  - 图片：SVG data URI 或本地 JPG。
  - hover 渐变遮罩，里面标题、`TxRating readonly :size="12"`、喜欢按钮（`TxIconButton :pressed` + `TxTooltip`）。
  - `TxTag soft` 显示合集，`TxBadge` 显示「新」，`TxAvatar size="small"` 显示作者首字母。

**详情（`TxFlipOverlay`）**

- `:source` 取卡片元素，`cardStyle` 如上图，`surface="mask"`。
- 自带 header 关掉，改用 `#header-display` / `#header-actions`。
- 内容：
  - `TxRating`：可交互，`starLabel` 本地化。
  - `TxTag` 列表、`TxAvatar`。
  - `TxButton`：设为壁纸 → 反馈；复制色值 → 反馈。
  - 喜欢 / 下载：`TxIconButton`。
  - 上一张 / 下一张：`TxIconButton`，外加 ←/→ 键。键盘监听只在打开期间挂在 document 上，关闭时移除。
  - `TxImageGallery`：该作品的 3–4 个变体（亮 / 暗 / 竖屏 / 桌面），用它自带的灯箱。
- 打开前先抬高分配器下限（R3）。

**空态、加载与兜底**

- 空态：「我的收藏」为空时用 `TxEmptyState variant="blank-slate"`（文案本地化）。
- 加载：切换合集时模拟 300ms 取数，渲染 `TxSkeleton variant="rect"` 方块（容器用 aspect-ratio）。
- 兜底：如果 FlipOverlay 的 teleport 修复没落地，改用 `TxModal` 做详情（它会 teleport）。

**可交互**

- 切合集，用键盘也行。
- 调缩略图大小、切布局、排序。
- 喜欢：计数变化 + 反馈。
- 打开翻转详情，评分，在详情里切上一张 / 下一张，打开变体灯箱。
- 上传本地图片：插到最前，打「新」标。
- 「设为壁纸」只弹反馈。

**自动播放**

- 挂载和切换合集时 stagger 入场。
- 减弱动效时不做 stagger。
- `replayDemo`：复位状态，并给 TxStagger 换 key 重播。

**Mock 数据**

- 36 件，本地 JPG 占 3–5 件（精选）。

```ts
interface Artwork {
  id: string; title: { zh: string; en: string }; collection: 'wallpaper' | 'theme' | 'plugin-cover' | 'community'
  authorId: string; rating: number /* 3.5–5, 步长 0.5 */; likes: number; liked: boolean; tags: string[]
  orientation: 'landscape' | 'portrait' | 'square'; width: number; height: number; createdAt: number; isNew: boolean
  art: { kind: 'svg'; seed: number; palette: [string, string, string]; motif: 'dunes' | 'orbs' | 'grid' | 'rings' } | { kind: 'asset'; src: string }
  variants: number[] // 派生 seed → TxImageGallery items
}
```

- 标题示例：
  - 「极光黄昏」Aurora Dusk
  - 「剪贴板星座」Clipboard Constellation
  - 「CoreBox 午夜」CoreBox Midnight
  - 「霓虹沙丘」Neon Dunes（`intelligence.jpg`）
  - 「条纹玻璃」Fluted Glass（`notion.jpg`）
  - 「日历插件封面 · 31」Calendar cover（`calendar.jpg`）
  - 「Mica 晨雾」Mica Mist
  - 「Vibrancy 深海」Vibrancy Deep

**手写 CSS**

- 网格：`grid-template-columns: repeat(auto-fill, minmax(var(--thumb-min), 1fr))`。
- 瀑布流：`columns: var(--cols)`，子项 `break-inside: avoid`，按 orientation 设 aspect-ratio。
- 列表行、hover 遮罩、色板圆点。
- 工具条绝对定位在滚动区顶部。
- 详情卡片内部布局、wide 模式合集栏、容器查询。

**风险**

- FlipOverlay 的 teleport 修复（R4）。
- GlassSurface 的效果和性能。
- object URL 生命周期（R10）。
- `TxImageGallery` 不能程序化打开。
- EdgeFadeMask 的 mask 会作用到没 teleport 的子树。
- TxStagger 没有减弱动效。
- 灯箱动效来自 TxModal，也没有减弱动效规则。

### Inbox 收件箱 — 「Tuff 账户收件箱」

**设定**：账户邮件 / 通知中心，内容包括插件审核、CI 构建、安全登录、AI 额度、账单、社区提及。

**栏内布局（784×540，column 模式）**

```
┌─────────────────────────────────────────────────────────────────── 784 ─┐
│ ✉ 收件箱  ⓬未读                [🔍 搜索发件人、主题        ]  [✎ 写邮件]   │ 44  TxBadge + TxSearchInput + TxButton
│ (收件箱 12)(提及 3)(更新 5)(发布)(账单 1)(已归档)                          │ 34  TxFilterChips（栏内文件夹切换）
│┌───────────────────────────┬─┬─────────────────────────────────────────┐│
││ ● (◎) Nexus Store   10:42 │ │ touch-translate 1.4.0 已通过审核    [⋯] ││ 阅读区头部
││   插件已通过审核，可以发布… │ │ (◎) Nexus Store · review@… · 10:42      ││
││ ○ (◎) Tuff CI       09:15 │ │ [插件][审核]    [⧉][↩][🗄][☆] TxMessageActions││
││   Nightly 在 win32 失败…   │║│ ─────────────────────────────────────── ││
││ ● (KS) 佐藤健二      昨天  │ │ TxMarkdownView 正文（局部字号 14）        ││
││   在 #plugin-dev 提到了你   │ │ TxAttachmentTray：review-report.pdf 🖼   ││
││ … TxVirtualList，76px 行    │ │ ┌ 回复 Nexus Store…（TxChatComposer）─┐ ││
│└───────────────────────────┴─┴─└──────────────────────────── [发送] ─┘─┘│
└──────────────────────────────────────────────────────────────────────────┘
TxSplitter v-model=0.42，min .30，max .62；外层 grid 在 column 模式下 nav 列宽为 0
```

**展开（wide）**

```
┌ TxSidebarNav 216 ┬──────────── 列表 ────────────────┬─┬───────────── 阅读 ─────────────────┐
│ Tuff 账户         │ 收件箱 · 12 未读     [排序 ▾]     │ │ 头部 / 标签 / 操作                   │
│ you@tuff.dev      │ 行 …                              │║│ 正文                                │
│ [✎ 写邮件]        │                                   │ │ 附件                                │
│ 邮箱              │                                   │ │ 往来（2 条更早的回复，折叠）          │
│  收件箱      12   │                                   │ │ 回复框（4 行）                        │
│  提及         3   │                                   │ │                                     │
│  更新         5   │                                   │ │                                     │
│ 标签              │                                   │ │                                     │
│  账单 · 安全 · 社区│                                   │ │                                     │
└──────────────────┴───────────────────────────────────┴─┴─────────────────────────────────────┘
```

**布局要点**

- 外层是 CSS grid：`grid-template-columns: var(--nav-w) 1fr`，侧栏宽度固定 px。只有一个 TxSplitter，避免侧栏随比例变宽。
- wide 模式隐藏 FilterChips、显示 SidebarNav；两者绑定同一个 `folder`，都有 ResizeObserver，显隐切换后会重新测量。
- narrow（<620）：单栏列表，选中后阅读区从右侧滑入，带「返回」按钮（手写）。

**组件与角色**

**导航**

- `TxSidebarNav`（wide）：
  - `workspace="{ name: 'Tuff 账户', description: 'you@tuff.dev' }"`、`action-label="写邮件"`。
  - 分组「邮箱 / 标签」；`badge` 是由数据推导的未读数。
  - `#item-icon` 用内联 SVG。
  - **不传 `search-hint`**（R8），也不传 `search-placeholder`，否则搜索只会过滤文件夹。
  - 外层包装写 `--tx-bui-sidebar-nav-width:100%; --tx-bui-shadow-raised:none`。
- `TxFilterChips`（column / narrow）：同一份文件夹数据。
- `TxSearchInput`：过滤发件人 / 主题 / 摘要。

**分栏与列表**

- `TxSplitter`：列表 | 阅读；用 `:deep` 去掉它的边框和圆角，让它和模板齐平。
- 列表头：文件夹名 + `TxBadge` 未读数（数字滚动），`TxDropdownMenu` 提供「最新优先 / 未读优先 / 只看有附件」。
- `TxVirtualList height="100%" :item-height="76" item-key="id"`：
  - 外层包 `role="listbox"`，行是 `role="option"`，带 `aria-selected` 和 `aria-setsize` / `aria-posinset`（用真实总数）。
  - 行内容：`TxAvatar size="small"`（人是首字母；Tuff 系统发件人用 `src="/logo.svg"`）、`TxDotIndicator` 未读点、发件人（未读时加粗）、时间、主题、单行摘要、至多 1 个 `TxTag soft`、星标 `TxIconButton :pressed` + `TxTooltip`。星标外包 `@click.stop`。
- 键盘：在模板根上监听 keydown，而**不是** document：↑↓ / J / K 选择并 `scrollToIndex`，E 归档，S 星标，Enter 聚焦回复框。
- 切文件夹时模拟 400ms 取数，`useDeferredLoading` 驱动 6 个 `TxListItemSkeleton`。
- 无结果时显示 `TxSearchEmpty`（文案本地化，主操作「清除搜索」）。

**阅读区**

- 未选中时：`TxNoSelection`（本地化标题），`#description` 里放 `TxKbd` 的 J / K 提示。
- 选中时：
  - 主题 `<h3>`。
  - `TxAvatar` + 发件人 + 地址 + 时间，`TxTag` 标签。
  - `TxMessageActions`：`copy-text` 取正文纯文本，copy / copied 文案本地化。插槽按钮带 `tx-message-actions__btn` class：回复 / 归档 / 星标，各配 `TxTooltip`。
  - 「更多」`TxDropdownMenu`：标为未读 / 移动到 ▸（`TxDropdownSubmenu` 列出标签）/ 静音此会话。
- 正文：`TxMarkdownView`，`theme="auto"`，局部字号 14。
- 附件：`TxAttachmentTray` 只读，7 个文案 prop 加 `sizeFormatter` 都要本地化；`@open` 弹反馈。
- 回复：`TxChatComposer`，`:send-on-enter="false"`，`:submitting` 假发送 600ms。
  - `@attachment-add` 收到的文件：生成 object URL，推进 `#attachments` 插槽里可删除的 `TxAttachmentTray`，卸载时统一回收。
  - 发送后追加到「往来」，再给反馈（撤销）。

**「新邮件到达」提示**：`TxToastPanel`，挂在列表头下方，`side="below"`，带 tether，框内显示；提示里的按钮「查看」会选中这封邮件。

**可交互**

- 切文件夹、搜索、选邮件（鼠标 / 键盘）、星标、归档（行消失，可撤销）、标为未读、移动到标签。
- 拖动分栏。
- 复制正文、回复（可拖入 / 粘贴附件）。
- 写新邮件：阅读区换成「收件人 / 主题（`TxInput`）+ `TxChatComposer`」。

**自动播放（可重播、尊重减弱动效）**

- 挂载后第 3.5 / 9 / 15 秒，各有一封新邮件插到收件箱顶部。
  - 未读数 +1：`TxBadge` 数字滚动，SidebarNav 徽标弹入。
  - `TxToastPanel` 出现约 4 秒。
  - 用户已经滚离顶部时，不跳回顶部。
- 减弱动效时：挂载即把 3 封插好，不设计时器、不弹提示。
- `replayDemo`：复位数据 / 选择 / 文件夹 / 草稿，清计时器后重启，`scrollToTop()`，回收 object URL。

**Mock 数据**

- 12 封手写种子，按 folder × 时间偏移派生到约 160 封，让虚拟化有意义。

```ts
interface Mail {
  id: string; folder: 'inbox' | 'mentions' | 'updates' | 'releases' | 'billing' | 'archive'; labels: string[]
  from: { name: string; address: string; logo?: boolean; color?: string }
  subject: { zh: string; en: string }; snippet: { zh: string; en: string }; body: { zh: string; en: string } // markdown
  receivedAt: number; unread: boolean; starred: boolean
  attachments: AiAttachment[]; thread: { from: string; at: number; body: { zh: string; en: string } }[]
}
```

- 种子邮件：
  - Nexus Store：「touch-translate 1.4.0 已通过审核」，附件 review-report.pdf。
  - Tuff CI：「Nightly 2.4.0-beta.3 在 win32 构建失败」，附件 build-log.txt + 一张生成的截图 SVG。
  - 安全中心：「新的登录：macOS 27 · 上海」。
  - 佐藤健二：「在 #plugin-dev 提到了你」，正文带代码块。
  - AI 用量：「本月 AI 请求额度已用 80%」。
  - 社区周报：「本周新增 12 个插件」，正文是列表。
  - 账单：「Pro 方案发票 · 2026 年 9 月」，附件 invoice-2026-09.pdf。
  - 剪贴板同步：「2 条记录同步冲突」。
  - 发布：「Tuff 2.4 正式版开始推送」。
  - 社区：「你的主题《CoreBox 午夜》获得 100 个赞」。
  - 插件更新：「Workspace Scripts 3.2 可更新」。
  - 草稿：「Re：插件签名问题」。
- 自动到达的 3 封：「Nightly 2.4.0-beta.4 构建通过」「Ava Chen 在 #design 提到了你」「新评价：touch-translate ★★★★★」。

**手写 CSS**

- 外层 grid 与容器查询。
- 行布局，未读 / 选中态用 `--tx-bui-hover` / `--tx-bui-accent-tint`。
- 阅读区头部。
- 分栏窗格用 flex column，保证 `TxVirtualList height="100%"` 能拿到高度。
- narrow 模式的单栏切换。
- 覆盖：splitter 的边框、sidebar 的面、markdown 字号。

**风险**

- SidebarNav 抢 `/`（R8）。
- 阅读区被 dark 泄漏影响（R2）。
- VirtualList 行高固定、没有语义。
- Splitter 的分数比例。
- ChatComposer 回车默认发送。
- object URL 回收。
- `TxMessageActions` 的入场动画。

---

## Risks

按严重度排列。R1–R3 与 app-shells.md 的 R1 / R2 / R4 是同一类问题，下面只写对本分组的影响和独立核对的依据。

**R1（高，跨模板）生产构建里 tuffex 有两份模块状态**

- 独立核对：
  - 生产环境下 `modules/tuffex-components.ts:96` 的前缀是 `@tuffex-components`，经 `nuxt.config.ts:47,553` 解析到源码。
  - `@talex-touch/tuffex/utils` 在生产固定走 dist（`build/tuffex-dev-mode.ts` 里 `!isDev → 'dist'`，`nuxt.config.ts:58-60`）。
  - `TxToastHost.vue:6` 从源码 `../../../../utils/toast` 取 `toastStore`。
- 构建证据见 app-shells.md R1（2026-09-21 的产物）。
- 对本分组的影响：
  - CMS / 画廊 / 收件箱的 `toast()` 反馈在生产环境不会出现。
  - `~/utils/layers` 的 `reserveOverlayLayer()`（走 dist）在生产抬不高自动注册浮层用的分配器。
- 对策：
  - 运行时函数从 `@tuffex-components/utils` 引入。
  - 框内反馈优先用 `TxToastPanel`。
  - 不混用显式组件 import。
  - 落地前在隔离 worktree 跑一次 `node nuxt.mjs build` 验证（见 memory）。

**R2（阻塞暗色验收）`.dark` / `[data-theme='dark']` 全局泄漏**

- 来源：`TuffexDocsHeroBackground.vue:195-215` 里 scoped 的 `:global(.dark) .x` 被 Vue 编译成裸 `.dark { … }`。已用 `@vue/compiler-sfc` 的 `compileStyle` 复现：输入 `:global(.dark) .tuffex-docs-hero-bg{…}`，输出 `.dark { … }`。
- 泄漏的规则对 `.dark` / `[data-theme='dark']` 元素生效：
  - 背景：先 `transparent`，后面被一条 4% 靛 / 玫渐变覆盖。
  - 文字：`color: rgba(255,255,255,.9)`。
  - 边框与阴影：`border-color: rgba(255,255,255,.2)`、`box-shadow: 0 10px 34px rgba(255,255,255,.12)`。
  - 另有 `::after` 径向渐变。
- 影响范围：只要 `isTuffexDocs`，`layouts/docs.vue:407` 就会挂载这个组件，所以所有 tuffex 组件文档页都受影响。
- 命中本分组的组件：
  - `TxMarkdownView` 根节点：暗色时带 class `dark` 和 `data-theme="dark"`（:152）。
  - `TxMarkdownEditor` 根节点：带 `data-theme`（:481）。
- 由 talex-touch-87 修复；本任务不碰。暗色截图等修复落地后再做。
- 模板里别给自己的元素起 `dark` class，也别设 `data-theme`。

**R3（高）浮层层级与展开浮层**

- 现状：
  - 顶栏 `TheHeader.vue:221` 为 `z-index:10000`；分配器种子 2000。
  - Drawer 会自抬到 10001；Modal、FlipOverlay、下拉、提示、Toast 都取 `next()`。
  - 栏内打开 Modal / FlipOverlay 时，顶栏药丸会压在遮罩上。
- 打开前的正确做法：`refreshZIndex(NEXUS_OVERLAY_LAYER_SEED /* 10100, app/utils/layers.ts:10 */, reason)`，`refreshZIndex` 从 `@tuffex-components/utils` 引入。
- 展开浮层（D6）：
  - 必须用同一份分配器：先抬下限，再用 `nextZIndex()` 给自己取层级，这样后续弹层都在它上面。
  - 展开之前已经打开的弹层保留旧层级，所以展开前要先关掉它们。

**R4（阻塞 Gallery）TxFlipOverlay 没有 teleport + `.docs-prose` 带 containment**

- `.docs-prose { content-visibility: auto }`（`[...slug].vue:2596`）会施加 layout / style / paint containment：
  - 成为 fixed 后代的包含块。
  - 按自身盒子裁切后代。
- HEAD 版本的 FlipOverlay 因此在栏内失效；修复（改为 teleport）在工作树里、未提交（pro-gallery R4）。
- 同理，栏内任何**没 teleport** 的 `position:fixed` 元素都会被困在文章里，包括手写的「伪全屏」。展开浮层必须真正 Teleport 到 body。
- FlipOverlay 修复落地前的兜底：
  - 详情改用 `TxModal`。
  - 或者只在展开态使用 FlipOverlay；那时模板已经 teleport 到 body，但浮层外壳本身也不能带 transform / filter / backdrop-filter / contain / will-change。

**R5（中）展开外壳与 fixed / mask 子树**

- 依据：CSS Conditional 5（drafts.csswg.org，2026-09-23 抓取）规定 `container-type: inline-size` 只施加 **style + inline-size containment** 并建立独立格式化上下文，**不含 layout containment**，所以不会成为 fixed 后代的包含块。模板根节点可以放心用容器查询。
- 但下列属性会成为包含块，或者把效果施加到整个子树：transform（含 TxVirtualList 的条目层、TxStagger 进场中的元素）、filter / backdrop-filter（TxGlassSurface、TxMessageActions 残留的 `filter: blur(0)`）、mask（TxEdgeFadeMask）、contain / content-visibility。
- 规则：
  - 会 fixed 定位的浮层一律放在模板根这一级，或者用会 teleport 的组件。
  - 展开外壳的开合动画只动 opacity / clip-path，或者只动外壳的兄弟节点。

**R6（高）图标集缺失**

- Nexus 只安装了 `carbon` / `cib` / `logos` / `twemoji`（`apps/nexus/package.json:46,77-79`；`build/check-icon-collections.mjs:1-13` 说明缺失的集合会渲染成 0×0 或空白）。
- 本分组里用到缺失图标集的地方：
  - `TxMarkdownEditor` 工具栏：`i-ri-*` 14 个。
  - `TxSplitButton` 默认 `menuIcon`：`i-ri-more-2-line`。
  - `TxStatusBadge` 的 `os`：`i-simple-icons-*`。
  - `TxIcon` 出错时的兜底：`i-ri-image-line`。
- 模板只用 `i-carbon-*`。
- 图标 class 字面量要写在 `.vue` 里，或写在 `app/(data|composables|utils)/*.ts` 里；`uno.config.ts:17-26` 只扫描这些位置，`demos/*.ts` 不在其中。

**R7（高）docs 正文样式外泄与变量依赖**

- 三套 prose 样式只排除 `.not-prose` 子树：UnoCSS typography（`:not(:where([class~="not-prose"],…))`）、`.docs-prose` 页面规则（`[...slug].vue:2647-2890`）、`components/docs/github-markdown.css`（170 处守卫）。
- 模板根节点必须带 `not-prose`，否则 p / ul / li / h3 / table / code 会被改成 17px、1.7 行高。
- teleport 到展开浮层后，这些 prose 样式会消失，版式跳变；`--docs-*` 变量也一样会消失。

**R8（中）快捷键冲突**

- `TxSidebarNav` 的单字符 `searchHint` 在 document 上 `preventDefault`，抢走 Nexus 的全站 `/`（`app.vue:182-185`）。
- 模板快捷键（J / K / E / S、←→）一律挂在模板根元素上，或只在浮层打开期间临时挂。

**R9（中）TxDataTable 的分页语义**

- 排序只作用于当前 `data`。
- 全选只覆盖当前页，而且替换或清空整个选择集。
- 单元格点击冒泡触发 `rowClick`。
- `loading` 只有转圈，骨架屏要宿主自己组合。
- 宿主对策：
  - 受控排序 + `sortOnClient=false`，先排序后切页。
  - 翻页时清空选择。
  - 行内控件外包 `@click.stop`。

**R10（中）object URL 生命周期**

- `TxImageUploader` 会在卸载时回收它创建的 URL。它必须比使用这些 URL 的卡片活得久：放在 keep-alive 的 `TxPopover` 或常驻栏里，不能放在 `TxModal` 里。
- `TxChatComposer` 的 `attachmentAdd` 文件由宿主创建 URL，也由宿主在卸载 / 重播时回收。

**R11（中）减弱动效缺口**

- 没有处理的组件：`TxDrawer`、`TxModal`、`TxFlipOverlay`（GSAP）、`TxStagger`、`TxEmptyState` 插画（无限循环）、`TxImageGallery`（经 TxModal）。
- 模板对策：
  - 用 `@media (prefers-reduced-motion: reduce)` 加 `:deep()` 关掉插画动画和 stagger 的过渡。
  - JS 时间线自己判断 `still`。
  - FlipOverlay：`duration` 直接换算成 GSAP 补间时长（`flip-overlay-motion.ts:267,322`），减弱动效时传 `:duration="0"` 可让翻转瞬时完成；但层叠补间是写死的 0.26s / 0.22s（:143,198），且卡片仍有 3D 倾斜初值。更稳的做法是减弱动效时不传 `source`，卡片直接居中出现。

**R12（中）写死英文的文案**

- 没有 prop 可以改、只能接受英文的：
  - DataTable 复选框 aria（`Select all` / `Select row`）
  - TxDrawer 关闭按钮（`Close drawer`）
  - TxModal `Close`
  - TxSplitter `Resize`
  - TxTree `No results` / `Collapse` / `Expand`
  - TxDatePicker 星期表头
  - TxMarkdownEditor 工具栏 title
- 有 prop、必须传本地化值的：TxPagination（5 个 aria）、TxImageGallery（6 个）、TxAttachmentTray（7 个 + `sizeFormatter`）、TxRating `starLabel`、TxEmptyState 系列的 title / description、TxDataTable `emptyText`、TxSelect / TxTagInput 的 placeholder / emptyText、TxMessageActions 的各 label。

**R13（低）视觉与主题**

- 两个蓝：BUI 组件（FilterChips / CellLink / DotIndicator / SidebarNav）用 `--tx-bui-accent` #0285ff（暗色 #3d9aff），TxButton / TxPagination / TxSegmentedSlider 用 `--tx-color-primary` #409eff。同屏会看到两种蓝。
- FilterChips 的激活底色是白色 surface，放在 surface 背景上看不出来。
- `TxChatComposer` 的背景在暗色下透明。

**R14（低）组件自身限制**

- `TxSelect` 默认宽 240px 且 `eager`。
- `TxFlatSelect` 不 teleport，会被 overflow 或玻璃层裁掉。
- `TxSplitter` 的比例是分数，嵌套时边框叠两层。
- `TxVirtualList` 没有语义和键盘支持，行高固定。
- `TxStagger` 离场时仍占位、没有 move 动画。
- `TxTabs` 的值就是 label。
- `TxForm` 的 `size` / `disabled` 不起作用。
- `TxFilterChips` 只能单选。
- `TxImageGallery` 不能程序化打开、没有说明文字、只有正方形网格。

**R15（低）并行改动带来的变化**

- 工作树里 `TxFlipOverlay` / `TxEmptyState` / `TxStatCard` / `TxLayoutSkeleton` 有未提交改动，dist 也在被重建（重建时用 `/tmp/tuffex-build.lock` 加锁）。
- 实现前重新核对 FlipOverlay 的 teleport 状态和 EmptyState 的 API，并在真实浏览器里截图确认。

---

## 附：关键文件

| 路径 | 说明 |
|---|---|
| `apps/nexus/modules/tuffex-components.ts:30,37,96,124` | 全局注册：名字正则、跳过的目录、前缀、`addComponent` |
| `apps/nexus/nuxt.config.ts:47,57-60,205-222,553-559,605-624` | 自动导入入口、utils 入口、components 忽略规则、Vite 别名、`components:extend` |
| `apps/nexus/build/tuffex-dev-mode.ts` | 生产固定 dist |
| `apps/nexus/app/components/content/TuffDemoWrapper.vue:76-110,361-364` | 重置流程、预览内边距 |
| `apps/nexus/app/components/content/TuffDemoClientRenderer.client.vue:109` | 以 `renderKey` 重挂载 |
| `apps/nexus/build/check-demo-registry-orphans.mjs:43-60` | 只扫 `.vue`，helper 必须 `from './X.vue'` |
| `apps/nexus/uno.config.ts:17-26,76,112-114` | Uno 扫描范围、图标预检、presetIcons |
| `apps/nexus/package.json:46,77-79` | 已安装的图标集 |
| `apps/nexus/app/utils/layers.ts:10,19-21` | `NEXUS_OVERLAY_LAYER_SEED`、`reserveOverlayLayer` |
| `apps/nexus/app/components/TheHeader.vue:221` | 顶栏 `z-index:10000` |
| `apps/nexus/app/app.vue:176-185` | 全站 ⌘K / `/` 快捷键 |
| `apps/nexus/app/pages/docs/[...slug].vue:2060-2072,2091,2596-2597,2647-2890` | 正文 class、`content-visibility`、prose 规则 |
| `apps/nexus/app/components/docs/TuffexDocsHeroBackground.vue:195-215` | `.dark` 泄漏源 |
| `apps/nexus/app/layouts/docs.vue:10,407` | 泄漏组件在 tuffex 文档页挂载 |
| `apps/nexus/app/images/assets/{intelligence.jpg,plugin-cards/*.jpg}` | 本地可用图片 |
| `packages/tuffex/packages/utils/z-index-manager.ts:33,214-244` | 种子 2000、回退分配器、`useZIndexAllocator` |
| `packages/tuffex/packages/utils/toast.ts:24-131` | `toast()` API |
| `packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue` | 见 cheat sheet 中的行号 |
| `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue` | HEAD 就地渲染，工作树改为 teleport（未提交） |
| `.trellis/tasks/09-23-nexus-pro-gallery-polish/prd.md` R3 / R4 / R6 / R8 | MarkdownEditor 灰方块、FlipOverlay、GlassSurface、VirtualList 的实测问题 |
| `.trellis/tasks/09-23-nexus-docs-templates-tab/research/app-shells.md` R1–R5 | 跨模板风险的完整推导 |

### 最佳借鉴 demo（`apps/nexus/app/components/content/demos/`）

- **CMS**：`DataTableRecordsDemo.vue`、`ComponentsDataOperationsDemo.vue`、`FilterChipsFilterTableDemo.vue`、`ComponentsSearchFiltersDemo.vue`、`ComponentsNavigationShellDemo.vue`、`FormFormDemo.vue`、`DatePickerDatePickerDemo.vue`、`ButtonSplitDemo.vue`
- **画廊**：`FlipOverlayFlipOverlayDemo.vue`、`ImageGalleryImageGalleryDemo.vue`、`GlassSurfaceGlassSurfaceDemo.vue`、`SegmentedSliderSegmentedSliderDemo.vue`、`FlatRadioIconDemo.vue`、`StaggerStaggerDemo.vue`
- **收件箱**：`SplitterSplitterDemo.vue`、`SidebarNavSidebarNavDemo.vue`、`VirtualListVirtualListDemo.vue`、`MessageActionsMessageActionsDemo.vue`、`AttachmentTrayAttachmentTrayDemo.vue`、`ChatComposerChatComposerDemo.vue`、`ToastPanelToastPanelDemo.vue`
- **时间线 / 减弱动效 / 重播**：`AiSuiteStreamingAnswerDemo.vue:74-103`、`AiSuiteChatShowcaseDemo.vue:31-44`、`ProgressBarUploadDemo.vue:62`
