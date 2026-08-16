# Research: Fusion — Tables Cluster (11 diff-table / 12 records-table / 13 filter-table)

- **Query**: 三个 Beautiful UI 表格组件如何移植进 tuffex 并与 `TxDataTable` 融合
- **Scope**: internal（BUI 源码归档 + tuffex 组件源码）
- **Date**: 2026-08-15
- **源文件**:
  - `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/11-diff-table.tsx`（132 行）
  - `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/12-records-table.tsx`（182 行）
  - `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/13-filter-table.tsx`（122 行）
  - `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/_global.css`（Tailwind v4.3.3 产物，2 行压缩）
- **目标文件**:
  - `packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue`（549 行）
  - `packages/tuffex/packages/components/src/data-table/src/types.ts`
  - `packages/tuffex/packages/components/src/{tag,status-badge,checkbox,virtual-list}/`
  - `packages/tuffex/packages/components/style/variables.scss`（token 体系）

---

## 0. 前置事实（三个组件共用，先读这一节）

### 0.1 `--stripe` 不是表格斑马纹 —— 它是页面底纹

任务描述里把 `--stripe` 列为表格消费的 token，这是个需要纠正的前提。全站只有 `body` 消费它：

```css
body{
  background-color:var(--stripe-bg);
  background-image:repeating-linear-gradient(-45deg,transparent 0,transparent 7px,var(--stripe) 7px,var(--stripe) 8px);
  color:var(--ink)
}
```

即 45° 斜向 1px 细纹（7px 间隔）作为**演示页背景**。三个表格组件没有一个引用 `--stripe` / `--stripe-bg`。BUI 的表格根本没有斑马纹设计语言 —— records-table 用的是**显式网格线**（每个 `td`/`th` 都有 `border-right` + `border-bottom`），diff/filter-table 用的是行底边线。

> 对照：`TxDataTable` 有 `striped` prop（`tbody tr:nth-child(odd)` 加底色）。移植三个 BUI 表格时**不要**开 `striped`，那不是 BUI 的视觉语言。

### 0.2 BUI token → tuffex token 映射

BUI 用 `:root` / `.dark` 两套共 32 个语义 token（`_global.css`）。tuffex 用 `--tx-*`，且有**四套**主题（light / dark / high-contrast-light / high-contrast-dark，见 `variables.scss:416-437`）。映射关系：

| BUI token | light | dark | tuffex 最近对应 | 备注 |
|---|---|---|---|---|
| `--surface` | `#fff` | `#232427` | `--tx-bg-color` | ✓ 直接可用 |
| `--inset` | `#f7f8f9` | `#1f2022` | `--tx-fill-color-lighter` | 页脚/汇总行底色 |
| `--hover` | `#f4f5f6` | `#2a2b2e` | **无中性 hover token** | tuffex 的 hover 是蓝色 tint（见 0.5） |
| `--field` | `#f2f2f3` | `#2b2c2f` | `--tx-fill-color-light` | 字母 mark 底色 / 计数徽底色 |
| `--ink` | `#1f2124` | `#f2f3f4` | `--tx-text-color-primary` | ✓ |
| `--ink-2` | `#62656b` | `#a5a8ad` | `--tx-text-color-regular` | ✓ |
| `--ink-3` | `#9a9da3` | `#6c6f75` | `--tx-text-color-secondary` | ✓ |
| `--line` | `#ecedef` | `#2e3033` | `--tx-border-color-lighter` | ✓ |
| `--line-strong` | `#e0e2e5` | `#3a3c40` | `--tx-border-color-light` | ✓ |
| `--accent` | `#0285ff` | `#3d9aff` | `--tx-color-primary` | ✓ |
| `--accent-ink` | `#0170dd` | `#7ec0ff` | **无** | 链接色；light 比 accent 深、dark 比 accent 浅 |
| `--accent-tint` | `#e9f3ff` | `#3d9aff29` | `--tx-color-primary-light-9` | 近似 |
| `--green` / `--green-tint` | `#189a4d` / `#e8f5ed` | `#3dbb72` / `#3dbb7224` | `--tx-color-success` + `-light-9` | tint 配方不同 |
| `--orange` / `--orange-tint` | `#ef720c` / `#fdf1e5` | `#f68f3c` / `#f68f3c24` | `--tx-color-warning` + `-light-9` | |
| `--red` / `--red-tint` | `#e3474c` / `#fcecec` | `#ee5c61` / `#ee5c6124` | `--tx-color-danger` + `-light-9` | |
| `--radius-chip` / `-control` / `-card` | 6 / 8 / 10 px | 同 | `--tx-border-radius-base` 只有 4px | tuffex 圆角刻度不匹配，需要新增 |
| `--ease-out-strong` | `cubic-bezier(.23,1,.32,1)` | 同 | **无** | 三个组件的主缓动 |
| `--ease-link` | `cubic-bezier(.16,1,.3,1)` | 同 | 无 | 本 cluster 未用 |
| `--shadow-hairline` | `0 0 0 1px var(--line)` | 同式 | 无 | |
| `--shadow-btn` | `0 0 0 1px var(--line-strong),0 1px 2px #1018280d` | | 无 | filter chip 选中态 |
| `--shadow-card` | `0 0 0 1px var(--line),0 1px 2px #1018280a,0 2px 6px #10182808` | | 无 | diff/filter 外壳 |

**关键结论 —— tuffex 的 `-light-9` tint 只有一半在 dark 下是对的**（已逐条实测 `variables.scss`）：

| token | light `:root` | dark `.dark` | dark 下可用？ |
|---|---|---|---|
| `--tx-color-danger-light-9` | `#fef0f0`（185 行） | `#4e1f1f`（341 行） | ✓ 显式深色 |
| `--tx-color-primary-light-9` | `#ecf5ff` | `#18222c`（317 行） | ✓ 显式深色 |
| `--tx-color-success-light-9` | `color-mix(success 10%, white)` | `color-mix(success 10%, white)`（369 行） | ✗ **dark 下仍然混白** |
| `--tx-color-warning-light-9` | `color-mix(warning 10%, white)` | `color-mix(warning 10%, white)`（375 行） | ✗ **dark 下仍然混白** |

也就是说：diff-table 的**红染**可以直接用 `--tx-color-danger-light-9`（明暗都已正确定义），但**绿色新增行**用 `--tx-color-success-light-9` 在 dark 下会得到一块接近白的浅绿 —— 因为 `.dark` 块里那两条 `-light-9` 是照抄 light 的混白公式。绿/橙 tint 必须自己写透明配方，例如 `color-mix(in srgb, var(--tx-color-success) 14%, transparent)`，与 BUI dark 的 `#3dbb7224`（≈14% alpha 叠深色）语义一致。

（BUI 侧的规律：dark tint 全部是 `<color>24` 形式的半透明叠加，light tint 是不透明浅色。）

### 0.3 `@supports` 渐进增强：tuffex 不需要照抄

`_global.css` 里凡是 `color-mix(...)` 的声明都包在 `@supports (color:color-mix(in lab,red,red))` 里，外层留一个纯色回退。例：

```css
.records-row.is-selected>.records-cell{background:var(--accent)}
@supports (color:color-mix(in lab,red,red)){
  .records-row.is-selected>.records-cell{background:color-mix(in srgb,var(--accent) 7%,var(--surface))}
}
```

tuffex 全库已经无条件使用 `color-mix`（`variables.scss` 的 token 定义本身就是 `color-mix`），所以**移植时不要加 `@supports` 回退层**，否则与既有约定不一致，且会把 `.records-row.is-selected` 的回退纯色 `--accent`（实心蓝行）带进来。

### 0.4 reduced-motion：BUI 是全局核弹，只砍补间不砍状态机

`_global.css` 里只有两处 `prefers-reduced-motion`，其中一处是全局：

```css
@media (prefers-reduced-motion:reduce){
  *,:after,:before{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}
}
```

三个表格组件**自身没有任何 reduced-motion 分支**。这意味着：

- diff-table 的 `setTimeout` 阶段机仍然在 800 / 1800 / 2800ms 触发，只是每一步瞬间到位（无补间）。**不是"直接跳到终态"**。
- filter-table 的行折叠瞬间完成。

tuffex 已有 25 个组件写了组件级 `@media (prefers-reduced-motion: reduce)`（`TxToolCallCard.vue:349-356` 是范式：把 `transition: none; animation: none` 加在具体类上）。移植时应采用 tuffex 的组件级写法，**行为语义保持 BUI 一致**（阶段机继续走，只去掉补间）。PRD 约束里"动效尊重 prefers-reduced-motion（移植不得丢失）"指的就是这个。

### 0.5 hover 底色的语义冲突

- BUI：`--hover` 是**中性灰**（light `#f4f5f6` / dark `#2a2b2e`）。
- `TxDataTable.vue:520-522`：`.is-hover tbody tr:hover { background: color-mix(in srgb, var(--tx-color-primary-light-9, #ecf5ff) 60%, transparent) }` —— **蓝色 tint**。

要做到与 shots 一致，records/filter/diff 表格的 hover 必须是中性色。这是 `TxDataTable` 上一个需要新增 token 或变体开关的点（见 §2 缺口 G13）。

### 0.6 尺寸刻度换算（`--spacing: .25rem`）

| Tailwind 类 | 计算值 | 出现处 |
|---|---|---|
| `max-w-95` | 23.75rem = **380px** | diff-table 容器 |
| `max-w-105` | 26.25rem = **420px** | filter-table 容器 |
| `h-5.5` | 1.375rem = **22px** | diff-table category pill |
| `h-6.5` | 1.625rem = **26px** | filter-table 筛选 chip |
| `h-5` | **20px** | filter-table 状态 pill |
| `size-1.5` | **6px** | 所有圆点（diff / filter chip） |
| `primitive-table-cell` | `padding:10px 12px` | diff-table 所有单元格 |

---

## 1. `TxDataTable` 能力基线与精确缺口清单

### 1.1 现有 API（`data-table/src/types.ts` + `TxDataTable.vue`）

**Props**（14 个）：`columns` `data` `rowKey` `loading` `emptyText` `striped` `bordered` `hover` `interactiveRows` `selectable` `selectedKeys` `defaultSort` `sortOnClient` `tableLayout` `nowrap`

**DataTableColumn**（16 字段）：`key` `title` `dataIndex` `width` `minWidth` `maxWidth` `auto` `fixed` `nowrap` `align` `sortable` `sorter` `format` `headerClass` `cellClass`

**Emits**：`update:selectedKeys` `selectionChange` `sortChange` `rowClick`

**Slots**：`header-<key>`（作用域 `{ column }`）、`cell-<key>`（作用域 `{ row, column, value, index }`）、`empty`

**已实现的机制**：
- 三态排序循环 `asc → desc → null`（`TxDataTable.vue:84-99`），`aria-sort` 正确暴露
- `defaultSort` 按值 watch（不按引用，`TxDataTable.vue:37-51`），避免父级重渲染回滚用户排序
- 左右固定列偏移计算（`fixedColumnOffsets`，`TxDataTable.vue:197-218`）
- 行可交互性自动推导（绑了 `rowClick` 监听即自动 `tabindex=0`，`TxDataTable.vue:32-33`）
- 选择用受控 `selectedKeys` + `update:selectedKeys`

### 1.2 缺口清单（按对本 cluster 的阻塞程度排序）

| # | 缺口 | 证据 | 阻塞谁 |
|---|---|---|---|
| **G1** | **无 `<tfoot>` / 汇总行**，无 `footer` slot、无 `summary` prop | 模板只有 `thead`+`tbody`（`TxDataTable.vue:294-379`） | records |
| **G2** | **表头不 sticky**：`thead th` 无 `position: sticky` | `TxDataTable.vue:450-456` | records |
| **G3** | **无滚动容器**：根元素 `overflow: hidden`；有固定列时切 `overflow: visible`，**不设 `overflow-x: auto`** | `TxDataTable.vue:386-399`；文档 `data-table.zh.mdc:122,154` 已显式承认 | records |
| **G4** | `border-collapse: collapse` | `TxDataTable.vue:403` | records（sticky 单元格在 Chromium/WebKit 下滚动时边框会丢失；BUI 正是为此用 `separate` + `border-spacing:0`） |
| **G5** | **无行级 class/attr 钩子**（无 `rowClass` / `rowProps`） | 行 class 硬编码 `TxDataTable.vue:341-342` | diff、records |
| **G6** | **选中行没有 `.is-selected` class**，`selectedKeys` 只驱动 checkbox，行本身无视觉反馈 | 同上 | records |
| **G7** | **`TxCheckbox` 无 indeterminate**：`aria-checked` 只有布尔（`TxCheckbox.vue:57`），无 mixed 视觉 | `checkbox/src/TxCheckbox.vue` 全文 | records 全选三态 |
| **G8** | **`header-<key>` slot 拿不到排序状态**，作用域只有 `{ column }`；且 `column.sortable` 为真时 slot 内容被塞进组件自己的 `<button>` 里（`TxDataTable.vue:312-330`），自定义表头无法再套按钮（嵌套 button 非法） | | records（表头图标 + 自绘箭头） |
| **G9** | **无行级进出场动画**：`<tr>` 是 `display: table-row`，不能承载 `grid-template-rows: 0fr` | | diff（新增行展开）、filter（行折叠） |
| **G10** | **无筛选管线**：只能父级预过滤 `data`，预过滤会把行从 DOM 摘掉，折叠动画无从谈起 | | filter |
| **G11** | **排序循环固定三态**，无 `sortCycle` 开关；records 是两态（`dir *= -1`，永不归零） | `12-records-table.tsx:135` | records（行为差异，非阻塞） |
| **G12** | `getStickyWidth` 只解析整数 px（`^(\d+(\.\d+)?)px$`，`TxDataTable.vue:187-195`）；百分比/rem 宽度得到偏移 0，多列 sticky 会静默重叠 | | records 用 px，不阻塞；但值得记录 |
| **G13** | hover 底色是蓝色 tint，非中性灰 | `TxDataTable.vue:520-522` | 三个都受影响（见 §0.5） |
| **G14** | 无 `<colgroup>`，列宽逐单元格下发 | | 软缺口，`table-layout: fixed` 下等效 |

### 1.3 `TxVirtualList` 不能用于表格

`TxVirtualList.vue:130-147` 是 div 结构 + `position: absolute` 的 items 层。塞进 `<tbody>` 会破坏 table 布局。records-table 26 行不需要虚拟化；若未来需要，得另做 table-aware 虚拟化（`translateY` on `tbody` + 固定行高），不能复用 `TxVirtualList`。

### 1.4 `TxScroll` 也不能做 records 的滚动容器（默认模式下）

`TxScroll` 基于 BetterScroll，是 transform 位移滚动。**祖先元素有 transform 会让 `position: sticky` 失效**，records-table 的 sticky 表头 / 首列 / 页脚全部依赖 sticky。必须用原生 `overflow: auto`（或 `TxScroll` 的 `native` 模式）。

---

## 2. `11-diff-table.tsx` — Diff Table

### 2.1 做什么

一次性播放的"AI 提案改动"表格：静置 1.8s → 两行被标红（删除提案）→ 再过 1s → 底部展开一行绿色新增。播完停在终态，不循环、不重置、无交互。

### 2.2 全量清单

**数据模型**

```ts
ROWS = [
  { id: 'Rocky Road', dept: 'Classic', email: 'aurora-scoops', removed: true },
  { id: 'Bubblegum',  dept: 'Retro',   email: 'kumo-creamery', removed: true },
  { id: 'Mint Chip',  dept: 'Classic', email: 'maple-orbit',  removed: false },
]
DOT = { Classic: 'bg-accent', Retro: 'bg-ink-3', Seasonal: 'bg-orange' }
```

新增行（Pistachio / Seasonal / maple-orbit）**是硬编码 JSX，不在 `ROWS` 里**（`11-diff-table.tsx:98-126`）。

**列锚**：`<colgroup>` 34% / 30% / 36%；表头 `Flavor / Category / Supplier`，12px / 500 / `--ink-3`。

**动画时间线**（`useStage([800, 1000, 1000])`，`11-diff-table.tsx:10-18, 33-36`）

| t | stage | 视觉 |
|---|---|---|
| 0 | 0 | 全 plain |
| 800ms | 1 | **无任何变化**（守卫是 `stage >= 2`） |
| 1800ms | 2 | `tinted = true` → 两行红染 |
| 2800ms | 3 | `added = true` → Pistachio 行展开 |

> 源码注释 `// 0 plain · 1 red tint · 2 completed diff`（`11-diff-table.tsx:34`）与实际守卫**差一位**。真实效果是前 1.8 秒完全静止。移植时按代码来，不按注释来 —— 也可以主动收掉那个空转的 800ms（见 §2.5 风险 R1）。

**逐属性补间**（全部 `duration-400` = 400ms；Tailwind 默认缓动 `cubic-bezier(.4,0,.2,1)`，来自 `--default-transition-timing-function`）

| 目标 | 属性 | 终值 |
|---|---|---|
| `<tr>` | `transition-colors` | `background: var(--red-tint)` |
| Flavor `<td>` | `transition-colors` | `color: var(--red)`（否则 `var(--ink)`） |
| Category pill | `transition-opacity` | `opacity: .55`（否则 1） |
| Supplier `<td>` | `transition-colors` | `color: var(--red)` + `text-decoration-line: line-through` + `text-decoration-color: color-mix(in srgb, var(--red) 50%, transparent)` |
| 新增行包裹 | `transition-[grid-template-rows,opacity]` **400ms `cubic-bezier(0.23, 1, 0.32, 1)`** | `0fr → 1fr`，`opacity 0 → 1` |

注意：Tailwind v4 的 `transition-colors` 属性集包含 `text-decoration-color`，但**不包含 `text-decoration-line`** —— 删除线是瞬间出现的，只有它的颜色在补间。

新增行的结构是 `<tr><td colSpan={3} class="p-0"><div class="grid" style="grid-template-rows:0fr|1fr">…` —— 因为 `<tr>` 无法承载 grid 行高动画，必须借 `colspan` 单元格里的 div。这是 G9 的根因。内层 `<div class="grid grid-cols-[34%_30%_36%]">` 手工复刻列宽，`border-t border-line`，底色 `var(--green-tint)`。

**消费的 token**：`--red` `--red-tint` `--green` `--green-tint` `--ink` `--ink-2` `--ink-3` `--line` `--surface` `--inset` `--hover` `--accent` `--orange`；`rounded-card`(10px) + `shadow-card` 外壳；pill 用 `bg-inset` + `shadow-hairline`（新增行的 pill 反而用 `bg-surface`）。

**hover**：`<tr>` 带 `hover:bg-hover`，但被删除行用**内联 style** 设了 `background`（`11-diff-table.tsx:67`），内联样式优先级高于 class → **红染行不会有 hover 反馈**。新增行完全没有 hover。

**reduced-motion**：无组件级处理，走全局核弹（§0.4）。

### 2.3 与 `TxDataTable` 的重叠判定

`TxDataTable` 能表达的：列定义（3 列定宽百分比）、`cell-<key>` 自定义渲染（pill / 删除线文本）、`tableLayout: 'fixed'`。

**不能表达的（精确缺口）**：
- **G5**：无 `rowClass` → 无法给 `<tr>` 挂 `is-removed` 并染红。当前只能靠 `cell-*` slot 逐个单元格染色，行底色（跨整行的 `--red-tint`）做不到。
- **G9**：无法插入"末尾追加行"，更无法让它以 `0fr → 1fr` 展开。这是硬阻塞。
- **G13**：hover 底色语义不符（软）。

### 2.4 融合建议：**(a) 新建独立 `TxDiffTable`**

**理由**
1. 它的行模型不是"列 + 数据"，是**变更集**：每行携带 `change: 'added' | 'removed' | 'unchanged' | 'modified'`，未来还要支持字段级 diff（BUI 目前只做了行级）。把这个语义塞进通用 `DataTableColumn` 会污染 `TxDataTable` 的心智模型。
2. 它自带一个**一次性阶段机 + 定时器生命周期**（挂载即播、卸载清 timer、可能需要 `replay()`）。通用表格不该拥有播放状态。
3. 追加行必须是 `<td colspan>` + grid 包裹（G9），`TxDataTable` 的 `v-for` 行循环发不出这种节点，除非新增一个专门的 `appended-rows` slot —— 那等于为一个 AI 场景给通用组件开洞。
4. 组件本体很小（表格标记约 50 行 + 阶段机约 30 行），独立实现的重复成本低于给 `TxDataTable` 开洞的耦合成本。

**备选（需要时可切）**
- **(b) `TxDataTable` 变体**：新增 `rowClass` + `appendedRows` slot + `rowTint` 支持。工作量与 (a) 接近，但把"提案/审阅"语义写进通用表格，且 `appendedRows` slot 只有 diff 场景会用。
- **(c) 纯组合**：`TxDataTable` + `cell-*` slot 做染色 —— 可覆盖约 80%（文字变红、删除线、pill 变淡），但**行底色**和**新增行展开**两个签名效果都做不到，等于放弃组件的核心表达。不推荐。

**共享**：category pill 用 §5 的 `TxDotChip`；红/绿 tint 用 §5 的 `--tx-diff-*` token 组。

### 2.5 Vue API 草案

```ts
// diff-table/src/types.ts
export type DiffChangeKind = 'unchanged' | 'added' | 'removed' | 'modified'

export interface DiffTableColumn<T = any> {
  key: string
  title: string
  width?: string | number        // '34%' 等百分比，落到 <colgroup>
  align?: 'left' | 'center' | 'right'
  /** 该列在 removed 行是否加删除线，默认 false */
  strikeOnRemove?: boolean
  /** 该列在变更行是否变色，默认 true */
  tintText?: boolean
}

export interface DiffTableRow<T = any> {
  key: string | number
  data: T
  change?: DiffChangeKind          // 默认 'unchanged'
}

export interface DiffTableProps<T = any> {
  columns: DiffTableColumn<T>[]
  rows: DiffTableRow<T>[]
  title?: string                    // 卡片头，默认 ''（无头则不渲染 bar）
  /** 播放模式：'auto' 挂载即播 | 'manual' 由 play() 触发 | 'settled' 直接终态 */
  play?: 'auto' | 'manual' | 'settled'
  /** 阶段延时 [起始静置, 标记变更, 展开新增]，默认 [800, 1000, 1000] */
  stageDelays?: [number, number, number]
  /** 补间时长 ms，默认 400 */
  duration?: number
}

export interface DiffTableEmits {
  (e: 'stageChange', stage: number): void
  (e: 'settled'): void              // 播放结束（终态达成）
}
```

**Slots**

| 名称 | 作用域 | 说明 |
|---|---|---|
| `title` | — | 覆盖卡片头 |
| `cell-<key>` | `{ row, column, value, change, index }` | 自定义单元格；`change` 让插槽内容能自己响应变更态 |

**Expose**：`play()` / `reset()` / `settle()`（跳到终态）

**泛型**：SFC 用 `<script setup lang="ts" generic="T">`，`defineProps<DiffTableProps<T>>()`，`defineSlots<{ [K: `cell-${string}`]: (p: { row: DiffTableRow<T>, ... }) => any }>`。参考 `TxVirtualList.vue:1` 已有 `generic="T"` 先例。

> 注：memory `tuffex-generic-sfc-expose-typing` —— 手写 `TxDiffTableInstance` 时 expose 面是解包后类型。

### 2.6 移植风险

- **R1 阶段机语义**：React 的 `useStage` 靠 `useEffect([stage])` 自递归。Vue 侧要用 `watch(stage, ..., { immediate: true })` 或显式 `onMounted` + 链式 `setTimeout`，并**务必在 `onBeforeUnmount` 清 timer**（React 版靠 effect cleanup，Vue 没有等价物会泄漏）。同时暴露 `settle()` 供文档 demo 反复触发。
- **R2 那 800ms 空转**：照抄会让 demo 前 1.8 秒看起来像卡住。建议 `stageDelays` 默认保留 `[800, 1000, 1000]` 以对齐 shots 语义，但在文档里注明第一段是刻意的"静置读取期"。
- **R3 内联 style 压掉 hover**（§2.2）：Vue 里如果用 `:style` 同样会压掉 `:hover` class。建议改成 class 驱动（`.is-removed { background: … }`），并让 `:hover` 用更高特异性选择器，从而**修掉**这个源码缺陷——但要在文档"与源码差异"里写明。
- **R4 `colspan` 行的列宽复刻**：内层 grid 手写 `34% 30% 36%`，与 `<colgroup>` 是两份真相。Vue 侧应由 `columns` 派生 `gridTemplateColumns`，避免漂移。
- **R5 dark tint**：`--red-tint` 在 dark 是 `#ee5c6124`（透明叠加），不能映射到 `--tx-color-danger-light-9`（那在 dark 也混白）。见 §0.2。
- **R6 高对比主题**：tuffex 有 HC light/dark（`variables.scss:4-157`），`--tx-color-danger` 在 HC-dark 是 `#fda4af`（很亮）。红染 tint 的 mix 比例需要在四套主题下各验一次，不能只验两套。

---

## 3. `12-records-table.tsx` — Records Table

### 3.1 做什么

CRM 风格宽表：26 条公司记录，5 列，横纵双向滚动，首列 sticky + 表头 sticky + 页脚汇总行 sticky，全选三态、行选中高亮、可排序表头、标签 chip、关系强度点、外链列。**这是本 cluster 的主融合目标**。

### 3.2 全量清单

**数据模型**

```ts
type Strength = 'strong' | 'weak' | 'veryweak' | 'none'
type SortKey  = 'name' | 'last' | 'strength'
type Row = { id: string; name: string; tags: string[]; last: string; strength: Strength; website?: string }

STRENGTH = {
  strong:   { label: 'Very strong',      color: 'var(--green)',  rank: 3 },
  weak:     { label: 'Weak',             color: 'var(--orange)', rank: 2 },
  veryweak: { label: 'Very weak',        color: 'var(--red)',    rank: 1 },
  none:     { label: 'No communication', color: 'var(--ink-3)',  rank: 0 },
}
TAG_COLORS = { B2B:#f09a2f, B2C:#92b72d, Cafe:#ee6572, Catering:#c84f9d, 'Dairy-free':#16a6c7,
               Gelato:#9a5cff, Imports:#3f78ff, Local:#25a878, Seasonal:#f09a2f,
               Sorbet:#16a6c7, Vegan:#92b72d, Wholesale:#3f78ff }   // fallback #7f858d
```

26 行数据分布已核对：strong×3、weak×7、veryweak×11、none×5；有 website 的 19 行。

**列解剖**（`<colgroup>` 固定像素宽，合计 1120px）

| 列 | 宽 | 可排序 | 内容 |
|---|---|---|---|
| Company | 270px | 否（但有全选 checkbox） | checkbox(24px 命中/18px 盒) + 字母 mark(20px) + 链接名 |
| Categories | 275px | 否（`HeaderCell` 无 `sortKey`，点击是 no-op，箭头不渲染） | tag chip ×N（`slice(0,4)` + `+N` 溢出片） |
| Last interaction | 190px | ✓ | 相对时间**字符串**；`'No contact'` 走 `records-muted` |
| Connection strength | 210px | ✓ | 8px 圆点 + label |
| Links | 175px | 否 | 外链 + 12px 箭头图标；无则 `—` |

**表格几何**

```css
.records-table { border-collapse:separate; border-spacing:0; table-layout:fixed;
                 width:100%; min-width:990px; font-size:12px; color:var(--ink) }
.records-scroll{ max-height:438px; overflow:auto; overscroll-behavior:none;
                 scrollbar-gutter:stable; scrollbar-color:var(--line-strong) transparent }
.records-scroll:focus-visible{ outline:2px solid var(--accent); outline-offset:-2px }
.records-cell  { height:42px; padding:0 12px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden }
.records-table td, .records-table th {
  border-right:1px solid color-mix(in srgb,var(--line) 78%,transparent);
  border-bottom:1px solid color-mix(in srgb,var(--line) 78%,transparent) }
.records-table tr>:last-child{ border-right:0 }
```

注意 `min-width: 990px` < colgroup 合计 1120px —— 实际最小宽由 colgroup 决定，`min-width` 是个更松的下界。

**sticky 的 z-index 阶梯**（这是最容易做错的部分）

| 层 | 定位 | z-index | 底色 |
|---|---|---|---|
| body 首列 `.records-sticky-cell` | `left: 0` | 2 | `var(--surface)`，`box-shadow: 5px 0 8px -10px #0006` |
| `tfoot td` | `bottom: 0` | 4 | `var(--inset)`，高 38px |
| `thead th` | `top: 0` | 5 | `var(--surface)`，高 42px |
| `tfoot .records-sticky-cell` | 双向 | 6 | `var(--inset)` |
| `thead th.records-sticky-cell` | 双向 | 7 | `var(--surface)` |

**行状态**

```css
.records-row>.records-cell        { transition: background-color .12s ease-out, color .12s ease-out }
.records-row:hover>.records-cell  { background: var(--hover) }
.records-row.is-selected>.records-cell { background: color-mix(in srgb, var(--accent) 7%, var(--surface)) }
```

底色打在 **`<td>` 上而不是 `<tr>` 上** —— 因为 sticky 单元格自带底色，打在 `tr` 上会被 sticky 列的 `background: var(--surface)` 盖掉。移植时这是必须复刻的技巧。

**单元格原语**

| 原语 | 尺寸/配方 |
|---|---|
| `records-checkbox` | 24×24 命中区，内含 18×18 盒（radius 6px）；真实 `<input>` 视觉隐藏（`opacity:0;w:1px;h:1px;position:absolute`）；`:focus-visible + .box → outline 2px var(--accent) offset 2px`；`:active → scale(.96)`；过渡 `border-color/background-color/box-shadow .14s ease-out, transform .14s var(--ease-out-strong)` |
| checkbox 明暗色 | **硬编码 hex**：light `#fff` / `#c7cdd3` / ink `#4d555e`；dark `#343a41` / `#4f565f` / `#e0e4e8`；选中态 `var(--accent)` + 白勾；mixed 是 8×1.5px 圆角横杠 |
| `records-company-mark` | 20×20，radius 6px，`background: var(--field)`，`color: var(--ink-2)`，10px / 650，**取名字首字母 1 个** |
| `records-company-name` | 12.5px / 500，省略号；`.has-link:hover` → `var(--accent-ink)` + underline，`text-underline-offset: 3px` |
| `records-tag` | 高 23px，radius 6px，padding 0 7px，11px / 500，`max-width: 115px`；`bg = color-mix(--tag-color 13%, --surface)`；`border = color-mix(--tag-color 24%, --surface)`；`color = color-mix(--tag-color 82%, --ink)`；`cursor: pointer`（但无点击行为） |
| `records-tag-dot` | 5×5 圆，`margin-right: 5px`，纯 `--tag-color` |
| `records-more-tag` | 高 23px，border `--line-strong`，bg `--inset`，color `--ink-3` |
| `records-strength` | 8×8 圆点 + label，`color: var(--ink-2)`，gap 8px |
| `records-link` | `color: var(--accent-ink)`，`text-decoration-color: color-mix(in srgb, currentColor 35%, transparent)`，offset 3px，hover → `color: var(--ink)` + 实色下划线；过渡 `color .12s ease-out, text-decoration-color .12s ease-out` |

**表头交互**

```css
.records-header-cell{ padding:0 }                       /* 内层 button 承担 padding */
.records-header-button{ width:100%; height:42px; padding:0 12px; gap:8px; color:var(--ink-2);
                        transition: background-color .12s ease-out, color .12s ease-out }
.records-header-button:hover{ background:var(--hover); color:var(--ink) }
.records-header-icon{ color:var(--ink-3) }              /* 15px 线性 SVG */
.records-sort{ opacity:0; margin-left:auto;
               transition: opacity .12s ease-out, transform .16s var(--ease-out-strong) }
.records-header-button:hover .records-sort, .records-sort.is-visible{ opacity:1 }
```

降序时 `transform: rotate(180deg)`（内联 style，`12-records-table.tsx:110`）。**排序是两态**：`dir *= -1`，永不回到"无排序"（`12-records-table.tsx:135`）。

**页脚汇总行**（`<tfoot>`，`12-records-table.tsx:176`）

`26 count` | `+ Add calculation` 按钮 | `—` | `● 44% average`（橙点，`Math.round(Σrank / 26 / 3 × 100)` = `34/78×100` = 43.59 → 44） | `19 links`

汇总基于 `rows`（原始数组）而非 `visibleRows`，所以排序不影响它。

**动画**：**没有 keyframe 动画**。全部是 `.12s` / `.14s` / `.16s` 的 hover/focus 微过渡。`_global.css` 里 `.records-filter-menu` 有 `animation: pop-in .16s var(--ease-out-strong) both`，但那段标记不在给定的 TSX 里（见 §3.3）。

### 3.3 ⚠ CSS 里有 19 个类没有对应标记

`_global.css` 定义了 53 个 `.records-*` 类，TSX 只用了 34 个。未被使用的 19 个描述了一个**更完整的版本**：

`records-toolbar` / `records-toolbar-left` / `records-toolbar-right` / `records-select-button` / `records-primary-button` / `records-secondary-button` / `records-quiet-button` / `records-database-icon` / `records-filter-wrap` / `records-filter-dot` / `records-filter-menu` / `records-filter-label` / `records-menu-check` / `records-sort-menu` / `records-add-field` / `records-calculation-row-secondary` / `records-footer` / `records-footer-hint` / `records-scroll-cue`

也就是说：完整版还有**顶部工具条**（数据库图标 + 筛选下拉 + 排序下拉 + 导入/导出/主按钮）、**第二汇总行**（`bottom: 38px` 叠在主汇总行之上）、**底部状态条**（hover 才现的滚动提示）、**列头"+ 添加字段"按钮**。归档的 TSX 是精简版。移植范围应以 TSX 为准，但这些 CSS 是补齐工具条时的现成规格。

### 3.4 与 `TxDataTable` 的重叠判定

`TxDataTable` **能**表达的：5 列定宽（px）、`fixed: 'left'` 首列 sticky 定位（缺滚动容器）、`sortable` + 自定义 `sorter`、`selectable` + `v-model:selectedKeys`、`cell-<key>` 渲染 tag/strength/link、`tableLayout: 'fixed'`、`nowrap`。

**不能表达的（阻塞项，逐条对应 §1.2）**：

- **G1 无 `<tfoot>`** —— `26 count / 44% average / 19 links` 这一行完全无处安放。**硬阻塞**。
- **G2 表头不 sticky** —— shots 里表头压在滚动内容之上。**硬阻塞**。
- **G3 无滚动容器** —— `max-height: 438px` + 双向 `overflow: auto` 需要组件自己产出。当前文档明确写着"`TxDataTable` 自身不产生横向滚动"（`data-table.zh.mdc:154`）。**硬阻塞**。
- **G4 `border-collapse: collapse`** —— sticky 单元格边框在滚动时丢失。**硬阻塞**（需按需切 `separate`）。
- **G6 选中行无高亮** —— `.is-selected` class 不存在，且底色需打在 `<td>` 上（§3.2）。**硬阻塞**。
- **G7 checkbox 无 mixed** —— 全选三态做不出。**硬阻塞**。
- **G8 表头 slot 无排序态、且被包在自带 button 内** —— 列头图标可以放（图标不是交互元素，嵌在 button 里合法），但"hover 才显箭头 + 旋转 180°"这套是组件内建样式，只能改组件 CSS，不能靠 slot。**半阻塞**。
- **G11 三态 vs 两态排序** —— 行为差异，非阻塞。
- **G13 hover 蓝 tint vs 中性灰** —— 视觉差异。

### 3.5 融合建议：**(b) `TxDataTable` 加法式扩展 + (c) 抽新单元格原语**

**不新建 `TxRecordsTable`。** records-table 需要的每一项能力都是**通用表格能力**：sticky 表头、汇总页脚、带真实滚动容器的 sticky 首列、行选中高亮、三态全选。把它们做成一个 CRM 专用组件，等于把这些能力锁死在一个 demo 里，而 `TxDataTable` 的现有消费者（后台数据运维面板，见 `data-table.zh.mdc:65-87`）恰恰在等这些能力。

所以：**records-table 落地为一份"文档化的组合方案"** = 扩展后的 `TxDataTable` + §5 的单元格原语。

**新增 API（全部可选、默认关闭，不改变任何现有消费者的渲染）**

```ts
export interface DataTableProps<T = any> {
  // …现有 15 个 props 原样保留…

  /** 纵向滚动上限；设置后组件内部产出滚动容器 */
  maxHeight?: number | string
  /** 允许横向滚动（配合 fixed 列）。默认 false —— 保持现有 overflow 行为 */
  scrollX?: boolean
  /** 表头吸顶。需要 maxHeight 或外层滚动容器 */
  stickyHeader?: boolean
  /** 汇总行吸底 */
  stickyFooter?: boolean
  /** 行级 class 钩子 */
  rowClass?: (row: T, index: number) => string | string[] | Record<string, boolean>
  /** 选中行是否加底色。默认 false —— 现有消费者视觉不变 */
  highlightSelected?: boolean
  /** 排序循环。默认 'tri'（asc→desc→null，现状） */
  sortCycle?: 'tri' | 'bi'
}
```

**新增 slots**

| 名称 | 作用域 | 说明 |
|---|---|---|
| `footer` | `{ columns, data, selectedKeys }` | 渲染 `<tfoot>` 的**整行内容**；未提供则完全不渲染 `<tfoot>` 节点 |
| `footer-<key>` | `{ column, data }` | 按列渲染汇总单元格（与 `footer` 二选一，`footer-<key>` 优先级更细） |

**扩展现有 slot 作用域（纯加法，安全）**

`header-<key>` 的作用域从 `{ column }` 扩为 `{ column, sorted: boolean, order: DataTableSortOrder, toggle: () => void }`。已有消费者只解构 `column`，不受影响。

**必须谨慎的两处改动**

1. `border-collapse` —— **不要全局改**。只在 `stickyHeader || stickyFooter || maxHeight` 时给根元素加 `.is-sticky-shell` 类，在该类下切 `separate` + `border-spacing: 0`，并把 `border-bottom` 从"collapse 合并边"改写成每格自带边。这条是最容易在回归里翻车的地方（`bordered` / `striped` 的既有观感会变）。
2. 选中行底色 —— class `.is-selected` **总是**加到 `<tr>`（加 class 无视觉副作用），但底色规则挂在 `highlightSelected` 开关下，且底色要打在 `> .tx-data-table__cell` 上而非 `<tr>` 上（§3.2 的 sticky 覆盖问题）。

**`TxCheckbox` 的 indeterminate（G7）**

```ts
// checkbox 新增
indeterminate?: boolean
```
渲染时 `:aria-checked="indeterminate ? 'mixed' : isChecked"`，`.is-indeterminate` 下画 8×1.5px 横杠。注意 `TxCheckbox` 是 `<button role="checkbox">`（不是原生 input），`aria-checked="mixed"` 是它唯一能表达三态的通道。**BUI 源码这里反而是错的**：它渲染了横杠视觉，但 `<input checked={allSelected}>` 从不设 `indeterminate`，屏幕阅读器听到的是"未选中"（`12-records-table.tsx:86`）。移植应修掉。

**备选**
- **(a) 独立 `TxRecordsTable`**：能最快对齐 shots，但把 6 项通用能力锁进 CRM 专用组件，且与 `TxDataTable` 形成两套表格实现（长期维护双份 sticky/排序/选择逻辑）。不推荐。
- **(c) 纯组合，不改 `TxDataTable`**：外层自己包滚动容器可以解决 G3，但 G1（tfoot）、G2（sticky 表头）、G6（选中高亮）、G7（三态）在组件外部无解。不可行。

### 3.6 Vue API 草案（消费侧）

```vue
<script setup lang="ts" generic="T extends { id: string }">
import type { DataTableColumn, DataTableSortState } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

const selectedKeys = ref<string[]>([])
const sort = ref<DataTableSortState>({ key: 'name', order: 'asc' })

const columns: DataTableColumn<Company>[] = [
  { key: 'name',     title: 'Company',             width: 270, fixed: 'left', nowrap: true },
  { key: 'tags',     title: 'Categories',          width: 275 },
  { key: 'last',     title: 'Last interaction',    width: 190, sortable: true, sorter: byRecency },
  { key: 'strength', title: 'Connection strength', width: 210, sortable: true, sorter: byRank },
  { key: 'website',  title: 'Links',               width: 175 },
]
</script>

<template>
  <TxDataTable
    v-model:selected-keys="selectedKeys"
    :columns="columns" :data="rows" row-key="id"
    selectable highlight-selected
    table-layout="fixed" nowrap
    :max-height="438" scroll-x sticky-header sticky-footer
    sort-cycle="bi" :default-sort="sort"
    @sort-change="sort = $event ?? sort"
  >
    <template #header-tags="{ column }">
      <TxIcon name="tag" :size="15" /> {{ column.title }}
    </template>

    <template #cell-name="{ row }">
      <TxAvatar :name="row.name.slice(0, 1)" :size="20" shape="rounded" />
      <a :href="row.website && `https://${row.website}`">{{ row.name }}</a>
    </template>

    <template #cell-tags="{ value }">
      <TxDotChip v-for="t in value.slice(0, 4)" :key="t" :color="TAG_COLORS[t]" :label="t" />
      <span v-if="value.length > 4">+{{ value.length - 4 }}</span>
    </template>

    <template #cell-strength="{ value }">
      <TxDotIndicator :color="STRENGTH[value].color" :label="STRENGTH[value].label" :size="8" />
    </template>

    <template #footer-name>  <strong>{{ rows.length }}</strong> count </template>
    <template #footer-strength>
      <TxDotIndicator :color="'var(--tx-color-warning)'" :label="`${avgPct}% average`" :size="8" />
    </template>
    <template #footer-website> {{ linkCount }} links </template>
  </TxDataTable>
</template>
```

**受控排序/筛选状态**：`defaultSort` + `sortChange` 已经能构成受控回路（`TxDataTable.vue:37-51` 的按值 watch 保证父级回写不会被吞），但 prop 名叫 `defaultSort` 有误导性。建议**加法式**新增 `sort?: DataTableSortState | null` + `update:sort` 作为显式受控通道，`defaultSort` 保留为非受控入口并在文档标注二者互斥。

### 3.7 移植风险

- **R1 sticky × `border-collapse`**：见 §3.5。这是本组件最大的实现风险，务必在 Chromium + WebKit 双引擎下验滚动时的边框。
- **R2 sticky × transform 祖先**：任何祖先有 `transform` / `filter` / `will-change` 都会让 sticky 失效。禁止把这张表包进默认模式的 `TxScroll`（§1.4）；nexus demo 的 `TuffDemoWrapper` 是否引入 transform 需要单独确认。
- **R3 相对时间格式化（"9 days ago"）**：
  - BUI 源码里 `last` 是**预格式化字符串**，不是日期。它的排序用 `a.last.localeCompare(b.last)`（`12-records-table.tsx:126`）—— 按字母排"9 days ago" / "3 weeks ago" / "over 1 year ago"，**语义上是错的**。移植时不要照抄这个 sorter。
  - **tuffex 没有 dayjs 依赖**（`packages/tuffex/package.json` 的 dependencies 里没有）。dayjs 只存在于 `packages/utils`（`^1.11.21`）和 `apps/core-app`（`^1.11.21`）。tuffex 依赖 `@talex-touch/utils: workspace:^`，所以 `import dayjs` **能解析成功但是幻影依赖**——这正是 memory `phantom-deps-hide-tooling` 记录的那一类问题。
  - 建议：组件**不做**日期格式化，`last` 列接受字符串（保持 BUI 契约）；若要提供 helper，用零依赖的 `Intl.RelativeTimeFormat`（浏览器内建），或让消费者自带格式化函数。若确实要用 dayjs，必须在 `packages/tuffex/package.json` 显式声明。
  - 排序应基于**原始时间戳字段**（新增 `lastAt?: number`），`sorter: (a, b) => a.lastAt - b.lastAt`。
- **R4 `TxAvatar` 首字母数量**：`TxAvatar.vue:88-104` 的 `fallbackText` 对多词姓名取"首词首字母 + 末词首字母"两个字母 —— `"Aurora Scoops — Reykjavík"` 会渲染 `"AR"`，而 BUI 要的是 `"A"`。要么传 `:name="row.name.slice(0,1)"`，要么给 `TxAvatar` 加 `maxInitials?: 1 | 2`。
- **R5 checkbox 的硬编码 hex**：BUI 的 checkbox 明暗色不走 token（`#c7cdd3` / `#343a41` / `#4f565f` …）。tuffex 的 `TxCheckbox` 已经全用 `--tx-*` token，**不要**为了像素对齐把硬编码 hex 搬进来，那会在 HC 主题下失效。
- **R6 12 色标签调色板**：`TAG_COLORS` 是 12 个裸 hex。tuffex 侧应作为**数据**（消费者传入）而非组件内置常量，组件只接受 `color: string`。若要提供预设，放在文档 demo 里，不要进组件源码。
- **R7 四套主题**：`color-mix(--tag-color 13%, --surface)` 在 HC 主题下对比度不足的风险很高（HC 的 `--tx-bg-color` 是 `#05070d`）。tag chip 需要在四套主题下各查一次对比度。

---

## 4. `13-filter-table.tsx` — Filter Table

### 4.1 做什么

顶部一排状态 chip（All / To do / In Progress / Completed，各带计数），点击后下方任务列表**就地折叠**不匹配的行（而不是把它们从 DOM 移除）。

### 4.2 全量清单

**数据模型**

```ts
type Status = 'todo' | 'progress' | 'done'
FILTERS = [
  { key: 'all',      label: 'All',         count: 5 },
  { key: 'todo',     label: 'To do',       dot: '#f09a2f', count: 2 },
  { key: 'progress', label: 'In Progress', dot: '#16a6c7', count: 2 },
  { key: 'done',     label: 'Completed',   dot: '#25a878', count: 1 },
]
ROWS = 5 × { task, date, status, owner }
PILLS = { todo: 'filter-status-todo', progress: 'filter-status-progress', done: 'filter-status-done' }
```

**计数是硬编码字面量**（`13-filter-table.tsx:12-17`），不是从 `ROWS` 推导的。碰巧对得上（5 / 2 / 2 / 1）。移植时应改为派生值。

**它不是 `<table>`**：整个"表格"是 CSS grid 的 div 结构，`grid-cols-[1.3fr_0.6fr_0.95fr_0.9fr]`，外壳 `overflow-x-auto rounded-card bg-surface shadow-card`，内层 `min-w-[420px]`，容器 `max-w-105`（420px）。滚动区 `role="region" tabIndex={0} aria-label="Scrollable task table"`，`scrollbarWidth: 'none'`。

**chip 规格**

```
h-6.5 (26px) · rounded-full · px-2.5 · 12px/500 · gap-1.5
active   → bg-surface  text-ink   shadow-btn
inactive → text-ink-2  hover:bg-hover
transition-[background-color,box-shadow,color] duration-200   /* ease = cubic-bezier(.4,0,.2,1) */
aria-pressed={active}
dot: size-1.5 (6px) 圆，硬编码 hex
count 徽章: rounded-[4px] px-1 text-[10.5px] tabular-nums
           active → bg-field text-ink-2 ; inactive → text-ink-3
```

chip 行本身：`-mx-1 mb-1 px-1 py-1 flex gap-1 overflow-x-auto`，`scrollbarWidth: 'none'`。

**行折叠动画**（`13-filter-table.tsx:87-95`）

```jsx
<div className="grid transition-[grid-template-rows,opacity] duration-300"
     style={{ gridTemplateRows: shown ? '1fr' : '0fr',
              opacity: shown ? 1 : 0,
              transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>
  <div className="overflow-hidden"> …实际行… </div>
</div>
```

**300ms / `cubic-bezier(.23,1,.32,1)`（= `--ease-out-strong`）**。所有 5 行**始终挂载**，只是高度归零 + 透明。

行内 hover：`transition-colors duration-100` + `hover:bg-hover`。

**状态 pill**（`.filter-status-*`，`_global.css`）

```
h-5 (20px) · rounded-[5px] · px-1.5 · 11px/500 · border 1px
color  = color-mix(in srgb, <hex> 92%, var(--ink))
bg     = color-mix(in srgb, <hex> 20%, var(--surface))
border = color-mix(in srgb, <hex> 34%, var(--surface))
todo #f09a2f · progress #16a6c7 · done #25a878
```

注意这套配方（**20% bg / 34% border / 92%+ink 文字**）与 `TxTag` 的（**12% bg / 32% border / 纯色文字**，`TxTag.vue:60,70`）不同，也与 records tag 的（13% / 24% / 82%+ink）不同。三套配方各不相同。

**消费的 token**：`--surface` `--inset`(未用) `--hover` `--field` `--ink` `--ink-2` `--ink-3` `--line`；`rounded-card` + `shadow-card` + `shadow-btn`。

**reduced-motion**：无组件级处理。

### 4.3 与 `TxDataTable` 的重叠判定

- **G10 无筛选管线**：`TxDataTable` 只接受 `data`。父级预过滤会把行从 DOM 摘掉 → 折叠动画消失。
- **G9 `<tr>` 不能折叠**：`display: table-row` 无法承载 `grid-template-rows`。这正是 BUI 自己**放弃 `<table>` 改用 grid div** 的原因。
- **G13 hover 底色**。
- 其余（列宽、单元格渲染、pill）`TxDataTable` 都能表达。

### 4.4 融合建议：**(a) 新建 `TxFilterChips` 原语 + (c) 表体用 `TxDataTable` 组合**

拆成两件事看，答案就清楚了：

**筛选 chip 行 = 真正值得复用的部分 → 新建 `TxFilterChips`**

tuffex 现有的三个近邻都不合适：
- `TxSuggestionChips`（`suggestion-chips/src/TxSuggestionChips.vue`）：绑死 `AiSuggestion` 类型，无选中态、无计数、无圆点、无 `v-model`，只 emit `select`。
- `TxTabBar`（`tab-bar/src/types.ts`）：是移动端**底部导航栏**（`fixed` / `safeAreaBottom` / `zIndex`），语义完全不同。
- `TxSegmentedSlider`：是滑杆，不是 chip 组。

而 records-table 的 CSS 里还有一整套 `.records-filter-menu` / `.records-quiet-button.is-active`，说明"带计数的筛选器"在 BUI 体系里是复用概念。`TxFilterChips` 至少服务 filter-table + records-table 工具条两处。

**表体 → 用 `TxDataTable`（组合），接受"瞬时过滤"而非折叠动画**

理由：
1. 折叠动画要进 `TxDataTable`，唯一干净的做法是给**每个单元格**再包一层 `<div>` 承载 `0fr↔1fr`，并把 `<td>` 的 padding 一起动画。这会改变所有现有消费者的 DOM 结构和 `cell-*` slot 的 CSS 上下文 —— 违反"不破坏现有 API"。
2. BUI 自己也是靠**放弃语义化 `<table>`** 换来的这个动画。用 grid div 复刻等于在 tuffex 里再养一套表格实现，且丢掉 `<table>` 的 a11y（行列关系、`aria-sort`、屏幕阅读器表格导航）。
3. **BUI 的折叠实现本身有 a11y 缺陷**（§4.6 R2），不值得逐像素继承。

**若确实要求折叠动画的像素级还原**（PRD AC2 用 shots 验收，而 shots 是静态终态，实际上验不到这一段），备选顺序：

- **备选 B**：给 `TxDataTable` 加 `hiddenKeys?: DataTableKey[]` + `collapseHidden?: boolean`。开启时行进入 `.is-collapsed`，用 `<td>` 的 `padding-block: 0` + 内容 wrapper 的 `0fr` 做折叠。**代价**：需要给每个 `<td>` 加内容包裹层（DOM 结构变更，`cell-*` slot 的 CSS 会受影响），且必须同步 `aria-hidden` / `hidden`。
- **备选 C**：独立 `TxFilterTable`（grid div，逐像素照抄 BUI）。**代价**：第二套表格实现 + a11y 退化。

**共享**：状态 pill 用 §5 的 `TxTag` `variant="soft"`（或新 `TxStatusPill`），chip 圆点用 `TxDotIndicator`。

### 4.5 Vue API 草案

```ts
// filter-chips/src/types.ts
export type FilterChipValue = string | number

export interface FilterChipItem {
  value: FilterChipValue
  label: string
  /** 前置圆点颜色；不传则不渲染圆点 */
  dot?: string
  /** 计数徽章；不传则不渲染 */
  count?: number
}

export interface FilterChipsProps {
  modelValue?: FilterChipValue
  items?: FilterChipItem[]
  disabled?: boolean
  /** 语义：单选筛选器用 aria-pressed（默认），导航语义用 tablist */
  role?: 'toolbar' | 'tablist'
}

export interface FilterChipsEmits {
  (e: 'update:modelValue', v: FilterChipValue): void
  (e: 'change', v: FilterChipValue): void
}
```

**Slots**：`chip`（作用域 `{ item, active }`，允许完全自定义 chip 内容）

**受控筛选状态**：`v-model` 单一真相源。计数由消费者传入（**不要**让组件从 `data` 里推 —— 组件看不到数据）。文档 demo 里用 `computed` 从行数据派生计数，把 BUI 的硬编码修正掉。

**配合 `TxDataTable`**：

```vue
<TxFilterChips v-model="filter" :items="filters" />
<TxDataTable :columns="columns" :data="visibleRows" row-key="task">
  <template #cell-status="{ value }">
    <TxTag :label="PILLS[value].label" :color="PILLS[value].color" variant="soft" size="sm" />
  </template>
</TxDataTable>
```

### 4.6 移植风险

- **R1 计数与数据脱钩**：BUI 是字面量。移植必须派生，否则筛选后计数会说谎。
- **R2 隐藏行仍在无障碍树里**（源码缺陷）：折叠行只有 `opacity: 0` + 零高度，**没有 `hidden` / `aria-hidden` / `inert`**。屏幕阅读器会照读全部 5 行，键盘 Tab 也能进到被折叠行里的可聚焦元素。如果实现备选 B/C，必须在动画结束后补 `hidden`（用 `transitionend` 或延时），且在展开前先摘掉。这是"照抄源码就继承 bug"的典型。
- **R3 `last:border-0` 是坏的（有截图佐证）**：行内层 `<div class="… border-b border-line … last:border-0">`（`13-filter-table.tsx:98-100`）是它父 `<div class="overflow-hidden">` 的**唯一子元素**，`:last-child` 恒成立 → **每一行的边框都被清掉**。`shots/light-filter-table.png` 证实：行之间没有分隔线，只有表头下方有一条。移植时要明确决定是复刻这个"无行分隔线"的结果（与截图一致），还是修成"最后一行无边框"（与意图一致）。**建议按截图走**（PRD AC2 以 shots 为验收基准），并在代码注释里记一句。
  - 对照：diff-table 的 `last:border-0` 在 `<tr>` 上是**有效**的，但因为最后一个兄弟是"新增行" `<tr>`，三条数据行的边框都保留 —— `shots/dark-diff-table.png` 证实有行分隔线。
- **R4 三套 tint 配方**：filter pill(20/34/92) vs records tag(13/24/82) vs `TxTag`(12/32/纯色)。不要为了统一而强行合并；建议 `TxTag` 增加 `variant?: 'outline' | 'soft'` 或直接暴露 `tint`/`borderTint` 数值，让三种配方都能表达。
- **R5 chip 圆点的硬编码 hex** 与状态色语义：`#f09a2f`(warning) / `#16a6c7`(info-cyan) / `#25a878`(success)。tuffex 的 `--tx-color-primary` 是蓝 `#409eff`，没有 cyan 语义色。progress 状态需要一个新的语义色或直接接受自定义 hex。

---

## 5. 应当只抽一次的共享单元格原语

按"三个组件里出现次数"排序。**注意：三者的单元格内边距各不相同**（diff `10px 12px` / records `0 12px` + 42px 行高 / filter `px-3 py-2`），所以"单元格外壳"不是共享物，只有**格内原语**是。

| # | 原语 | 谁在用 | 建议形态 |
|---|---|---|---|
| **P1** | **圆点 + 文本 chip** | diff category pill（22px 圆角全 / `bg-inset` / `shadow-hairline` / 6px 点）、records tag（23px / radius 6 / color-mix 三件套 / 5px 点）、filter chip（26px 圆角全 / 6px 点 / 带计数） | 扩展 `TxTag`：新增 `dot?: string`（圆点颜色）、`dotSize?: number`、`variant?: 'outline' \| 'soft' \| 'plain'`、`count?: number`。**不新建组件** —— `TxTag` 已有 `color`/`background`/`border`/`pill`/`size`，缺的只是圆点与 tint 强度 |
| **P2** | **纯圆点状态指示器** | records strength（8px 点 + label + `--ink-2` 文字）、records 汇总行 average（8px 橙点）、filter chip 的点（6px） | 新建极小组件 `TxDotIndicator`：`{ color, label?, size = 8 }`。**不要**复用 `TxStatusBadge` —— 它是 5 档固定 tone + 图标 + 边框盒（`TxStatusBadge.vue:151-185`），语义与"裸圆点"不同，且不接受任意颜色 |
| **P3** | **软色状态 pill（无点）** | filter status pill | `TxTag` 的 `variant="soft"`（P1 的一部分） |
| **P4** | **单元格链接** | records `records-link`（外链 + 12px 箭头 + 35% 下划线）、records `records-company-name.has-link`（hover 才下划线） | 新建 `TxCellLink`：`{ href, external?, muted? }`；`external` 时补 `target="_blank" rel="noreferrer"` + 箭头图标。两种下划线策略用 `underline?: 'always' \| 'hover'` 表达 |
| **P5** | **字母方块 mark** | records company mark（20px / radius 6 / `--field` / 单字母） | 复用 `TxAvatar`（`shape="rounded"` + `:size="20"` + `backgroundColor`），但需处理首字母数量（§3.7 R4）。不新建 |
| **P6** | **三态 checkbox** | records 全选 | 扩展 `TxCheckbox`：`indeterminate?: boolean` + `aria-checked="mixed"`（§3.5） |
| **P7** | **溢出计数片（`+N`）** | records `records-more-tag` | `TxTag` 的 `variant="plain"` 即可表达，不必单开 |
| **P8** | **等宽数字** | 三者的数字/日期列都用 `tabular-nums` | 不是组件，是一条 CSS 约定；建议在 `TxDataTable` 的 `DataTableColumn` 加 `tabularNums?: boolean`，或直接靠 `cellClass` |
| **P9** | **`--ease-out-strong` 缓动** | 三者的主缓动 `cubic-bezier(.23,1,.32,1)` | tuffex 没有这个 token（只有 `--tx-transition-function: ease-in-out`）。建议在 `variables.scss` 新增 `--tx-ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)` |
| **P10** | **`0fr ↔ 1fr` 折叠** | diff 新增行、filter 行折叠 | tuffex **已有 4 处先例**：`TxToolCallCard.vue:244-253`（含注释 "The 0fr↔1fr grid transition animates height without JS measurement"）、`TxChainOfThought.vue:240`、`TxSources.vue:134`、`TxReasoningDisclosure.vue:154`。直接沿用既有写法，**不要**新造抽象 |

---

## 6. 源码级缺陷清单（照抄会继承的）

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| D1 | `11-diff-table.tsx:34` | 注释 `0 plain · 1 red tint · 2 completed diff` 与守卫 `stage>=2` / `stage>=3` 差一位；前 1800ms 完全静止 | 按代码实现，文档注明 |
| D2 | `11-diff-table.tsx:67` | 红染行用内联 `style.background`，压掉 `hover:bg-hover` | 改 class 驱动 |
| D3 | `11-diff-table.tsx:29,116` | `DOT.Seasonal = 'bg-orange'`，但硬编码新增行的 Seasonal 点用 `bg-green` | 数据驱动后自然消解；或保留（新增行的绿点是刻意的 diff 语义） |
| D4 | `12-records-table.tsx:86` | mixed checkbox 画了横杠但从不设 `indeterminate` / `aria-checked="mixed"` | 移植时修 |
| D5 | `12-records-table.tsx:126` | `last` 列按 `localeCompare` 排人类可读的相对时间字符串，结果无意义 | 改为按时间戳排 |
| D6 | `13-filter-table.tsx:12-17` | 筛选计数是硬编码字面量 | 改为派生 |
| D7 | `13-filter-table.tsx:87-100` | 折叠行无 `hidden`/`aria-hidden`，仍在无障碍树与 Tab 序列里 | 补 `hidden`（动画结束后） |
| D8 | `13-filter-table.tsx:100` | `last:border-0` 命中每一行（唯一子元素），行分隔线全丢 | **截图证实此为实际渲染结果**；按截图走并注释 |

---

## Caveats / Not Found

- **未找到**：BUI 三个表格的任何 `@keyframes` 使用。`_global.css` 里 9 个 keyframes（`shimmer-text` / `fade-up` / `fade-in` / `eq-bounce` / `stream-in` / `caret-blink` / `pop-in` / `spin` / `pixel-on`）**没有一个**被本 cluster 消费。唯一沾边的 `pop-in` 用在 `.records-filter-menu` 上，而那段标记不在归档的 TSX 里。三个表格的动效全部是 CSS transition。
- **未找到**：tuffex 内任何相对时间格式化工具（`RelativeTimeFormat` / `dayjs` / `date-fns` 在 `packages/tuffex/packages/components/src` 下零命中）。`packages/utils` 有 dayjs 但 tuffex 不能当自己的依赖用（§3.7 R3）。
- **未找到**：`.trellis/spec/` 下与 tuffex 表格组件相关的规范文档（spec 目录只有 `frontend/` `guides/` `main-process/` 三个子目录，无组件库规范）。
- **未验证**：`TuffDemoWrapper` 的容器是否引入 `transform`（会破坏 records-table 的 sticky）。这需要在实现阶段实测，我只做了静态检索。
- **未验证**：把 `border-collapse` 从 `collapse` 切到 `separate` 对现有 `bordered` / `striped` 消费者的具体视觉回归幅度。需要实际渲染对比。
- **范围说明**：`12-records-table.tsx` 是精简版；`_global.css` 里另有 19 个类描述了带工具条/双汇总行/底部状态条的完整版（§3.3）。本报告按 TSX 的实际渲染范围分析，完整版规格已记录备查。
