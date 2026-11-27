<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * One launcher panel set on two type scales: the productivity ladder the article
 * describes and a marketing ladder. Both copies are laid out in the same grid cell, so
 * they share a width and a height; the one not shown is hidden but still laid out, and
 * both are measured: how many rows fit the panel, the row pitch, and the computed font
 * size of each tier.
 */

type Scale = 'product' | 'marketing'
type Tier = 'heading' | 'row' | 'meta' | 'micro'

interface Row {
  tag: string
  title: string
  meta: string
  shortcut?: string
}

interface LayerStats {
  visible: number
  pitch: number
  height: number
  tiers: Record<Tier, number>
}

const SCALES: Scale[] = ['product', 'marketing']
const TIERS: Tier[] = ['heading', 'row', 'meta', 'micro']

const { locale } = useI18n()

const scale = ref<Scale>('product')
const stats = ref<Record<Scale, LayerStats> | null>(null)

const copy = computed(() => locale.value === 'zh'
  ? {
      scale: '字阶',
      product: '生产力',
      marketing: '营销页',
      title: '最近使用',
      count: (n: number) => `${n} 项`,
      tiers: { heading: '标题', row: '数据行', meta: '辅助与快捷键', micro: '微型标签' } as Record<Tier, string>,
      ruler: '当前字阶（读自面板里的计算字号）',
      visibleProduct: '生产力字阶：完整可见的行',
      visibleMarketing: '营销字阶：完整可见的行',
      pitch: '行距（生产力 → 营销）',
      density: '同一面板的信息量',
      height: '面板高度',
      caption: '同一块面板、同一组数据，切换两套字阶。两套版式排在同一个网格单元里，看不见的那套同样参与排版并被测量，所以两边的可见行数、行距都是实测值；字阶尺上的字号读自面板中对应元素的计算样式。',
      rows: [
        { tag: '应用', title: '日历', meta: '系统应用 · 昨天打开', shortcut: '⌘1' },
        { tag: '文件', title: '季度复盘.key', meta: '文稿 › 工作 › 复盘', shortcut: '⌘2' },
        { tag: '指令', title: '切换深色模式', meta: '系统动作', shortcut: '⌘3' },
        { tag: '插件', title: '窗口预设', meta: 'touch-window-presets', shortcut: '⌘4' },
        { tag: '应用', title: '终端', meta: '实用工具', shortcut: '⌘5' },
        { tag: '文件', title: '发布说明草稿.md', meta: '桌面', shortcut: '⌘6' },
        { tag: '指令', title: '清空废纸篓', meta: '系统动作' },
        { tag: '插件', title: '工作区脚本', meta: 'touch-workspace-scripts' },
        { tag: '应用', title: '备忘录', meta: '系统应用' },
        { tag: '文件', title: '设计规范.pdf', meta: '下载' },
        { tag: '指令', title: '锁定屏幕', meta: '系统动作' },
        { tag: '插件', title: '快捷操作', meta: 'touch-quick-actions' },
      ] as Row[],
    }
  : {
      scale: 'Scale',
      product: 'Productivity',
      marketing: 'Marketing',
      title: 'Recent',
      count: (n: number) => `${n} items`,
      tiers: { heading: 'Heading', row: 'Data row', meta: 'Secondary & shortcuts', micro: 'Micro-label' } as Record<Tier, string>,
      ruler: 'Current scale (computed sizes read from the panel)',
      visibleProduct: 'Productivity: rows fully visible',
      visibleMarketing: 'Marketing: rows fully visible',
      pitch: 'Row pitch (productivity → marketing)',
      density: 'Rows the same panel holds',
      height: 'Panel height',
      caption: 'The same panel and the same data on two type scales. Both layouts sit in one grid cell, and the hidden one is laid out and measured too, so the visible rows and the row pitch on both sides are measured values; the sizes on the scale ruler are the computed font sizes of the matching elements in the panel.',
      rows: [
        { tag: 'App', title: 'Calendar', meta: 'System app · opened yesterday', shortcut: '⌘1' },
        { tag: 'File', title: 'Quarterly review.key', meta: 'Documents › Work › Reviews', shortcut: '⌘2' },
        { tag: 'Action', title: 'Toggle dark mode', meta: 'System action', shortcut: '⌘3' },
        { tag: 'Plugin', title: 'Window presets', meta: 'touch-window-presets', shortcut: '⌘4' },
        { tag: 'App', title: 'Terminal', meta: 'Utilities', shortcut: '⌘5' },
        { tag: 'File', title: 'Release notes draft.md', meta: 'Desktop', shortcut: '⌘6' },
        { tag: 'Action', title: 'Empty Trash', meta: 'System action' },
        { tag: 'Plugin', title: 'Workspace scripts', meta: 'touch-workspace-scripts' },
        { tag: 'App', title: 'Notes', meta: 'System app' },
        { tag: 'File', title: 'Design guidelines.pdf', meta: 'Downloads' },
        { tag: 'Action', title: 'Lock screen', meta: 'System action' },
        { tag: 'Plugin', title: 'Quick actions', meta: 'touch-quick-actions' },
      ] as Row[],
    })

const layerRefs: Partial<Record<Scale, HTMLElement>> = {}
const layersRef = ref<HTMLElement | null>(null)

function setLayerRef(layer: Scale, el: unknown) {
  if (el instanceof HTMLElement)
    layerRefs[layer] = el
  else
    delete layerRefs[layer]
}

function fontSizeOf(root: HTMLElement, tier: Tier) {
  const el = root.querySelector<HTMLElement>(`[data-tier="${tier}"]`)
  return el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0
}

function measureLayer(panel: HTMLElement): LayerStats {
  const box = panel.getBoundingClientRect()
  // The bottom of the area the panel shows; rows past it are clipped.
  const bottom = box.top + panel.clientTop + panel.clientHeight
  const rows = Array.from(panel.querySelectorAll<HTMLElement>('.tsc__row'))
  const rects = rows.map(row => row.getBoundingClientRect())
  const visible = rects.filter(rect => rect.bottom <= bottom + 0.5).length
  const pitch = rects.length > 1 ? rects[1]!.top - rects[0]!.top : rects[0]?.height ?? 0
  const tiers = Object.fromEntries(TIERS.map(tier => [tier, fontSizeOf(panel, tier)])) as Record<Tier, number>
  return { visible, pitch, height: box.height, tiers }
}

function measure() {
  const product = layerRefs.product
  const marketing = layerRefs.marketing
  if (!product || !marketing)
    return
  stats.value = { product: measureLayer(product), marketing: measureLayer(marketing) }
}

let frame = 0
function scheduleMeasure() {
  if (frame)
    return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

let observer: ResizeObserver | null = null
let disposed = false

onMounted(() => {
  measure()
  // Web fonts change every metric here; measure again once they have loaded.
  document.fonts?.ready.then(() => {
    if (!disposed)
      scheduleMeasure()
  })
  if (layersRef.value) {
    observer = new ResizeObserver(scheduleMeasure)
    observer.observe(layersRef.value)
  }
})

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  observer = null
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
})

watch(locale, () => nextTick(scheduleMeasure))

const activeTiers = computed(() => {
  const current = stats.value?.[scale.value]
  return TIERS.map(tier => ({ tier, label: copy.value.tiers[tier], size: current?.tiers[tier] ?? 0 }))
})

function formatPx(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}px`
}

const densityChange = computed(() => {
  const product = stats.value?.product.visible ?? 0
  const marketing = stats.value?.marketing.visible ?? 0
  if (!product)
    return '—'
  const change = Math.round((marketing / product - 1) * 100)
  return `${product} → ${marketing} · ${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(change)}%`
})

function resetDemo() {
  scale.value = 'product'
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="tsc-root" stage="plain" :caption="copy.caption">
    <div class="tsc">
      <div ref="layersRef" class="tsc__layers">
        <section
          v-for="layer in SCALES"
          :key="layer"
          :ref="el => setLayerRef(layer, el)"
          class="tsc__panel"
          :class="[`is-${layer}`, { 'is-hidden': layer !== scale }]"
          :aria-hidden="layer !== scale ? 'true' : undefined"
          :inert="layer !== scale"
        >
          <header class="tsc__head">
            <span class="tsc__title" data-tier="heading">{{ copy.title }}</span>
            <span class="tsc__count">{{ copy.count(copy.rows.length) }}</span>
          </header>
          <ul class="tsc__list">
            <li v-for="(row, index) in copy.rows" :key="index" class="tsc__row" :class="{ 'is-active': index === 0 }">
              <span class="tsc__tag" data-tier="micro">{{ row.tag }}</span>
              <span class="tsc__main">
                <span class="tsc__name" data-tier="row">{{ row.title }}</span>
                <span class="tsc__meta" data-tier="meta">{{ row.meta }}</span>
              </span>
              <kbd v-if="row.shortcut" class="tsc__key">{{ row.shortcut }}</kbd>
            </li>
          </ul>
        </section>
      </div>

      <div class="tsc__ruler" :class="`is-${scale}`">
        <span class="tsc__ruler-title">{{ copy.ruler }}</span>
        <ul class="tsc__ruler-list">
          <li v-for="item in activeTiers" :key="item.tier" class="tsc__ruler-item" :class="`is-${item.tier}`">
            <span class="tsc__ruler-name">{{ item.label }}</span>
            <span class="tsc__ruler-size cfig-mono">{{ item.size ? formatPx(item.size) : '—' }}</span>
          </li>
        </ul>
      </div>
    </div>

    <template #controls>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.scale }}</span>
        <TxRadioGroup v-model="scale">
          <TxRadio value="product">
            {{ copy.product }}
          </TxRadio>
          <TxRadio value="marketing">
            {{ copy.marketing }}
          </TxRadio>
        </TxRadioGroup>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat" :class="{ 'is-accent': scale === 'product' }">
        <span class="cfig-stat__label">{{ copy.visibleProduct }}</span>
        <span class="cfig-stat__value">{{ stats ? `${stats.product.visible} / ${copy.rows.length}` : '—' }}</span>
      </span>
      <span class="cfig-stat" :class="{ 'is-accent': scale === 'marketing' }">
        <span class="cfig-stat__label">{{ copy.visibleMarketing }}</span>
        <span class="cfig-stat__value">{{ stats ? `${stats.marketing.visible} / ${copy.rows.length}` : '—' }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.pitch }}</span>
        <span class="cfig-stat__value">{{ stats ? `${formatPx(Math.round(stats.product.pitch))} → ${formatPx(Math.round(stats.marketing.pitch))}` : '—' }}</span>
      </span>
      <span class="cfig-stat" :class="stats ? 'is-fail' : undefined">
        <span class="cfig-stat__label">{{ copy.density }}</span>
        <span class="cfig-stat__value">{{ densityChange }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.height }}</span>
        <span class="cfig-stat__value">{{ stats ? formatPx(Math.round(stats.product.height)) : '—' }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
/* The two ladders. Paddings are in em, so a row grows with its type the way a real
   component scaled for a marketing page would. */
.tsc__panel.is-product,
.tsc__ruler.is-product {
  --tsc-heading: 16px;
  --tsc-row: 13px;
  --tsc-meta: 12px;
  --tsc-micro: 11px;
  --tsc-leading: 1.4;
  --tsc-tracking: 0.08em;
}

.tsc__panel.is-marketing,
.tsc__ruler.is-marketing {
  --tsc-heading: 20px;
  --tsc-row: 18px;
  --tsc-meta: 16px;
  --tsc-micro: 16px;
  --tsc-leading: 1.6;
  --tsc-tracking: 0;
}

.tsc {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px;
}

.tsc__layers {
  display: grid;
  flex: 1 1 280px;
  min-width: 0;
}

.tsc__panel {
  grid-area: 1 / 1;
  height: 300px;
  overflow: hidden;
  padding: 10px 8px 0;
  border: 1px solid var(--cfig-line);
  border-radius: 12px;
  background: var(--tx-bg-color, #fff);
  line-height: var(--tsc-leading);
}

.tsc__panel.is-hidden {
  visibility: hidden;
}

.tsc__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 0.5em 0.4em;
  font-size: var(--tsc-meta);
}

.tsc__title {
  font-size: var(--tsc-heading);
  font-weight: 600;
}

.tsc__count {
  color: var(--cfig-muted);
}

.tsc__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tsc__row {
  display: flex;
  align-items: center;
  gap: 0.7em;
  min-width: 0;
  padding: 0.45em 0.6em;
  border-radius: 8px;
  font-size: var(--tsc-row);
}

.tsc__row.is-active {
  background: color-mix(in srgb, var(--cfig-accent) 11%, transparent);
}

.tsc__tag {
  flex: none;
  min-width: 4.4em;
  padding: 0 0.4em;
  border: 1px solid var(--cfig-line-strong);
  border-radius: 4px;
  color: var(--cfig-muted);
  font-size: var(--tsc-micro);
  font-weight: 500;
  letter-spacing: var(--tsc-tracking);
  text-align: center;
  text-transform: uppercase;
}

.tsc__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.tsc__name,
.tsc__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tsc__name {
  font-weight: 500;
}

.tsc__meta {
  color: var(--cfig-muted);
  font-size: var(--tsc-meta);
}

.tsc__key {
  flex: none;
  padding: 0 0.35em;
  border: 1px solid var(--cfig-line-strong);
  border-radius: 4px;
  color: var(--cfig-muted);
  font-family: inherit;
  font-size: var(--tsc-meta);
}

.tsc__ruler {
  display: flex;
  flex: 0 1 190px;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.tsc__ruler-title {
  color: var(--cfig-muted);
  font-size: 11px;
}

.tsc__ruler-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tsc__ruler-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--cfig-line-strong);
  line-height: 1.3;
}

.tsc__ruler-item.is-heading .tsc__ruler-name {
  font-size: var(--tsc-heading);
  font-weight: 600;
}

.tsc__ruler-item.is-row .tsc__ruler-name {
  font-size: var(--tsc-row);
  font-weight: 500;
}

.tsc__ruler-item.is-meta .tsc__ruler-name {
  color: var(--cfig-muted);
  font-size: var(--tsc-meta);
}

.tsc__ruler-item.is-micro .tsc__ruler-name {
  color: var(--cfig-muted);
  font-size: var(--tsc-micro);
  font-weight: 500;
  letter-spacing: var(--tsc-tracking);
  text-transform: uppercase;
}

.tsc__ruler-size {
  flex: none;
  color: var(--cfig-accent);
  font-size: 12px;
}
</style>
