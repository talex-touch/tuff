# Research: Beautiful UI → tuffex 融合分析（nav / cards 簇：10 / 14 / 15 / 16 / 18）

- **Query**: 分析 5 个 MIT 授权的 Beautiful UI React 组件如何移植进 tuffex Vue 3 组件库并与既有组件融合
- **Scope**: internal（BUI 源码 + tuffex 源码 + 截图基准），少量 external（`liveline` npm 元数据）
- **Date**: 2026-08-15
- **覆盖组件**: `10-context-cards` / `14-sidebar-nav` / `15-search` / `16-insight-cards` / `18-fine-tune-card`

---

## 0. 共享层：这 5 个组件消费的 token、keyframes、工具类

### 0.1 Token（`_design-tokens.json` + `_global.css`）

半径与缓动（Tailwind v4 `@theme` 层，`--spacing:.25rem`）：

| Token | 值 |
|---|---|
| `--radius-chip` | `6px` |
| `--radius-control` | `8px` |
| `--radius-card` | `10px` |
| `--ease-out-strong` | `cubic-bezier(.23,1,.32,1)` |
| `--ease-link` | `cubic-bezier(.16,1,.3,1)` |

阴影（明/暗两套，**暗色不是简单加深**）：

| Token | light | dark |
|---|---|---|
| `--shadow-hairline` | `0 0 0 1px var(--line)` | 同 |
| `--shadow-btn` | `0 0 0 1px var(--line-strong),0 1px 2px #1018280d` | `0 0 0 1px var(--line-strong),0 1px 2px #0000004d` |
| `--shadow-card` | `0 0 0 1px var(--line),0 1px 2px #1018280a,0 2px 6px #10182808` | `0 0 0 1px var(--line),0 1px 2px #0003,0 2px 6px #0003` |
| `--shadow-raised` | `0 0 0 1px var(--line),0 2px 10px #0000000b` | `0 0 0 1px var(--line),0 2px 10px #00000038` |
| `--shadow-overlay` | `0 0 0 1px var(--line),0 8px 28px #0001` | `0 0 0 1px var(--line-strong),0 8px 28px #00000057` ← 暗色改用 `line-strong` |

颜色（本簇实际用到的）：

| Token | light | dark |
|---|---|---|
| `--surface` | `#fff` | `#232427` |
| `--inset` | `#f7f8f9` | `#1f2022` |
| `--field` | `#f2f2f3` | `#2b2c2f` |
| `--hover` | `#f4f5f6` | `#2a2b2e` |
| `--ink` / `--ink-2` / `--ink-3` | `#1f2124` / `#62656b` / `#9a9da3` | `#f2f3f4` / `#a5a8ad` / `#6c6f75` |
| `--line` / `--line-strong` | `#ecedef` / `#e0e2e5` | `#2e3033` / `#3a3c40` |
| `--accent` / `--accent-ink` / `--accent-tint` | `#0285ff` / `#0170dd` / `#e9f3ff` | `#3d9aff` / `#7ec0ff` / `#3d9aff29` |
| `--green` / `--orange` / `--red` | `#189a4d` / `#ef720c` / `#e3474c` | `#3dbb72` / `#f68f3c` / `#ee5c61` |
| `--tooltip-bg` / `-fg` / `-muted` / `-border` | `#25272b` / `#f6f7f8` / `#a5a8ad` / `#3a3c40` | `#111214` / `#f2f3f4` / `#a5a8ad` / `#2e3033` |

### 0.2 Keyframes（本簇只用到 9 个中的 4 个）

```css
@keyframes fade-in{0%{opacity:0}to{opacity:1}}
@keyframes fade-up{0%{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pop-in{0%{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
@keyframes shimmer-text{0%{background-position:150%}to{background-position:-50%}}
```

未被本簇使用：`eq-bounce` / `stream-in` / `caret-blink` / `spin` / `pixel-on`（属于其他簇）。

### 0.3 自定义工具类（BUI 全站共享，非 Tailwind 内置）

```css
.primitive-card-bar,.primitive-card-footer,.primitive-table-cell{padding:10px 12px}
.primitive-card-pad{padding:12px}
.insight-chart-stage{touch-action:pan-y;overflow:hidden}
.insight-chart-cursor{z-index:4;background:var(--ink);opacity:.26;pointer-events:none;width:1px;position:absolute;top:0;bottom:0}
.insight-chart-tooltip-anchor{z-index:5;pointer-events:none;position:absolute;top:8px;transform:translate(-50%)}
.insight-chart-tooltip{border:1px solid var(--line-strong);min-width:154px;color:var(--tooltip-fg);background:var(--tooltip-bg);box-shadow:var(--shadow-overlay);border-radius:10px;padding:9px 10px;font-size:12px}
.insight-chart-tooltip-time{color:var(--tooltip-muted);margin-bottom:7px;font-size:11px;display:block}
.insight-chart-tooltip-row{justify-content:space-between;align-items:center;gap:16px;line-height:1.65;display:flex}
.insight-chart-tooltip-label{color:var(--tooltip-fg);align-items:center;gap:7px;display:inline-flex}
.insight-chart-tooltip-row strong{color:var(--tooltip-muted);font-variant-numeric:tabular-nums;font-weight:500}
.insight-chart-tooltip-dot{border-radius:50%;flex:0 0 8px;width:8px;height:8px}
```

`primitive-card-bar` / `primitive-card-pad` / `primitive-card-footer` 是 BUI 全站的卡片内边距三件套（10/12/10-12），本簇 `10` 与 `18` 都用到，跨簇也大量复用 → **应该在 tuffex 里落成共享 mixin 或 CSS 变量，而不是每个组件重写 padding 字面量**。

### 0.4 reduced-motion：BUI 用的是全局大锤，不是逐组件

```css
@media (prefers-reduced-motion:reduce){*,:after,:before{
  transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
```

另有一条窄规则只管 `.stream-caret` / `.stream-tail`（不属本簇）。

**这是本簇最重要的移植约束之一**：本簇 5 个组件源码里**没有任何一处**自己处理 reduced-motion，全靠这条 `*` 通配 `!important`。tuffex 不能照抄——PRD R3 明确「不得全局污染现有组件样式」。必须在每个移植组件的 `<style>` 里补 `@media (prefers-reduced-motion: reduce)` 块。

仓库里已有先例与守卫：
- 逐组件写法：`packages/tuffex/packages/components/src/sources/src/TxSources.vue:202-207`、`context-indicator/src/TxContextIndicator.vue:119-123`
- JS 侧：`thinking-orb/src/TxThinkingOrb.vue:77-87`（`watchReducedMotion()`，`matchMedia` + `change` 监听 + 卸载时 detach）
- 已有测试守卫：`skeleton/__tests__/skeleton-motion.test.ts:41-61` 会断言 CSS 里存在 `@media (prefers-reduced-motion: reduce)` 块——可作为新组件同类测试的模板

### 0.5 tuffex 侧可直接复用的既有资产

| 资产 | 路径 | 对本簇的用处 |
|---|---|---|
| `withInstall` 目录范式 | `src/<name>/{index.ts,src/Tx*.vue,src/types.ts,__tests__/}` | 见 `sources/index.ts`、`stat-card/index.ts` |
| `useAutoTheme` | `src/stream-markdown/src/use-auto-theme.ts:10` | 替代 BUI 的 `useDarkMode()`；已处理 `data-theme` 属性 + `.dark` class + `<body>` 双观察 |
| `TxFlatRadio` 指示器 | `src/flat-radio/src/TxFlatRadio.vue:125-142` | `offsetLeft/offsetWidth` + `translateX` + ResizeObserver，正是 sidebar-nav 悬浮框与 fine-tune 分段控件的同一手法 |
| `TxTabs` pointer | `src/tabs/src/TxTabs.vue:301-424` | 更完整的指示器方案（含 `layoutResizeObserver`、`indicatorRevealed` 首帧不动画） |
| canvas 生命周期先例 | `src/thinking-orb/src/TxThinkingOrb.vue:100-181` | DPR ≤2、`getContext('2d')` 为 null 时静默跳过（jsdom）、IntersectionObserver + `visibilitychange` 暂停、reduced-motion 只画一帧 |
| `AiAttachmentFile` | `src/ai-elements/src/types.ts:52-58` | `{kind,id,name,size?,mime?}`，`mime` 可驱动 context-cards 的 PDF/CSV 角标 |
| `TxKbd` | `src/kbd/src/types.ts` | `{size?:'sm'|'md', tone?}`，sidebar-nav 的 `/` 提示键 |

---

## 1. `10-context-cards` → RAG 检索块卡片

### 1.1 职责与完整清单

**职责**：展示 RAG 检索回来的知识块（chunk），每块含标题、字符数、正文片段、来源文件 chip。

**Props/变体**：**零 props**。数据是模块级常量 `CHUNKS`（2 条，字段 `title/chars/body/source/badge/tone`）。唯一状态是 `chipsShown: boolean`，`useEffect` 里 `setTimeout(...,700)` 置 true，卸载 `clearTimeout`。

**DOM 结构**（`10-context-cards.tsx:37-89`）：

```
div.flex.w-full.max-w-95.flex-col.gap-2            ← max-w-95 = 380px
├─ div (header) .flex.items-center.gap-2.px-0.5    ← animation: fade-in 400ms ease-out both
│  ├─ span "All chunks"  text-[13px] font-semibold text-ink
│  └─ span (count chip)  h-5 rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline tabular-nums
└─ div×N (chunk card) .overflow-hidden.rounded-card.bg-surface.shadow-card
   │                                               ← animation: fade-up 400ms cubic-bezier(0.23,1,0.32,1) {i*100}ms both
   ├─ div.primitive-card-bar.flex.items-center.gap-2.5.border-b.border-line   ← padding 10px 12px
   │  ├─ svg 11×11 汉堡图标 strokeWidth 2.5 + span.truncate  text-[13px] font-medium text-ink
   │  └─ span "290 characters"  ml-auto shrink-0 text-[12px] text-ink-3 tabular-nums
   ├─ p  px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink-2
   └─ div.px-3.pb-3 > span (source chip)
      h-6 rounded-full bg-inset px-2 text-[12px] font-medium text-ink-2 shadow-btn hover:bg-hover
      ├─ span (badge) size-3.5 rounded-[4px] bg-red|bg-green text-[7px] font-bold text-white
      ├─ 文件名
      └─ svg 9×9 外链箭头 strokeWidth 2.5
```

**动效清单**：

| 元素 | 动效 | 精确参数 |
|---|---|---|
| header | `fade-in` | `400ms ease-out both` |
| chunk 卡片 | `fade-up` | `400ms cubic-bezier(0.23,1,0.32,1)`，delay `i*100ms`，`both` |
| source chip | transition（非 keyframe） | `transition-[opacity,transform,background-color] duration-300`，timing `cubic-bezier(0.23, 1, 0.32, 1)`，delay `i*80ms`；opacity `0→1`，transform `scale(0.95)→scale(1)`，由 `chipsShown` 在 **700ms** 后翻转触发 |

即：卡片入场（0/100ms）与 chip 浮现（700ms+0/80ms）是**两段独立编排**，chip 刻意迟到 ~300ms，读起来像「块先到、来源后解析出来」。

**消费 token**：`--ink` `--ink-2` `--ink-3` `--inset` `--surface` `--line` `--red` `--green` `--shadow-hairline` `--shadow-card` `--shadow-btn` `--radius-card`。

**reduced-motion**：无自处理，仅靠 §0.4 全局大锤。

### 1.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxSources` (`sources/src/TxSources.vue`) | 「一组来源引用」的概念 | TxSources 是**可折叠 disclosure**（"Used N sources" + chevron + `grid-template-rows 0fr→1fr` 展开），条目是 `序号 + favicon + 标题 + 域名` 的**单行链接**；BUI 是**常驻展开的多块卡片**，每块有正文段落、字符数、文件类型角标。信息形状不同（URL 引用 vs 检索文本块）。`AiSourceItem = {id,url,title?,favicon?}` 缺 `chars`/`body`/`badge` 三个字段 |
| `TxContextIndicator` | 只有名字里的 "context" | 实为 token 用量环形 meter（`role="meter"`，"12.3K / 200K"），与 RAG chunk 无关 |
| `TxAttachmentTray` | 文件 chip 的视觉 | tray 是附件上传/预览（含 progress、remove、图片 lightbox），BUI chip 是只读来源指针 |
| `TxCard` | 卡片外壳 | TxCard 的语言是 glass/refraction/blur（`background: 'pure'|'mask'|'blur'|'glass'|'refraction'`、`inertial`、`refractionLightFollowMouse`），与 BUI 的「发丝线 + 10px 圆角 + 极轻阴影」是两种设计语言；硬套会打架 |

**结论：无实质重叠，是新组件。**

### 1.3 融合建议

**(a) 新组件 `TxContextCards` + `TxContextChunk`**（推荐）

理由：
1. 数据形状是新的（chunk 有正文与字符数），塞进 `AiSourceItem` 会污染 ai-elements 的 parts 契约。
2. TxSources 的折叠语义是它的核心（"Used N sources" 是收起态的全部内容），加一个 "always expanded + body text" 变体等于把两个组件缝在一起。
3. 拆成父/子两个组件，让宿主可以只用 `TxContextChunk` 单块（RAG 调试面板常见需求）。

备选：
- **(b) TxSources 加 `variant="chunks"`**：会让 `sources` prop 的类型分叉（`AiSourceItem[] | ContextChunk[]`），破坏现有 API 的类型收敛。不推荐。
- **(c) 用 TxCard + TxTag 组合复刻**：可行但每个使用方都要重抄 `fade-up` stagger 与 chip 延迟编排；BUI 的价值恰恰在这段编排里。不推荐。

### 1.4 Vue Port API 草图

```ts
// src/context-cards/src/types.ts
export interface ContextChunk {
  id: string
  title: string
  body: string
  /** 已格式化的字符数文案，如 '290 characters'；数字格式化留给宿主（无 i18n 系统） */
  chars?: string
  source?: ContextChunkSource
}

export interface ContextChunkSource {
  /** 显示名，如 'Dairy Onboarding SOP.pdf' */
  name: string
  /** 角标短文本，如 'PDF' / 'CSV'；未给时可由 name 后缀推导 */
  badge?: string
  /** 角标底色语义。BUI 原样是 bg-red / bg-green */
  tone?: 'red' | 'green' | 'orange' | 'accent' | 'neutral'
  href?: string
}

export interface ContextCardsProps {
  chunks: ContextChunk[]
  /** 头部标题文案。@default 'All chunks' */
  title?: string
  /** 头部计数胶囊；未给时不渲染（BUI 里是 32，与 chunks.length 无关——是"全库总数"） */
  total?: number | string
  /** 卡片入场 stagger 步长（ms）。@default 100 */
  staggerStep?: number
  /** source chip 浮现延迟（ms）。@default 700 */
  chipDelay?: number
  /** chip 之间的额外错峰（ms）。@default 80 */
  chipStaggerStep?: number
  /** 关掉入场编排，直接终态（文档站/测试用） */
  disableEnter?: boolean
}

export interface ContextCardsEmits {
  /** 点击来源 chip。是否打开由宿主决定（对齐 TxSources 的 open 语义） */
  (e: 'open-source', payload: { chunk: ContextChunk, source: ContextChunkSource }): void
}
```

Slots：`header`（整块头部）、`chunk-title`（scoped: `{ chunk }`）、`chunk-body`、`source`（scoped: `{ chunk, source }`）。
Exposed：不需要（无命令式操作）。
受控状态：无——`chipsShown` 是纯展示时序，不该暴露为 v-model。

### 1.5 移植风险

1. **`total` 与 `chunks.length` 不是一回事**：BUI 头部写死 32 而只渲染 2 块。若把 `total` 实现成 `chunks.length` 会改变语义（"全库 32 块，这里显示 2 块"）。必须做成独立 prop。
2. **入场动画在 Vue 里的重放**：React 靠首次挂载执行一次 `animation ... both`。Vue 若在 `v-for` 上用 `:style="{ animationDelay }"`，列表更新（新增 chunk）会给**已存在**的元素重放动画。需要 `:key` 稳定 + 只给新元素加 class，或走 `TxStagger`（`src/stagger/src/types.ts`，有 `delayStep`/`delayBase`/`appear`）。
3. **`setTimeout` 泄漏**：`chipDelay` 定时器必须在 `onBeforeUnmount` 清掉；BUI 的 cleanup 已经这么做了，移植时容易漏。
4. **reduced-motion**：700ms 的 chip 延迟在 reduced-motion 下如果只是把 `transition-duration` 压到 0.01ms，chip 仍然会**空白等 700ms** 才出现——因为延迟是 `transition-delay` 不是 duration。需要在 reduced-motion 分支里同时把 delay 归零，否则是可访问性回归。BUI 的全局大锤同样没管 delay，这是它的既有缺陷，不要照抄。

---

## 2. `14-sidebar-nav` → 工作区侧边导航

### 2.1 职责与完整清单

**职责**：工作区级垂直导航——组织切换器 + 快捷搜索 + 主操作按钮 + 分组条目（含计数徽标）。

**Props/变体**：**零 props**。常量 `ITEMS`（5 条：`{key,label,section}` + 可选 `count:true` / `plus:true`），`sections = ["Workspace","Objects"]`。

**状态**：`active`（默认 `"tasks"`）、`hovered`、`box:{top,height}|null`、`query`、`badge`（初值 4）。

**DOM 结构**（`14-sidebar-nav.tsx:56-190`）：

```
div.w-60.rounded-card.bg-surface.p-2.shadow-raised          ← 240px 宽
├─ button (workspace row)  mb-2 gap-2.5 rounded-control p-1.5
│  │                        transition-[background-color,transform] duration-100 hover:bg-hover active:scale-[0.96]
│  ├─ span (avatar) size-8 rounded-[8px] bg-ink text-[13px] font-semibold text-surface   ← 反色：墨底纸字
│  ├─ span 名称 text-[13px] font-medium leading-tight text-ink
│  │   + 副标题 text-[11px] leading-tight text-ink-3
│  └─ svg 12×12 上下 chevron，stroke="var(--ink-3)"
├─ label (quick search)  mb-1 h-8 gap-2 rounded-control bg-inset px-2.5 shadow-hairline
│  ├─ svg 12×12 放大镜 stroke="var(--ink-3)"
│  ├─ input  text-[12.5px] text-ink placeholder:text-ink-3  bg-transparent outline-none
│  └─ kbd  size-4.5 rounded-[5px] bg-surface text-[10px] text-ink-3 shadow-hairline  → "/"
├─ button (New task)  mb-2 rounded-control px-2 py-1.5 text-[13px] font-medium text-accent
│  │                   hover:bg-accent-tint active:scale-[0.96] duration-100
│  └─ span size-4 rounded-full bg-accent text-white > svg 9×9 加号 strokeWidth 3
└─ div[ref=navRef].relative.flex.flex-col.gap-2   (onMouseLeave → hovered=null)
   ├─ span (悬浮框) pointer-events-none absolute inset-x-0 rounded-[7px] bg-hover
   └─ 每个 section:
      ├─ div (组头) px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3
      └─ div.flex.flex-col.gap-px > button×N
         group relative z-10 gap-2 rounded-[7px] px-2 py-1.5
         transition-[color,transform] duration-150 active:scale-[0.96]
         ├─ Icon svg 13×13 strokeWidth 1.8  （active→text-ink，否则 text-ink-3）
         ├─ label truncate text-[13px] transition-colors duration-150
         │    active → font-medium text-ink ；否则 text-ink-2
         ├─ [count] h-4.5 min-w-4.5 rounded-full px-1 text-[10.5px] font-semibold tabular-nums
         │    active → bg-surface text-ink-2 shadow-hairline
         │    否则   → bg-accent-tint text-accent-ink
         └─ [plus]  size-4.5 rounded-[5px] text-ink-3 opacity-0
              group-hover:opacity-100 hover:bg-line/70 hover:text-ink-2 duration-100
              active 时强制 opacity:1
```

**悬浮/选中框的测量逻辑**（`14-sidebar-nav.tsx:43-54`，这是本组件的核心）：

```tsx
useLayoutEffect(() => {
  const container = navRef.current
  const target = itemRefs.current[hovered ?? active]     // hover 优先于 active
  if (!container || !target) return
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  setBox({ top: targetRect.top - containerRect.top, height: targetRect.height })
}, [hovered, active])
```

框的过渡：`top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease`，`opacity: box ? 1 : 0`。

**动效清单**：

| 元素 | 动效 | 精确参数 |
|---|---|---|
| 悬浮框 | top/height 过渡 | `220ms cubic-bezier(0.23,1,0.32,1)`；opacity `150ms ease` |
| workspace row / New task | 背景+按压 | `duration-100`，`active:scale-[0.96]` |
| 条目 | 颜色+按压 | `duration-150`，`active:scale-[0.96]` |
| 计数徽标 | `pop-in` | `250ms cubic-bezier(0.23,1,0.32,1) both`，**靠 React `key={badge}` 强制重挂载来重放** |
| plus 图标 | 淡入 | `duration-100`，`group-hover:opacity-100` |

**a11y**：`aria-current="page"` 标记 active 条目；`onFocus`/`onBlur` 也驱动 `hovered`，所以键盘 Tab 会带动悬浮框。

**消费 token**：`--surface` `--inset` `--hover` `--ink` `--ink-2` `--ink-3` `--line` `--accent` `--accent-tint` `--accent-ink` `--shadow-raised` `--shadow-hairline` `--radius-card` `--radius-control`。

### 2.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxNavBar` (`nav-bar/src/TxNavBar.vue`) | **仅名字** | TxNavBar 是移动端**顶部横向 app bar**：`--tx-nav-bar-height: 44px`，`grid-template-columns: minmax(56px,1fr) minmax(0,2fr) minmax(56px,1fr)` 的左/中/右三分栏，含 `safe-area-inset-top`、`position: sticky`、`backdrop-filter: blur(18px)`。props 是 `title/fixed/safeAreaTop/showBack/backLabel/...`。与垂直工作区侧栏**零结构重叠** |
| `TxTabBar` | 概念 | 底部标签栏，`TabBarItem = {value,label,iconClass?,badge?,disabled?}`——item 形状确实接近（有 badge），但布局是横向等分固定底栏 |
| `TxFlatRadio` | 移动指示器**技法** | `TxFlatRadio.vue:125-142` 用 `offsetLeft/offsetWidth` + `translateX` + ResizeObserver 驱动指示器——与 BUI 的 `getBoundingClientRect` 差值同构。但 FlatRadio 是**横向单组单选**，无分组、无徽标、无 hover 优先于 active 的双态 |
| `TxTabs` | 指示器**技法**（更完善） | `TxTabs.vue:301-424` 有 `layoutResizeObserver`、`indicatorRevealed`（首帧不动画）——移植时值得抄这两个细节 |

**结论：无实质重叠，是新组件。** 名字上要小心：`TxNavBar` 已被占用，新组件不能叫这个。

### 2.3 融合建议

**(a) 新组件 `TxSidebarNav`**（推荐）

理由：
1. tuffex 当前**没有任何垂直导航组件**（`grep -li sidebar` 只命中 `layout-skeleton` 的骨架占位和 `gradual-blur` 的方位枚举）。这是真空，不是重复造轮子。
2. TxNavBar 名字虽近但语义完全不同，加变体会让一个组件同时是「顶栏」和「侧栏」——API 会立刻分裂成两套互斥 props。
3. 组头 + 条目 + 徽标 + 悬浮框是一个内聚整体，拆成组合会把测量逻辑推给使用方。

备选：
- **(b) TxTabBar 加 `vertical` 变体**：TabBarItem 形状接近，但 TabBar 的 `fixed`/`safeAreaBottom`/`zIndex` 是移动端底栏专属，垂直化后全是死 prop。不推荐。
- **(c) TxFlatRadio + TxKbd + TxSearchInput 组合**：悬浮框的容器相对测量必须由使用方实现，且 FlatRadio 不支持分组。不推荐。

**内部复用**：搜索行可以内嵌 `TxKbd`（`{size:'sm'|'md'}`）渲染 `/` 提示键。

### 2.4 Vue Port API 草图

```ts
// src/sidebar-nav/src/types.ts
export type SidebarNavValue = string | number

export interface SidebarNavItem {
  value: SidebarNavValue
  label: string
  /** 分组名；与 groups 里的 key 对应 */
  group?: string
  icon?: TxIconSource | string
  /** 徽标。变化时重放 pop-in */
  badge?: string | number
  /** 行尾的次级动作（BUI 的 plus），hover/active 时才显形 */
  action?: { icon?: TxIconSource | string, label: string }
  disabled?: boolean
}

export interface SidebarNavGroup {
  key: string
  /** 组头文案；BUI 视觉是 uppercase + tracking-[0.08em]，大写由 CSS 做，不改文案 */
  label: string
}

export interface SidebarNavWorkspace {
  name: string
  description?: string
  /** 单字母/短码，渲染成反色方块 */
  initials?: string
  avatar?: string
}

export interface SidebarNavProps {
  modelValue?: SidebarNavValue
  items: SidebarNavItem[]
  groups?: SidebarNavGroup[]
  workspace?: SidebarNavWorkspace
  /** 快捷搜索输入值，配 v-model:query；不传即不受控 */
  query?: string
  /** 不传则不渲染搜索行 */
  searchPlaceholder?: string
  /** 搜索行尾的快捷键提示，如 '/'；不传不渲染 */
  searchHint?: string
  /** 主操作按钮文案；不传不渲染 */
  actionLabel?: string
  /** 悬浮框过渡时长（ms）。@default 220 */
  indicatorDuration?: number
  /** 工作区切换按钮的可访问名。@default 'Switch workspace' */
  workspaceLabel?: string
}

export interface SidebarNavEmits {
  (e: 'update:modelValue', value: SidebarNavValue): void
  (e: 'update:query', value: string): void
  (e: 'select', item: SidebarNavItem): void
  (e: 'action'): void                                    // New task
  (e: 'item-action', item: SidebarNavItem): void         // 行尾 plus
  (e: 'workspace-click'): void
}
```

Slots：`workspace`、`search`、`action`、`group-label`（scoped `{ group }`）、`item`（scoped `{ item, active }`）、`item-trailing`（scoped `{ item, active }`）、`footer`。
Exposed：`focusSearch()`、`refreshIndicator()`（供宿主在容器尺寸外部变化后手动重算）。
受控：`modelValue`（选中项）、`query`（搜索文本）双 v-model。

### 2.5 移植风险

1. **`useLayoutEffect` → Vue 没有同步等价物**。`watch` + `nextTick` 是**微任务后**，`onUpdated` 是渲染后——都可能让悬浮框有一帧错位。可行做法：`watch(..., { flush: 'post' })` + 首帧 `opacity:0`（照抄 TxTabs 的 `indicatorRevealed`，`TxTabs.vue:422-424`）。
2. **BUI 只在 `[hovered, active]` 变化时测量**，没有 ResizeObserver。容器宽度变化、字体加载完成、条目增删都会让框错位。移植时必须补 ResizeObserver（`TxFlatRadio.vue` 与 `TxTabs.vue` 都有现成写法），这是修 bug 不是加特性。
3. **`key={badge}` 重放动画在 Vue 里的等价物**：`:key="badge"` 同样有效（强制重建 VNode），但会连带丢失该节点上的过渡/焦点。更稳的做法是 `watch(badge)` 时切一个 class 并在 `animationend` 移除。
4. **快捷搜索是死的**：`query` state 存在但**从不参与 `ITEMS.filter`**，`/` 键也**没有任何 keydown 绑定**——纯装饰。移植时必须明确：要么如实照搬（纯展示，文档写清楚），要么真的接上过滤 + `/` 聚焦。不要默认「它本来就能用」。
5. **`hovered ?? active` 的优先级**：鼠标移入任意条目，框立刻离开当前选中项。这是刻意的设计（框是"指针"不是"选中态"），选中态另由 `font-medium text-ink` + 徽标反色表达。移植时若把框做成纯 active 指示器，视觉会对但交互会错。
6. **`bg-ink` 头像在暗色下是反的**：light 下墨底白字，dark 下 `--ink:#f2f3f4` 变成**浅底深字**（`text-surface` = `#232427`）。这是 token 自动完成的反转，不要硬编码颜色。

---

## 3. `15-search` → 内联命令搜索

### 3.1 职责与完整清单

**职责**：内联搜索面板——输入框 + 清除按钮 + 实时过滤结果列表 + 空态。

**Props/变体**：**零 props**。常量 `ITEMS`（7 条字符串）。状态只有 `query`。

**过滤逻辑**（`15-search.tsx:22-25`，逐字）：

```tsx
const results = query
  ? ITEMS.filter((i) => i.toLowerCase().includes(query.toLowerCase()))
  : ITEMS.slice(0, 5);
const empty = query.length > 2 && results.length === 0;
```

两处值得注意：空查询时只显示前 **5** 条（不是全部 7 条）；空态门槛是 `query.length > 2`，所以输入 1–2 个无匹配字符时，列表区域是**完全空白**（既非结果也非空态）。

**DOM 结构**（`15-search.tsx:27-88`）：

```
div.flex.min-h-[248px].w-full.max-w-72.flex-col.items-stretch     ← 288px 宽，248px 最小高（防跳动）
└─ div.w-full.self-start.overflow-hidden.rounded-card.bg-surface.shadow-raised
   ├─ div (输入行) flex h-10 items-center gap-2 border-b border-line px-3
   │  │              transition-colors duration-100 hover:bg-hover
   │  ├─ svg 14×14 放大镜 stroke="var(--ink-3)" strokeWidth 2 shrink-0
   │  ├─ input  text-[13px] text-ink placeholder:text-ink-3  aria-label="Search flavors"
   │  └─ [query 非空] button (清除)  size-5.5 rounded-full text-ink-3
   │        hover:bg-line/70 hover:text-ink  duration-100
   │        animation: fade-in 150ms ease-out both ；aria-label="Clear search"
   │        svg 11×11 strokeWidth 2.2
   └─ 二选一：
      ├─ [empty] div  flex-col items-center gap-1 px-4 py-8
      │     animation: fade-in 250ms ease-out both
      │     ├─ span (图标框) size-8 rounded-control bg-inset text-ink-3 shadow-hairline
      │     │      svg 15×15 strokeWidth 1.8
      │     ├─ span "No results found"  text-[13px] font-medium text-ink
      │     └─ span "Adjust your search to try again"  text-[12px] text-ink-3
      └─ [否则] div.p-1 > button×N
            h-8 w-full rounded-[6px] px-2 text-left text-[13px] text-ink
            hover:bg-hover duration-100
            animation: fade-in 200ms ease-out both
            onClick → setQuery(item)     ← 把结果**回填输入框**，不是导航
```

**动效清单**：清除按钮 `fade-in 150ms ease-out both`；空态 `fade-in 250ms ease-out both`；结果行 `fade-in 200ms ease-out both`（**无 stagger**，全部同时）。

**a11y 现状（重要）**：**完全没有键盘导航**——无 ArrowUp/Down、无 Enter、无 activeIndex、无 `role="listbox"`/`role="option"`/`aria-activedescendant`。只有 `input` 的 `aria-label` 和清除按钮的 `aria-label`。纯鼠标组件。

**消费 token**：`--surface` `--inset` `--hover` `--line` `--ink` `--ink-3` `--shadow-raised` `--shadow-hairline` `--radius-card` `--radius-control`。

### 3.2 重叠判定（本簇重叠度最高的一个）

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxCommandPalette` (`command-palette/src/TxCommandPalette.vue`) | 过滤 + 空态 + 结果列表 | **架构完全不同**：TxCommandPalette 是 `<Teleport to="body">` + 全屏遮罩（`position:fixed; inset:0; background:rgba(15,23,42,.35)`）+ `role="dialog" aria-modal="true"` + 焦点陷阱（`trapFocus`, `:290-306`）+ z-index 分配器（`useZIndexAllocator`）。功能**远超** BUI：ArrowUp/Down 跳过 disabled 项（`moveActive`, `:79-93`）、Enter 选中、Escape 关闭、`aria-activedescendant`、`<mark>` 命中高亮（`getHighlightedParts`, `:197-253`）。BUI 是**内联面板**，无遮罩、无模态、无键盘 |
| `TxSearchInput` (`search-input/src/TxSearchInput.vue`) | **输入行**基本一致 | 包装 `TxInput`，`#prefix` 槽放放大镜 SVG，`clearable` 由 TxInput 提供，额外有 `remote` + `searchDebounce`（200ms）防抖与 Enter→`search` 事件。BUI 输入行无防抖（每次 keystroke 直接过滤） |
| `TxSearchEmpty` (`search-empty/src/TxSearchEmpty.vue`) | **空态**基本一致 | 只是 `TxEmptyState variant="search-empty"` 的 4 行薄包装，支持 `title/description/icon/primaryAction/...`。BUI 空态是「圆角方框图标 + 标题 + 副标题」，正好落在 EmptyState 的 vertical/center 版式里 |

**结论：这是本簇唯一「组合现有原语」真正划算的一个。**

### 3.3 融合建议

**(c) 组合：新建薄壳 `TxSearchPanel`，内部组合 `TxSearchInput` + `TxSearchEmpty`**（推荐）

理由：
1. 输入行与空态在 tuffex 里已经是成熟组件，重写等于制造第三套搜索输入。
2. 不能做成 `TxCommandPalette` 的 `inline` 变体：Palette 的 Teleport / 遮罩 / `aria-modal` / 焦点陷阱 / z-index 分配是**一体的模态契约**，加个 `inline` 就要在这五处全部分支，等于在一个组件里塞两个组件——且违反 PRD「不破坏现有组件的公开 API」。
3. 薄壳只负责三件事：BUI 皮肤的卡片外壳（`rounded-card` + `shadow-raised` + `border-b border-line` 分隔）、结果列表渲染、过滤策略。

**明确的取舍点**：BUI 版本**没有键盘导航**。建议移植时**补上** ArrowUp/Down/Enter + `role="listbox"`/`option` + `aria-activedescendant`——直接复用 `TxCommandPalette.vue:72-93`（`firstEnabledIndex` / `moveActive`）的成熟实现。这不改变任何像素，只补可访问性；把「BUI 没做」当成规范来抄会给 tuffex 引入一个键盘不可用的组件。

备选：
- **(a) 全新独立 `TxSearchPanel`（不复用 SearchInput/SearchEmpty）**：像素还原最自由，但会有三套搜索输入的维护成本。次选。
- **(b) TxCommandPalette 加 `inline` 变体**：见上，不推荐。

### 3.4 Vue Port API 草图

```ts
// src/search-panel/src/types.ts
export interface SearchPanelItem {
  id: string
  label: string
  /** 参与匹配的额外词；默认只匹配 label */
  keywords?: string[]
  disabled?: boolean
}

export interface SearchPanelProps {
  /** 搜索文本，v-model */
  modelValue?: string
  items: SearchPanelItem[]
  /** @default 'Search' */
  placeholder?: string
  /** 输入框可访问名；不传则回落到 placeholder */
  ariaLabel?: string
  /** 空查询时展示的条数；0 表示全部。@default 5 —— 对齐 BUI 的 slice(0,5) */
  idleCount?: number
  /** 触发空态的最小查询长度。@default 3 —— 对齐 BUI 的 query.length > 2 */
  emptyThreshold?: number
  /** 空态文案 */
  emptyTitle?: string          // @default 'No results found'
  emptyDescription?: string    // @default 'Adjust your search to try again'
  /** 关掉内置过滤，由宿主给 items（远程搜索场景） */
  remote?: boolean
  /** remote 时的防抖（ms）。@default 200，对齐 TxSearchInput */
  searchDebounce?: number
  /** 面板最小高度，防列表长度变化时抖动。@default 248 */
  minHeight?: number
  /** 清除按钮可访问名。@default 'Clear search' */
  clearLabel?: string
}

export interface SearchPanelEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'select', item: SearchPanelItem): void
  (e: 'search', query: string): void   // remote 模式
  (e: 'clear'): void
}
```

Slots：`item`（scoped `{ item, active, query }`）、`empty`（scoped `{ query }`）、`footer`。
Exposed：`focus()` / `blur()` / `clear()`（对齐 `TxSearchInput.vue:68-78` 的 expose 面）。
受控：`modelValue` 是查询文本（BUI 里点结果会**回填**输入框——移植时这应是 `select` 的默认行为还是宿主决定，需在文档里写死；建议默认**不**回填，emit `select` 交给宿主，因为回填对"命令执行"语义是错的）。

### 3.5 移植风险

1. **`select` 后回填 vs 不回填**：BUI 的 `onClick={() => setQuery(item)}` 只是 demo 手法（让面板自洽可玩）。若原样移植进组件库，等于强制回填，宿主想导航就得对抗组件。建议：默认 emit `select`，回填交给宿主写 `v-model` 赋值。此点必须在文档里明说，否则和截图行为对不上。
2. **1–2 字符无匹配的空白区**：`emptyThreshold=3` 会保留这个"既没结果也没空态"的窗口。这是 BUI 的原样行为（避免打字过程中空态闪烁），但要在 `minHeight` 撑住的前提下才不难看。
3. **键盘导航与 IME**：补键盘导航时必须处理中文输入法——`TxCommandPalette.vue:264` 已有 `e.isComposing || e.keyCode === 229 || composing.value` 的三重判定，直接抄，不要自己写。
4. **`hover:bg-line/70` 的 alpha 语法**：Tailwind 的 `/70` 在 CSS 里要写成 `color-mix(in srgb, var(--line) 70%, transparent)`；tuffex 已大量使用 `color-mix`（如 `TxNavBar.vue:122`），保持一致。

---

## 4. `16-insight-cards` → 分页洞察卡（含 canvas 图表）

### 4.1 职责与完整清单

**职责**：`Insights N ‹ ›` 分页器，每页 = 一段带 @实体提及的散文 + 一张洞察卡 + 一个追问 pill。三种卡片形态各不相同。

**外部依赖**：`import { Liveline, type LivelinePoint, type LivelineSeries } from "liveline"`

`liveline` npm 元数据（已核实）：
- `version = 0.0.7`，`license = MIT`
- `description = 'Real-time animated charts for React — line, candlestick, and multi-series modes'`
- `peerDependencies = { react: '>=18' }` ← **React 专属，Vue 不可用**
- `keywords` 含 `canvas`，`homepage = https://github.com/benjitaylor/liveline`

**通用工具**（`16-insight-cards.tsx:12-76`）：

```tsx
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";                 // = --ease-link
const formatPercent = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const formatMoney   = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
const SNAPSHOT_END  = Math.floor(Date.now() / 1000);          // 模块级，一次求值
function makePoints(values, gap = 6) {
  return values.map((value, index) => ({ time: SNAPSHOT_END - (values.length - 1 - index) * gap, value }));
}
```

`useDarkMode()`：`MutationObserver` 观察 `document.documentElement`，`attributeFilter: ["class"]`，读 `classList.contains("dark")`。

`Entity`：`inline-flex items-center gap-1 align-baseline font-medium text-ink` + `size-2.5 rounded-full {tone}` 圆点 + `@name`。
`Mono`：`<code className="font-mono text-[11.5px] text-red|text-green">`。

**图表 scrub 机制**（这是「canvas chart internals」的实质——**BUI 自己不画图，它在 canvas 之上叠 DOM**）：

```tsx
function chartIndexFromPointer(event, pointCount) {
  const rect = event.currentTarget.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return Math.round(progress * (pointCount - 1));
}
```

绑定在 `.insight-chart-stage` 上：`onPointerDown` 与 `onPointerMove` **都**设 `hoverIndex`；`onPointerLeave` / `onPointerCancel` / `onPointerUp` 置 null。含义：桌面端**悬停即 scrub**（不需按下），触屏端抬手即清。

游标与 tooltip 定位：
- 游标 `left: ${(hoverIndex / (len - 1)) * 100}%`（`.insight-chart-cursor`：1px 宽、`background:var(--ink)`、`opacity:.26`）
- tooltip 锚点 `left: ${Math.min(Math.max(pct, 28), 72)}%` ← **夹在 28%–72%**，防止贴边溢出
- tooltip 时间行写死 `"Today, 12:00"`

**Liveline 传参**（tuffex 自研图表需要还原的语义）：

| 卡片 | 关键 props |
|---|---|
| CompareCard | `data={[]}` `value={0}` `series={[mint, pistachio]}` `theme` `grid={false}` `pulse={false}` `window={42}` `paused` `scrub={false}` `cursor="default"` `lineWidth={2.25}` `padding={{top:24,right:0,bottom:22,left:0}}` `formatValue={formatPercent}` |
| AnomalyCard | `data={points}` `value` `color="#ee5c61"` `grid` `scrub={false}` `fill={false}` `pulse={false}` `momentum={false}` `paused` `window={49}` `lineWidth={2.25}` `cursor="crosshair"` `padding={{top:18,right:0,bottom:22,left:0}}` |

注意 `scrub={false}` + `paused`：Liveline 自带的 scrub 与动画都**关掉了**，scrub 完全由外层 DOM 实现。这大幅降低自研图表的门槛——只需要「静态多序列折线 + 可选网格 + padding」。

三张卡片：

**① CompareCard**（`:79-185`）——双序列对比
- 外壳 `min-h-[278px] rounded-card bg-surface p-3 shadow-hairline`
- 数据：mint 8 点 `[-2.9,-3.4,-3.05,-3.86,-3.52,-4.1,-3.82,-4.41]` 色 `#f68f3c`；pistachio 8 点 `[0.22,0.58,0.42,0.91,0.76,1.08,0.96,1.15]` 色 `#3d9aff`
- **两个颜色都是暗色主题的 token 字面量**（`--orange` dark / `--accent` dark），硬编码而非 `var()`——明色下线条偏亮，是源码的既有不一致
- 图例：圆点 `size-2` + 名称 `text-[11.5px] text-ink-2`；大数 `text-[17px] font-semibold tracking-[-0.01em] tabular-nums`（红/绿）；子行 `Mono`
- 图表框 `mt-2 overflow-hidden rounded-control bg-inset shadow-hairline`；头 `border-b border-line px-2.5 py-1.5`（左 "Trend snapshot" `text-[11px] text-ink-3 tabular-nums`，右 `rounded-full bg-field px-2 py-0.5 text-[10.5px]` 的 "Snapshot" 胶囊）；舞台 `h-[166px]`

**② AnomalyCard**（`:188-284`）——单序列 + 指标切换
- 数据：spend `[274,289,264,307,331,1210,1718,2112]`，usage `[18,19,17,21,22,58,81,96]`，`gap=7`
- 头部左侧红色上箭头 svg 12×12 `stroke="var(--red)"` + "High freezer spend"
- 图表头左侧文案随 `hoverIndex` 变：悬停时显示该点值，否则显示 `"$2,112 threshold"`
- 指标切换：`flex rounded-full bg-field p-0.5`，按钮 `rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.96]`，选中 `bg-surface text-ink shadow-btn`，`aria-pressed`
- 底部 `text-[17px] font-semibold tracking-[-0.01em] text-ink tabular-nums` + `Mono tone="red"` + `text-[11px] text-ink-3`

**③ AllocationCard**（`:287-362`）——**无 canvas，纯 DOM**
- 段：VAN 72.5% `$51,785` / CHOC 22.8% `$16,278` / MINT 4.7% `$3,357`
- 大数 `text-[20px] font-semibold tracking-[-0.01em] text-ink tabular-nums`
- 分段条 `mt-3 flex h-9 gap-0.5 overflow-hidden rounded-full bg-field p-0.5`，`role="group" aria-label="Allocation segments"`
- 段按钮：`width: ${pct}%`；`opacity: selected ? 1 : 0.58`；`boxShadow: selected ? 'inset 0 0 0 1px rgba(255,255,255,0.22)' : undefined`；`transition-[opacity,transform,box-shadow] duration-300` timing `EASE`；`active:scale-[0.98]`；`aria-pressed` + `aria-label="${label}: ${pct}%"`
- 段内高光：`absolute inset-y-1 left-1 rounded-full bg-white/20 transition-[width,opacity] duration-500`，`width: selected ? 'calc(100% - 8px)' : '0%'`，timing `EASE`
- 图例 chip `rounded-full px-1.5 py-0.5 text-[11px] transition-[background-color,color,transform] duration-150 active:scale-[0.96]`
- 说明面板 `mt-3 min-h-16 rounded-control bg-inset px-2.5 py-2 shadow-hairline`

**分页外壳**（`:400-453`）
- 根 `min-h-[408px] w-full max-w-86`（344px）
- 头：`"Insights"` `text-[13px] font-semibold text-ink` + 计数 `text-[13px] text-ink-3 tabular-nums`
- 翻页按钮 `size-6 rounded-[6px] text-ink-3 transition-[background-color,color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]`，svg 13×13 strokeWidth 2.2，`aria-label` 为 `"Previous insight"` / `"Next insight"`
- `move()` 用模运算环绕：`(current + direction + PAGES.length) % PAGES.length`
- 追问 pill `mt-2 rounded-full bg-surface px-3 py-1.5 text-left text-[12px] text-ink shadow-btn transition-colors duration-100 hover:bg-hover`

**两处「文档说了但没实现」（移植时不要照抄注释）**：
1. 顶部注释写 `Autoplay yields as soon as a person uses it` —— **源码里没有任何 autoplay**，无 `setInterval`/`setTimeout`。
2. 分页容器注释写 `page content — blurred crossfade`，但代码是 `className="transition-[opacity,filter] duration-250"` + `style={{ opacity: 1, filter: "blur(0)" }}` —— 内联值是**常量**，翻页时从不改变，过渡永不触发。且 `duration-250` 不是 Tailwind 默认档位（v4 任意值应写 `duration-[250ms]`），大概率整条声明就是无效的。**翻页目前是硬切**。

**a11y**：翻页按钮有 `aria-label`；指标/分段按钮有 `aria-pressed`；分段条有 `role="group"`。无 live region，翻页后内容变化不播报。

### 4.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxStatCard` (`stat-card/src/TxStatCard.vue`) | 「大数 + 涨跌」 | TxStatCard 是**单块玻璃拟态 KPI 砖**：`backdrop-filter: blur(16px) saturate(140%)`、`border-radius:16px`、`min-height:112px`、`font-size:28px` 的值、径向光晕 `__glow` + 放大模糊的装饰图标 `__decoration`、`variant='progress'` 的 conic-gradient 环。BUI 洞察卡是**发丝线纸片**（`shadow-hairline`、`rounded-card` 10px、17–20px 值、`--tx` 无 backdrop-filter），且含分页、散文、canvas 图、分段条。`StatCardInsight = {from,to,type,color,...}` 只能表达单个 delta |
| **tuffex 无任何图表组件** | — | 全库仅 `progress` / `progress-bar`；唯一 canvas 是 `TxThinkingOrb`（装饰性球体，非数据可视化）。折线图是**净新增能力** |
| `TxTooltip` | tooltip | BUI 图表 tooltip 是跟随 scrub 位置的绝对定位块（`.insight-chart-tooltip-anchor` 夹 28–72%），不是 hover 触发的浮层；语义与定位策略都不同 |
| `TxFlatRadio` | AnomalyCard 的 Spend/Usage 切换 | 形状匹配（pill 分段），可复用 |

**结论：新增一族组件；`TxStatCard` 原样保留不动。**

### 4.3 融合建议

**(a) 新组件族**（推荐），拆成四个可独立使用的单元：

| 组件 | 职责 |
|---|---|
| `TxInsightCards` | 分页外壳（头部计数 + 前后翻页 + 内容槽 + 追问 pill） |
| `TxSparkChart` | 自研 canvas 折线图：多序列、无动画、可选网格、padding、`theme` |
| `TxChartScrubber` | 覆盖在图上的 DOM 层：游标线 + 夹边 tooltip + pointer→index 换算 |
| `TxAllocationBar` | 分段占比条 + 图例 chip（纯 DOM，独立价值最高） |

理由：
1. `liveline` 是 React-only（`peerDependencies: { react: '>=18' }`），**没有 Vue 版可用**，必须自研。
2. 但自研门槛比看上去低：BUI 传的是 `paused` + `scrub={false}` + `pulse={false}` + `momentum={false}`，即 liveline 的实时/动画/交互能力**全部关闭**，只用到「静态折线渲染」。需要复刻的只有：多序列折线、`lineWidth 2.25`、可选网格、`padding {top,right,bottom,left}`、明暗主题描边色。
3. 拆四件是因为 `TxAllocationBar` 与 `TxSparkChart` 各自都能被别处复用（`TxAllocationBar` 尤其像一个通用占比控件）；捆成一个巨组件会让它们不可达。

备选：
- **(b) TxStatCard 加 `variant="insight"`**：要把 canvas 图表、分页、散文全塞进一个已有 40+ 行样式的玻璃砖里，且两者的阴影/圆角/字号体系互斥。强烈不推荐。
- **(c) 找 Vue 图表库**（如 uPlot / lightweight-charts）：能省自研，但引入外部运行时依赖，且它们的默认视觉与 BUI 的 `padding{top:24,bottom:22}` + 无坐标轴 + 2.25px 线宽差距不小，定制成本可能高于自研。作为次选，需要单独评估包体积（tuffex 有 `audit:size` 门禁，见 repo memory）。

### 4.4 Vue Port API 草图

```ts
// src/spark-chart/src/types.ts
export interface SparkPoint { time: number, value: number }

export interface SparkSeries {
  id: string
  data: SparkPoint[]
  /** 未给时按 index 从内置主题色轮取 */
  color?: string
  label?: string
}

export interface SparkChartProps {
  series: SparkSeries[]
  /** 'auto' 走 useAutoTheme（data-theme / .dark，含 body） */
  theme?: 'light' | 'dark' | 'auto'
  grid?: boolean
  /** @default 2.25 —— 对齐 BUI */
  lineWidth?: number
  /** @default { top: 24, right: 0, bottom: 22, left: 0 } */
  padding?: { top?: number, right?: number, bottom?: number, left?: number }
  /** y 轴范围；不给则按数据自适应 */
  domain?: [number, number]
  /** 图表可访问名（canvas 是 role="img"，对齐 TxThinkingOrb） */
  ariaLabel?: string
}
```

```ts
// src/insight-cards/src/types.ts
export interface InsightPage {
  key: string
  /** 纯文本；富文本（@实体、mono 数字）走 #prose 具名 slot */
  prose?: string
  /** 追问 pill 文案；不传不渲染 */
  suggestion?: string
}

export interface InsightCardsProps {
  pages: InsightPage[]
  /** 当前页索引，v-model；不传即不受控 */
  modelValue?: number
  /** 头部标题。@default 'Insights' */
  title?: string
  /** 头部是否显示总数。@default true */
  showCount?: boolean
  /** 翻页是否环绕。@default true —— 对齐 BUI 的模运算 */
  loop?: boolean
  previousLabel?: string   // @default 'Previous insight'
  nextLabel?: string       // @default 'Next insight'
}

export interface InsightCardsEmits {
  (e: 'update:modelValue', index: number): void
  (e: 'change', page: InsightPage, index: number): void
  (e: 'suggestion', page: InsightPage): void
}
```

```ts
// src/allocation-bar/src/types.ts
export interface AllocationSegment {
  key: string
  label: string
  /** 0–100 */
  percent: number
  /** 显示金额/数量文本 */
  amount?: string
  color?: string
  description?: string
}

export interface AllocationBarProps {
  segments: AllocationSegment[]
  /** 选中段 key，v-model */
  modelValue?: string
  /** 是否渲染图例 chip 行。@default true */
  legend?: boolean
  /** role="group" 的可访问名。@default 'Allocation segments' */
  ariaLabel?: string
}
```

Slots：
- `TxInsightCards`：`prose`（scoped `{ page, index }`，承载 @实体 + mono 数字这类富文本）、`default`（scoped `{ page, index }`，放卡片本体）、`suggestion`
- `TxSparkChart`：`overlay`（scoped `{ width, height, indexFromX }`，供 scrubber 挂载）

Exposed：`TxInsightCards.next()` / `.previous()` / `.goTo(i)`；`TxSparkChart.redraw()`。
受控：分页索引、分段选中、指标切换均走 v-model；`hoverIndex` 是内部瞬态，不外露（但可通过 `scrub` 事件抛出）。

### 4.5 移植风险

1. **canvas 生命周期（最大风险）**。仓库记忆已记过 OGL 的坑，这里同源：
   - **必须测量容器 + ResizeObserver**。`TxThinkingOrb` 用的是**固定 `size` prop**（`TxThinkingOrb.vue:109`），不适用——本图表宽度是 `h-[166px]` × 容器宽度（100%）。要照 `TxSlider.vue:437-441` / `TxTabs.vue:362-371` 的 ResizeObserver 写法。
   - DPR：`Math.min(2, window.devicePixelRatio || 1)`，`ctx.setTransform(dpr,0,0,dpr,0,0)` 后按 CSS 像素绘制（`TxThinkingOrb.vue:111-125`）。
   - **jsdom 守卫**：`canvas.getContext('2d')` 在 jsdom 返回 null，必须 `if (!ctx) return`，否则组件单测直接崩（`TxThinkingOrb.vue:115-118` 有现成注释）。
   - **主题切换重绘**：canvas 不吃 CSS 变量。`useAutoTheme`（`stream-markdown/src/use-auto-theme.ts:10`）返回的 ref 要进 `watch` 触发重绘。BUI 自己的 `useDarkMode` 只观察 `documentElement.class`，**不认 `data-theme` 属性**——tuffex 的 `variables.scss:311` 同时支持 `[data-theme='dark']` 和 `.dark`，所以必须用 `useAutoTheme` 而不是照抄 BUI 的 MutationObserver。
   - 卸载时 `disconnect()` ResizeObserver + `cancelAnimationFrame`（若有）。
2. **截图基准在这一项上不可用**。`shots/dark-insight-cards.png` 与 `shots/light-insight-cards.png` **两张都**在 CompareCard 的图表区显示 **"No data to display"**——`data={[]}` + `series` 的多序列路径在抓图那版 liveline 里没渲染出来，只剩两个图例圆点和一条底部灰弧。**AC2 的视觉验收不能拿这两张图当图表区基准**；卡片外框、图例、大数、pill 仍然可用。移植后的图表长什么样需要另立基准（建议按 AnomalyCard 的单序列路径推导，或直接与设计方确认）。
3. **`SNAPSHOT_END = Math.floor(Date.now()/1000)` 在模块作用域**。移植到 Vue 若照抄成模块级常量，SSR（nexus 是 Nuxt）会产生 hydration 不一致。demo 数据应放组件内或用固定时间戳。
4. **scrub 的 pointer 语义**：`onPointerMove` 无按键判断 → 桌面端**纯悬停**就 scrub。触屏上 `touch-action: pan-y`（`.insight-chart-stage`）允许纵向滚页、横向被组件吃掉。移植时要保留 `touch-action`，否则页面在图表上滑不动。
5. **两处死代码**（见 §4.1 末）：autoplay 与 blurred crossfade 都不存在。若产品期望"翻页有过渡"，那是**新增**而非还原，要单独立项，且不能拿截图当依据。
6. **硬编码的暗色 hex**：`#f68f3c` / `#3d9aff` / `#ee5c61` 是 dark token 的字面量。移植时应改用 `var(--tx-...)` 或组件级色轮，否则明色主题下的线条会偏亮——这是修 BUI 的既有不一致，需在 design.md 里记一笔（会造成与截图的可见差异）。

---

## 5. `18-fine-tune-card` → 属性检查器

### 5.1 职责与完整清单

**职责**：agent 在检查器里调整设计属性——布局模式分段、W/H/Radius/Opacity 四个可拖拽数值域、类型下拉。

**Props/变体**：主组件**零 props**。内部 `ScrubField` 有完整 props：`{label, value, onChange, min, max, step=1, suffix="", active}`。

**状态**：`seg`(0) / `width`(324) / `height`(96) / `radius`(28) / `opacity`(100) / `menuOpen` / `typeValue`("Select type")。

派生：
```tsx
const done = seg !== 0 || width !== 324 || height !== 96 || radius !== 28 || opacity !== 100 || typeValue !== "Select type";
```

**`ScrubField` 交互三通道**（`18-fine-tune-card.tsx:30-88`，本组件的核心）：

```tsx
const drag = useRef<{ x: number; v: number } | null>(null);
const clamp = (v) => Math.min(max, Math.max(min, Math.round(v)));

// ① 拖拽（标签即手柄）
onPointerDown: (e) => { e.target.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: value }; }
onPointerMove: (e) => { if (!drag.current) return;
                        onChange(clamp(drag.current.v + ((e.clientX - drag.current.x) / 2) * step)); }
onPointerUp:   () => (drag.current = null)

// ② 键盘
onKeyDown: mult = e.shiftKey ? 10 : 1
  ArrowUp | ArrowRight  → onChange(clamp(value + step * mult))   // preventDefault
  ArrowDown | ArrowLeft → onChange(clamp(value - step * mult))

// ③ 直接输入
<input inputMode="numeric" onChange={(e) => {
  const n = Number(e.target.value.replace(/[^\d-]/g, ""));
  if (!Number.isNaN(n)) onChange(clamp(n));
}} />
```

**关键量**：`(clientX - startX) / 2` → **每 2px 位移 = 1 个 step**。这是相对增量拖拽，与「按位置映射到轨道」的 slider 是两种数学。

手柄元素：`<span role="slider" aria-label={label} aria-valuenow aria-valuemin aria-valuemax tabIndex={0}>`，class 含 `cursor-ew-resize touch-none select-none`、`hover:text-ink-2 focus-visible:text-accent-ink focus-visible:outline-none`。

字段外壳：`flex h-6.5 min-w-0 items-center gap-1 rounded-chip py-1 pr-1 pl-0.5 transition-[background-color,box-shadow] duration-200`；
`background: active ? 'var(--accent-tint)' : 'var(--field)'`；`boxShadow: active ? '0 0 0 1px var(--accent)' : 'none'`。
值输入 `text-[12px] text-ink tabular-nums`；后缀 `text-[11.5px] text-ink-3`。

**DOM 结构**（`:116-244`）：

```
div.relative.w-full.max-w-60.rounded-card.bg-surface.shadow-raised          ← 240px
├─ div.primitive-card-bar.flex.items-center.justify-between.border-b.border-line   ← 10px 12px
│  ├─ span "Flavor card"  text-[13px] font-medium text-ink
│  └─ done ? ✓ + "Edited" text-[12px] font-medium text-green
│           animation: pop-in 250ms cubic-bezier(0.23,1,0.32,1) both
│     : sparkle chip size-4.5 rounded-[5px] border border-accent/30 bg-accent-tint (svg 9×9 fill=var(--accent))
│       + "Adjust"  bg-clip-text text-transparent text-[12px] font-medium
│           backgroundImage: linear-gradient(90deg, var(--accent) 35%, var(--accent-ink) 50%, var(--accent) 65%)
│           backgroundSize: 200% 100%
│           animation: shimmer-text 1.4s linear infinite
├─ div.primitive-card-pad.flex.flex-col.gap-2.border-b.border-line          ← 12px
│  ├─ p "Layout"  text-[12.5px] font-medium text-ink
│  ├─ div.relative.grid.grid-cols-3.rounded-control.bg-field.p-0.5
│  │  ├─ span (thumb) absolute inset-y-0.5 rounded-[6px] bg-surface shadow-btn
│  │  │     transition-transform duration-300 ；timing cubic-bezier(0.23, 1, 0.32, 1)
│  │  │     width: calc((100% - 4px) / 3) ; left: 2 ; transform: translateX({seg * 100}%)
│  │  └─ button×3  relative z-10 flex h-6 items-center justify-center transition-colors duration-200
│  │        选中 text-accent，否则 text-ink-3 ；aria-label="{row|col|grid} layout" aria-pressed
│  │        SegmentIcon：dot = size-1.5 rounded-[2px] border-[1.2px] border-current
│  │          row = flex gap-0.5 ×3 ； col = flex-col gap-0.5 ×2 ； grid = grid-cols-2 gap-0.5 ×4
│  ├─ div.grid.grid-cols-2.gap-2 > ScrubField W(40..999, 默认324) / H(24..999, 默认96)
│  └─ div.grid.grid-cols-2.gap-2 > ScrubField Radius(0..64, 默认28) / Opacity(0..100, 默认100, suffix "%")
└─ div.primitive-card-footer.flex.items-center.justify-between               ← 10px 12px
   ├─ span "Type"  text-[12px] text-ink-3
   └─ div.relative.-mr-0.5.w-30                                              ← 120px
      ├─ button (trigger) h-6.5 w-full rounded-chip bg-inset py-1 pr-1 pl-2 shadow-hairline
      │     transition-shadow duration-200 ；open 时 boxShadow: 0 0 0 1px var(--accent)
      │     aria-expanded ；文本 text-[12px]（已选 text-ink / 未选 text-ink-3）
      │     chevron svg 11×11 transition-transform duration-200，open 时 rotate(180deg)
      └─ [open] div  absolute right-0 bottom-8 z-10 w-30 rounded-[10px] bg-surface p-1 shadow-raised
            animation: pop-in 200ms cubic-bezier(0.23,1,0.32,1) both ；transformOrigin "bottom right"
            → 向上弹出
            items×3 (Seasonal/Classic/Limited)  h-6.5 rounded-[6px] px-2 text-[12.5px] text-ink
              hover:bg-field duration-150 ；选中项 background: var(--field)
```

**动效清单**：

| 元素 | 动效 | 精确参数 |
|---|---|---|
| "Adjust" 文字 | `shimmer-text` | `1.4s linear infinite`，配 `background-size: 200% 100%` 与三段渐变 |
| "Edited" 徽记 | `pop-in` | `250ms cubic-bezier(0.23,1,0.32,1) both` |
| 分段 thumb | transform 过渡 | `duration-300`，timing `cubic-bezier(0.23, 1, 0.32, 1)` |
| 分段文字色 | color 过渡 | `duration-200` |
| ScrubField 外壳 | 底色+描边 | `transition-[background-color,box-shadow] duration-200` |
| 下拉 trigger | box-shadow | `duration-200` |
| chevron | rotate | `duration-200` |
| 下拉菜单 | `pop-in` | `200ms cubic-bezier(0.23,1,0.32,1) both`，`transform-origin: bottom right` |

### 5.2 重叠判定（逐个评估任务点名的四个候选）

| tuffex 组件 | 能否复用 | 依据 |
|---|---|---|
| `TxSlider` (`slider/src/TxSlider.vue`) | **不能** | TxSlider 的内核是原生 `<input type="range">`（`:509-527`），值 = 指针在轨道上的**绝对位置**映射；BUI ScrubField 是**无轨道、无 thumb 的相对增量**（每 2px 一个 step，可无限拖）。两者的数学与 DOM 都不可调和。另外 TxSlider 挂了一整套 tooltip 物理（`tooltipJelly*` / `tooltipSpring*` / `thumbSurface` 折射盘，共 25 个 prop），塞进 26px 高的检查器字段是负担 |
| `TxSegmentedSlider` (`segmented-slider/src/`) | **不能** | 名字误导：它是**轨道上的圆点步进器**（`__track` 4px 高 + `__progress` 填充 + 绝对定位的 `__dot` 16/20px + 下方 label），语义是「第 N 档进度」，不是分段单选控件。`SegmentedSliderSegment = {value,label?}` 也没有图标位 |
| `TxFlatRadio` (`flat-radio/src/`) | **能，且是最佳匹配** | 正是「灰底轨道 + 滑动白 thumb」的分段控件：`indicatorStyle` 用 `offsetLeft/offsetWidth` + `translateX`（`:125-142`），有 ResizeObserver、`bordered`、roving focus + `aria-activedescendant`（比 BUI 的裸 `aria-pressed` 更好）。尺寸档位 `sm{h:24px,r:6px,item:4px}` / `md{h:30px,r:8px,item:6px}`（`:247-250`）——BUI 是 **h 28px / 外圆角 8px（`rounded-control`）/ thumb 圆角 6px**，介于两档之间，需要覆写 `--tx-flat-radio-height: 28px` + 用 md 的圆角。`TxFlatRadioItemProps` 有 `icon?: string`，但 BUI 的 SegmentIcon 是纯 CSS 点阵不是图标字体 → 走 `#default` slot 传自定义节点 |
| `TxNumberInput` (`number-input/src/TxNumberInput.vue`) | **不能直接用，但逻辑值得对齐** | 视觉差距大：`min-width:120px; height:34px; border-radius:10px`，带左右 `+`/`-` 按钮，`type="number"`，居中对齐；BUI 是 26px 高、6px 圆角、无按钮、标签即手柄。**行为差异更关键**：TxNumberInput 聚焦时保留原始文本、**clamp 推迟到 blur**（`:100-112` 有大段注释解释「输入 5 去 50 的途中不能被改写成 10」）；BUI 是**每次输入立刻 clamp**（`clamp(n)`）。两种都合理，但必须显式选一种并写进文档 |
| `TxSelect` (`select/src/`) | **可行但偏重，不推荐** | 功能远超需求（multiple/searchable/remote/allowCreate/maxTagCount/panelVariant/panelBackground/refraction…共 33 个 prop），且依赖 `TxBaseAnchor`。致命点：**没有 trigger slot**——`TxSelect.vue` 的 slot 只有 `tag`/`group`/`option`/`loading`/`empty`，无法把触发器换成 26px 的 chip。要还原就得靠外部 CSS 覆写内部类名，脆弱 |
| `TxDropdownMenu` | 可作下拉备选 | 需另行核实其 placement/宽度控制是否支持 `bottom-right` 向上弹出 |

### 5.3 融合建议

**(a) 新组件 `TxFineTuneCard`（卡片外壳） + `TxScrubField`（可拖拽数值域，独立组件）**（推荐），内部**复用 `TxFlatRadio`** 做布局分段。

理由：
1. `TxScrubField` 是 tuffex 目前**完全缺失**的交互原语（Figma/Blender 式 scrub 数值输入）。它的独立价值高于 fine-tune 卡本身——任何检查器 UI 都需要它。
2. slider / segmented-slider / number-input 三个候选经逐项核实均不可直接复用（见 §5.2），不存在「重复造轮子」问题。
3. `TxFlatRadio` 可以真复用，且它自带的 roving focus 比 BUI 原版的一堆 `aria-pressed` 按钮更好——这是融合带来的净收益。
4. 卡片外壳（header 的 Adjust/Edited 双态 + 三段式分隔）是 demo 级组合，做成组件让文档站有完整案例；宿主也可只取 `TxScrubField`。

备选：
- **(b) 扩 `TxNumberInput` 加 `scrub` 变体**：会把 `+`/`-` 按钮、`type="number"`、34px 高度全变成条件分支，且 clamp 时机要分叉。破坏面大于收益。不推荐。
- **(c) 纯组合（不新建 ScrubField）**：拖拽逻辑没有宿主能合理承担。不可行。

**下拉部分建议**：先做 `TxFineTuneCard` 内联的轻量 select（26px chip + 向上 pop-in 菜单），并**补齐 BUI 缺的**：outside-click 关闭、Escape 关闭、`role="listbox"`/`option`、方向键 roving。若后续发现复用价值，再抽成 `TxChipSelect`。

### 5.4 Vue Port API 草图

```ts
// src/scrub-field/src/types.ts
export interface ScrubFieldProps {
  modelValue: number
  /** 标签文本，同时是拖拽手柄 */
  label: string
  min: number
  max: number
  /** @default 1 */
  step?: number
  /** 单位后缀，如 '%' */
  suffix?: string
  /** 高亮态（BUI 用「值 ≠ 默认值」驱动）。由宿主判定，组件不猜 */
  active?: boolean
  disabled?: boolean
  /** 每 N 像素位移 = 1 个 step。@default 2 —— 对齐 BUI 的 /2 */
  pixelsPerStep?: number
  /** Shift 加速倍率。@default 10 */
  shiftMultiplier?: number
  /** 输入时立刻 clamp（BUI 行为）还是 blur 时再 clamp（TxNumberInput 行为）。@default 'input' */
  clampOn?: 'input' | 'blur'
  /** 手柄 role="slider" 的可访问名；不传回落到 label */
  ariaLabel?: string
  /** 值输入框的可访问名。@default `${label} value` */
  valueLabel?: string
}

export interface ScrubFieldEmits {
  (e: 'update:modelValue', value: number): void
  (e: 'change', value: number): void
  (e: 'scrub-start'): void
  (e: 'scrub-end'): void
}
```

```ts
// src/fine-tune-card/src/types.ts
export type FineTuneLayout = 'row' | 'col' | 'grid'

export interface FineTuneValues {
  layout: FineTuneLayout
  width: number
  height: number
  radius: number
  opacity: number
  type: string | null
}

export interface FineTuneCardProps {
  /** 全量受控，v-model */
  modelValue: FineTuneValues
  title?: string
  /** 类型下拉选项 */
  typeOptions?: Array<{ value: string, label: string }>
  typePlaceholder?: string     // @default 'Select type'
  /** 是否已被编辑（驱动 Adjust ↔ Edited 切换）。不传则组件与 defaults 比对 */
  edited?: boolean
  /** 未编辑态的提示文案。@default 'Adjust' */
  adjustLabel?: string
  /** 已编辑态的文案。@default 'Edited' */
  editedLabel?: string
  /** 各字段的范围覆写 */
  ranges?: Partial<Record<'width' | 'height' | 'radius' | 'opacity', { min: number, max: number }>>
}

export interface FineTuneCardEmits {
  (e: 'update:modelValue', value: FineTuneValues): void
  (e: 'change', key: keyof FineTuneValues, value: FineTuneValues[keyof FineTuneValues]): void
}
```

Slots：`TxFineTuneCard` → `header-status`（替换 Adjust/Edited 区）、`layout-icon`（scoped `{ layout }`）、`footer`。
Exposed：`TxScrubField.focus()`。
受控：`FineTuneValues` 整体 v-model（六个字段一个对象，避免六个 v-model）。

### 5.5 移植风险

1. **`setPointerCapture` 的 Vue 写法与 BUI 的缺陷**：
   - BUI 在 `onPointerDown` 里对 `e.target` 调 `setPointerCapture`，但**没有 `onPointerCancel`**，也没有监听 `lostpointercapture`。指针被系统抢走（如触发浏览器手势）后 `drag.current` 永不清空 → 下次 move 会跳变。移植时应补 `pointercancel` + `pointerup` 双清，并在 `onBeforeUnmount` 兜底。
   - `touch-none`（`touch-action: none`）必须保留，否则触屏上横拖会被页面滚动吃掉。
2. **`role="slider"` 放在 `<span>` 上**：`aria-valuenow/min/max` 齐全、`tabIndex=0`、有方向键处理，符合 ARIA slider 模式。但**没有 `aria-orientation`**，且拖拽手柄与显示值分处两个元素（值在旁边的 `<input>` 里，另有 `aria-label="${label} value"`）——屏幕阅读器会读到两个控件。移植时保留结构即可，但要在文档里说明这是「手柄 + 数值框」双控件设计。
3. **`Math.round` 在 clamp 里**：`clamp` 无条件 `Math.round`，所以 `step` 即使传小数也只能得到整数。若 `TxScrubField` 想支持小数 step，需要改 clamp 实现（会偏离 BUI）。建议 v1 保持整数语义并在类型上标注。
4. **输入清洗正则的漏洞**：`replace(/[^\d-]/g, "")` 允许 `1-2` 这类串（→ `Number("1-2")` = NaN → 被 `Number.isNaN` 挡住，值不更新，但输入框里留着脏文本）。移植时若要更稳，参考 `TxNumberInput.vue:97-112` 的 raw/normalized 双轨做法。
5. **下拉菜单向上弹出且无外部关闭**：`bottom-8` + `transformOrigin: 'bottom right'` 是硬编码方向，卡片贴近视口顶部时会被裁。且**点外部不关、Escape 不关、无焦点管理**。移植必须补齐这三项（属于修缺陷，不改像素）。
6. **`done` 的判定耦合默认值**：源码把 `324/96/28/100/0/"Select type"` 写死在比较里。做成组件后这些是 props 默认值，`edited` 必须要么由宿主给，要么与**当前生效的 defaults** 比对，不能再硬编码常量。
7. **`shimmer-text` 依赖 `background-clip: text`**：需要 `-webkit-background-clip: text` 前缀 + `color: transparent`。在 reduced-motion 下要停动画但**保留渐变可见性**（不能连 `background-image` 一起去掉，否则文字变透明消失）——这是本簇 reduced-motion 处理里最容易做错的一处。

---

## 6. 跨组件共享模式（建议提取为 tuffex 共享层）

以下模式在本簇 ≥2 个组件中重复出现，且据 PRD 与其他簇的清单判断会在 19 个组件里广泛复用：

| 模式 | 出现处 | 建议落法 |
|---|---|---|
| **等宽数字** `tabular-nums` | 10（字符数、计数）、14（徽标）、15（无）、16（所有大数、时间、百分比）、18（值输入） | SCSS mixin `@mixin tx-tabular-nums { font-variant-numeric: tabular-nums; }`；仓库已在 `TxContextIndicator.vue:115`、`TxSources.vue:176` 各写一遍 |
| **mono 数值** `font-mono text-[11.5px]` + 红/绿 | 16（`Mono` 组件，`-$2,377.66`） | 共享 `TxMonoValue` 或工具类；需要 `--font-mono-face`（BUI 是 JetBrains Mono） |
| **图标 chip / 角标方块** | 10（PDF/CSV `size-3.5 rounded-[4px]`）、14（workspace `size-8 rounded-[8px] bg-ink`）、16（`V` 圆形 `size-3.5`）、18（sparkle `size-4.5 rounded-[5px]`） | 共享 `TxIconChip`：`{size, radius, tone, shape: 'square'|'circle'}` |
| **分组头** `text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3` | 14（WORKSPACE/OBJECTS）；其他簇的表格/列表大概率同款 | 共享 class 或 `TxGroupLabel` |
| **卡片内边距三件套** `.primitive-card-bar/-pad/-footer` | 10、18（跨簇更多） | SCSS mixin：`tx-card-bar{padding:10px 12px}` / `tx-card-pad{padding:12px}` |
| **`--ease-out-strong` = `cubic-bezier(.23,1,.32,1)`** | 10（fade-up、chip）、14（悬浮框）、18（thumb、pop-in） | 落成 tuffex token `--tx-ease-out-strong`；出现频次高到不该重复写字面量 |
| **`active:scale-[0.96]` 按压** | 14（4 处）、16（翻页、指标、图例；分段是 0.98） | 共享 mixin，并在 reduced-motion 下关闭 |
| **移动指示器（测量 + translate）** | 14（垂直 top/height）、18（水平 translateX） | tuffex 已有两份实现（`TxFlatRadio` / `TxTabs`），可抽 `useIndicatorBox()` composable |
| **发丝线阴影体系** | 全簇 | 落成 `--tx-shadow-hairline/-btn/-card/-raised/-overlay` 五个 token，明暗两套（值见 §0.1） |

---

## 7. Caveats / Not Found

1. **`liveline` 无 Vue 版本**。npm 上 `liveline@0.0.7` 的 `peerDependencies` 只有 `react: '>=18'`；未检索到 Vue port 或框架无关的 core 包。图表必须自研或换库。（版本 0.0.7 也意味着上游 API 不稳定，即便有 Vue 版也不宜依赖。）
2. **insight-cards 的截图基准部分失效**：明暗两张截图的 CompareCard 图表区都是 "No data to display"。AC2 的像素比对在该区域**没有可用基准**。已在 §4.5-2 记录。
3. **未验证的 tuffex 组件**：`TxDropdownMenu` 的 placement 能力（fine-tune 下拉的备选）、`TxTag` 的具体样式（context-cards 计数胶囊的备选）本次未展开读。
4. **本簇 5 个组件全部零 props**，是 demo 而非组件——所有 props/emits/slots 契约都是本报告的**设计推导**，不是从源码提取的既有 API。落地前需与主会话/design.md 对齐命名。
5. **本簇未涉及的 BUI 全局资产**：`_global.css` 中的 `eq-bounce` / `stream-in` / `caret-blink` / `spin` / `pixel-on` 五个 keyframes 与 `.stream-caret` / `.stream-tail` / `.primitive-table-cell` 属于其他簇，未展开。
6. **命名冲突提醒**：`TxNavBar` 已被占用（顶部横向 app bar），侧栏不能复用该名。`TxLoadingState` 在 PRD R2 里已标注同名不同物，本簇不涉及但同类风险存在。
7. **MIT 署名（PRD R5）**：全仓当前 `grep -rl "Beautiful UI\|Shane Levine"` 无命中，说明署名尚未落任何一处。本簇 5 个组件的目录/文件头都需要加。
