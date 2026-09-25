# Research: Stagger / Transition / TextTransformer（动效三格）

- **Query**: 三个组件的源码/API、动画触发方式、demo、当前格子的问题（含共享开关）、紧凑提案与重播性
- **Scope**: internal（源码 + ego 实测：replay 采样、开关联动）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/stagger/src/TxStagger.vue` | defineComponent + render 函数（94 行） |
| `packages/tuffex/packages/components/src/stagger/src/types.ts`、`index.ts`、`__tests__/stagger.test.ts` | 类型 / 导出 / 单测 |
| `packages/tuffex/packages/components/src/transition/src/TxTransition.vue` | 主组件 |
| `packages/tuffex/packages/components/src/transition/src/TxTransitionFade.vue`、`TxTransitionSlideFade.vue`、`TxTransitionRebound.vue` | 固定 preset 的语义包装 |
| `packages/tuffex/packages/components/src/transition/src/TxTransitionSmoothSize.vue` | 包 TxAutoSizer 的尺寸过渡 |
| `packages/tuffex/packages/components/src/text-transformer/src/TxTextTransformer.vue` | 组件 |
| `packages/tuffex/packages/components/src/text-morph/src/TxTextMorph.vue` + `src/engine/*.ts` | morph 引擎（`MORPH_DEFAULTS` 在 `engine/types.ts:47-56`） |
| `apps/nexus/app/components/content/demos/StaggerStaggerDemo.vue` | Stagger demo |
| `apps/nexus/app/components/content/demos/TransitionTransitionContentDemo.vue`、`TransitionTransitionListDemo.vue` | Transition demo |
| `apps/nexus/app/components/content/demos/TextTransformer{TextTransformer,StatusText,MorphVsFade,TitleSubtitle,LongTextChapter,AutoSizerTextTransformer}Demo.vue` | TextTransformer demo |

---

### 1. Stagger

**API**（TxStagger.vue:22-30）

| prop | 类型 | 默认 |
|---|---|---|
| `tag` | `string` | `'div'` |
| `appear` | `boolean` | `true` |
| `name` | `string` | `'tx-stagger'` |
| `duration` | `number` | `180` |
| `delayStep` | `number` | `24` |
| `delayBase` | `number` | `0` |
| `easing` | `'ease' \| 'ease-in' \| 'ease-out' \| 'ease-in-out' \| 'linear'` | `'ease-out'` |

默认 slot（子元素需带 key；v-for 片段会被展平，注释节点剔除）；无 emit / expose。根上 CSS 变量 `--tx-stagger-duration / -delay-step / -delay-base / -easing`，每个子元素有 `--tx-stagger-index`。渲染为 `h(TransitionGroup, { name, tag, appear, class: 'tx-stagger', style })`，透传的 class 落到 TransitionGroup 的 tag 元素上。

**内置 CSS**（76-94）：enter / leave 为 opacity 0 + `translateY(6px)`，delay = base + index × step。没有 `.tx-stagger-move`（重排会跳），也没有 reduced-motion 兜底。

**当前格子**（研究时 2969-2985 行）：`<TxStagger appear :delay-step="80">` 包 3 个 `.docs-gallery__tile` → 实测根 29.5×102（块级 div 在 flex 舞台里收缩包裹，tile 竖排、无间距）；入场 180 + 2×80 ≈ 340ms，发生在页面加载时。

**重播实测**（点 replay 后采样 3 个子元素的 opacity）：50ms [0.15, 0, 0] → 149ms [0.82, 0.30, 0] → 248ms [1, 0.88, 0.40] → 348ms [1, 1, 0.96]。能重播，但只有 0.35s、6px 位移。

**demo**：`StaggerStaggerDemo.vue` 只是三行纯文本 "First / Second / Third"，delay-step 30、duration 180（zh / en 两个分支相同）。

**提案**

```vue
<TxStagger class="docs-gallery__stagger" :duration="420" :delay-step="70">
  <div v-for="item in staggerItems" :key="item.id" class="docs-gallery__tile docs-gallery__stagger-item">
    <span :class="item.icon" aria-hidden="true" />
    {{ item.label }}
  </div>
</TxStagger>
```

```css
.docs-gallery__stagger { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: min(320px, 100%); }
.docs-gallery__stagger-item { gap: 6px; }
```

- 6 项（例如 Clipboard / Browser / Actions / Scripts / Windows / AI，配图标）→ 两行约 76px 高；整段 420 + 5×70 = 770ms。
- 如果 6px 位移太弱，可以用自定义 `name="docs-gallery-stagger"`，在画廊 CSS 里复用组件写出的变量：

```css
.docs-gallery-stagger-enter-active {
  transition: opacity var(--tx-stagger-duration) var(--tx-stagger-easing), transform var(--tx-stagger-duration) var(--tx-stagger-easing);
  transition-delay: calc(var(--tx-stagger-delay-base) + var(--tx-stagger-index) * var(--tx-stagger-delay-step));
}
.docs-gallery-stagger-enter-from { opacity: 0; transform: translateY(12px) scale(0.96); }
@media (prefers-reduced-motion: reduce) { .docs-gallery-stagger-enter-active { transition: none; } }
```

- 重播：可以（新的 TransitionGroup 会执行 appear，已实测）。

---

### 2. Transition

**TxTransition API**（12-20）：`preset`（`'fade' | 'slide-fade' | 'rebound' | 'smooth-size'`，默认 `'fade'`）、`group`（false）、`tag`（`'div'`，仅 group 时生效）、`appear`（true）、`mode`（`'in-out' | 'out-in'`，默认 `'out-in'`）、`duration`（180）、`easing`（`'cubic-bezier(0.2, 0, 0, 1)'`）。`inheritAttrs: false`：class / style 落在外包的 `div.tx-transition` 上，其余 attrs 交给内部的 Transition / TransitionGroup（44-55）。默认 slot。CSS 变量 `--tx-transition-duration / -easing`。

- Fade / SlideFade / Rebound：preset 固定，转发 `$attrs`。
- SmoothSize（12-20）：appear true、mode out-in、duration 220、easing、width false、height true、`motion`（`'fade' | 'slide-fade' | 'rebound'`），外面包一层 TxAutoSizer。
- 预设（95-167）：fade 只有透明度；slide-fade 加 `translateY(8px)`；rebound 入场用回弹曲线 `cubic-bezier(.34,1.56,.64,1)`，从 `translateY(10px) scale(.985)` 进入；group 模式有 `-move`；reduced motion 下为 0.01ms、无位移。

**当前格子**（研究时 3004-3023 行）：`<TxTransitionFade>` + `div.docs-gallery__tile v-if="switchOn"` + `<TuffSwitch v-model="switchOn" />`：只有最不明显的 fade；静止时是静态的；隐藏后 `.tx-transition` 包装变空并塌陷，stack 实测 72 → 38px，开关跳位；`switchOn` 与 TextTransformer 共用（已实测联动）。

**demo**：Content demo 有 preset 下拉 + Toggle，`<TxTransition :preset :duration="220" mode="out-in">` 在带 key 的面板 A（90px）和 B（180px）之间切换，下方 "Semantic Components" 一排 Fade / SlideFade / Rebound 小块按 value 换 key（180 / 180 / 200ms）。List demo 是 group 模式增删；注意它写在 TxTransition 上的 `style="display: grid; gap: 10px;"` 落在外包 div 上，而不是 TransitionGroup 元素上，间距对 item 不生效。

**提案**

```vue
<div class="docs-gallery__stack docs-gallery__stack--center">
  <div class="docs-gallery__row docs-gallery__row--loose">
    <div v-for="preset in transitionPresets" :key="preset" class="docs-gallery__meter">
      <TxTransition :preset="preset" :duration="320" class="docs-gallery__lane">
        <div :key="transitionFlip ? 'b' : 'a'" class="docs-gallery__tile">
          {{ transitionFlip ? copy.reviewing : copy.online }}
        </div>
      </TxTransition>
      <span class="docs-gallery__meter-text">{{ preset }}</span>
    </div>
  </div>
  <TxButton size="sm" @click="transitionFlip = !transitionFlip">{{ copy.toggle }}</TxButton>
</div>
```

```ts
const transitionPresets = ['fade', 'slide-fade', 'rebound'] as const
const transitionFlip = ref(false)
```

```css
.docs-gallery__lane { display: grid; place-items: center; min-width: 92px; min-height: 40px; }
```

- 泳道固定尺寸，避免 out-in 过程中塌陷跳动；约 3×92 + 2×22 = 320 宽、约 110 高。
- 状态与 `switchOn` 脱钩。
- 重播：appear 默认 true，重挂载时三条泳道并排重新入场（fade / slide / rebound 对比明显）；flip 状态保留。可选：仿 ProgressBar 每约 1.8s 自动切换一次（reduced motion 下不启动）。

---

### 3. TextTransformer

**API**（11-17）：`text`（`string | number`，必填）、`mode`（`'morph' | 'fade'`，默认 `'morph'`）、`durationMs`（240）、`blurPx`（8，仅 fade）、`tag`（`'span'`）、`wrap`（false，开启后强制 fade）。默认 slot `{ text }` 也会强制 fade。没有 emit（TxTextMorph 的 animation-start / complete / cancel 没有转发）。根上有 `aria-live="polite"`（147 行）。CSS 变量 `--tx-tt-duration`、`--tx-tt-blur`。

- morph：只给 TxTextMorph 传 `text` 和 `durationMs`，其余用引擎默认值：easing `cubic-bezier(0.19, 1, 0.22, 1)`、scale true、**numbers true（数字按位滚动）**、locale 'en'、respectReducedMotion true。按片段 diff，相同的片段不动，变化的片段进出，容器宽度随之动画。
- fade：两层交叉淡化 + blur，`durationMs + 34` 后移除旧层。
- 只在 `text` 变化时有动画；挂载时静态显示（TxTextMorph 会冻结初始文本）。

**当前格子**（研究时 2987-3002 行）：`<TxTextTransformer :text="switchOn ? copy.online : copy.failed" />` + 共享开关。静止时是静态的；切换时 Online↔Failed 共享字母很少，看上去就像直接替换；同时还带动 Transition 格。

**demo**：`TextTransformerMorphVsFadeDemo.vue` 最好——阶段 `['Connecting', 'Connected', 'Syncing 12 files', 'Syncing 148 files', 'Up to date']`，Next 按钮，`mode="morph"` / `mode="fade"` 两行用 `<code>` 标注，duration 320、blur 10。StatusText：fade 模式的 'Operational'↔'Degraded' + 彩色圆点。其余是 fade + 滑块。`TextTransformerLongTextChapterDemo.vue` 里 `text = ref('')`、`toggle = () => {}`，按钮无效（文档 demo 自身的问题，不在本任务范围内）。

**提案**

```vue
<div class="docs-gallery__stack docs-gallery__stack--center">
  <div class="docs-gallery__morph">
    <code>morph</code>
    <TxTextTransformer :text="syncStage" :duration-ms="360" />
    <code>fade</code>
    <TxTextTransformer :text="syncStage" mode="fade" :duration-ms="360" :blur-px="8" />
  </div>
  <TxButton size="sm" @click="nextSyncStage">{{ copy.next }}</TxButton>
</div>
```

```ts
const syncStageIndex = ref(0)
const syncStage = computed(() => copy.value.syncStages[syncStageIndex.value % copy.value.syncStages.length])
function nextSyncStage() {
  syncStageIndex.value += 1
}
// en: ['Connecting', 'Connected', 'Syncing 12 files', 'Syncing 148 files', 'Up to date']
// zh: ['连接中', '已连接', '同步 12 个文件', '同步 148 个文件', '已是最新']
```

```css
.docs-gallery__morph { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 8px 14px; font-size: 14px; font-weight: 600; }
.docs-gallery__morph code { font-size: 11px; font-weight: 400; color: var(--docs-muted); }
```

- 两个 transformer 放在同一网格列里，宽度变化不会推动标签；最长一行约 190px。
- `aria-live`：每次变化都会被读屏播报；由按钮触发没有问题，自动循环会每轮播报一次 → 用按钮，或者只在 hover 时循环。
- 重播：重挂载只会静态显示当前阶段，动画只在点 Next 时出现；阶段状态保留在画廊里。

## Caveats / Not Found

- `copy.toggle`、`copy.next`、`copy.syncStages` 是新文案 key，需要在 zh / en 两边补上。
- 三个提案的布局都未在浏览器实测。
- 中文阶段文案的 morph 效果未实测。
