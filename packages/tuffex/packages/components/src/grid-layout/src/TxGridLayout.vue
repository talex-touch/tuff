<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { GridLayoutProps } from '../index'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

defineOptions({
  name: 'TxGridLayout',
})

const props = withDefaults(defineProps<GridLayoutProps>(), {
  minItemWidth: '300px',
  gap: '1.5rem',
  maxColumns: 4,
  interactive: true,
})

const gridContainer = ref<HTMLElement | null>(null)

// Pointer position in viewport coordinates, taken from the latest mousemove.
let pointerX = 0
let pointerY = 0
let frameId: number | null = null

function paintSpotlight() {
  frameId = null
  const container = gridContainer.value
  if (!props.interactive || !container)
    return

  const items = Array.from(container.querySelectorAll<HTMLElement>('.tx-grid-layout__item'))
  // Read every rect before the first write, so the frame pays for one layout pass.
  const placed = items.map(item => ({ item, rect: item.getBoundingClientRect() }))
  for (const { item, rect } of placed) {
    item.style.setProperty('--tx-grid-op', '0.2')
    item.style.setProperty('--tx-grid-x', `${pointerX - rect.left}px`)
    item.style.setProperty('--tx-grid-y', `${pointerY - rect.top}px`)
  }
}

function handleMove(event: MouseEvent) {
  if (!props.interactive)
    return
  if (!gridContainer.value)
    return

  // pageX minus scrollX is the viewport coordinate that getBoundingClientRect uses.
  pointerX = event.pageX - window.scrollX
  pointerY = event.pageY - window.scrollY
  // One write per frame, however many moves arrive within it.
  if (frameId === null)
    frameId = requestAnimationFrame(paintSpotlight)
}

function cancelFrame() {
  if (frameId === null)
    return
  cancelAnimationFrame(frameId)
  frameId = null
}

function cancelColor() {
  // A queued frame would light the items again right after this reset.
  cancelFrame()
  if (!gridContainer.value)
    return

  gridContainer.value.querySelectorAll('.tx-grid-layout__item').forEach((element) => {
    ;(element as HTMLElement).style.setProperty('--tx-grid-op', '0')
  })
}

onBeforeUnmount(cancelFrame)

// Turning interactivity off while the pointer is inside must clear any spotlight
// vars already written, otherwise the items stay permanently lit.
watch(() => props.interactive, (v) => {
  if (!v)
    cancelColor()
})

const rootStyle = computed<CSSProperties>(() => {
  return {
    '--tx-grid-gap': props.gap,
    '--tx-grid-min-width': props.minItemWidth,
    '--tx-grid-max-columns': String(props.maxColumns),
  } as CSSProperties
})
</script>

<template>
  <div
    ref="gridContainer"
    class="tx-grid-layout"
    :style="rootStyle"
    @mouseleave="cancelColor"
    @mousemove="handleMove"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-grid-layout {
  display: grid;
  gap: var(--tx-grid-gap, 1.5rem);
  grid-template-columns: repeat(auto-fit, minmax(var(--tx-grid-min-width, 300px), 1fr));

  @media (min-width: 1400px) {
    grid-template-columns: repeat(var(--tx-grid-max-columns, 4), 1fr);
  }
}

:deep(.tx-grid-layout__item) {
  background: var(--tx-fill-color-light, #f5f7fa);
  height: 100%;
  position: relative;
  border-radius: 16px;
  transition: background-color 0.3s ease;
  cursor: pointer;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    width: calc(100% + 3px);
    height: calc(100% + 3px);
    top: 50%;
    left: 50%;
    opacity: var(--tx-grid-op, 0);
    transition: opacity 0.25s ease-in-out;
    transform: translate(-50%, -50%);
    border-radius: 18px;
    filter: blur(5px);
    background: radial-gradient(
      250px circle at var(--tx-grid-x) var(--tx-grid-y),
      var(--tx-color-primary, #409eff) 0,
      transparent 100%
    );
    z-index: 0;
  }

  & > * {
    position: relative;
    z-index: 1;
  }
}
</style>
