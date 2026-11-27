<script setup lang="ts">
import type { FusionSurfaceBud } from '@talex-touch/tuffex/fusion-surface'
import type { ComponentPublicInstance } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type ToolId = 'select' | 'pan' | 'draw' | 'shapes' | 'text' | 'image'
type TrayId = 'draw' | 'shapes'

interface Tool {
  id: ToolId
  icon: string
  tray?: TrayId
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      tools: '画布工具',
      names: { select: '选择', pan: '平移', draw: '画笔', shapes: '形状', text: '文字', image: '图片' },
      shapes: ['方形', '圆形', '三角形', '星形'],
      colors: ['蓝色', '绿色', '橙色', '红色'],
      hint: '画笔和形状各有一个选项托盘：点另一个，托盘滑过去；再点一次收起。',
    }
  : {
      tools: 'Canvas tools',
      names: { select: 'Select', pan: 'Pan', draw: 'Draw', shapes: 'Shapes', text: 'Text', image: 'Image' },
      shapes: ['Square', 'Circle', 'Triangle', 'Star'],
      colors: ['Blue', 'Green', 'Amber', 'Red'],
      hint: 'Draw and Shapes each open a tray of options: press the other one and the tray slides over, press it again to close.',
    })

const TOOLS: Tool[] = [
  { id: 'select', icon: 'i-carbon-cursor-1' },
  { id: 'pan', icon: 'i-carbon-move' },
  { id: 'draw', icon: 'i-carbon-pen', tray: 'draw' },
  { id: 'shapes', icon: 'i-carbon-shapes', tray: 'shapes' },
  { id: 'text', icon: 'i-carbon-text-font' },
  { id: 'image', icon: 'i-carbon-image' },
]
const SHAPE_ICONS = ['i-carbon-square-outline', 'i-carbon-circle-outline', 'i-carbon-triangle-outline', 'i-carbon-star']
const SWATCHES = ['var(--tx-color-primary)', 'var(--tx-color-success)', 'var(--tx-color-warning)', 'var(--tx-color-danger)']

// Four 32px options 2px apart inside 6px of padding: the tray is exactly its row.
const TRAY_WIDTH = 146
const TRAY_HEIGHT = 44

const tool = ref<ToolId>('select')
const openTray = ref<TrayId | null>(null)
// What the tray shows. Left alone on close, so a closing tray keeps its
// options until the bud has shrunk away.
const trayContent = ref<TrayId>('shapes')
const trayCenter = ref(0)
const shape = ref(0)
const swatch = ref(0)

// One bud with a fixed id: pressing the other tray tool moves this bud, so it
// slides; removing it from the list closes it where it is.
const buds = computed<FusionSurfaceBud[]>(() => openTray.value
  ? [{ id: 'tray', center: trayCenter.value, width: TRAY_WIDTH, height: TRAY_HEIGHT, radius: 14 }]
  : [])

const toolEls = new Map<ToolId, HTMLElement>()
function setToolEl(id: ToolId, el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement)
    toolEls.set(id, el)
  else
    toolEls.delete(id)
}

// Measured from the button, in the surface's own coordinates: the surface
// root is the buttons' offset parent.
function centerOf(id: ToolId): number {
  const el = toolEls.get(id)
  return el ? el.offsetLeft + el.offsetWidth / 2 : 0
}

function press(entry: Tool): void {
  tool.value = entry.id
  if (!entry.tray || openTray.value === entry.tray) {
    openTray.value = null
    return
  }
  trayCenter.value = centerOf(entry.id)
  trayContent.value = entry.tray
  openTray.value = entry.tray
}

// The intro opens Shapes, then slides the tray over to Draw. It starts when
// the demo scrolls into view and stops at the reader's first press.
const rootRef = ref<HTMLElement | null>(null)
const timers: ReturnType<typeof setTimeout>[] = []
let observer: IntersectionObserver | null = null
let touched = false

function later(ms: number, run: () => void): void {
  timers.push(setTimeout(() => {
    if (!touched)
      run()
  }, ms))
}

function intro(): void {
  later(450, () => press(TOOLS[3]!))
  later(1900, () => press(TOOLS[2]!))
}

function onPress(entry: Tool): void {
  touched = true
  press(entry)
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
  <div ref="rootRef" class="fusion-tray-demo not-prose">
    <TxFusionSurface
      class="fusion-tray-demo__bar"
      :buds="buds"
      :radius="18"
      stroke="var(--tx-border-color-lighter)"
      shadow="var(--tx-elevation-4)"
    >
      <div class="fusion-tray-demo__tools" role="group" :aria-label="copy.tools">
        <button
          v-for="entry in TOOLS"
          :key="entry.id"
          :ref="el => setToolEl(entry.id, el)"
          type="button"
          class="fusion-tray-demo__tool"
          :class="{ 'is-active': tool === entry.id }"
          :title="copy.names[entry.id]"
          :aria-label="copy.names[entry.id]"
          :aria-pressed="tool === entry.id"
          :aria-expanded="entry.tray ? openTray === entry.tray : undefined"
          @click="onPress(entry)"
        >
          <span :class="entry.icon" aria-hidden="true" />
        </button>
      </div>

      <template #bud>
        <div class="fusion-tray-demo__tray" role="group" :aria-label="copy.names[trayContent]">
          <template v-if="trayContent === 'shapes'">
            <button
              v-for="(icon, index) in SHAPE_ICONS"
              :key="icon"
              type="button"
              class="fusion-tray-demo__option"
              :class="{ 'is-active': shape === index }"
              :aria-label="copy.shapes[index]"
              :aria-pressed="shape === index"
              @click="shape = index"
            >
              <span :class="icon" aria-hidden="true" />
            </button>
          </template>
          <template v-else>
            <button
              v-for="(color, index) in SWATCHES"
              :key="color"
              type="button"
              class="fusion-tray-demo__option"
              :class="{ 'is-active': swatch === index }"
              :aria-label="copy.colors[index]"
              :aria-pressed="swatch === index"
              @click="swatch = index"
            >
              <span class="fusion-tray-demo__swatch" :style="{ background: color }" aria-hidden="true" />
            </button>
          </template>
        </div>
      </template>
    </TxFusionSurface>

    <p class="fusion-tray-demo__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
/* The tray grows outside the toolbar's box and takes no layout space, so the
   demo reserves the room above it. */
.fusion-tray-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 56px;
}

.fusion-tray-demo__tools {
  display: flex;
  gap: 4px;
  padding: 8px;
}

/* Radius 10 inside 8px of padding: the toolbar's 18px corner is concentric. */
.fusion-tray-demo__tool,
.fusion-tray-demo__option {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
}

.fusion-tray-demo__tool {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 18px;
}

.fusion-tray-demo__option {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 16px;
}

.fusion-tray-demo__tool:hover,
.fusion-tray-demo__option:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

/* Same-hue ink mixed toward the primary ink: the plain hue on its own
   -light-9 tint is under 3:1. */
.fusion-tray-demo__tool.is-active,
.fusion-tray-demo__option.is-active {
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
}

.fusion-tray-demo__tool:focus-visible,
.fusion-tray-demo__option:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Fills the bud's content layer, which is exactly TRAY_WIDTH x TRAY_HEIGHT. */
.fusion-tray-demo__tray {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 6px;
}

.fusion-tray-demo__swatch {
  width: 14px;
  height: 14px;
  border-radius: 999px;
}

.fusion-tray-demo__hint {
  max-width: 360px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--tx-text-color-regular, #606266);
}
</style>
