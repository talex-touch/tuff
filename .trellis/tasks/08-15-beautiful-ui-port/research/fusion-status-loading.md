# Research: Beautiful UI 状态/加载簇（01 / 02 / 06 / 17）融合分析

- **Query**: 分析 01-loading-state / 02-thinking-state / 06-task-rows / 17-code-block 四个 BUI 组件，给出与 tuffex 现有组件的重叠判定、融合方案、Vue port API、移植风险
- **Scope**: internal（BUI 源码 + tuffex 源码 + tuffex spec）
- **Date**: 2026-08-15
- **源码位置**: `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/`

---

## 0. 全簇共享的基础事实（先读这一节，后面四节都依赖它）

### 0.1 这四个组件实际用到的 keyframes（9 个里只用了 5 个）

| keyframe | 精确定义（来自 `_global.css`） | 01 | 02 | 06 | 17 |
|---|---|---|---|---|---|
| `pixel-on` | `0%,to{opacity:.15}18%,42%{opacity:1}62%{opacity:.15}` | ✅ | | | |
| `shimmer-text` | `0%{background-position:150%}to{background-position:-50%}` | ✅ | ✅ | | |
| `fade-up` | `0%{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}` | | ✅ | ✅ | ✅ |
| `fade-in` | `0%{opacity:0}to{opacity:1}` | | ✅ | ✅ | |
| `pop-in` | `0%{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}` | | | ✅ | |
| `spin` | `to{transform:rotate(1turn)}` | | ✅ | ✅ | |

**明确不使用**：`eq-bounce`、`stream-in`、`caret-blink`。特别是 `caret-blink` —— 17-code-block 的光标是**静止**的（`ml-0.5 inline-block h-3 w-[3px] translate-y-0.5 rounded-full bg-accent`），全站只有 `.stream-caret`（03-streaming-text 用）挂了 `caret-blink 1s step-end infinite`。移植 17 时不要自作主张加闪烁。

### 0.2 reduced-motion 的真实机制（最容易漏掉的一条）

BUI 全站只有两条 reduced-motion 规则：

```css
@media (prefers-reduced-motion:reduce){.stream-caret{animation:none}.stream-tail{filter:none;mask-image:none}}
@media (prefers-reduced-motion:reduce){*,:after,:before{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
```

也就是说：**这四个组件自身没有一行 reduced-motion 代码**，全靠那条全局 `*` 兜底。01 头注释说的「Reduced motion freezes the grid to its dim state」是这条全局规则的*涌现结果*——`animation-duration:.01ms` + `iteration-count:1` 让 `pixel-on` 瞬间跑完并停在 `to{opacity:.15}`（暗态），不是任何显式规则。

**移植含义（硬约束）**：tuffex 没有这条全局 `*` 规则（25 个组件各自写 `@media (prefers-reduced-motion: reduce)` 块）。所以每个移植组件必须显式写自己的 reduced-motion 块，而且 **01 的像素格必须落到 `opacity: .15` 而不是 `1`**——直接写 `animation: none` 就正好是这个结果（inline base opacity 本来就是 `.15`），但要写出来并测。

顺带一个既有缺口：`TxTypingIndicator` 和 `TxSpinner` 目前**都没有** reduced-motion 块（已 grep 确认）。这不是本次任务范围，但新增的 loading 组件不要复制这个缺口。

### 0.3 design token 映射表（BUI → tuffex）

BUI 54 个变量 × 明暗两套；这四个组件消费的子集与 tuffex `packages/tuffex/packages/components/style/variables.scss` 的对应关系：

| BUI | light / dark | tuffex 对应 | 备注 |
|---|---|---|---|
| `--ink` | `#1f2124` / `#f2f3f4` | `--tx-text-color-primary` | 一级文字 |
| `--ink-2` | `#62656b` / `#a5a8ad` | `--tx-text-color-regular` | 二级文字 |
| `--ink-3` | `#9a9da3` / `#6c6f75` | `--tx-text-color-secondary` | 三级/弱化 |
| `--line` | `#ecedef` / `#2e3033` | `--tx-border-color-light` | 发丝线 |
| `--line-strong` | `#e0e2e5` / `#3a3c40` | `--tx-border-color` | |
| `--surface` | `#fff` / `#232427` | `--tx-bg-color-overlay` | ⚠️ 不要用 `--tx-fill-color-blank`，它 dark 下是 `transparent` |
| `--inset` | `#f7f8f9` / `#1f2022` | `--tx-fill-color-light` | 代码区/选中底 |
| `--hover` | `#f4f5f6` / `#2a2b2e` | `--tx-fill-color-light` | |
| `--hover-2` | `#e7e9eb` / `#313236` | `--tx-fill-color` | |
| `--accent` | `#0285ff` / `#3d9aff` | `--tx-color-primary` | |
| `--accent-ink` | `#0170dd` / `#7ec0ff` | `--tx-color-primary-dark-2` | 明暗反向，tuffex 该 token 同样反向（`#337ecc` / `#66b1ff`），映射成立 |
| `--green` / `--green-tint` | `#189a4d` / `#e8f5ed` | `--tx-color-success` / `--tx-color-success-light-9` | |
| `--red` / `--red-tint` | `#e3474c` / `#fcecec` | `--tx-color-danger` / `--tx-color-danger-light-9` | |
| `--orange` | `#ef720c` / `#f68f3c` | `--tx-color-warning` | |
| `--shadow-card` | `0 0 0 1px var(--line),0 1px 2px #1018280a,0 2px 6px #10182808` | **无对应** | tuffex 的 `--tx-box-shadow-*` 重得多（12px/32px 模糊）。BUI 的 card 阴影本质是「发丝描边 + 极轻投影」，需要新增 `--tx-shadow-hairline-card` 之类 |
| `--ease-out-strong` | `cubic-bezier(.23,1,.32,1)` | **无对应** | 四个组件里所有 inline `cubic-bezier(0.23,1,0.32,1)` 就是这个命名 token |
| `--radius-card` / `--radius-control` / `--radius-chip` | `10px` / `8px` / `6px` | `--tx-border-radius-base` 只有 4px | tuffex 圆角体系与 BUI 不同，建议组件内私有变量而非动全局 |

### 0.4 Tailwind 任意值换算（`--spacing: .25rem`）

已从编译 CSS 核实，移植成 SCSS 时直接用右列：

`size-3`=12px、`size-3.5`=14px、`size-5.5`/`h-5.5`=22px、`size-6`=24px、`size-7`=28px、`min-h-7`=28px、`h-11`=44px、`gap-2.5`/`px-2.5`=10px、`gap-2`=8px、`px-1.5`=6px、`max-w-95`=380px、`max-w-110`=440px、`rounded-card`=10px、`rounded-control`=8px、`rounded-chip`=6px、`primitive-card-bar`=`padding:10px 12px`。

`text-ink-3/60` 编译成 `color-mix(in oklab, var(--ink-3) 60%, transparent)`（带 `var(--ink-3)` 无 `color-mix` 兜底）。

### 0.5 四个组件互相共享、应当抽成公共物的东西

1. **shimmer 文字配方**（01 + 02 完全相同）：
   `background-image: linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)` + `background-size: 200% 100%` + `background-clip: text` + `color: transparent` + `animation: shimmer-text 1.4s linear infinite`。
   **tuffex 已经有两份近似重复**：`tx-chain-shimmer`（`TxChainOfThought.vue:381`）和 `tx-reasoning-shimmer`（`TxReasoningDisclosure.vue:186`），两者都是 `1.6s` 且 `200% 0 → -100% 0`，与 BUI 的 `1.4s` / `150% → -50%` 不同。建议新增 SCSS mixin `shimmer-text-surface` / `shimmer-text-keyframes`（对齐现有 `skeleton-surface` / `skeleton-keyframes` 范式），新组件用它，**不改**两个既有组件的类名与时长（避免破坏 API 与既有测试）。

2. **`fade-up` + `--ease-out-strong` 入场语法**（02/06/17 共用）：时长 250/300/320/450ms，stagger 80/100/120ms。同样做成 mixin。

3. **披露语法（disclosure grammar）**：`<button aria-expanded>` + `display:grid` + `grid-template-rows: 1fr/0fr` + 内层 `overflow:hidden` + chevron `rotate(180deg)`。02 与 06 都用；**tuffex 已在 4 个组件里各写了一遍**（`tool-call-card`、`chain-of-thought`、`sources`、`reasoning-disclosure`，均为 `0.26s cubic-bezier(0.4,0,0.2,1)`）。不建议抽成组件（会动 4 个组件的 class 契约），建议抽 SCSS mixin。

4. **等宽 + tabular 数字**：01 的计时器、02 的 `+74 −41`、06 的 amount/环内数字/detail meta、17 的行号，全部 `font-variant-numeric: tabular-nums`。tuffex 已有 7 个文件在用，是既有约定，直接沿用。
   ⚠️ 02 的删除数用的是 **U+2212 MINUS SIGN（`−`）** 不是 ASCII 连字符，移植时别改成 `-`。

5. **状态圆点/圆徽**：02 的 `Dot`（14px 圆 + 白色描边图标 + `bg-accent`/`bg-orange`/`bg-green` 按 `i % 3` 循环）和 06 的 `Badge`（22px 圆 + 白色图标 + `bg-red`/`bg-green` + `pop-in`）是同一形状的两个尺寸。建议一个内部 `StatusDot` 原语（尺寸 + tone 两个入参），不对外导出。

6. **竖直发丝导轨**：02 用 `absolute left-[3px] w-px bg-line` + JS 测高 + 500ms 高度过渡；06 用 `grid-cols-[24px_1fr]` 里的 `mx-auto h-full w-px bg-line`。同一视觉，两种实现（见 §2 移植风险）。

7. **序列驱动 hook**：02 的 `useSequence(steps)` 和 06 的 `useTick(intervals)` 是**逐字相同**的函数（不同名字）：`useState(0)` + `useEffect` 里 `setTimeout(() => setStage(s => s+1), steps[stage])`，`stage >= steps.length - 1` 时停。两者的最后一个数组元素因此**永远用不到**（02 的 `1600`、06 的 `600` 是死数据）。这是 demo 编排逻辑，**不应进 tuffex 组件**（见 §6）。

---

## 1. 01-loading-state.tsx — 像素格加载器

### 1.1 做什么 + 完整清单

一个 3×3 像素格 + shimmer 标签 + 实时计时器的一行内联加载指示器。用于「长时间运行的工作」，不是页面级空态。

**Props**（源码 48-54 行）：

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `label` | `string` | `"Churning"` | shimmer 文字 |
| `variant` | `string`（**不是联合类型**）| `"Drive"` | 未知值走 `PATTERNS[variant] ?? PATTERNS.Drive` 兜底 |

**三个 variant 的精确参数**（源码 20-35 行）：

| variant | delays（9 格，ms） | dur | 形状 |
|---|---|---|---|
| `Drive` | `[90,180,270, 0,90,180, 90,180,270]` | 650ms | `rounded-[1px]` 方块 |
| `Dots` | 同上 | 650ms | `rounded-full` 圆点 |
| `Orbit` | `[0,110,220, 770,null,330, 660,550,440]` | 950ms | `rounded-[1px]` 方块 |

- Drive/Dots 的 delay 由 `(c + |r-1|) * 90` 生成 —— 一个从左向右推进的 V 形（chevron）波前。650ms 周期短于整条波前的扫掠时间，所以**画面上永远同时有两道波前在飞**（这是头注释点明的设计意图）。
- Orbit 的 delay 由 `ORBIT_ORDER = [0,1,2,5,8,7,6,3]` 逆查得到，中心格（i=4）为 `null` —— 彗星绕周长跑，中心是洞。

**DOM 结构**：

```
span.flex.w-fit.items-center.gap-2.5          ← 10px 间距
├─ span[aria-hidden].grid.grid-cols-[repeat(3,4px)].gap-[1.5px]   ← 总宽 4*3+1.5*2 = 15px
│  └─ span × 9   size-[4px] bg-ink
│        opacity: d === null ? 0.07 : 0.15
│        animation: d === null ? none : `pixel-on ${dur}ms ease-in-out ${d}ms infinite`
├─ span  13px/500 shimmer 文字（bg-clip-text + text-transparent）
└─ span  font-mono 12px text-ink-3 tabular-nums   ← 计时器
```

**动效**：`pixel-on`（见 §0.1）、`shimmer-text 1.4s linear infinite`。

**token**：`--ink`（格子）、`--ink-3` + `--ink`（shimmer 渐变）、`--ink-3`（计时器）。

**计时器逻辑**（`useElapsed`，37-46 行）：`setInterval(…, 100)` 每 100ms `ds += 1`，`total = ds / 10` 秒。`< 60` → `` `${total.toFixed(1)}s` ``；否则 `` `${Math.floor(total/60)}m ${(total%60).toFixed(1)}s` ``。截图里的 `2m 3.0s` 即此格式。注意这是**纯计数器**（从挂载起算），不接受起始时间戳。

**reduced-motion**：无自有规则，见 §0.2。

### 1.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxLoadingState` | **仅名字冲突** | 它是 `TxEmptyState variant="loading"` 的薄包装（页面级空态，带 icon/title/description/actions 插槽 + primary/secondary 事件），与 BUI 组件毫无关系。**名字已占用** |
| `TxTypingIndicator`（`chat/`） | **最接近的真重叠** | 已有 6 个 variant（`dots`/`ai`/`pure`/`ring`/`circle-dash`/`bars`）+ `text` + `showText` + `role="status" aria-live="polite"` + sr-only 兜底。缺：像素格、文字 shimmer、计时器、reduced-motion |
| `TxSpinner` | 部分 | 纯 loading 圈，`size`/`strokeWidth`/`fallback`/`visible`/`label`，无文字无计时 |
| `TxThinkingOrb` | 概念相邻 | Canvas/引擎驱动的思考球，量级完全不同 |

### 1.3 融合建议：**(a) 新增组件 `TxWorkingIndicator`**

**理由**：
- `TxLoadingState` 名字被占且语义完全不同，不能复用。
- 塞进 `TxTypingIndicator` 不合适：后者的语义是「对方正在输入」（`role=status` + `Typing…` 默认文案 + 6 个 variant 已经很拥挤），而 BUI 这个的语义是「长任务进行中，已耗时 X」。计时器 + shimmer 是两个全新的横切能力，加进去会让 `TypingIndicator` 的 prop 面从 14 个涨到 20+。
- 独立组件可以顺手补上 `TxTypingIndicator`/`TxSpinner` 都缺的 reduced-motion 块，不动既有组件。

**备选**：
- (b) `TxTypingIndicator` 加 `variant="pixel"` + `shimmer` + `elapsed` 三个 prop —— 省一个组件，但把「输入中」和「工作中」两个语义混在一个 `role=status` 里，且 6→7 个 variant 的 SCSS 已经 320 行。不推荐。
- (c) 组合现有原语 —— 做不到，像素格与 shimmer 文字都没有现成原语。

**命名核对**：已比对现有全部 162 个 `Tx*` 名，`TxWorkingIndicator` 未被占用。`Indicator` 后缀在 tuffex 是既有惯例（`TxTypingIndicator`、`TxContextIndicator`）。备选名：`TxPixelLoader`（偏机制）、`TxBusyIndicator`。

### 1.4 Vue port API 草案

```
loading-state 之外新目录：packages/tuffex/packages/components/src/working-indicator/
├── src/TxWorkingIndicator.vue
├── src/types.ts
├── src/use-elapsed.ts
├── __tests__/working-indicator.test.ts
└── index.ts
```

```ts
// types.ts
export type WorkingIndicatorVariant = 'drive' | 'dots' | 'orbit'

export interface WorkingIndicatorProps {
  /** Shimmering status text. @default 'Working' */
  label?: string
  /** @default 'drive' */
  variant?: WorkingIndicatorVariant
  /**
   * Wall-clock start. Omit to count from mount; pass a timestamp to survive a
   * remount (a streaming host re-rendering the row must not reset the clock).
   */
  startedAt?: number
  /** Hide the elapsed readout entirely. @default true */
  showElapsed?: boolean
  /** Formats the elapsed milliseconds. @default 12.3s / 2m 3.0s */
  elapsedFormatter?: (ms: number) => string
  /** Accessible name for the status region. @default label */
  ariaLabel?: string
}
```

```ts
// 组件
defineOptions({ name: 'TxWorkingIndicator' })
const props = withDefaults(defineProps<WorkingIndicatorProps>(), {
  label: 'Working', variant: 'drive', showElapsed: true,
})
// 无 emits。
// slots: { label?: () => any }  —— 允许宿主放富文本标签
// expose: 无（计时是内部的；宿主要控制时钟就传 startedAt）
```

- variant 全小写（tuffex 惯例：`StepsSize = 'small'|'medium'|'large'`、`StatusTone`），并收成真联合类型（BUI 的 `string` 是松散写法，不照抄）。
- 9 格 delay **不在 JS 里算**，直接写进 SCSS 的 `:nth-child(n)`：三套 variant 各 9 条 `animation-delay`，比 React 的 inline style 更省 runtime，也让 reduced-motion 一条 `animation: none` 就能全灭。
- `--tx-working-indicator-color` 之类的 hook 变量，对齐 `TxTypingIndicator` 的 `--tx-typing-indicator-color` 惯例。

### 1.5 移植风险

| React 写法 | 风险 | Vue 对应 |
|---|---|---|
| `useElapsed()` 里的 `setInterval(…, 100)` | **tuffex 现在 0 处使用 `setInterval`**（已用 39 个 `setTimeout` 文件做正对照验证）。裸 interval 在组件卸载后会泄漏 | 抽 `use-elapsed.ts` composable：`onMounted` 起 interval、`onBeforeUnmount` 清、`document.visibilitychange` 时不必暂停（计时应继续走），但要在 `startedAt` 存在时用 `Date.now() - startedAt` 重算而不是自增计数——自增计数在标签页被节流时会漂移 |
| 每格 inline `style={{animation}}` | Vue 里逐格 `:style` 会让 9 个 span 都带内联样式，reduced-motion 的 `!important` 之外无法覆盖 | 全部落到 SCSS `:nth-child()`，见上 |
| `opacity: 0.07` 的 Orbit 中心格 | 这个值只在 Orbit 出现，且**不参与动画** | SCSS 里 `.is-orbit .cell:nth-child(5) { opacity: .07; animation: none; }` |
| reduced-motion 靠全局 `*` 兜底 | tuffex 没有该规则，直接移植会得到**全速动画** | 显式 `@media (prefers-reduced-motion: reduce) { animation: none }`，并断言 opacity 停在 `.15` |
| 计时器在 reduced-motion 下仍走 | 是刻意行为（头注释明写） | 不要把计时器一并关掉 |

---

## 2. 02-thinking-state.tsx — 可展开推理轨迹

### 2.1 做什么 + 完整清单

一个「模型正在想 / 想完了」的可折叠轨迹：头部（星芒图标 + shimmer/settled 标签 + chevron）+ 展开区（竖直发丝导轨 + 行列表）。四个 variant 复用同一套头部与展开语法，只换行的内容形态。

**Props**：`variant?: string`（默认 `"Steps"`；`VARIANTS[variant] ?? VARIANTS.Steps` 兜底）。**没有任何数据 prop** —— 内容全是模块级常量。

**四个 variant 的数据形状**（37-78 行）：

| variant | `active` | `done` | 行形态 | 额外 |
|---|---|---|---|---|
| `Steps` | `Thinking` | `Thought for 4 seconds` | 勾/转圈 + 主文案（+ 可选 secondary） | — |
| `Reasoning` | `Thinking` | `Thought for 4 seconds` | 纯散文（换行、`leading-relaxed`、`text-ink-2`） | — |
| `Search` | `Searching the web` | `Searched the web` | 彩色圆点 + 站名（`<a>` 可点，带 `animated-underline`）+ 域名 | 顶部 `query` 行 + 末尾 `+7 more` |
| `Coding` | `Running tools` | `Ran 3 tools` | 工具名 + mono 文件名（`<button aria-pressed>` 可选中）| `add`/`del` 差分计数 |

**`Row` 类型**（28-35 行）：`{ primary: string; secondary?: string; mono?: boolean; add?: number; del?: number; href?: string }`

**时序编排**（`STAGES = [800, 600, 1800, 2600, 1600]`）：累计 800 / 1400 / 3200 / 5800ms 推进到 stage 4；**最后的 `1600` 永不使用**（`stage >= steps.length - 1` 提前返回）。

- `autoExpanded = stage >= 1 && stage < 4`（自动展开又自动收起）
- `expanded = manualExpanded ?? autoExpanded`（点一次后用户意志永久接管）
- `working = stage < 3`（决定 shimmer vs settled，以及最后一行是转圈还是勾）
- `visible = stage < 2 ? 0 : stage === 2 ? min(2, rows.length) : rows.length`（分两批出现）

**DOM 结构 + 精确样式**：

```
div.flex.min-h-[176px].w-full.max-w-95.flex-col      ← max-w-95 = 380px；key={variant} 强制重挂载
├─ button[aria-expanded]  -mx-1.5 flex w-fit items-center gap-2 rounded-control
│                          px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2
│  ├─ svg 16×16 星芒  fill = working ? var(--ink-2) : var(--ink-3)
│  │     path: M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z
│  ├─ span 13px/500  working → shimmer-text 1.4s linear infinite
│  │                  settled → text-ink-2 + fade-in 350ms ease-out both
│  └─ svg 14×14 chevron  stroke var(--ink-3) sw 2.2  transition-transform duration-300  rotate(180deg)
└─ div.grid  transition-[grid-template-rows,opacity] duration-400  cubic-bezier(0.23,1,0.32,1)
   │         gridTemplateRows: expanded ? 1fr : 0fr ; opacity: 1 : 0
   └─ div.overflow-hidden
      └─ div.relative.mt-1.ml-[5px].pl-4
         ├─ span[aria-hidden].absolute.left-[3px].w-px.bg-line
         │     top: -8px ; height: lineHeight ? lineHeight - 2 : 0
         │     transition: height 500ms cubic-bezier(0.23,1,0.32,1)      ← JS 测出来的高度
         └─ div[ref=traceRef].flex.flex-col.gap-1.py-1
            ├─ (Search) query 行  flex h-6 items-center gap-2 px-1.5
            │     放大镜 14×14 + span 12.5px text-ink-2
            │     animation: fade-up 300ms cubic-bezier(0.23,1,0.32,1) both（仅 expanded 时）
            └─ 行 × visible
                  容器 class: flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left
                  animation: fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i*120}ms both
                  Search → <a target=_blank rel=noreferrer> + hover:bg-hover
                  Coding → <button aria-pressed> + (selected ? bg-inset : hover:bg-hover)
                  其他   → <div>
```

**行内元素细节**：

- Steps 图标：`i < visible - 1 || !working` → 14×14 勾（`M20 6L9 17l-5-5`，sw 2.5，stroke `var(--ink-3)`）；否则 → `span.size-3.rounded-full.border-[1.5px].border-line-strong.border-t-ink-2` + `animation: spin 700ms linear infinite`（**CSS 边框转圈，不是 svg**）
- Search 圆点：`flex size-3.5 shrink-0 items-center justify-center rounded-full text-white`，tone 按 `TONES[i % 3] = ["bg-accent","bg-orange","bg-green"]` 循环；内嵌 9×9 地球线稿
- primary：`min-w-0 truncate text-[12.5px]`；Reasoning 覆写为 `whitespace-normal leading-relaxed text-ink-2`，其余 `font-medium text-ink`
  - ⚠️ Reasoning 同时带 `truncate` 和 `whitespace-normal`：`white-space` 被覆盖，但 `overflow:hidden`/`text-overflow:ellipsis` 仍在。移植时按「多行不截断」处理即可
- secondary：`shrink-0 text-[11.5px] text-ink-3` + `font-mono`（`mono: true` 时）
- add/del：`shrink-0 font-mono text-[11px] tabular-nums`，`+74`（`text-green`）+ 空格 + `−41`（`text-red`，**U+2212**）
- `+7 more`（Search 且 `stage >= 3`）：`text-[12px] text-ink-3` + `fade-in 300ms ease-out both`

**token**：`--ink`、`--ink-2`、`--ink-3`、`--line`、`--line-strong`、`--hover`、`--hover-2`、`--inset`、`--accent`、`--orange`、`--green`、`--red`、`--ease-link`（`animated-underline` 的 `.28s`）。

### 2.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxChainOfThought` | **头部语法高度重叠** | 头部（图标 + shimmer 标签 + chevron + `0fr/1fr` 折叠）几乎一样；`userOpen`/`userOverride` 的「用户意志接管自动展开」逻辑与 BUI 的 `manualExpanded ?? autoExpanded` **是同一设计**。<br>差异：数据模型是 `AiChainStep{id,kind:'thinking'|'tool',title,body,status,durationMs}`，一行一个可滚动的 markdown body（marked + DOMPurify）；BUI 是单行 + secondary + 差分计数 + 链接，**没有 body**。视觉上 CoT 是竖向 stepper（bullet 16px 圆 + `::before` 连线），BUI 是紧凑行列表 |
| `TxReasoningDisclosure` | 头部语法重叠 | 单段纯文本 + `durationMs` + `durationFormatter`，正好覆盖 BUI 的 `Reasoning` variant 的**语义**，但视觉是 `border-left: 2px` 引用块而非导轨 + 行 |
| `TxSources` | 覆盖 Search variant 的一半 | `AiSourceItem{id,url,title,favicon}` + `open` 事件（**链接从不自行导航**，由宿主决定）+ favicon 失败兜底 + `domainOf()`。BUI 的 Search 行用彩色圆点代替 favicon，且是真 `<a target=_blank>` |
| `TxSteps`/`TxStep` | 名义重叠，实际无关 | 传统横/竖向表单步骤条（`provide('steps')` + `registerStep`），不是 AI 轨迹 |
| `TxToolCallCard` | 覆盖 Coding variant 的一半 | 单个工具调用的卡片（pending/running/done/error + logs + result 插槽 + retry），BUI 的 Coding 是**多个工具的一行一条紧凑列表** |
| `TxTimeline` | 弱 | 通用时间线 |

### 2.3 融合建议：**(a) 新增组件 `TxAgentTrace`**

**理由**：
- 重叠集中在**头部 + 折叠语法**，而这套语法在 tuffex 里**已经被复制了 4 遍**（`chain-of-thought` / `reasoning-disclosure` / `sources` / `tool-call-card`，全是 `grid-template-rows: 0fr` + `0.26s cubic-bezier(0.4,0,0.2,1)`）。再复制第 5 遍不增加债务的量级，而把它抽成公共**组件**要改这 4 个组件的 class 契约 —— PRD R2 明确「不允许破坏现有组件 API」，且这些 class 名被各自的 `__tests__` 断言。
- 行的数据模型（`primary`/`secondary`/`mono`/`add`/`del`/`href` + 四种行为形态）与 `AiChainStep` 不兼容。把 `href`、`add`、`del` 塞进 `AiChainStep` 会污染 `ai-elements` 的公共类型，而它被 `TxChainOfThought` 和潜在的 conversation 链路共用。
- 四个 variant 里只有 `Reasoning` 能被既有组件覆盖，其余三个都需要新结构。

**同时建议**（不属于本组件，但设计时要一并定）：把头部 + 折叠 + shimmer 抽成 **SCSS mixin**（`disclosure-collapse`、`shimmer-text-surface`/`shimmer-text-keyframes`），新组件用 mixin，既有 4 个组件**暂不改**。mixin 不产生任何 class 名，因此零 API 风险。

**备选**：
- (b) `TxChainOfThought` 加 `variant` —— 需要扩 `AiChainStep`，污染共享类型，且 CoT 的 stepper 视觉与 BUI 的紧凑行是两套版式。不推荐。
- (c) 组合 `TxReasoningDisclosure` + `TxSources` + `TxToolCallCard` —— 三个组件的头部会各画一遍，视觉不统一，且拼不出统一的导轨。不推荐。

**命名核对**：`TxAgentTrace` 未占用。备选：`TxThinkingTrace`、`TxReasoningTrace`。选 `TxAgentTrace` 因为它涵盖了 search / coding 这两个非「thinking」的 variant。

### 2.4 Vue port API 草案

```ts
// types.ts
export type AgentTraceVariant = 'steps' | 'reasoning' | 'search' | 'coding'
export type AgentTraceRowStatus = 'pending' | 'active' | 'done' | 'error'

export interface AgentTraceRow {
  id: string
  /** Primary text: step name, prose sentence, site title, or tool name. */
  primary: string
  /** Right-hand detail: count, domain, file path, command. */
  secondary?: string
  /** Renders `secondary` in the mono face — file paths and commands. */
  mono?: boolean
  /** Diff counters shown as `+N −M` (U+2212). */
  added?: number
  removed?: number
  /** Makes the row a link. Navigation stays the host's call via `@open`. */
  href?: string
  /** Drives the check-vs-spinner glyph in the `steps` variant. */
  status?: AgentTraceRowStatus
}

export interface AgentTraceProps {
  variant?: AgentTraceVariant          // @default 'steps'
  rows: AgentTraceRow[]
  /** `search`: the query echoed above the results. */
  query?: string
  /** True while the trace is still running — drives shimmer + spinner. */
  working?: boolean
  /** Header text while working. @default per-variant ('Thinking' / 'Searching the web' / …) */
  activeLabel?: string
  /** Header text once settled. @default per-variant ('Thought for …' / 'Searched the web' / …) */
  doneLabel?: string
  /** Trailing overflow note, e.g. '+7 more'. */
  moreLabel?: string
  /** Initial open state before any user interaction. @default true while working */
  defaultOpen?: boolean
  /**
   * Host-held override, mirroring TxChainOfThought's `userOpen`: a streaming
   * host that remounts this component would otherwise lose the reader's choice.
   */
  userOpen?: boolean
  /** `coding`: the currently selected row id (aria-pressed). */
  selectedId?: string
}
```

```ts
const emit = defineEmits<{
  toggle: [open: boolean]
  /** `search`: the host opens the URL — the component never navigates on its own. */
  open: [row: AgentTraceRow]
  /** `coding`: null when the row is deselected. */
  select: [id: string | null]
}>()

defineSlots<{
  icon?: (props: { working: boolean }) => any
  row?: (props: { row: AgentTraceRow, index: number }) => any
  label?: (props: { working: boolean }) => any
}>()
```

- variant 到实现的映射：全部走同一个 `<ul>`，用 `data-variant` 在 SCSS 里切换行的 element 形态与排版（`reasoning` → `white-space: normal` + `line-height: 1.6`；`search` → 圆点 + underline；`coding` → mono secondary + 差分）。行的**标签**（`<a>` / `<button>` / `<li>`）用 `<component :is="…">` 按 variant 决定。
- `@open` 的设计直接抄 `TxSources` 的既有约定（`event.preventDefault()` + emit），这是 tuffex 里已经确立的「链接不自行导航」规则，Electron 环境下尤其重要。
- 无 `expose`。

### 2.5 移植风险

| React 写法 | 风险 | Vue 对应 |
|---|---|---|
| `useLayoutEffect` 测 `traceRef.current.offsetHeight` 驱动导轨高度 + 500ms 过渡 | 最大的一处 React-only 编排。Vue 里 `watch(..., {flush:'post'})` 能跑，但依赖 `[visible, expanded, variant, stage]` 四个源，而且折叠动画期间 `offsetHeight` 是中间值 | **首选纯 CSS**：导轨改成轨迹容器的 `::before`，`position:absolute; top:-8px; bottom:2px; left:3px; width:1px`，完全不需要测量。代价是失去那 500ms 的高度补间（视觉上折叠动画本身已经在裁剪它，肉眼几乎无差）。若设计坚持要补间，再退回 `ResizeObserver` + `flush:'post'` |
| `useSequence(STAGES)` 定时推进 | **这是 demo 编排，不是组件能力**。做进组件会让宿主无法用真实数据驱动 | 组件只吃 `rows` + `working`；自动播放放到 nexus demo 包装层（见 §6） |
| `key={variant}` 强制重挂载 | Vue 同样支持 `:key`，但组件化后 variant 切换应当是平滑的 | 用 `watch(() => props.variant, () => { selected = null })` 重置局部态即可，不必重挂载 |
| `manualExpanded ?? autoExpanded` 三态 | `null` / `true` / `false` 三态在 Vue 里同样可行 | 直接照抄 `TxChainOfThought` 的 `props.userOpen ?? userOverride.value ?? fallback`（`TxChainOfThought.vue:47-54`），那里已经把这个模式和它的理由写成注释了 |
| 每行 inline `animationDelay: i*120ms` | Vue 里 `:style` 可以，但 reduced-motion 覆盖会打架 | `:style="{ '--tx-agent-trace-index': i }"` + SCSS `animation-delay: calc(var(--tx-agent-trace-index) * 120ms)`，reduced-motion 里一条 `animation: none` 全灭 |
| `animated-underline` 用 `:after` + `scaleX` + `var(--ease-link)` | tuffex 无此工具类 | 组件私有 SCSS，`transition: transform .28s cubic-bezier(.16,1,.3,1)` |
| `target="_blank" rel="noreferrer"` | Electron 渲染进程里直接开新窗口是安全问题 | 走 `@open` 事件，不渲染真实 `href` 导航（`TxSources` 已是这个做法） |

---

## 3. 06-task-rows.tsx — agent 任务状态行

### 3.1 做什么 + 完整清单

三行「agent 任务」列表，每行：状态徽章 + 标题 + 数量 + 状态药丸 + chevron，点开有明细子行。两个 variant 只改容器与圆角，行内结构完全一样。

**Props**：`variant?: string`（`"Capsules"` 默认 / `"List"`）。同样**无数据 prop**。

**时序**（`TICKS = [600, 900, 2400, 1400, 2400, 600]`，累计 600 / 1500 / 3900 / 5300 / 7700ms；末位 `600` 死数据）。头注释与代码一致：

- 0ms 行依次入场（80ms 间隔）
- 1500ms（tick=2）第二行自动展开
- 3900ms（tick=3）收起 + 第三行翻 Failed
- 5300ms（tick=4）第三行 → Completed

`row2 = tick < 3 ? 'pending' : tick === 3 ? 'failed' : 'done'`；`open = manualOpen[key] ?? (key === 'index' && tick === 2)`。

**`SpinnerRing` 精确参数**（28-50 行）：

```
size=24, stroke=2, r=(24-2)/2=11, c=2πr=69.115
<svg 24×24 absolute inset-0>  active 时 animation: spin 1.1s linear infinite
  <circle r=11 fill=none stroke=var(--line) stroke-width=2/>            ← 轨道
  {active && <circle r=11 stroke=var(--ink-3) stroke-width=2
                     stroke-linecap=round
                     stroke-dasharray="19.35 49.76"/>}                  ← c*0.28 / c*0.72
</svg>
<span class="relative text-[10.5px] font-semibold tabular-nums text-ink">{children}</span>
```

> ⚠️ **源码与注释不符**：头注释写「600ms 行 1 的环从 0 扫到 66%」，但代码里 dasharray 是**固定 28%**，只有整圈旋转，没有任何扫掠动画。移植时以代码为准（固定 28% 弧 + 旋转），不要去实现一个不存在的 sweep。

**`Badge`**：`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white` + `bg-red`/`bg-green` + `animation: pop-in 300ms cubic-bezier(0.23,1,0.32,1) both`。内嵌 12–13px 线稿图标（X / 勾）。

**药丸**：`inline-flex h-5.5 items-center rounded-full px-2 text-[11.5px] font-medium`

- Completed → `bg-green-tint` + `text-green`
- Failed → `bg-red-tint` + `text-red` + `gap-1.5` + 12×12 重试图标（`animation: spin 1.2s linear infinite`）
- 两者切换时带 `animation: fade-in 200ms ease-out both`

**容器与行**：

```
Capsules: flex w-full max-w-110 flex-col min-h-[196px] gap-2      ← 440px
List:     flex w-full max-w-110 flex-col gap-0 self-start
          overflow-hidden rounded-card bg-surface shadow-card

行外壳 div: self-stretch overflow-hidden transition-[border-radius] duration-300
   List     → border-b border-line last:border-0
   Capsules → bg-surface shadow-card
   borderRadius: list ? 0 : (open ? 14 : 22)      ← 胶囊展开时「变方」，这是签名动作
   animation: fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i*80}ms both

头部 button[aria-expanded]: flex h-11 w-full items-center gap-2.5 px-2.5
                            text-left transition-colors duration-100 hover:bg-inset
  ├─ span.flex.size-6  ← 徽章槽
  ├─ span.min-w-0.flex-1.truncate.text-[13px].font-medium.text-ink
  ├─ span.text-[12.5px].text-ink-2.tabular-nums      ← amount
  ├─ {pill}
  └─ span[aria-hidden].-ml-2.flex.size-7.rounded-full.text-ink-3
        └─ svg 15×15 chevron  transition-transform duration-300  rotate(180deg)

折叠区: grid transition-[grid-template-rows,opacity] duration-300  cubic-bezier(0.23,1,0.32,1)
  └─ div.overflow-hidden
     └─ div.mb-2.5.grid.grid-cols-[24px_1fr].gap-2.5.px-2.5
        ├─ span[aria-hidden].mx-auto.h-full.w-px.bg-line      ← 导轨（纯 CSS，无测量）
        └─ div.flex.flex-col.gap-1.5
           └─ div.flex.items-center.justify-between × N
                 animation: fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j*100}ms both
                 label  text-[12px] text-ink-2
                 meta   font-mono text-[11.5px] text-ink-3 tabular-nums
```

**token**：`--line`、`--ink`、`--ink-2`、`--ink-3`、`--surface`、`--inset`、`--green`/`--green-tint`、`--red`/`--red-tint`、`--shadow-card`。

### 3.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxToolCallCard` | **结构最像** | 同样是 header button（`aria-expanded`/`aria-controls`）+ `0fr/1fr` 折叠 + 状态药丸（`padding:2px 8px; border-radius:999px` + `color-mix` 底色）+ chevron rotate + `data-status` 驱动配色 + retry。<br>差异：**单卡片**（`toolCall: AiToolCallPart` 单个对象），没有列表/stagger/圆角形变；展开区是 input/logs/result/error 四段而非 label-meta 明细行；没有环形进度徽章 |
| `TxAgentsList` / `TxAgentItem` | 弱 | 分组的 agent 选择列表（`selected`/`disabled`/`badgeText`），不是任务状态 |
| `TxSteps` | 弱 | 表单步骤条 |
| `TxTimeline` | 弱 | `TimelineItemProps{title,time,icon,color,active}`，视觉是时间线不是行卡 |
| `TxStatusBadge` | 药丸部分重叠 | `StatusTone = 'success'|'warning'|'danger'|'info'|'muted'` + `color-mix(12%)` 底 + 32% 边 + icon。BUI 的药丸**无边框**、纯 `-tint` 底、`border-radius: 999px`、`h-5.5`。可复用 tone 语义，视觉要另做 |
| `TxProgressBar` | 弱 | 线性进度 |

### 3.3 融合建议：**(a) 新增组件 `TxTaskRows`（+ 内部 `TxTaskRow`）**

**理由**：
- `TxToolCallCard` 的契约是「一次工具调用的卡片」，数据模型钉死在 `AiToolCallPart`（`type:'tool-call'` 字面量 + `input`/`output`/`logs`/`submitted`）。任务行的模型是 `label + amount + status + details[]`，硬套会让 `AiToolCallPart` 长出 `amount`/`details`/`progressIndex` 三个与工具调用无关的字段，而这个类型在 `ai-elements` 里是公共导出。
- BUI 版有三个 `TxToolCallCard` 没有的东西：列表级 stagger 入场、`22px → 14px` 的展开圆角形变、环形序号进度徽章。这三个都是「多行」语义的产物。
- `Capsules` / `List` 两个 variant 是容器级差异（独立卡片 vs 单卡内分隔行），天然需要一个列表组件持有。

**备选**：
- (b) `TxToolCallCard` 加 `variant` + 外面套 `TxToolCallList` —— 等于把新组件塞进旧文件，且要改 `AiToolCallPart`。不推荐。
- (c) 用 `TxCollapse` + `TxStatusBadge` + `TxSpinner` 组合 —— `TxCollapse` 的折叠时长/缓动与 BUI 不同，`TxStatusBadge` 带边框，`TxSpinner` 不支持环内数字。三处都要覆盖样式，最后等于重写。不推荐。

**命名核对**：`TxTaskRows` / `TxTaskRow` 均未占用。复数组件名在 tuffex 有先例（`TxSources`、`TxSteps`、`TxTabs`、`TxAgentsList`）。备选：`TxTaskList`（但与 `TxAgentsList` 的「可选列表」语义容易混）。

### 3.4 Vue port API 草案

```ts
// types.ts
export type TaskRowStatus = 'pending' | 'running' | 'done' | 'failed'
export type TaskRowsVariant = 'capsules' | 'list'

export interface TaskRowDetail {
  label: string
  /** Rendered mono + tabular — counts, ratios, file totals. */
  meta?: string
}

export interface TaskRowItem {
  id: string
  label: string
  status: TaskRowStatus
  /** Right-aligned quantity, e.g. '12 suppliers'. */
  amount?: string
  /** Number shown inside the progress ring while pending/running. */
  index?: number
  /** Overrides the default status text in the pill. */
  statusText?: string
  details?: TaskRowDetail[]
  /** Offers a retry affordance on a failed row. @default true when failed */
  retryable?: boolean
}

export interface TaskRowsProps {
  rows: TaskRowItem[]
  variant?: TaskRowsVariant            // @default 'capsules'
  /** Ids of rows to open initially. */
  defaultOpenIds?: string[]
  /** Fully controlled open set; omit to let the component own it. */
  openIds?: string[]
  /** Pill text per status. English defaults, no i18n. */
  doneText?: string                    // @default 'Completed'
  failedText?: string                  // @default 'Failed'
  runningText?: string                 // @default 'Running'
  pendingText?: string                 // @default 'Queued'
}
```

```ts
const emit = defineEmits<{
  toggle: [id: string, open: boolean]
  'update:openIds': [ids: string[]]
  retry: [id: string]
}>()

defineSlots<{
  badge?: (props: { row: TaskRowItem }) => any
  detail?: (props: { row: TaskRowItem, detail: TaskRowDetail }) => any
  trailing?: (props: { row: TaskRowItem }) => any
}>()
```

- `status` 用 tuffex 既有的 `'pending' | 'running' | 'done' | 'error'` 命名会更一致（`AiToolCallPart.status` 就是这四个）。上表写了 `failed` 是为了对齐 BUI 文案；**建议最终采用 `'error'` 与 tuffex 对齐**，把 `Failed` 只作为默认文案，设计时定。
- `openIds` + `update:openIds` 的受控/非受控双模，对齐 tuffex 里 `TxChainOfThought.userOpen` 的思路。
- 圆角形变（22 ↔ 14）用 `transition: border-radius .3s` + `.is-open` class，不用 inline style。

### 3.5 移植风险

| React 写法 | 风险 | Vue 对应 |
|---|---|---|
| `useTick(TICKS)` 驱动 row2 的 pending→failed→done | demo 编排 | 组件只吃 `rows[].status`；自动剧本放 demo 层 |
| `manualOpen: Record<string, boolean>` + `?? (key === 'index' && tick === 2)` | 「自动展开某行」是 demo 逻辑 | `defaultOpenIds` prop |
| `borderRadius: open ? 14 : 22` inline | 与 `transition-[border-radius]` 配合正常，但 inline 优先级最高 | `.tx-task-row { border-radius: 22px; &.is-open { border-radius: 14px } }` |
| `SpinnerRing` 用 JS 算 `c = 2πr` 后拼 `strokeDasharray` | Vue 里可以 `computed`，但 24px 是写死的 | 常量化：`r=11`，`dasharray="19.35 49.76"`（`pathLength` 也可用 `pathLength="100"` + `"28 72"` 让尺寸可变时不用重算） |
| `Badge` 每次状态变化重挂载触发 `pop-in` | React 靠元素身份变化重放动画 | Vue 里 `<Transition>` 或对 badge 加 `:key="row.status"` 强制重建以重放 `pop-in` —— 否则状态切换时动画不会重放（这是最容易在移植中丢失的一处） |
| 药丸 `fade-in 200ms both` | 同上，靠身份变化 | 同上，`:key="row.status"` |
| 明细行 `animationDelay: 120 + j*100` | inline | CSS 变量 + `calc()` |
| `shadow-card` | tuffex 无对应 | 组件私有 `--tx-task-rows-shadow: 0 0 0 1px var(--tx-border-color-light), 0 1px 2px rgb(16 24 40 / 4%), 0 2px 6px rgb(16 24 40 / 3%)`，暗色下换成 `rgb(0 0 0 / 20%)` 系（BUI dark 是 `#0003`） |
| `aria-hidden` 的 chevron 在 button 内 | 正确做法，保留 | 保留；另外 tuffex 惯例是 `aria-controls` 指向折叠区（`useId()`），BUI 没写，**移植时补上** |

---

## 4. 17-code-block.tsx — 逐行流式代码块

### 4.1 做什么 + 完整清单

一个带文件名头部与复制按钮的代码块，代码按行逐条淡入，循环播放。

**Props**：**无**。所有内容（`LINES`、`RAW`、语言名、文件名）都是模块常量。

**时序**：`LINE_MS = 240`，`HOLD_MS = 3200`。`count === 0` 时等 400ms 起播，之后每 240ms 加一行；`count >= LINES.length`（`done`）后等 3200ms 归零重播 —— **无限循环**。

**token 模型**（13-30 行）：

```ts
type Tok = { t: string; c?: "kw" | "str" | "num" | "fn" | "dim" }
const COLORS = {
  kw:  "var(--accent-ink)",   // 关键字
  str: "var(--green)",        // 字符串
  num: "var(--orange)",       // 数字（LINES 里实际未用到）
  fn:  "var(--ink)",          // 函数名
  dim: "var(--ink-3)",        // 标点/括号
}
// 未标 c 的 token → var(--ink-2)
```

**DOM 结构 + 精确样式**：

```
div.w-full.max-w-95.overflow-hidden.rounded-card.bg-surface.shadow-card    ← 380px / 10px
├─ div.primitive-card-bar.flex.items-center.justify-between.border-b.border-line
│      primitive-card-bar = padding: 10px 12px
│  ├─ span.flex.items-baseline.gap-2
│  │  ├─ span.font-mono.text-[12px].font-medium.text-ink        "churn.ts"
│  │  └─ span.text-[11.5px].text-ink-3                          "TypeScript"
│  └─ button[aria-label="Copy code"]
│        flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px]
│        font-medium transition-colors duration-100 hover:bg-hover
│        copied ? "text-green" : "text-ink-3 hover:text-ink"
│        svg 10×10（勾 / 复制图标）+ 文案 "Copied" / "Copy"
└─ pre.min-h-[137px].bg-inset.px-3.py-2.5.font-mono.text-[11.5px].leading-[1.7]
   └─ div.flex × count      animation: fade-up 250ms cubic-bezier(0.23,1,0.32,1) both
      ├─ span.w-5.shrink-0.text-right.text-[10.5px].leading-[1.86].text-ink-3/60.select-none
      │      ← 行号；leading 1.86 与外层 1.7 不同，是为了对齐基线
      └─ span.pl-2.5.whitespace-pre
         ├─ span × tokens   style={{ color: COLORS[tok.c] ?? "var(--ink-2)" }}
         └─ (最后一行且未完成) span.ml-0.5.inline-block.h-3.w-[3px]
                               .translate-y-0.5.rounded-full.bg-accent   ← 静止光标
```

**复制**：`navigator.clipboard.writeText(RAW)` → `copied = true` → 1500ms 后复位。无降级路径。

**token**：`--surface`、`--inset`、`--line`、`--ink`、`--ink-2`、`--ink-3`、`--accent`、`--accent-ink`、`--green`、`--orange`、`--shadow-card`。

**动效**：只有 `fade-up 250ms`。

### 4.2 重叠判定

| tuffex 组件 | 重叠 | 差异 |
|---|---|---|
| `TxCodeBlock`（`stream-markdown/`）| **名字被占 + 功能大面积重叠** | 已有 `lang`/`code`/`closed`/`streaming`/`theme`/`previewable` + shiki 高亮（`highlightToHtml`，开放 fence 每 120ms 增量重着色）+ `TxCopyButton` + html/svg/xml 的 sandbox 预览。<br>差异：**无文件名、无行号、无逐行显现、无光标**；它的 `streaming` 控制的是**高亮节流频率**而非显现进度；它是 `TxStreamMarkdown` 渲染每个 fence 的内部件（改它 = 影响 app 里每条聊天消息） |
| `TxCopyButton` | 完全覆盖复制部分 | `text`/`copyLabel`/`copiedLabel`/`timeout`/`size` + **`document.execCommand` 降级**（BUI 版没有）+ `copy`/`error` 事件。**直接复用** |
| `TxCodeEditor` | 弱 | CodeMirror 编辑器（`modelValue`/`language`/`lint`/`completion`），是编辑不是展示 |
| `TxStreamMarkdown` | 上游 | 整篇 markdown 流式渲染 |

### 4.3 融合建议：**(a) 新增组件 `TxCodeStream`**

**理由**：
- `TxCodeBlock` 名字已被占用（`stream-markdown/src/TxCodeBlock.vue`），且它是 `TxStreamMarkdown` 每个 fence 的渲染件 —— 给它加 `filename` / `lineNumbers` / `revealedLines` / 光标四组能力，会让一个被全应用聊天流消费的组件的 prop 面从 9 涨到 14，任何回归直接打到每条消息。风险收益比不划算。
- 两者的契约本就不同：`TxCodeBlock` = 「渲染一段 markdown 围栏」；`TxCodeStream` = 「让 agent 写的代码带文件名头部逐行显现」。
- **但必须复用**：`TxCopyButton`（含 execCommand 降级）与 `shiki-runtime.ts` 的 `highlightToHtml`。

**关键设计决定**：**不要照抄 BUI 的 `Tok[][]` 手工 token 模型**。那是 demo 为了免依赖手写的假高亮（连 `num` 颜色都没用上）。真组件应当吃 `code: string` + `lang: string`，走已有的 shiki 运行时；`revealedLines` 控制显现到第几行。这样既保住视觉，又不引入一个宿主必须手工分词的畸形 API。

**备选**：
- (b) `TxCodeBlock` 加 `filename` + `revealedLines` —— 少一个组件，但如上，爆炸半径覆盖全部聊天消息。若设计最终选它，必须先给 `TxCodeBlock` 补齐回归测试。
- (c) `TxCodeEditor` readOnly 模式 —— CodeMirror 太重，且没有逐行显现语义。不推荐。

**命名核对**：`TxCodeStream` 未占用（现有的是 `TxCodeBlock`、`TxCodeEditor`、`TxCodeEditorRuntime`、`TxCodeEditorToolbar`）。备选：`TxStreamingCode`、`TxAgentCodeBlock`。

### 4.4 Vue port API 草案

```ts
// types.ts
export interface CodeStreamProps {
  code: string
  /** Shiki language id; empty renders unhighlighted. */
  lang?: string
  /** Header filename, mono. Omit to hide the whole header. */
  filename?: string
  /** Human language label beside the filename, e.g. 'TypeScript'. */
  langLabel?: string
  /**
   * How many lines are revealed. Omit (or -1) to show everything —
   * the host owns the reveal cadence, the component owns the transition.
   */
  revealedLines?: number
  /** Draws the accent caret at the end of the last revealed line. @default true while revealing */
  caret?: boolean
  lineNumbers?: boolean        // @default true
  theme?: 'light' | 'dark'     // mirrors TxCodeBlock's prop
  copyable?: boolean           // @default true
  copyLabel?: string           // @default 'Copy'
  copiedLabel?: string         // @default 'Copied'
}
```

```ts
const emit = defineEmits<{
  copy: [code: string]
  /** Fires once revealedLines reaches the last line. */
  complete: []
}>()

defineSlots<{
  /** Replaces the filename/label pair. */
  header?: () => any
  /** Extra chrome beside the copy button. */
  actions?: () => any
}>()
```

- 复制按钮直接 `<TxCopyButton :text="code" size="sm" />`，不重写。
- 高亮按 `TxCodeBlock` 的既有做法：`highlightToHtml(code, lang, theme)` 异步增强，未就绪时渲染转义纯文本（BUI 的手工 token 模型不移植）。
- 逐行显现的实现：先整体高亮，再按 `\n` 切成行数组，`v-for` 到 `revealedLines`。shiki 输出是逐行 `<span class="line">` 的结构，切分是安全的；若为简化，也可只对纯文本模式做行切分，高亮模式用 `max-height` 裁剪 —— 设计时二选一。
- **`v-html` 注意**：`TxCodeBlock` 现有注释已说明 shiki 输出里代码文本是转义过的；沿用同一保证，不要把未经 shiki 的用户代码丢进 `v-html`。

### 4.5 移植风险

| React 写法 | 风险 | Vue 对应 |
|---|---|---|
| `useEffect` 自驱动 `count` 循环播放（400 / 240 / 3200ms） | demo 编排，组件不该自播 | `revealedLines` 由宿主给；循环 demo 放 nexus 包装层 |
| `Tok[][]` 手写 token | 宿主无法使用 | 换 shiki（见上） |
| `navigator.clipboard.writeText` 无降级 | 非安全上下文 / Electron 里可能不可用 | `TxCopyButton` 已有 `document.execCommand` 兜底，复用即可 |
| 行号 `leading-[1.86]` vs 外层 `leading-[1.7]` | 看似笔误，其实是让 10.5px 行号与 11.5px 代码基线对齐（10.5×1.86 ≈ 11.5×1.7 ≈ 19.5px）。改任一边都会错位 | 原样保留，并在 SCSS 里写明为什么 |
| 光标是**静止**的 `bg-accent` 条 | 极易被「顺手加个 blink」破坏 | 不加动画。若设计要闪，走 `caret-blink 1s step-end infinite` 且必须带 reduced-motion 关闭（BUI 全站唯一一条组件级 reduced-motion 规则就是给 `.stream-caret` 的） |
| `min-h-[137px]` | 是为了让循环重播时容器不塌陷 | 组件里应改成 `min-height` 可配置或由 `revealedLines` 的最大值决定，写死 137px 对任意长度代码没有意义 |
| `fade-up` 每行都跑 | 已显现的行在 `revealedLines` 增加时会因 key 稳定而不重放，正确 | 用行索引作 `:key`，只让新行入场 |

---

## 5. 融合决策速查表

| BUI | 决策 | tuffex 组件名 | 目录 | 关键复用 |
|---|---|---|---|---|
| 01 Loading State | (a) 新增 | `TxWorkingIndicator` | `working-indicator/` | 新 `use-elapsed` composable；shimmer mixin |
| 02 Thinking | (a) 新增 | `TxAgentTrace` | `agent-trace/` | `TxSources` 的 `@open` 约定；`TxChainOfThought` 的 `userOpen` 三态模式；disclosure + shimmer mixin |
| 06 Task Rows | (a) 新增 | `TxTaskRows` (+ 内部 `TxTaskRow`) | `task-rows/` | `AiToolCallPart` 的 status 词汇；disclosure mixin |
| 17 Code Block | (a) 新增 | `TxCodeStream` | `code-stream/` | `TxCopyButton`、`stream-markdown/src/shiki-runtime.ts` |

**四个都选 (a) 的共同原因**：重叠集中在**披露语法与头部**这一层横切关注点，而它在 tuffex 已被复制 4 遍且各自的 class 名被测试锁定。把共享做在 **SCSS mixin** 层（零 class 变更、零 API 风险），把差异做成新组件，比改造既有组件的公共类型（`AiChainStep` / `AiToolCallPart`）安全得多。

**建议新增的 SCSS mixin**（放 `packages/tuffex/packages/components/style/mixins.scss`，紧邻既有的 `skeleton-keyframes` / `skeleton-surface`）：

| mixin | 内容 | 用于 |
|---|---|---|
| `shimmer-text-keyframes` / `shimmer-text-surface($duration: 1.4s)` | 90° 三段渐变 + `background-clip:text` + `200% 100%` + reduced-motion | 01、02 |
| `fade-up-keyframes` / `fade-up-in($duration, $delay)` | `translateY(8px)` + opacity + `cubic-bezier(.23,1,.32,1)` + reduced-motion | 02、06、17 |
| `disclosure-collapse($duration: .3s)` | `grid` + `0fr/1fr` + 内层 `overflow:hidden` + reduced-motion | 02、06 |
| `pop-in-keyframes` / `pop-in` | `scale(.95)` + opacity | 06 |
| `hairline-card-shadow` | `0 0 0 1px line, 0 1px 2px …, 0 2px 6px …`（明暗两套） | 06、17 |

> ⚠️ **必须做成 mixin 而不是全局 CSS**。`mixins.scss:126-130` 已明确记录理由：消费者按子路径导入组件、只拿到该组件的 CSS，全局定义的 keyframes 对不加载 `base.css` 的人就是未定义。所有新 keyframes 都要走「组件内 emit 一次 + 逐元素 apply」的既有范式。

---

## 6. 贯穿四个组件的最大 API 设计决定：**demo 编排不进组件**

四个源码全部是**自驱动 demo**：内容是模块常量，时间轴是 `useEffect` + `setTimeout`/`setInterval`，没有一个数据 prop（01 只有 `label`/`variant`，02/06 只有 `variant`，17 什么都没有）。

如果照搬，得到的是四个「只会播固定动画的装饰品」，宿主无法用真实 agent 数据驱动 —— 直接违背 PRD R2「与现有组件融合、不无脑重复造轮子」。

**建议的分层**：

| 层 | 归属 | 职责 |
|---|---|---|
| tuffex 组件 | `packages/tuffex/.../*/src/*.vue` | 纯受控：吃 `rows` / `status` / `revealedLines` / `working`，负责视觉与过渡 |
| demo 包装 | nexus `content/**/demos/*.vue` | 持有 `STAGES`/`TICKS`/`LINE_MS` 时间轴，用 `setTimeout` 推进状态后喂给组件 |

这样 nexus 文档里能 1:1 复刻 shots/ 的动态观感（AC2 的视觉验收基准），同时 tuffex 里留下的是可用的原语。

时间轴常量（照抄源码，供 demo 层使用）：

- 01：`useElapsed` 100ms tick；`Drive/Dots` 650ms、`Orbit` 950ms
- 02：`STAGES = [800, 600, 1800, 2600, 1600]`（末位死数据）
- 06：`TICKS = [600, 900, 2400, 1400, 2400, 600]`（末位死数据）
- 17：起播 400ms、每行 240ms、结尾停 3200ms 后归零

---

## 7. 移植时**已知会丢**的东西（需要设计明确取舍）

1. **02 导轨的 500ms 高度补间** —— 若改纯 CSS `::before`（推荐），失去这段补间。折叠动画本身已在裁剪它，肉眼差异极小。
2. **06 的 `Badge` / 药丸重放动画** —— React 靠元素身份变化重放 `pop-in`/`fade-in`；Vue 需要显式 `:key="row.status"`。**不做就是静默丢失**，且只在状态切换时才看得出来。
3. **17 的手工 token 配色** —— 换成 shiki 后，`kw → --accent-ink`、`str → --green`、`dim → --ink-3` 这套 BUI 专属配色不会自动出现。若要像素级还原，需要一个自定义 shiki 主题把这五个 scope 映到对应 token；否则接受 shiki 默认主题的观感差异。**这是 AC2 的一个明确风险点**。
4. **BUI 的 `--shadow-card` 发丝阴影** —— tuffex 无对应 token，若只用 `--tx-box-shadow-lighter`（`0 0 6px rgba(0,0,0,.12)`）观感会明显不同（缺 1px 描边、模糊过大）。建议新增组件私有变量。
5. **`Inter` + `JetBrains Mono` 字面** —— tuffex `--tx-font-family` 已含 Inter；等宽字体 tuffex **没有 token**（`TxCodeBlock` 等直接靠继承）。17 与 02/06 的 mono 部分需要一个 `--tx-font-family-mono` 兜底链。

---

## Caveats / 未覆盖

- 只读了 shots 里 `dark-loading-state` / `light-thinking-state` / `light-task-rows` / `dark-code-block` 四张。另四张（对应的另一主题）未逐张比对；`light-task-rows` 截图捕捉的是 `tick >= 4` 的终态（两行 Completed + 一行 running），未见 Failed 态与展开态的视觉基准。
- `_global.css` 是压缩后的 Tailwind v4 产物，本报告中的类到样式的换算均已从中逐条核实，但不排除有未被这四个组件用到的 `@supports` 变体分支未展开。
- 未评估这四个组件与簇外组件（03 Streaming Text、05 Tool Chips、07 Chat）的重叠 —— 02 的 Coding variant 与 05 Tool Chips、17 与 03 都可能有交叠，属于其他 cluster 的研究范围。
- `TxTypingIndicator` 与 `TxSpinner` 缺少 reduced-motion 块是既有事实（已 grep 确认），本报告只记录，不建议在本任务中修改。
- 关于 `TaskRowStatus` 用 `'failed'` 还是 `'error'`：报告给出了倾向（`'error'`，与 `AiToolCallPart` 对齐）但未定案，留给 design.md。
