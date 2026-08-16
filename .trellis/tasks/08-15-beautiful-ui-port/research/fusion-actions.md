# Research: Beautiful UI → tuffex 融合分析（approval / actions 簇）

- **Query**: 04-approval-card / 05-tool-chips / 09-recommendation-card / 19-selection-actions 四个 BUI 组件的完整清单、与 tuffex 现有组件的重叠判定、融合方案、Vue API 草案与移植风险
- **Scope**: internal（BUI 源码 + tuffex 组件库 + 现有 spec）
- **Date**: 2026-08-15

---

## 0. 前置：四个组件共用的底座事实

### 0.1 BUI 全局 keyframes（`_global.css`，共 9 个；本簇用到 5 个）

```css
@keyframes fade-up   { 0%{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes fade-in   { 0%{opacity:0} to{opacity:1} }
@keyframes pop-in    { 0%{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
@keyframes spin      { to{transform:rotate(1turn)} }
@keyframes shimmer-text { 0%{background-position:150%} to{background-position:-50%} }  /* 19 的 <Shimmer> 用 */
```

主缓动只有两条：`cubic-bezier(0.23,1,0.32,1)`（几乎所有出场/宽度动画）和 `cubic-bezier(0.16,1,0.3,1)`（仅 09 的抽屉）。19 的定位位移单独用 `cubic-bezier(0.77,0,0.175,1)`。

### 0.2 BUI 的 primitive 工具类（`_global.css` 实测值）

```css
.primitive-card-pad     { padding: 12px }
.primitive-card-footer  { padding: 10px 12px }   /* 与 .primitive-card-bar/.primitive-table-cell 共用 */
.primitive-icon-button  { width:28px; height:28px; border-radius:var(--radius-control); display:inline-flex; align-items:center; justify-content:center }
.rounded-chip { border-radius: 6px }   /* --radius-chip */
.rounded-control { border-radius: 8px }/* --radius-control */
.rounded-card { border-radius: 10px }  /* --radius-card */
```

### 0.3 reduced-motion：**BUI 是全局一刀切，tuffex 是逐组件自守**

BUI 只有一条全局规则：

```css
@media (prefers-reduced-motion:reduce){ *,:after,:before{
  transition-duration:.01ms!important; animation-duration:.01ms!important; animation-iteration-count:1!important } }
```

tuffex 没有这条全局规则，现有组件都在各自 `<style>` 末尾写自己的守卫（`TxToolCallCard.vue:349-356`、`TxChainOfThought.vue:396-404`、`TxMessageActions.vue:266-274`）。**四个移植组件都必须自带 `@media (prefers-reduced-motion: reduce)` 块，否则 PRD 约束「动效尊重 prefers-reduced-motion」在移植后静默丢失**（源码里看不出来，因为源码依赖的是它自己的全局表）。

额外一条：19 的宽度动画是 **WAAPI（`element.animate()`）**，CSS 媒体查询管不到它，必须在 JS 里读 `matchMedia('(prefers-reduced-motion: reduce)').matches` 跳过。仓库已有这个写法可抄：`TxBaseAnchor.vue:105-106`（`motionQuery` / `reducedMotion`）、`TxFloating.vue:240-246`。

### 0.4 token 映射（BUI `:root`/`.dark` → tuffex `--tx-*`）

| BUI | 值(light/dark) | tuffex 最近对应 | 备注 |
|---|---|---|---|
| `--surface` | `#fff` / `#232427` | `--tx-fill-color-blank` / `--tx-bg-color` | 卡片面 |
| `--canvas` | `#f1f2f3` / `#1c1d1f` | `--tx-bg-color-page` | 反白文字底（`bg-ink text-canvas`） |
| `--inset` | `#f7f8f9` / `#1f2022` | `--tx-fill-color-lighter` | 09 抽屉/页脚的凹陷带 |
| `--hover` / `--hover-2` | `#f4f5f6` `#e7e9eb` / `#2a2b2e` `#313236` | 无 | 需 `color-mix(--tx-fill-color …)` |
| `--ink` / `--ink-2` / `--ink-3` | `#1f2124` `#62656b` `#9a9da3` | `--tx-text-color-primary` / `-secondary` / `-placeholder` | **色值不同**（tuffex light `-secondary:#374151` 比 BUI 深很多） |
| `--line` / `--line-strong` | `#ecedef` `#e0e2e5` | `--tx-border-color-extra-light` / `-lighter` | |
| `--field` | `#f2f2f3` / `#2b2c2f` | `--tx-fill-color-light` | 04 禁用态发送键底色 |
| `--accent` / `--accent-ink` / `--accent-tint` | `#0285ff` `#0170dd` `#e9f3ff` | `--tx-color-primary` / `-dark-2` / `-light-9` | |
| `--green` / `--orange` / `--red` (+ `-tint`) | `#189a4d` `#ef720c` `#e3474c` | `--tx-color-success` / `-warning` / `-danger` (+ `-light-9`) | |
| `--shadow-hairline` / `-btn` / `-card` / `-overlay` | 见 `_design-tokens.json:37-41` | **无对应** | tuffex 只有 `--tx-box-shadow-lighter/-light/-dark` |
| `--radius-chip/control/card` | 6/8/10 | **无对应** | tuffex 组件各自硬编码 8/12/999px |

**冲突点（要主会话裁决，不是我能定的）**：AC2 要求「与 shots 像素级一致」，R3 又要求「用 tuffex token 体系」。二者色值实测不同（例：`--ink-2` #62656b vs `--tx-text-color-secondary` #374151）。可行解是给这批组件一层**组件作用域的局部 token**（`.tx-approval-card{ --tx-bui-ink-2: …}` 之类），默认取 BUI 值、可被下游重指向；这样既满足 shots 基准，也满足 R3「不得全局污染现有组件样式」。

### 0.5 tuffex 侧已存在、本簇会直接复用的原语（重要，别重造）

| 能力 | 位置 | 与本簇的关系 |
|---|---|---|
| 浮层定位（floating-ui 封装） | `base-anchor/src/TxBaseAnchor.vue` + `types.ts` | 19 的锚定；**已支持 `virtualReference`**（`types.ts:81-84,101`，`TxBaseAnchor.vue:128`） |
| 宽度/高度形变（measure→WAAPI/transition） | `packages/tuffex/packages/utils/animation/auto-resize.ts` + `auto-sizer/src/TxAutoSizer.vue` | 19 手写的 152-202 行宽度动画，`useAutoResize` 已经是同一套（`applyMode:'waapi'`、`styleTarget:'outer'`、`observeTarget:'inner'`、`durationMs`/`easing`） |
| 文本选区响应式追踪 | `@vueuse/core@14.4.0` 的 `useTextSelection`（`text`/`rects`/`ranges`/`selection`），已是 tuffex 依赖 | 19 的真实选区来源；**tuffex 自身没有任何选区工具**（全库只有 `TxMarkdownEditor.vue:226` 读了一次 `document.getSelection()?.toString()`） |
| 0fr↔1fr 折叠 | 全库手抄 4 处：`tool-call-card`、`chain-of-thought`、`sources`、`reasoning-disclosure` | 05/09 都要用；已经到了该抽 mixin 的规模 |
| 受控/非受控开关的既有写法 | `TxChainOfThought.vue:16-31, 47-54`（`props.userOpen ?? userOverride ?? 自动值`） | 04 的受控分页、05 的受控展开，抄这个三段式 |
| roving tabindex 工具栏 | `TxMessageActions.vue:51-108` | 19 的按钮组可参考（但见 §4.5 的告警） |
| 组件注册范式 | `src/<name>/{index.ts,src/,__tests__/}` + `withInstall` + `src/components.ts` barrel | 见 `tool-call-card/index.ts` 全文 |

---

## 1. 04 Approval Card

### 1.1 做什么 + 完整清单

**语义**：agent 在动手前问用户一串澄清题（单选/多选 + 自由文本），逐题走查，最后一题发送。**不是** approve/deny 闸门。

**状态机（源码 31-39 行）**

```
qi: number                     // 当前题号
answers: Record<number, number[]>  // 每题选中的 option index 列表
custom: Record<number, string>     // 每题的自定义答案
sent: boolean                  // 已提交
open: boolean                  // 未关闭
hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim())
```

**DOM 结构**

```
div.min-h-[196px].max-w-80              (320px 容器)
└ div.rounded-card.bg-surface.shadow-card.overflow-hidden
  ├ [sent] div.h-37 (148px, 居中)  → 绿色勾 + "Answers sent" + "Start over"
  ├ [!sent] div.primitive-card-pad key={qi}
  │   ├ 题干 span.text-[13px].font-medium.text-ink  +  关闭按钮 .primitive-icon-button (aria-label="Dismiss")
  │   ├ 选项 button × n （aria-pressed）
  │   └ label > input (自定义答案, aria-label="Custom answer", placeholder="Type something…")
  └ div.primitive-card-footer.flex.justify-between
    ├ span: [prev 按钮] [分页点 × n] [next 按钮]
    └ [!sent] 发送按钮 size-7
```

**交互（逐条）**

- 选项点击 `toggle(i)`：`radio` → `[i]` 覆盖，并清空该题 custom；`check` → 数组增删。
- **单选自动翻页**：`radio` 分支里 `window.setTimeout(…, 480)` —— 480ms 后，末题则 `sent=true`，否则 `qi+1`（源码 51-58）。多选不会自动翻页。
- 自定义输入 onChange：若该题是 `radio`，同时清空 `answers[qi]`（互斥，源码 145）。
- 分页点本身是**可点 button**（`aria-label="Go to question N"`，当前项 `aria-current="step"`，`sent` 时全部 disabled）。
- 发送键：`disabled={!hasAnswer}`；末题 → `sent=true`，否则 `qi+1`；`aria-label` 在末题是 `"Send answers"`，否则 `"Next question"`；`sent` 后整个按钮被移除（`{!sent && …}`）。
- 关闭后整卡换成一颗 `Open approval` 按钮（`rounded-control bg-surface px-3 py-2 text-[12.5px] shadow-btn`）。

**动画（全部精确值）**

| 位置 | 值 |
|---|---|
| 题面进入（`key={qi}` 重挂） | `fade-up 350ms cubic-bezier(0.23,1,0.32,1) both` |
| 已发送勾 | `pop-in 300ms cubic-bezier(0.23,1,0.32,1) both` |
| "Answers sent" 文案 | `fade-up 350ms cubic-bezier(0.23,1,0.32,1) 100ms both` |
| 选项 hover 底 | `transition-colors duration-100` |
| 选项指示器/文字变色 | `transition-colors duration-200` |
| 单选圆点缩放 | `transition-transform duration-200`，`scale(1)`↔`scale(0)` |
| 分页点尺寸/边框 | `transition-all duration-300` |
| 发送键 | `transition-[background-color,color,transform] duration-200`，`enabled:active:scale-[0.96]` |
| 关闭键 | `transition-colors duration-100` |

**分页点三态（源码 178-184，注意是内联 style 不是 class）**

```
当前:  9×9,  border: 2.5px solid var(--ink)
已答/已发送(i<qi): 7×7,  background: var(--ink-3)
未答:  7×7,  border: 1.5px solid var(--ink-3)
```

**选项指示器两态**

```
on : bg-ink text-canvas
off: shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent
形状: radio → rounded-full ; check → rounded-[5px]
尺寸: size-4 (16px)，单选内点 size-1.5 (6px)，勾 svg 12 strokeWidth 3
```

**发送键两态**（内联 style，源码 205-209）

```
可发: background var(--ink); color var(--surface); boxShadow inset 0 1px 0 rgba(255,255,255,0.14)
禁用: background var(--field); color var(--ink-3); boxShadow var(--shadow-btn)
```

**tokens**：`--ink/-2/-3`、`--canvas`、`--surface`、`--field`、`--line-strong`、`--hover`、`--green`、`--accent-ink`、`--shadow-card`、`--shadow-btn`、radius card/control。

### 1.2 重叠判定 vs 现有组件

**唯一近邻是 `TxToolConfirmation`（`tool-confirmation/src/TxToolConfirmation.vue`）——但重叠只在外壳，不在语义。**

| 维度 | TxToolConfirmation | BUI Approval Card |
|---|---|---|
| 语义 | 一次二元授权（allow/deny + remember + risk 分级） | N 题问卷走查，产出答案集合 |
| 数据 | `toolName/summary/input/risk` 四个标量 | `questions[]`，每题 options + 自定义文本 |
| 输出 | `approve({remember})` / `deny({remember})` | 一组 `answers`，`submit` 时一并发出 |
| 分页 | 无 | 有（点/prev/next/自动翻页） |
| 视觉 | 左侧 3px 风险色边、圆角 12、pill 按钮 | 卡片 + 页脚栏、圆角 10、图标按钮 |

结论：**零 API 重叠**，把问卷塞进 TxToolConfirmation 会同时破坏它的 emit 契约和 risk 语义。

其他：`TxSteps`（有 types.ts，但是流程步骤条，不是紧凑点阵）、`TxRadio`/`TxCheckbox`（外观是 tuffex 自己那套，不是 BUI 的 ink 方块）——都不构成重叠。

### 1.3 融合建议

**选 (a) 新增组件 `TxApprovalCard`。**

理由：语义、数据模型、输出契约三者都与现有组件不相交；PRD 的映射表也以 "Approval Card" 命名，保持可追溯。文档里必须写清它与 `TxToolConfirmation` 的分工（问清楚 vs 批准），否则名字会误导——这是选它的唯一代价。

备选：
- (b) `TxToolConfirmation` 加 `variant="questions"` —— 否决：要新增 questions 数组 + 分页 + 新 emit，等于在旧组件里塞一个新组件。
- (c) `TxCard` + `TxRadio` + `TxSteps` 组合 —— 否决：分页点三态、480ms 自动翻页、`hasAnswer` 门控发送键都得在宿主重写，等于把复杂度推给每个调用方。
- 命名备选：`TxClarifyCard` / `TxAgentQuestions`（语义更准，但与 PRD 表和 shots 标题脱钩）。

### 1.4 Vue port API 草案

```ts
// approval-card/src/types.ts
export type ApprovalQuestionType = 'radio' | 'check'

export interface ApprovalOption {
  value: string
  label: string
}

export interface ApprovalQuestion {
  id: string
  question: string
  /** @default 'radio' */
  type?: ApprovalQuestionType
  options: ApprovalOption[]
  /** 关掉自由文本行。@default true */
  allowCustom?: boolean
  customPlaceholder?: string
}

export interface ApprovalAnswer {
  questionId: string
  values: string[]
  custom?: string
}

export interface ApprovalCardProps {
  questions: ApprovalQuestion[]
  /** v-model：questionId → answer */
  modelValue?: Record<string, ApprovalAnswer>
  /** v-model:index，缺省时组件自持（沿用 TxChainOfThought 的 `userOpen ?? internal` 三段式） */
  index?: number
  /** 宿主接管提交态（重挂后仍要显示"已发送"时必须外置） */
  sent?: boolean
  /** 单选后自动前进。@default true */
  autoAdvance?: boolean
  /** @default 480 —— 与 BUI 一致；reduced-motion 下建议降到 0 */
  autoAdvanceDelay?: number
  dismissible?: boolean          // @default true
  // 文案（无 i18n，英文默认）
  sendLabel?: string             // 'Send answers'
  nextLabel?: string             // 'Next question'
  prevLabel?: string             // 'Previous'
  dismissLabel?: string          // 'Dismiss'
  reopenLabel?: string           // 'Open approval'
  sentLabel?: string             // 'Answers sent'
  startOverLabel?: string        // 'Start over'
  customPlaceholder?: string     // 'Type something…'
  customLabel?: string           // 'Custom answer'（aria-label）
}

export interface ApprovalCardEmits {
  'update:modelValue': [answers: Record<string, ApprovalAnswer>]
  'update:index': [index: number]
  'update:sent': [sent: boolean]
  /** 单题作答即刻通知，便于宿主增量落库 */
  'answer': [answer: ApprovalAnswer]
  'submit': [answers: ApprovalAnswer[]]
  'dismiss': []
  'reopen': []
}
```

slots：`question(question, index)`（替换题干渲染）、`sent`（自定义成功态）、`footer-extra`。
expose：`next()` / `prev()` / `goTo(index)` / `submit()` / `reset()`。

### 1.5 风险

1. **受控分页**：BUI 的 `qi` 是纯内部态。Vue 侧若只做非受控，宿主在流式重渲染中重挂组件会丢页码（`TxChainOfThought.vue:16-31` 的注释记录过同类事故）。方案：`props.index ?? internalIndex`，两条路径都 emit。
2. **480ms 自动翻页与 a11y**：屏幕阅读器用户在朗读选项时被自动翻页会失去上下文。建议 `autoAdvance` 在 `prefers-reduced-motion: reduce` 下自动关闭（motion 偏好在这里当作"减少意外位移"用），并在文档写明。
3. **选项用 `button + aria-pressed` 而非原生 radio/checkbox**：BUI 这么做（源码 115-118）。移植时若换成原生控件，键盘语义会变（radiogroup 方向键 vs Tab）。建议保持 BUI 结构，但为多选加 `role="group"` + `aria-labelledby` 指向题干（仓库既定做法：aria-labelledby 优先于 aria-label，见 tuffex 本地化约定）。
4. **`answers` 用 index 存**：BUI 用 option 下标做 key，题目顺序一变答案就错位。移植改用 `option.value` 字符串（已体现在上面的类型里）。
5. **`min-h-[196px]` / `h-37`**：BUI 用固定高度防止翻页跳动。不同字号/语言下会溢出，建议改成 `min-height` + 内容自适应，并在文档标注视觉与 shots 的差异来源。

---

## 2. 05 Tool Chips

### 2.1 做什么 + 完整清单

**语义**：一次 agent run 的紧凑摘要——顶部一行 "N tool calls, M messages" 折叠头，展开后是若干工具调用行（每行可再展开看详情），最后一段是文件 diff chips。

**数据形状（源码 22-59）**

```ts
type DetailLine = { text: string; tone?: 'add' }
type Row = { icon: string; label: string; chip: string; mono: boolean; detailMono: boolean; detail: DetailLine[] }
type Diff = { file: string; add: number; del: number }
```

内置 4 个图标：`think`（实心星）/`write`（笔）/`run`（终端）/`read`（文件）。

**时序**：`STEP_MS = 700`，`total = ROWS.length + 1 = 5`；`step` 每 700ms +1，行按 `ROWS.slice(0, step)` 逐条出现，`step >= total` 时才渲染 diff 区。

**DOM + 交互**

```
button (折叠头, aria-expanded)  ── chevron 12px, transition-transform 200ms, rotate(0)↔rotate(-90deg)
                                └ span.tabular-nums "4 tool calls, 2 messages"
div.grid  transition-[grid-template-rows,opacity] duration-300   gridTemplateRows 1fr↔0fr
└ div.-mx-1.overflow-hidden.px-1.5.pb-1        ← 源码注释：负边距+内边距让 hover 药丸有空间又不移动内容 x
  ├ 行 × n （每行 fade-up 300ms cubic-bezier(0.23,1,0.32,1) both）
  │  ├ button.h-7 (aria-expanded, hover:bg-hover-2, rounded-control)
  │  │   ├ 图标位 size-4：**工具图标 hover 时淡出 / chevron 淡入**（本组件的招牌交互）
  │  │   │     图标 transition-opacity 100ms；chevron transition-[opacity,transform] 150ms + rotate(-90deg)↔0
  │  │   ├ label text-[12.5px] font-medium text-ink
  │  │   └ chip  h-5.5(22px) flex-1 truncate rounded-chip bg-hover-2 px-1.5 text-[11.5px]
  │  │            text-[#43464c] shadow-hairline hover:bg-line-strong
  │  │            dark:bg-field dark:text-ink-2 dark:hover:bg-hover   [+ font-mono 可选]
  │  └ 详情 div.grid transition-[grid-template-rows,opacity] duration-300
  │        timingFunction cubic-bezier(0.23,1,0.32,1)
  │        └ 内容 mt-0.5 mb-1 ml-2 border-l border-line py-0.5 pl-3.5
  │             行 truncate text-[11.5px] leading-[1.6]，tone==='add' → text-green，否则 text-ink-2
  └ diff 区 (step>=total) mt-2.5 flex-wrap gap-1.5 border-t border-line pt-2.5
     ├ chip h-7 rounded-chip bg-surface px-2 font-mono text-[11.5px] shadow-btn hover:bg-hover
     │    animation: pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${i*80}ms both     ← 80ms 阶梯
     │    文件名 truncate ／ +add text-green tabular-nums ／ −del text-red tabular-nums（del>0 才渲染，用 U+2212）
     └ "+2 more" button: underline decoration-transparent → hover:decoration-current
          animation: fade-in 300ms ease-out ${DIFFS.length*80}ms both
```

**tokens**：`--ink/-2/-3`、`--hover-2`、`--hover`、`--field`、`--line`、`--line-strong`、`--surface`、`--green`、`--red`、`--shadow-hairline`、`--shadow-btn`、radius chip/control。
**注意一处硬编码**：chip 的浅色文字是 `text-[#43464c]`，不是 token（源码 129）；暗色走 `dark:text-ink-2`。移植要给它一个显式 token 或在注释里写明这是 BUI 的原始硬编码值。

### 2.2 重叠判定

三个近邻，都只重叠一部分：

| 现有组件 | 重叠 | 差异 |
|---|---|---|
| `TxToolCallCard` | 折叠头 + 0fr 展开 + 工具名 + 一行摘要 | 它是**单卡单调用**，带 `status`（pending/running/done/error）、logs 跟随尾部、error+retry、`result` 挂件插槽；tool-chips 是**多行一组、无状态语义、无 retry**，且带 chip 与 diff 页脚 |
| `TxChainOfThought` | 折叠头 + 计数徽标 + 步骤列表 + 0fr 展开 | 它有竖向连接轨、markdown 正文（marked+DOMPurify）、streaming shimmer、**每步不可单独展开**；tool-chips 每行独立展开、有 hover 图标换 chevron、无 markdown |
| `TxSources` | 0fr 折叠 | 无关内容 |

即：`TxToolCallCard` 是"一个调用的全貌"，`TxChainOfThought` 是"思考轨迹"，tool-chips 是"一次 run 的压缩流水 + 改动摘要"。三者信息密度不同层。

### 2.3 融合建议

**选 (a) 新增 `TxToolChips`，并把 diff 段拆成可独立导出的 `TxDiffChips`。**

理由：
- 招牌交互（hover 时图标↔chevron 原地互换 + 每行独立 0fr 展开 + flex-1 truncate chip）在 `TxChainOfThought` 的轨道式版式里表达不出来，硬加会同时污染它的 `AiChainStep` 契约和视觉。
- diff chips 是独立可复用单元（11-diff-table、以及任何"本次改了哪些文件"的场景都用得上），单独导出比埋在 tool-chips 内部有价值。
- 类型上复用 `ai-elements/src/types.ts` 的既有词汇（`AiToolCallPart.name/summary`），行数据可由宿主从 `parts` 派生——与 `AiChainStep` 的既有做法（"derived by the consumer from a message's parts"，types.ts 注释）一致。

备选：
- (b) `TxChainOfThought` 加 `density="chips"` —— 否决：轨道线/markdown/shimmer 与 chip 版式互斥，会变成两个组件挤在一个文件里。
- (c) `TxCollapse` + `TxTag` 组合 —— 否决：hover 图标互换与逐行展开无法用现有 props 表达。

### 2.4 Vue port API 草案

```ts
// tool-chips/src/types.ts
export type ToolChipIcon = 'think' | 'write' | 'run' | 'read'

export interface ToolChipDetailLine {
  text: string
  /** 'add' 走成功色，'del' 走危险色，其余静默。 */
  tone?: 'add' | 'del'
}

export interface ToolChipRow {
  id: string
  label: string
  /** 行尾那颗可截断的 chip；省略则该行只有标签。 */
  chip?: string
  icon?: ToolChipIcon | (string & {})
  /** chip 用等宽字体（路径/命令）。 */
  mono?: boolean
  /** 详情用等宽字体（代码/日志）。 */
  detailMono?: boolean
  detail?: ToolChipDetailLine[]
}

export interface ToolChipDiff {
  file: string
  add: number
  del: number
}

export interface ToolChipsProps {
  rows: ToolChipRow[]
  diffs?: ToolChipDiff[]
  /** 折叠头文案；缺省由 rows.length 生成 'N tool calls'。 */
  summary?: string
  /** v-model:open —— 整组折叠 */
  open?: boolean
  /** v-model:expandedRows —— 受控的逐行展开集合 */
  expandedRows?: string[]
  /** diff 区未列出的剩余数量，>0 时渲染 "+N more"。 */
  moreCount?: number
  moreLabel?: string        // '+{n} more'
  /** 仅供文档 demo 的顺序揭示间隔(ms)；0 = 关闭（生产由数据到达驱动）。@default 0 */
  revealInterval?: number
}

export interface ToolChipsEmits {
  'update:open': [open: boolean]
  'update:expandedRows': [ids: string[]]
  'row-click': [row: ToolChipRow]
  'chip-click': [row: ToolChipRow]
  'diff-click': [diff: ToolChipDiff]
  'more': []
}
```

slots：`row-icon(row)`、`chip(row)`、`detail(row)`、`diffs`。
expose：`expand(id)` / `collapse(id)` / `toggle(id)` / `expandAll()` / `collapseAll()`。

**一个明确的移植决策**：BUI 的 `STEP_MS=700` 定时揭示是 demo 的假流式。真实宿主里行是随数据 push 进来的，逐行的 `fade-up 300ms` 保留即可自然产生同样观感。所以 `revealInterval` 默认 0，只在文档 demo 打开——否则真实数据会被人为拖慢 700ms/行。

### 2.5 风险

1. **受控展开集合**：同 04 的受控分页问题；`expandedRows` 用 `props.expandedRows ?? internalSet`。BUI 用 `label` 当 key（源码 64、73-78），标签重复就会连动展开——移植改用 `row.id`。
2. **`-mx-1 / px-1.5` 的裁剪补偿**：源码 97-99 的注释是有信息量的——外层 `overflow-hidden` 会切掉行 hover 药丸，所以用负边距+等量内边距换空间。SCSS 移植时如果只照抄类名语义、不照抄这对补偿值，hover 底色会被切边。
3. **图标↔chevron 互换依赖 `group-hover/row`**：Tailwind 的具名 group 在 SCSS 里要写成 `.tx-tool-chips__row:hover .tx-tool-chips__icon{opacity:0}`；触屏没有 hover，chevron 永远不出现 → 需要 `@media (hover: none)` 下常显 chevron，否则移动端没有"可展开"的可见线索。
4. **`h-5.5`(22px) 与 `text-[11.5px]`**：半像素字号在 tuffex 其它组件里也有先例（`TxToolCallCard` 用 12.5px），不是问题；但 `h-5.5` 依赖 Tailwind 的 0.5 单位，SCSS 要写死 22px。
5. **`tabular-nums`**：计数与 diff 数字都必须保留 `font-variant-numeric: tabular-nums`，否则流式更新时数字宽度跳动。

---

## 3. 09 Recommendation Card

### 3.1 做什么 + 完整清单

**语义**：agent 给一条带置信度的建议，用户可 Accept，或打开「Alternatives」抽屉换一条（选中即"晋升"为主推荐）。源码顶部注释点明设计意图："The card holds its shape"——卡片尺寸不随内容跳动。

**数据形状（源码 12-21）**

```ts
type Option = {
  key: string
  body: ReactNode      // 富文本正文（含内联 code）
  short: string        // 抽屉里的一行摘要
  signal: number       // 0–3，量表填充格数
  tone: string         // CSS 颜色字符串，如 'var(--green)'
  label: string        // 'High confidence' / 'Needs review' / 'No signal'
  cta: string          // 'Accept' / 'Configure' / 'Accept full restock'
  ctaStyle: string     // 'bg-accent text-white' / 'bg-ink text-canvas'
}
```

**Meter（源码 73-85）**：3 根竖条，`w-1`(4px) × `height:10`px，`gap-0.5`(2px)，`rounded-full`，`items-end`；`bar < signal` 用 `tone`，否则 `var(--line-strong)`；`transition-colors duration-300`。

**DOM**

```
div.max-w-95(380px).rounded-card.bg-surface.shadow-card.overflow-hidden
├ div.primitive-card-pad
│   ├ 标题 span.text-[13px].font-semibold.text-ink
│   └ 正文 p key={active.key} .mt-1.5.min-h-12(48px).text-[13px].leading-relaxed.text-ink-2
│         animation: fade-in 180ms ease-out both        ← min-h-12 就是"卡片不跳"的实现
│         内联 code: rounded-md bg-accent-tint px-1.5 py-0.5 font-mono text-[12px] text-accent-ink
│                   （警示变体: bg-orange-tint text-orange）
├ 抽屉 div.grid transition-[grid-template-rows,opacity] duration-300
│      timingFunction cubic-bezier(0.16, 1, 0.3, 1)      ← 全站唯一用这条缓动的地方
│   └ div.border-t.border-line.bg-inset.px-2.py-2
│      ├ p "Other options"  px-1.5 pb-1 text-[11px] font-medium text-ink-3
│      └ button × (n-1): [Meter] [short truncate flex-1 text-[12.5px]] [label text-[11px] text-ink-3]
│            点击 → selected=i; accepted=false; open=false
└ 页脚 .primitive-card-footer.border-t.border-line.bg-inset.flex.justify-between
   ├ 左: [Meter] + label text-[12.5px] font-medium text-ink-2
   └ 右: Alternatives 按钮 + 主按钮
```

**按钮规格**

```
Alternatives: h-7 rounded-control px-2.5 text-[12.5px] font-medium shadow-btn
              transition-[background-color,transform] duration-100  active:scale-[0.96]
              open ? 'bg-hover text-ink' : 'bg-surface text-ink hover:bg-hover'   (aria-expanded)
主按钮:        h-7 rounded-control px-3 text-[12.5px] font-medium
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.14),
                          0 0 0 1px rgba(16,24,40,0.12),
                          0 1px 2px rgba(16,24,40,0.1)
              transition-[background-color,transform] duration-150  active:scale-[0.96]
              accepted ? 'bg-green text-white' : active.ctaStyle
```

**tokens**：`--surface`、`--inset`、`--line`、`--line-strong`、`--ink/-2/-3`、`--canvas`、`--accent`、`--accent-tint`、`--accent-ink`、`--green`、`--orange`、`--orange-tint`、`--shadow-card`、`--shadow-btn`。

**已接受态是纯本地的**：`accepted` 只切文案（'Accepted'）与配色，没有撤销；选另一条备选会把它复位（源码 130）。

### 3.2 重叠判定

- `TxToolConfirmation`：只重叠"页脚两颗按钮 + 一个语义徽标"的外形。它没有 options 模型、没有抽屉、没有置信度，emit 是 approve/deny 二元。
- `TxSuggestionChips`：完全不同——那是回复后的追问 chip 行（`AiSuggestion{id,text}` + `select`），不是带证据的单条建议。
- `TxStatCard` / `TxCard`：只是容器，量表与抽屉都不在内。
- tuffex 全库**没有**任何"分段量表/置信度"可视化（`TxProgressBar` 是连续条，`TxRating` 是星级语义）。

结论：本体无重叠；量表是全新原语。

### 3.3 融合建议

**选 (a) 新增 `TxRecommendationCard`，并把量表抽成独立导出的 `TxSignalMeter`。**

理由：量表在本组件里就出现两次（页脚 + 每条备选行），且 16-insight-cards 之类的场景大概率复用；留在组件内部会立刻被别处复制粘贴。抽屉 + 晋升语义（选中即成为主推荐）是这张卡的核心行为，用 `TxCard + TxCollapse + TxButton` 组合的话，这套状态机要在每个宿主重写。

备选：
- (b) `TxToolConfirmation` 加 `options` —— 否决：会把二元授权组件变成多选建议组件，emit 契约冲突。
- (c) `TxCard` + `TxCollapse` + `TxSignalMeter` 组合 —— 可行但把"选中即晋升 + accepted 复位"的逻辑推给宿主；建议作为文档里的"进阶自定义"路径，不作为默认交付。

### 3.4 Vue port API 草案

```ts
// recommendation-card/src/types.ts
export type RecommendationConfidence = 'high' | 'medium' | 'low' | 'none'

export interface RecommendationOption {
  key: string
  /** 主区正文；富文本走 #body 插槽。 */
  text?: string
  /** 抽屉里的一行摘要。 */
  short: string
  /** 'high'|'medium'|'low'|'none' 派生 signal(3/2/1/0) 与默认色；也可直接给数字。 */
  confidence?: RecommendationConfidence
  signal?: number
  /** 覆盖填充色（默认由 confidence 映射到 --tx-color-success/-warning/文字弱色）。 */
  tone?: string
  /** 'High confidence' 之类的文字标签 —— 颜色永远不是状态的唯一载体。 */
  label: string
  /** 主按钮文案。@default 'Accept' */
  cta?: string
  /** @default 'ink' */
  ctaTone?: 'accent' | 'ink' | 'danger'
}

export interface RecommendationCardProps {
  title: string
  options: RecommendationOption[]
  /** v-model —— 当前主推荐的 key */
  modelValue?: string
  /** v-model:open —— 备选抽屉 */
  open?: boolean
  /** v-model:accepted —— 宿主接管才能在重挂后保持"已接受" */
  accepted?: boolean
  alternativesLabel?: string   // 'Alternatives'
  otherOptionsLabel?: string   // 'Other options'
  acceptedLabel?: string       // 'Accepted'
}

export interface RecommendationCardEmits {
  'update:modelValue': [key: string]
  'update:open': [open: boolean]
  'update:accepted': [accepted: boolean]
  'accept': [option: RecommendationOption]
  'select': [option: RecommendationOption]
}
```

slots：`body(option)`（富文本正文，含内联 `<code>`）、`footer-extra`、`meter(option)`。

```ts
// signal-meter/src/types.ts
export interface SignalMeterProps {
  /** 已填充格数。 */
  value: number
  /** @default 3 */
  max?: number
  /** 填充色，默认 currentColor。 */
  tone?: string
  /** 无障碍名，例如 'High confidence'。 */
  label?: string
  /** @default 10 */
  barHeight?: number
}
```

`TxSignalMeter` 渲染 `role="img"` + `aria-label="{label}"`（或 `aria-hidden` 由父级 label 承担），避免屏幕阅读器把 3 个空 span 念出来。

### 3.5 风险

1. **`tone` 收的是裸 CSS 颜色字符串**（BUI 传 `'var(--green)'`）。移植若原样保留，会绕开 tuffex 主题与高对比模式。建议以 `confidence` 语义为主、`tone` 为逃生口，并在文档标注 `tone` 不参与主题切换。
2. **`min-h-12` 撑住正文高度**：这是"卡片不跳"的全部实现。中文正文行高不同，48px 可能不够（两行中文 13px/1.625 ≈ 42px，三行就溢出撑高）。建议改成 `--tx-recommendation-body-min-height` 可调，并在文档写明。
3. **无障碍：抽屉是 `grid 0fr` 隐藏而非 `display:none`**，隐藏时里面的 button 仍可被 Tab 聚焦。BUI 没处理。移植必须在收起态加 `inert` 或 `visibility:hidden`（`TxToolCallCard` 的同类实现也没加——这是一个可以顺手补齐但**不要**在本次改动旧组件的已知缺口）。
4. **主按钮的 `box-shadow` 是写死的 `rgba(16,24,40,·)`**，暗色下不换值（BUI 原样如此），移植时要么照抄（对齐 shots）要么改 token（偏离 shots）——同 §0.4 的裁决点。
5. **`accepted` 无撤销**：真实业务里"已接受"通常要能撤回或进入 pending。建议 `accepted` 做成受控 prop（上面已如此），把撤销权交给宿主。

---

## 4. 19 Selection Actions

### 4.1 做什么 + 完整清单

**语义**：选中一段文字 → 文字下方浮出一条药丸工具条，把这段文字交给 agent 改写。工具条自身有四态状态机，并在整个过程中跟随文本重排。

**状态机**

```
type Mode = 'idle' | 'thinking' | 'streaming' | 'result'
挂载 280ms 后 shown=true
run(action) → mode='thinking'
thinking → 700ms → 'streaming'
streaming 由 <StreamText onDone> → 'result'
reset() → 'idle'（清空 prompt / typingWidth / action='Improve' / expanded=false）
```

**定位算法（源码 107-130，`place()`）**

```
rAF 批处理（每次先 cancelAnimationFrame 上一帧）
bounds   = selection.getBoundingClientRect()        // 整段选区
lastLine = selection.getClientRects().at(-1)        // 最后一行
x = round(bounds.left - hostBounds.left + bounds.width / 2)
y = round(lastLine.bottom - hostBounds.top + 8)     // 最后一行下方 8px
→ transform: translate3d(x, y, 0) translateX(-50%)
```

重定位触发点：`useLayoutEffect([mode])`、宿主的 `ResizeObserver`、`window.resize`、以及 **streaming 期间 `<StreamText onProgress={place}>` 每个 token 触发一次**。

**宽度形变（源码 152-202）**

```
nextWidth = ceil(content.getBoundingClientRect().width) + 8      // +8 = 药丸 p-1 的左右内边距
若 mode 变化 且 |next - prev| > 1：
  bar.animate([{width: prev}, {width: next}], { duration: 320, easing: 'cubic-bezier(0.23,1,0.32,1)' })
content 上另有 ResizeObserver 同步 lastWidth，但动画 running 时跳过（防抖动回灌）
```

**可见性与出场**

```
visible = shown && positioned
外层: transition 'transform 320ms cubic-bezier(0.77,0,0.175,1), opacity 180ms ease-out'
      opacity 1/0, pointerEvents auto/none, willChange transform
药丸: animation 'pop-in 220ms cubic-bezier(0.23,1,0.32,1) both'（仅 visible 时挂）
```

**药丸几何（源码 265-268 的注释是设计说明，值得原样保留）**

> "A 36px pill wraps 28px controls at a 4px inset. The controls resolve to a 14px radius, preserving the concentric curve."

```
bar:  h-9(36px) w-fit max-w-[calc(100vw-48px)] gap-0.5 overflow-hidden rounded-full bg-surface p-1 shadow-overlay
control: h-7(28px) rounded-full px-2.5 text-[12px] gap-1  hover:bg-hover  active:scale-[0.96]
         transition-[background-color,color,transform] duration-150
primary: h-7 rounded-full bg-ink px-2.5 text-[12.5px] text-canvas shadow-hairline
         hover:opacity-90 active:scale-[0.96]  transition-[opacity,transform] duration-150
```

**idle 态的三组滑动区（全部 `duration-400` + `cubic-bezier(0.23,1,0.32,1)`）**

| 组 | 属性 | 值 |
|---|---|---|
| 输入区 | `max-width` | `expanded ? 0 : (hasPrompt && typingWidth ? typingWidth-40 : 145)`；opacity 0/1；`translateX(-8px)` |
| 动作区 | `max-width` | `hasPrompt ? 0 : (expanded ? 462 : 224)`；opacity 0/1；`translateX(-8px)` |
| 展开子区（Shorten/Tone/Grammar） | `max-width` / `margin-left` | `expanded ? 262 : 0` / `expanded ? 2 : 0` |
| 发送键区 | `max-width` / `transform` | `hasPrompt ? 30 : 0` / `scale(1)`↔`scale(0.88)` |

`typingWidth`：在 prompt 由空变非空的那一刻抓一次 `barRef.getBoundingClientRect().width`，清空时置 null（源码 363-376）。作用是把药丸钉在开始打字前的宽度，避免边打字边抖。

**动作集**：Explain / Improve / Shorten / Tone / Grammar（后三个折在 chevron 后）。**`Explain` 在 demo 里没有 onClick——是死按钮**（源码 396-399）。
`busyLabel` 映射：Improve→"Improving"、Shorten→"Shortening"、Change tone→"Changing tone"、其余→"Editing"，渲染为 `{busyLabel}…`。
busy 态 spinner：`size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2`，`animation: spin 700ms linear infinite`。
`thinking` 时文案包在 `<Shimmer>`（shimmer-text keyframe），`streaming` 时是普通文本——**两态的差别只有这一点**。

**result 态**：`Keep`（primary + check）/ `Discard`（control + close）/ 竖分隔 `mx-0.5 h-4 w-px bg-line` / 重试图标键 `size-7 rounded-full text-ink-3 hover:bg-hover-2`（aria-label="Try again"）。

**被选中的文字**：`<span class="box-decoration-clone rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] dark:bg-accent-tint">`，宿主 `<p class="text-[13px] leading-relaxed">`，容器 `relative select-none pb-12`。

**外部依赖（不在 src 包里）**：`@/components/atoms/Shimmer`、`@/components/atoms/StreamText`。`_global.css` 里有配套的 `.stream-caret`（`caret-blink 1s step-end infinite`，2px×1.05em，`--ink`）和 `.stream-tail`（`filter: blur(1.6px)` + 右淡出 mask），两者都在全局 reduced-motion 块里被关掉。这两个原子属于 03-streaming-text 簇，本簇只消费。

### 4.2 重叠判定

| 现有组件 | 重叠 | 差异 |
|---|---|---|
| `TxMessageActions` | "一排动作按钮" | 它是消息尾部的**图标条**（copy/regenerate/speak），role="toolbar" + roving tabindex，无浮层、无输入框、无状态机 |
| `TxTextTransformer` | **名字像，实则无关** | 它是文本切换的模糊交叉淡入动画（`text` 变化时旧字模糊淡出），不是"文本转换动作" |
| `TxSuggestionChips` | chip 行 | 追问 chip，无浮层无输入 |
| `TxContextMenu` | 浮层 + 虚拟锚点 | 菜单是竖向列表，锚点是鼠标点；选区工具条是横向药丸，锚点是 Range 且会随流式重排移动 |
| `TxPopover` / `TxBaseAnchor` | **基础设施，可直接复用** | `TxBaseAnchor` 已支持 `virtualReference`（types.ts:81-84）、`strategy:'fixed'`、Teleport 到 body，并 expose `updatePosition`（TxBaseAnchor.vue:748-752） |
| `TxAutoSizer` / `useAutoResize` | **基础设施，可直接复用** | 19 手写的 measure→WAAPI 宽度动画与 `useAutoResize({applyMode:'waapi', styleTarget:'outer', observeTarget:'inner'})` 是同一套 |

**tuffex 没有任何选区追踪工具**（全库唯一相关代码是 `TxMarkdownEditor.vue:226` 的一次性 `document.getSelection()?.toString()`）。但 `@vueuse/core@14.4.0` 已是依赖且导出 `useTextSelection(): { text, rects, ranges, selection }` —— 不需要新增依赖。

### 4.3 融合建议

**选 (c)+(a)：以组合为主体的新组件 `TxSelectionActions` = `TxBaseAnchor`(virtualReference) + `TxAutoSizer`(宽度形变) + 新写的药丸 chrome 与状态机；选区追踪单独做成 `useSelectionAnchor` 组合式函数（基于 vueuse `useTextSelection`）。**

理由：
- 两个最难的部分（虚拟锚点定位、内容变化时的宽度动画）仓库里已经有经过打磨的实现，重写等于放弃 `TxBaseAnchor` 里已解决的 z-index 分配、Teleport、reduced-motion、outside-click 语义。
- 追踪与呈现拆开，是因为 **BUI 的 demo 根本没有真实选区**（全文没有 `window.getSelection()`，"选区"是一个写死的 `<span>`）。组件必须能同时服务三种宿主：真实 DOM 选区、contenteditable、以及像 demo 那样的合成选区。做成"受控 + 可选追踪"两层，三种都成立。

分层：
```
useSelectionAnchor(root)  →  { selection: SelectionPayload | null, clear() }   // 可选，纯 composable
TxSelectionActions        →  受控展示层：给它 selection + state，它负责定位、形变、动作行
```

备选：
- (a) 单体全包（组件内部直接监听 `selectionchange`）—— 否决：contenteditable / 虚拟列表 / iframe 场景下宿主必须能接管，写死就没法用。
- (b) `TxMessageActions` 加 `floating` 变体 —— 否决：它是 role=toolbar 的图标条，加入输入框会破坏它的 roving tabindex 单一 tab stop 模型（见 §4.5.4）。

### 4.4 Vue port API 草案

**选区 → 动作的契约：`selection` 单向传入（prop），动作单向传出（emit），组件永不改文档。**
v-model 只用于组件自身的 UI 态（`prompt` / `expanded` / `visible`），不用于选区——选区的所有权在宿主，双向绑定会诱导宿主在回调里改 DOM 而破坏 Range。

```ts
// selection-actions/src/types.ts
export interface SelectionPayload {
  /** 选中的纯文本。 */
  text: string
  /** 选区各行的 client rects；用于定位（最后一行的 bottom 是锚点）。 */
  rects: DOMRect[]
  /** 原始 Range 的快照；宿主用它回写改写结果。 */
  range?: Range
}

export type SelectionActionState = 'idle' | 'thinking' | 'streaming' | 'result'

export interface SelectionActionItem {
  id: string                 // 'explain' | 'improve' | 'shorten' | 'tone' | 'grammar' | 自定义
  label: string              // 'Improve'
  /** 折在 chevron 之后，默认展开区。 */
  more?: boolean
  /** 忙碌时的进行时文案，如 'Improving'。缺省回落到 busyLabel。 */
  busyLabel?: string
}

export interface SelectionActionsProps {
  /** null / undefined = 收起。给它 payload 就浮出。 */
  selection?: SelectionPayload | null
  /** 宿主拥有的状态机；组件自己不发请求。@default 'idle' */
  state?: SelectionActionState
  /** 默认 Explain / Improve / Shorten / Tone / Grammar（后三个 more: true）。 */
  actions?: SelectionActionItem[]
  /** v-model:expanded —— chevron 展开更多动作 */
  expanded?: boolean
  /** v-model:prompt —— "Describe edits" 输入框 */
  prompt?: string
  placeholder?: string       // 'Describe edits'
  keepLabel?: string         // 'Keep'
  discardLabel?: string      // 'Discard'
  retryLabel?: string        // 'Try again'
  /** 忙碌兜底文案。@default 'Editing' */
  busyLabel?: string
  /** 距最后一行的距离。@default 8 */
  offset?: number
}

export interface SelectionActionsEmits {
  /** 点了某个预设动作。 */
  'action': [payload: { id: string, action: SelectionActionItem, selection: SelectionPayload }]
  /** 输入框回车/发送键：自由指令。 */
  'submit': [payload: { prompt: string, selection: SelectionPayload }]
  'keep': []
  'discard': []
  'retry': []
  'update:expanded': [expanded: boolean]
  'update:prompt': [prompt: string]
}
```

slots：`actions`（整排动作自定义）、`busy`（自定义忙碌区）、`result`（自定义 Keep/Discard 区）。
expose：`updatePosition()`（透传 `TxBaseAnchor` 的 `updatePosition`，**streaming 宿主每个 delta 都要调**）、`focusInput()`。

虚拟锚点的构造（对齐 BUI 的 x-center / 末行-bottom）：

```ts
const virtualReference = markRaw({
  getBoundingClientRect(): DOMRect {
    const rects = props.selection?.rects ?? []
    const last = rects.at(-1)
    if (!last) return new DOMRect(0, 0, 0, 0)
    const left = Math.min(...rects.map(r => r.left))
    const right = Math.max(...rects.map(r => r.right))
    // 宽度取整段选区（水平居中），纵向坍缩到最后一行底部（BUI 的 y 规则）
    return new DOMRect(left, last.bottom, right - left, 0)
  },
})
```

配 `placement="bottom"` + `:offset="8"`。（注：常规 LTR 文本流里 `range.getBoundingClientRect().bottom` 本就等于末行 bottom，所以直接用 union rect 也能得到同样结果；显式取末行只是对 bidi/异常行高更稳。）

### 4.5 风险

1. **`window.getSelection()` 根本没被 BUI 用过** —— 全部真实选区行为都是移植时新写的，shots 无法验收这部分。必须自己定契约：
   - `selectionchange` 是 document 级、高频（拖选时每帧都触发）→ 必须 debounce（vueuse 的 `useTextSelection` 内部已监听，外层再套 `refDebounced`）。
   - 折叠选区（`isCollapsed`）要视为"无选区"→ 收起工具条。
   - **点工具条会毁掉选区**：药丸里的 input 一获得焦点，原选区就被清空。必须在药丸根上 `@pointerdown.prevent`（保住焦点不转移），并在浮出瞬间 `range.cloneRange()` + 文本快照，之后所有动作用快照而不是实时选区。这是这类组件最经典的一个 bug。
   - Safari 与 Firefox 在 `pointerdown.prevent` 后的 caret 行为不同，需要真机验证（本次无法在 CI 覆盖）。
2. **虚拟锚点下 `TxBaseAnchor` 不启用 `autoUpdate`**（`TxBaseAnchor.vue:820-831）：虚拟引用只挂 `window.resize` + capture 阶段 `scroll`，**不会**响应文本重排。而 streaming 改写恰恰会让选区每个 token 都重排 —— 对应 BUI 的 `onProgress={place}`。移植必须在流式回调里显式调 `updatePosition()`，否则药丸会停在旧位置。这是本组件最大的移植陷阱。
3. **`flip` 中间件不可关**：`TxBaseAnchor` 的 middleware 数组是写死的（`offset/flip/shift/size/arrow`，`TxBaseAnchor.vue:134-171`）。靠近视口底部时药丸会翻到选区上方——行为上更好，但与 shots 不一致。要么接受差异并在文档说明，要么给 `TxBaseAnchor` 加一个 `disableFlip` prop（**改公共组件，需主会话批准**）。
4. **焦点管理与 role**：`TxMessageActions` 的 roving tabindex（单一 tab stop + 方向键）不适用于这里——药丸里有文本输入框，方向键要留给光标。建议：药丸根 `role="group"` + `aria-label="Selection actions"`，内部保持自然 Tab 顺序，不要套 `role="toolbar"`。另外 `TxBaseAnchor` 的 `closeOnClickOutside` 必须把药丸自身算作 inside（它用 `composedPath` 判断，Teleport 后的面板天然在内，但**宿主里的选区文本**在外——点选区应视为继续操作而非关闭）。
5. **WAAPI 宽度动画绕过 CSS reduced-motion**（见 §0.3）：`useAutoResize` 的 `applyMode` 需要在 reduced-motion 下切成 `'sync'`（直接设宽，不动画）。`TxAutoSizer` 目前没有内建这个开关，得在 `TxSelectionActions` 里按 `matchMedia` 选 `applyMode`。
6. **`typingWidth` 这套三重 max-width 联动（145/224/262/462/30 这些魔数）** 是像素级手调的结果，直接照抄会与 tuffex 字体（非 Inter）下的实际文本宽度对不上。建议改为让 `TxAutoSizer` 测量真实内容宽度、用 `max-width: 0 / none` + `overflow:hidden` 做进出场，只保留 `duration-400` 与缓动；并在实现注释里写明"BUI 的魔数是 Inter 字体下的手调值，此处改为测量驱动"。
7. **`Explain` 是死按钮**：移植时要么给它 emit（推荐，`action` 事件带 `id:'explain'`），要么在文档里说明它需要宿主接管。别原样搬一个点了没反应的按钮。
8. **`select-none` 在宿主容器上**：BUI 给演示容器加了 `select-none` 防止真实选区干扰它的假选区。移植的真实场景必须去掉，否则用户根本没法选字——很容易照抄漏改。

---

## 5. 跨组件共享模式（建议抽成公共资产）

| # | 模式 | 出现处 | 建议落点 |
|---|---|---|---|
| S1 | **chip 解剖**：`rounded-chip`(6px) + h 22/28px + `shadow-hairline`/`shadow-btn` + `truncate` + 可选 `font-mono` + `tabular-nums` 数字 | 05 行内 chip、05 diff chip（也见 10/11/12/13） | `style/mixins.scss` 加 `@mixin tx-chip($height)`；diff chip 单独做 `TxDiffChips` 组件 |
| S2 | **分段信号量表**：3×(4px 宽 / 10px 高 / 2px 间距 / 全圆角)，填充色 vs `--line-strong`，`transition-colors 300ms` | 09 页脚 + 09 抽屉每行（预计 16 也用） | 新原子 `TxSignalMeter` |
| S3 | **选项行指示器**：16px 方/圆，off = `inset 0 0 0 1.5px var(--line-strong)`，on = `bg-ink text-canvas`；圆点 `scale(0)→scale(1)` 200ms | 04（18-fine-tune-card 大概率同款） | mixin `@mixin tx-choice-indicator($shape)`，或原子 `TxChoiceRow` |
| S4 | **0fr↔1fr 折叠**（含 opacity 联动） | 05 两处、09 一处；tuffex 已手抄 4 处（tool-call-card / chain-of-thought / sources / reasoning-disclosure） | `style/mixins.scss` 加 `@mixin tx-collapse-grid($duration, $easing)`；**注意 BUI 两处缓动不同**：05 用 `cubic-bezier(0.23,1,0.32,1)`，09 用 `cubic-bezier(0.16,1,0.3,1)` |
| S5 | **keyframes 集**：`fade-up` / `fade-in` / `pop-in` / `spin` | 04/05/19 全用 | 单一 partial 统一发射，**必须加 `tx-` 前缀**（`pop-in`/`spin` 太通用，裸名会与宿主全局撞车，违反 R3「不得全局污染」） |
| S6 | **实心 ink 按钮配方**：`inset 0 1px 0 rgba(255,255,255,0.14)` 顶光 + `active:scale-[0.96]` | 04 发送键、09 主按钮、19 primary/control | mixin `@mixin tx-solid-ink-button` |
| S7 | **reduced-motion 逐组件守卫**（BUI 靠全局，tuffex 必须逐个写；WAAPI 还要 JS 判断） | 全部四个 | 每个组件 `<style>` 末尾 + JS 里读 `matchMedia`，参照 `TxBaseAnchor.vue:105-106` |
| S8 | **`tabular-nums`** 数字（计数、diff、时长） | 04 无、05 有、09 无、19 无；05 是硬要求 | 与 S1 一起进 chip mixin |

---

## Caveats / Not Found

- **`Shimmer` / `StreamText` 两个原子不在 src 包里**（19 从 `@/components/atoms/` 引入）。配套 CSS 在 `_global.css` 里能找到（`.stream-caret` = `caret-blink 1s step-end infinite`、2px×1.05em、`--ink`；`.stream-tail` = `blur(1.6px)` + 右向 mask），keyframe `shimmer-text` 也在。它们属于 03-streaming-text 簇，本报告只标注依赖关系，未给出移植方案。
- **`_design-tokens.json` 里 76 行之后的 `.lexi-*` 变量是抓取环境里某个浏览器扩展注入的，与 Beautiful UI 无关**，token 映射时要跳过（有效的只有 `:root` 与 `.dark` 两段，共 54 个）。
- **AC2（像素级对齐 shots）与 R3（用 tuffex token）在色值上实测冲突**（§0.4），我只记录事实与一个可行解（组件作用域局部 token），最终裁决权在主会话。
- **19 的真实选区行为无源码可依**：BUI 全文没有 `window.getSelection()`，"选区"是写死的 `<span>`。§4.4/§4.5 里关于 Range 快照、`pointerdown.prevent`、debounce 的部分是基于 tuffex 现有基础设施（vueuse `useTextSelection`、`TxBaseAnchor.virtualReference`）推导的移植契约，不是对 BUI 源码的转述——实现时需要真机验证 Safari/Firefox 差异。
- **未验证**：`TxBaseAnchor` 的 `flip` 是否真的会在选区贴近视口底部时把药丸翻上去（读代码判断 middleware 写死；没有跑起来实测）。
- **未调查**（不在本簇职责内）：nexus 文档 `.zh.mdc`/`.en.mdc` 的具体 frontmatter 值、demo-registry 注册方式、以及 `src/components.ts` barrel 的编辑（PRD 约束共享文件由主会话统一编辑）。
