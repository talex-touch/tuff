# Research: VirtualList / EdgeFadeMask / CornerOverlay 三格（R8 / R10 / R9）

- **Query**: VirtualList 行宽 ~120px 贴左、滚动条远在右侧；EdgeFadeMask 静态一行编号块，要 marquee 式自动滚动；CornerOverlay 只有一个头像 + badge，"变体呢？"。查 API、前提、demo、失败原因，给紧凑方案。
- **Scope**: internal
- **Date**: 2026-09-23

---

## A. VirtualList

### Files

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/virtual-list/src/TxVirtualList.vue` | 组件（174 行，`<script setup generic="T">`） |
| `packages/tuffex/packages/components/src/virtual-list/src/types.ts` | `VirtualListProps` / `VirtualListEmits` / key 类型 |
| `packages/tuffex/packages/components/src/virtual-list/index.ts` | 导出 + `TxVirtualListInstance` |
| `apps/nexus/app/components/content/demos/VirtualListVirtualListDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/virtual-list.{en,zh}.mdc` | 文档页 |

### API

| Prop | Type | Default |
|---|---|---|
| `items` | `T[]` | `[]` |
| `itemHeight` | `number` | **必填**（每行固定 px 高） |
| `height` | `number \| string` | `320`（数字→px；`%/vh/vw/rem/em` 需挂载后读 `clientHeight`） |
| `overscan` | `number` | `4` |
| `itemKey` | `keyof T \| (item, index) => string \| number` | index |

- **Slots**：`item`（`{ item, index }`，默认渲染 `{{ item }}`）。
- **Emits**：`scroll`（`{ scrollTop, startIndex, endIndex }`，含 overscan）。
- **Expose**：`scrollToIndex(i)`（`scrollTop = max(0,i)·itemHeight`，不钳上界）、`scrollToTop()`、`scrollToBottom()`。
- **CSS 变量**：无。DOM：`.tx-virtual-list`（`width:100%; overflow:auto; position:relative`，inline `height`）→ `__spacer`（总高）→ `__items`（`translateY(offsetTop)`）→ `__item`（**`display:flex; align-items:center; box-sizing:border-box; width:100%`**，inline `height: itemHeight`，TxVirtualList.vue:168–173）。
- 无动画；只随滚动回收行。前提：固定行高、明确的 `height`。

### Nexus demo

`VirtualListVirtualListDemo.vue`：100 条 `Item N`（zh "项目 N"），`item-height 36`、`height="240px"`，slot 根 `<div style="padding: 6px 12px; width: 100%;">{{ index + 1 }}. {{ item }}</div>` —— **demo 自己给了 `width: 100%`**，画廊没有。

### 当前格子（研究时 ~2752–2772 行，锚点 `docPath('virtual-list')`）

```vue
<div class="docs-gallery__block">
  <TxVirtualList :items="virtualRows" :item-height="32" :height="104" item-key="id">
    <template #item="{ item }">
      <div class="docs-gallery__scroll-row">
        {{ item.label }}
      </div>
    </template>
  </TxVirtualList>
</div>
```

`virtualRows = Array.from({ length: 200 }, (_, index) => ({ id: index, label: \`Row ${index + 1}\` }))`（~541 行）。

失败原因：
1. `__item` 是 flex 容器，slot 根 `.docs-gallery__scroll-row`（`padding: 7px 10px; font-size:12px; border-bottom`）作为 flex item 不伸展 → 宽度 = 文本 + 20px padding，贴左；它的下边线也只有这么宽。
2. `.tx-virtual-list` 占满 320px 的 `docs-gallery__block`，滚动条在 x=320 → 与贴左的窄行之间隔一大片空白。
3. 没有外框；104px 高显示 3.25 行（最后一行被切）；200 行体现不出"虚拟化"。

### 方案

```vue
<div class="docs-gallery__block docs-gallery__doc docs-gallery__vlist">
  <div class="docs-gallery__doc-bar">
    <span>{{ copy.virtualTitle }}</span>
    <span class="docs-gallery__vlist-count">
      {{ virtualWindow.end - virtualWindow.start }} / {{ virtualRows.length.toLocaleString() }}
    </span>
  </div>
  <TxVirtualList
    :items="virtualRows" :item-height="28" :height="112" item-key="id"
    @scroll="({ startIndex, endIndex }) => (virtualWindow = { start: startIndex, end: endIndex })"
  >
    <template #item="{ item, index }">
      <div class="docs-gallery__vrow">
        <span class="docs-gallery__vrow-index">{{ index + 1 }}</span>
        <span class="docs-gallery__vrow-name">{{ item.name }}</span>
        <span class="docs-gallery__vrow-meta">{{ item.meta }}</span>
      </div>
    </template>
  </TxVirtualList>
</div>
```

- 数据：10 000 行（虚拟化后成本不变），`name` 轮换插件名、`meta` 如版本号；`virtualWindow` 初值 `{ start: 0, end: Math.min(n, Math.ceil(112/28) + 4) }` = 8（`scroll` 事件首次滚动前不会发）。
- CSS 要点：`.docs-gallery__vrow { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; gap: 10px; padding: 0 12px; font-size: 12px; border-bottom: 1px solid var(--docs-gallery-line) }`（**`flex: 1` 是修正行宽的关键**，等价于 demo 的 `width:100%`）；index 列定宽 + `font-variant-numeric: tabular-nums` + 等宽 + `--docs-muted`；meta `margin-left: auto`；`.docs-gallery__vlist .tx-virtual-list { scrollbar-width: thin; scrollbar-color: var(--docs-gallery-line) transparent }`，滚动条就贴在框内右缘。
- `docs-gallery__doc` 提供 12px 圆角 + inset ring + 底色（新 helper，见 overview）。总高 ≈ 标题条 27 + 列表 112 ≈ 139px，宽 320。
- 计数框体现"只渲染 8 行 / 10,000"，是虚拟列表的卖点。
- 可选入场（随 reset 重播）：函数 ref 拿到组件实例后 `$el.scrollTo({ top: 28 * 60, behavior: 'smooth' })`（延迟 ~400ms，reduced-motion 跳过），展示行在滚动中回收。remount 本身会把滚动复位到顶部。

---

## B. EdgeFadeMask

### Files

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/edge-fade-mask/src/TxEdgeFadeMask.vue` | 组件（192 行） |
| `packages/tuffex/packages/components/src/edge-fade-mask/src/types.ts` | Props / Axis |
| `apps/nexus/app/components/content/demos/EdgeFadeMaskHorizontalDemo.vue` / `EdgeFadeMaskVerticalDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/edge-fade-mask.{en,zh}.mdc` | 文档页 |
| `apps/nexus/app/components/tuff/landing/TuffLandingFeatures.vue` | 仓库里唯一的 marquee 实现（手写 mask + `translateX(-50%)` 双段轨道），可作参照 |

### API

| Prop | Type | Default |
|---|---|---|
| `as` | `string` | `'div'` |
| `axis` | `'vertical' \| 'horizontal'` | `'vertical'` |
| `size` | `string \| number` | `24`（数字→px，渐隐距离） |
| `threshold` | `number` | `1`（负数钳为 0） |
| `disabled` | `boolean` | `false` |
| `observeResize` | `boolean` | `true` |

- **Slots**：`default`。**Emits / Expose**：无（`viewportRef` 未 expose）。
- DOM：根 `component :is="as"`（`position:relative; display:block; min-width/min-height:0`）→ `.tx-edge-fade-mask__viewport`（`width/height:100%`；horizontal 时 `overflow-x:auto; overflow-y:hidden`）承载 slot 与 inline mask。
- 逻辑（`updateFadeState`，~28–57 行）：只看**真实滚动位置**。`maxScroll = scrollWidth − clientWidth`；`scrollable = maxScroll > threshold`；前缘渐隐仅当 `scrollLeft > threshold`，后缘渐隐仅当 `scrollLeft < maxScroll − threshold`。触发更新：viewport 的 `scroll` 事件（passive）、ResizeObserver（viewport 与**第一个子元素**）、`onUpdated`、props 变化。mask = `linear-gradient(to right, leading 0, black size, black calc(100% − size), trailing 100%)`。
- 推论：用 CSS `transform` 平移内部轨道做 marquee **不会**改变 `scrollLeft`，前缘永远不渐隐（左边是硬切）。要让两端都渐隐，必须真的滚动 viewport。

### Nexus demos

- Horizontal：520px 宽、1px 边 12px 圆角外框；`:size="40"`、`height:116px`；轨道 `display:flex; gap:12px; width:max-content; padding:12px`，10 张 120×84 卡片（"卡片 N / Item N"）。
- Vertical：420px 外框、`:size="32"`、`height:220px`，一段说明文字 + 180px 空白制造可滚动内容。
- 文档 Best Practices："horizontal strips 用 `width: max-content` 或固定宽"。

### 当前格子（研究时 ~2793–2813 行，锚点 `docPath('edge-fade-mask')`）

```vue
<div class="docs-gallery__block">
  <TxEdgeFadeMask axis="horizontal" :size="32">
    <div class="docs-gallery__fade-row">
      <div v-for="tileIndex in 10" :key="tileIndex" class="docs-gallery__tile">
        {{ tileIndex }}
      </div>
    </div>
  </TxEdgeFadeMask>
</div>
```

失败原因：10 个 ~29–36px 宽的数字块 + 9×8px gap ≈ 370px，只比 320px 多 ~50px；`scrollLeft=0` 时只有右缘渐隐；无任何运动；块本身无内容感。

### 方案：驱动组件自己的 viewport 做无缝 marquee

```vue
<div class="docs-gallery__block docs-gallery__marquee"
     @pointerenter="marqueePaused = true" @pointerleave="marqueePaused = false">
  <TxEdgeFadeMask axis="horizontal" :size="56">
    <div :ref="bindMarquee" class="docs-gallery__marquee-track">
      <span v-for="copyIndex in 2" :key="copyIndex" class="docs-gallery__marquee-seg"
            :aria-hidden="copyIndex === 2 || undefined">
        <span v-for="chip in marqueeChips" :key="chip.label" class="docs-gallery__marquee-chip">
          <span :class="chip.icon" aria-hidden="true" />{{ chip.label }}
        </span>
      </span>
    </div>
  </TxEdgeFadeMask>
</div>
```

驱动（函数 ref：remount 时 Vue 先以 `null` 调用、再以新元素调用，天然随 reset 重启）：

```ts
let marqueeFrame = 0
const marqueePaused = ref(false)
function bindMarquee(el: Element | ComponentPublicInstance | null) {
  cancelAnimationFrame(marqueeFrame)
  const track = el instanceof HTMLElement ? el : null
  const viewport = track?.parentElement            // .tx-edge-fade-mask__viewport
  const seg = track?.firstElementChild as HTMLElement | null
  if (!track || !viewport || !seg)
    return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    viewport.scrollLeft = seg.offsetWidth / 2      // 静态、两端都渐隐
    return
  }
  let pos = 0
  let last = performance.now()
  const tick = (now: number) => {
    if (!marqueePaused.value) {
      pos += (now - last) * 0.03                   // ~30px/s
      const period = seg.offsetWidth               // 一段（含段尾 gap）= 一个周期
      if (pos >= period + 2)
        pos -= period                              // 始终 > threshold(1)，前缘渐隐不闪
      viewport.scrollLeft = pos
    }
    last = now
    marqueeFrame = requestAnimationFrame(tick)
  }
  marqueeFrame = requestAnimationFrame(tick)
}
```

- CSS：`.docs-gallery__marquee-track { display: flex; width: max-content }`；`.docs-gallery__marquee-seg { display: flex; gap: 8px; padding-right: 8px }`（段尾补一个 gap，周期 = 段宽，接缝无跳动；若用 `scrollWidth/2` 会差 gap/2）；chip 用 `--docs-inline-code-bg` 底 + `--docs-gallery-line` ring + 12px 文本 + carbon 图标；隐藏滚动条：`.docs-gallery__marquee .tx-edge-fade-mask__viewport { scrollbar-width: none }` 与 `::-webkit-scrollbar { display: none }`（画廊 CSS 不 scoped，可直接写组件公开类名）。
- 内容建议：已拆出的插件名（Clipboard、Browser、Quick actions、Window presets、Workspace scripts、System actions、Intelligence）配 `i-carbon-*` 图标；图标类要以字面量出现在画廊 `.vue` 里（Uno 扫描 `.vue` 全文，脚本数组也算）。段宽必须 > 320px，才保证循环点在 `maxScroll` 之前、后缘渐隐常亮。
- 重播语义：每次 remount 从 `scrollLeft=0` 开始，第一帧只有后缘渐隐，滚过 1px 后前缘渐隐"出现"——正好演示组件"按滚动位置决定两端渐隐"的逻辑。
- 可选：第二行反向（从 `period` 往回减）做成 logo 墙；高度 ~36px/行，两行 ~80px。
- 注意 `viewport.scrollLeft = pos` 赋小数值在 Chrome 可用；不要回读 scrollLeft 再累加（可能被取整），用自己的 `pos` 累加。组件的 `scroll` 监听每帧触发一次，只在布尔状态变化时改 inline mask，开销很小。
- 卸载清理：函数 ref 收到 `null` 时 `cancelAnimationFrame`；画廊 `onBeforeUnmount` 也可兜底取消。

---

## C. CornerOverlay

### Files

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/corner-overlay/src/TxCornerOverlay.vue` | 组件（74 行） |
| `packages/tuffex/packages/components/src/corner-overlay/src/types.ts` | Props / Placement |
| `apps/nexus/app/components/content/demos/CornerOverlayBasicDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/corner-overlay.{en,zh}.mdc` | 文档页 |

### API

| Prop | Type | Default |
|---|---|---|
| `placement` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'bottom-right'` |
| `offsetX` / `offsetY` | `string \| number` | `0`（数字→px；写入对应的 left/right、top/bottom；负值向外探出） |
| `overlayPointerEvents` | `'none' \| 'auto'` | `'none'`（为 `none` 时叠层 `aria-hidden="true"`） |

- **Slots**：`default`（底图）、`overlay`（角标；不提供则不渲染叠层节点）。**Emits / Expose / CSS 变量**：无。
- DOM：根 `span.tx-corner-overlay`（`position:relative; display:inline-block`）→ slot + `span.tx-corner-overlay__overlay`（`position:absolute; display:inline-flex; align/justify:center`，inline 的 inset 与 pointer-events）。无动画；不预留布局空间。

### Nexus demo

`CornerOverlayBasicDemo.vue`：两个 44px 圆形字母头像，gap 24：`bottom-right`(−2,−2) 12px 绿色状态点（2px `--tx-bg-color` 描边）；`top-right`(−4,−4) 包在页面色圆底里的 `i-carbon-checkmark-filled` 主色图标（带阴影）。

### 当前格子（研究时 ~2774–2791 行，锚点 `docPath('corner-overlay')`）

```vue
<TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
  <TxAvatar name="Talex" shape="rounded" />
  <template #overlay>
    <TxBadge :value="3" />
  </template>
</TxCornerOverlay>
```

失败原因：只有一个实例、一个 placement；`TxBadge` 默认 variant 是 `--tx-fill-color-light` 底 + 次要文字色的灰色胶囊，暗色下几乎看不出；而 base 组的 AvatarVariants 格子（`docPath('avatar-variants')`）已经用 `TxCornerOverlay` 做了三个"头像 + 右下角状态点"，这里重复且更弱。

### 方案：四个 placement × 四种叠层内容

```vue
<div class="docs-gallery__row docs-gallery__row--loose">
  <figure class="docs-gallery__corner" style="--i: 0">
    <TxCornerOverlay placement="top-left" :offset-x="4" :offset-y="4">
      <img class="docs-gallery__corner-thumb" :src="galleryItems[0].url" alt="">
      <template #overlay><TxTag label="NEW" variant="soft" /></template>
    </TxCornerOverlay>
    <figcaption>top-left</figcaption>
  </figure>
  <figure class="docs-gallery__corner" style="--i: 1">
    <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
      <TxAvatar name="Kiri" shape="rounded" size="large" />
      <template #overlay><span class="docs-gallery__corner-ring"><TxBadge :value="12" variant="error" /></span></template>
    </TxCornerOverlay>
    <figcaption>top-right</figcaption>
  </figure>
  <figure class="docs-gallery__corner" style="--i: 2">
    <TxCornerOverlay placement="bottom-left" :offset-x="-4" :offset-y="-4">
      <TxIconChip :size="48" tone="red" label="PDF" />
      <template #overlay><span class="docs-gallery__corner-ring"><TxIcon name="check-circle" /></span></template>
    </TxCornerOverlay>
    <figcaption>bottom-left</figcaption>
  </figure>
  <figure class="docs-gallery__corner" style="--i: 3">
    <TxCornerOverlay placement="bottom-right" :offset-x="-1" :offset-y="-1">
      <TxAvatar name="Talex" size="large" />
      <template #overlay><span class="docs-gallery__dot" style="background: var(--tx-color-success)" /></template>
    </TxCornerOverlay>
    <figcaption>bottom-right</figcaption>
  </figure>
</div>
```

- 组件素材：`TxAvatar` `size="large"` = 48px（preset：small 32 / medium 40 / large 48 / xlarge 64），`shape` circle/rounded/square；`TxBadge` variants `default|primary|success|warning|error`（12% 底 + 32% 边的着色胶囊，数字走 text-morph），`open` 的入场动画只在切换时播放、首挂载不播；`TxIconChip`（`size/tone/variant/shape/label`，画廊 IconChip 格子已在用）；`TxIcon name="check-circle"` 是**内置 SVG**（`builtinIcons`），不依赖 UnoCSS；`galleryItems[i].url` 是画廊内联 SVG 风景缩略图。
- 可读性：着色 badge 是半透明底，压在头像上会透色；`docs-gallery__corner-ring`（页面色 `var(--tx-bg-color)` 圆底 + 2px 同色 ring，思路同 `.docs-gallery__dot`）让角标"坐在"底图之上。按设计规则不要用白字 + 实心语义色。
- 注脚：placement 名用 11px 等宽 `--docs-muted`（是代码标识，不翻译）。尺寸：4 × ~56 + 3 × 22 ≈ 290px 宽，~72px 高。
- 入场（随 reset 重播）：画廊 CSS 给 `.docs-gallery__corner .tx-corner-overlay__overlay` 加 `animation: <pop-in> 420ms cubic-bezier(.34,1.36,.64,1) both; animation-delay: calc(var(--i) * 90ms + 120ms)`，用独立的 `scale` 属性（不碰 inline 的 inset），`transform-origin` 按角设置；`@media (prefers-reduced-motion: reduce) { animation: none }`。类名 `.tx-corner-overlay__overlay` 在 DOM 上始终存在（scoped 只加属性），画廊不 scoped 的 CSS 可以命中。
- 可选第五例：`overlay-pointer-events="auto"` + 一个带 `aria-label` 的"移除"小按钮，演示可交互叠层（需中英文案）。

## Caveats / Not Found

- 各方案尺寸按样式表推算，未在浏览器目测。
- EdgeFadeMask 驱动的 rAF 在画廊不可见时仍运行（格子滚出视口也在跑）；如需节流可配合 `IntersectionObserver` 暂停，属实现取舍。
