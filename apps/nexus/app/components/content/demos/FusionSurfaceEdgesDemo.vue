<script setup lang="ts">
import type { FusionSurfaceBud, FusionSurfaceEdge } from '@talex-touch/tuffex/fusion-surface'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      position: '沿边位置',
      height: '凸起高度',
      open: '展开',
      close: '收起',
      hint: '圆点是请求的 center。靠近拐角时，凸起停在凹角还能落在直边上的位置；高度不到 24px 时，凹角半径变成高度的一半。',
    }
  : {
      position: 'Position along the edge',
      height: 'Bud height',
      open: 'Open',
      close: 'Close',
      hint: 'Dots mark the requested center. Near a corner the bud stops where its fillet still lands on the straight part of the edge; under 24px of height the fillet shrinks to half the height.',
    })

// Body size, fixed in the stylesheet too: top and bottom are 220px long,
// left and right 132px.
const WIDTH = 220
const HEIGHT = 132
const FILLET = 12
const DOT_INSET = 6

const EDGES: { edge: FusionSurfaceEdge, width: number }[] = [
  { edge: 'top', width: 64 },
  { edge: 'right', width: 40 },
  { edge: 'bottom', width: 64 },
  { edge: 'left', width: 40 },
]

const open = ref(false)
const position = ref(50)
const budHeight = ref(32)

function lengthOf(edge: FusionSurfaceEdge): number {
  return edge === 'top' || edge === 'bottom' ? WIDTH : HEIGHT
}

// The same share of every edge. `center` counts from the left on top and
// bottom and from the top on left and right; the component clamps it.
const buds = computed<FusionSurfaceBud[]>(() => EDGES.map(({ edge, width }) => ({
  id: edge,
  edge,
  open: open.value,
  center: (position.value / 100) * lengthOf(edge),
  width,
  height: budHeight.value,
  radius: 12,
})))

// Where each bud was asked to sit, just inside its edge.
const dots = computed(() => {
  const along = position.value / 100
  return [
    { id: 'top', x: along * WIDTH, y: DOT_INSET },
    { id: 'right', x: WIDTH - DOT_INSET, y: along * HEIGHT },
    { id: 'bottom', x: along * WIDTH, y: HEIGHT - DOT_INSET },
    { id: 'left', x: DOT_INSET, y: along * HEIGHT },
  ]
})

const fillet = computed(() => Math.min(FILLET, budHeight.value / 2))

// The intro opens the buds, walks them into both corners and back, then
// drops the height under twice the fillet and restores it. It starts when the
// demo scrolls into view and stops at the reader's first touch.
const rootRef = ref<HTMLElement | null>(null)
const timers: ReturnType<typeof setTimeout>[] = []
let observer: IntersectionObserver | null = null
let touched = false

function later(ms: number, step: () => void): void {
  timers.push(setTimeout(() => {
    if (!touched)
      step()
  }, ms))
}

function intro(): void {
  later(300, () => (open.value = true))
  later(1500, () => (position.value = 0))
  later(2900, () => (position.value = 100))
  later(4300, () => (position.value = 50))
  later(5500, () => (budHeight.value = 8))
  later(6900, () => (budHeight.value = 32))
}

function touch(): void {
  touched = true
}

function toggle(): void {
  touched = true
  open.value = !open.value
}

onMounted(() => {
  const el = rootRef.value
  if (!el)
    return
  if (typeof IntersectionObserver === 'undefined') {
    intro()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    intro()
  }, { threshold: 0.6 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  timers.forEach(clearTimeout)
})
</script>

<template>
  <div ref="rootRef" class="fusion-edges-demo not-prose">
    <div class="fusion-edges-demo__stage">
      <TxFusionSurface
        class="fusion-edges-demo__body"
        :buds="buds"
        :radius="18"
        stroke="var(--tx-border-color-lighter)"
      >
        <span
          v-for="dot in dots"
          :key="dot.id"
          class="fusion-edges-demo__dot"
          :style="{ transform: `translate(${dot.x}px, ${dot.y}px)` }"
          aria-hidden="true"
        />
        <span class="fusion-edges-demo__readout">fillet {{ fillet }}px</span>
      </TxFusionSurface>
    </div>

    <div class="fusion-edges-demo__controls" @pointerdown.capture="touch" @keydown.capture="touch">
      <div class="fusion-edges-demo__control">
        <span class="fusion-edges-demo__label">{{ copy.position }} · {{ position }}%</span>
        <TxSlider v-model="position" :min="0" :max="100" :step="1" :aria-label="copy.position" />
      </div>
      <div class="fusion-edges-demo__control">
        <span class="fusion-edges-demo__label">{{ copy.height }} · {{ budHeight }}px</span>
        <TxSlider v-model="budHeight" :min="4" :max="40" :step="1" :aria-label="copy.height" />
      </div>
      <TxButton size="sm" variant="ghost" @click="toggle">
        {{ open ? copy.close : copy.open }}
      </TxButton>
    </div>

    <p class="fusion-edges-demo__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.fusion-edges-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* Buds reach up to 40px past every edge and take no layout space. */
.fusion-edges-demo__stage {
  padding: 48px;
}

.fusion-edges-demo__body {
  display: grid;
  place-items: center;
  width: 220px;
  height: 132px;
}

.fusion-edges-demo__dot {
  position: absolute;
  top: -3px;
  left: -3px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-color-primary, #409eff);
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.fusion-edges-demo__readout {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}

.fusion-edges-demo__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  gap: 12px 20px;
}

.fusion-edges-demo__control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 180px;
}

.fusion-edges-demo__label {
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}

.fusion-edges-demo__hint {
  max-width: 420px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--tx-text-color-regular, #606266);
}

@media (prefers-reduced-motion: reduce) {
  .fusion-edges-demo__dot {
    transition: none;
  }
}
</style>
