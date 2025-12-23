<script setup lang="ts">
import { ref } from 'vue'
import type { CSSProperties } from 'vue'
import type { GridLayoutProps } from '../index'

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

function handleMove(event: MouseEvent) {
  if (!props.interactive) return
  if (!gridContainer.value) return

  const { pageX: mouseX, pageY: mouseY } = event
  const elements = gridContainer.value.querySelectorAll('.tx-grid-layout__item')

  for (const element of elements) {
    const htmlElement = element as HTMLElement
    const { left, top } = htmlElement.getBoundingClientRect()
    const elementX = left + window.scrollX
    const elementY = top + window.scrollY

    const distanceX = mouseX - elementX
    const distanceY = mouseY - elementY

    htmlElement.style.setProperty('--tx-grid-op', '0.2')
    htmlElement.style.setProperty('--tx-grid-x', `${distanceX}px`)
    htmlElement.style.setProperty('--tx-grid-y', `${distanceY}px`)
  }
}

function cancelColor() {
  if (!props.interactive) return
  if (!gridContainer.value) return

  gridContainer.value.querySelectorAll('.tx-grid-layout__item').forEach((element) => {
    ;(element as HTMLElement).style.setProperty('--tx-grid-op', '0')
  })
}

const rootStyle = (() => {
  const s: CSSProperties = {
    '--tx-grid-gap': props.gap,
    '--tx-grid-min-width': props.minItemWidth,
    '--tx-grid-max-columns': String(props.maxColumns),
  } as CSSProperties
  return s
})()
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
  transition: all 0.3s ease;
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
